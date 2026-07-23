import { prisma } from "@/lib/db";
import { fetchTarSvcDem } from "@/lib/public-data/adapters/tarSvcDem";
import { fetchTouDivIx } from "@/lib/public-data/adapters/touDivIx";
import { fetchTouResDem } from "@/lib/public-data/adapters/touResDem";
import { fetchVisitorCnt } from "@/lib/public-data/adapters/visitorCnt";
import { fetchTourInfo, mapContentTypeToPoiCategory } from "@/lib/public-data/adapters/tourInfo";
import { METRIC_CODES } from "@/lib/domain/types";
import type { RegionLevel } from "@/generated/prisma/enums";

export type SyncTrigger = "CRON" | "ADMIN" | "CLI";

// KorService2의 areaCode는 시/도 단위(예: 강원=32, 충북=33)라 시/군/구보다 훨씬 넓은 범위를 반환한다.
// 필터 없이 그대로 upsert하면 평창/강릉/영덕처럼 서로 먼 시/군/구가 한 Region에 뒤섞여 코스가 비현실적으로
// 넓어진다(2026-07-21 실제 발견). 주소(addr1)에 이 키워드가 포함된 장소만 반영해 범위를 좁힌다. 기본값은
// region.name(예: "양양군")이면 충분하다 — 대전만 예외였는데, areaCode=3이 이미 "대전광역시" 단위이지
// 강원/충북처럼 여러 시/군/구를 아우르는 도 단위가 아니라서(대전은 도시 전체가 15km 안쪽) 원래는 override가
// 필요 없었다. 한때 통계청 지표(DNA 점수)가 유성구 하나만 대표하는 것과 맞추려고 POI도 "유성구"로 좁혀
// 뒀었는데(2026-07-21), 그 결과 성심당 본점(중구)처럼 대전 하면 바로 떠오르는 다른 구 명소가 실제로
// 검색돼도 반영되지 못하는 부작용이 있었다(2026-07-22 발견) — 지표(DNA 점수)는 여전히 유성구 대표값이지만
// POI 후보 풀은 대전 전체로 되돌린다. 다른 지역에서 비슷한 예외가 필요해지면 여기 추가한다.
const TOUR_INFO_ADDRESS_FILTER_OVERRIDE: Record<string, string> = {};

function tourInfoAddressFilterKeyword(region: { code: string; name: string }): string {
  return TOUR_INFO_ADDRESS_FILTER_OVERRIDE[region.code] ?? region.name;
}

export interface SyncSourceResult {
  sourceCode: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED";
  itemCount: number;
  errorMessage?: string;
}

export interface SyncRunResult {
  baseYm: string;
  skipped: boolean;
  overallStatus: "SUCCESS" | "PARTIAL" | "FAILED";
  results: SyncSourceResult[];
}

async function upsertMetric(
  regionId: string,
  adminLevel: RegionLevel,
  baseYm: string,
  metricCode: string,
  rawValue: number,
  unit: string,
  sourceId: string,
) {
  await prisma.normalizedMetric.upsert({
    where: { regionId_baseYm_metricCode: { regionId, baseYm, metricCode } },
    update: { rawValue, unit, adminLevel, sourceId, collectedAt: new Date() },
    create: { regionId, baseYm, metricCode, rawValue, unit, adminLevel, sourceId },
  });
}

/**
 * 어댑터가 실제로 받은 원본 응답(rawPayload)을 DataSnapshot에 upsert한다(Phase 1-B, 2026-07-23).
 * 호출 시점에 실제 본문이 하나도 없었으면(네트워크/timeout/JSON 파싱 실패) 이 함수 자체를 호출하지
 * 않는다 — rawPayload는 스키마상 NOT NULL이라 "본문 없음"을 지어낸 값 없이 정직하게 표현할 방법이
 * 없기 때문이다(기존 성공 스냅샷이 있다면 그것을 그대로 둔다 — 삭제하지 않는다).
 */
async function upsertSnapshot(params: {
  dataSourceId: string;
  regionId: string;
  baseYm: string;
  status: "SUCCESS" | "EMPTY" | "ERROR";
  resultCode: string | null;
  resultMsg: string | null;
  itemCount: number;
  rawPayload: object;
}) {
  await prisma.dataSnapshot.upsert({
    where: {
      dataSourceId_regionId_baseYm: {
        dataSourceId: params.dataSourceId,
        regionId: params.regionId,
        baseYm: params.baseYm,
      },
    },
    update: {
      status: params.status,
      resultCode: params.resultCode,
      resultMsg: params.resultMsg,
      itemCount: params.itemCount,
      rawPayload: params.rawPayload,
      fetchedAt: new Date(),
    },
    create: {
      dataSourceId: params.dataSourceId,
      regionId: params.regionId,
      baseYm: params.baseYm,
      status: params.status,
      resultCode: params.resultCode,
      resultMsg: params.resultMsg,
      itemCount: params.itemCount,
      rawPayload: params.rawPayload,
    },
  });
}

/**
 * 6개 공공데이터 API를 동기화한다. DATA_MODE=snapshot이거나 서비스키가 없으면 라이브 호출을
 * 생략하고 기존 성공 데이터를 그대로 유지한다(스냅샷 모드로 전체 데모 지속 가능). 일부 API가
 * 실패해도 다른 API의 기존 성공 데이터를 삭제하지 않는다 — 실패한 지표만 갱신을 건너뛴다.
 */
export async function runTourismDataSync(params: { baseYm: string; triggeredBy: SyncTrigger }): Promise<SyncRunResult> {
  const startedAt = new Date();
  const serviceKey = process.env.TOUR_API_SERVICE_KEY;
  const dataMode = process.env.DATA_MODE ?? "hybrid";
  const results: SyncSourceResult[] = [];

  if (!serviceKey || dataMode === "snapshot") {
    const result: SyncRunResult = {
      baseYm: params.baseYm,
      skipped: true,
      overallStatus: "SUCCESS",
      results: [
        {
          sourceCode: "ALL",
          status: "SKIPPED",
          itemCount: 0,
          errorMessage: !serviceKey
            ? "TOUR_API_SERVICE_KEY 미설정 — 라이브 호출 생략, 기존 스냅샷 유지"
            : "DATA_MODE=snapshot — 라이브 호출 생략, 기존 스냅샷 유지",
        },
      ],
    };
    await prisma.syncLog.create({
      data: {
        baseYm: params.baseYm,
        triggeredBy: params.triggeredBy,
        overallStatus: "SUCCESS",
        results: result.results as unknown as object,
        startedAt,
        endedAt: new Date(),
      },
    });
    return result;
  }

  const dataSources = await prisma.dataSource.findMany();
  const sourceByCode = new Map(dataSources.map((d) => [d.code, d]));
  const regions = await prisma.region.findMany({ where: { level: "SIGUNGU" } });

  for (const region of regions) {
    if (!region.apiAreaCode || !region.apiSigunguCode) {
      results.push({
        sourceCode: `REGION:${region.code}`,
        status: "SKIPPED",
        itemCount: 0,
        errorMessage: "apiAreaCode/apiSigunguCode 미설정 — 이 지역은 라이브 동기화에서 제외",
      });
      continue;
    }

    const svcSource = sourceByCode.get("TAR_SVC_DEM");
    if (svcSource) {
      const res = await fetchTarSvcDem({
        serviceKey,
        baseUrl: svcSource.baseUrl,
        areaCd: region.apiAreaCode,
        signguCd: region.apiSigunguCode,
        baseYm: params.baseYm,
      });
      if (res.status === "SUCCESS") {
        for (const item of res.items) {
          if (item.tarSjrnDsIxVal !== undefined) {
            await upsertMetric(region.id, region.level, params.baseYm, METRIC_CODES.STAY, item.tarSjrnDsIxVal, "지수", svcSource.id);
          }
          if (item.tarExpDsIxVal !== undefined) {
            await upsertMetric(region.id, region.level, params.baseYm, METRIC_CODES.SPEND, item.tarExpDsIxVal, "지수", svcSource.id);
          }
        }
      }
      // 실제로 받은 본문이 하나라도 있으면(네트워크 실패로 둘 다 없는 경우는 제외) snapshot을 남긴다.
      if (res.raw.stay !== null || res.raw.spend !== null) {
        await upsertSnapshot({
          dataSourceId: svcSource.id,
          regionId: region.id,
          baseYm: params.baseYm,
          status: res.status,
          resultCode: res.resultCode,
          resultMsg: res.resultMsg,
          itemCount: res.items.length,
          rawPayload: res.raw,
        });
      }
      results.push({
        sourceCode: `TAR_SVC_DEM:${region.code}`,
        status: res.status === "SUCCESS" ? "SUCCESS" : res.status === "EMPTY" ? "SUCCESS" : "FAILED",
        itemCount: res.items.length,
        errorMessage: res.status === "ERROR" ? res.resultMsg : undefined,
      });
    }

    const divSource = sourceByCode.get("TOU_DIV_IX");
    if (divSource) {
      const res = await fetchTouDivIx({
        serviceKey,
        baseUrl: divSource.baseUrl,
        areaCd: region.apiAreaCode,
        signguCd: region.apiSigunguCode,
        baseYm: params.baseYm,
      });
      // 연령대별 방문객/소비 다양성 + 국적 다양성을 조합한 종합 점수(touDivIx.ts의 evenness 산식 참고).
      if (res.status === "SUCCESS" && res.composite !== null) {
        await upsertMetric(region.id, region.level, params.baseYm, METRIC_CODES.DIVERSITY, res.composite, "지수", divSource.id);
      }
      // 13개 코드 호출 중 실제 본문을 하나라도 받았으면 snapshot을 남긴다. 13개를 합친 값이라 하나의
      // resultCode/resultMsg로 대표할 수 없으므로 null로 둔다(있지도 않은 대표값을 지어내지 않음).
      const hasRealDivData = res.raw.tou.some((t) => t.data !== null) || res.raw.exp.some((e) => e.data !== null) || res.raw.intl.data !== null;
      if (hasRealDivData) {
        await upsertSnapshot({
          dataSourceId: divSource.id,
          regionId: region.id,
          baseYm: params.baseYm,
          status: res.status,
          resultCode: null,
          resultMsg: null,
          itemCount: res.itemCount,
          rawPayload: res.raw,
        });
      }
      results.push({
        sourceCode: `TOU_DIV_IX:${region.code}`,
        status: res.status === "ERROR" ? "FAILED" : "SUCCESS",
        itemCount: res.status === "ERROR" ? 0 : 1,
        errorMessage: res.status === "ERROR" ? res.resultMsg : undefined,
      });
    }

    const resDemSource = sourceByCode.get("TOU_RES_DEM");
    if (resDemSource) {
      const res = await fetchTouResDem({
        serviceKey,
        baseUrl: resDemSource.baseUrl,
        areaCd: region.apiAreaCode,
        signguCd: region.apiSigunguCode,
        baseYm: params.baseYm,
      });
      if (res.status === "SUCCESS") {
        for (const item of res.items) {
          // areaTarSvcDemList("관광 서비스 수요")가 실제 METRIC_CODES.DEMAND_SERVICE의 출처였다(touResDem.ts 참고).
          if (item.tarSvcDemIxVal !== undefined) {
            await upsertMetric(region.id, region.level, params.baseYm, METRIC_CODES.DEMAND_SERVICE, item.tarSvcDemIxVal, "지수", resDemSource.id);
          }
        }
      }
      if (res.raw !== null) {
        await upsertSnapshot({
          dataSourceId: resDemSource.id,
          regionId: region.id,
          baseYm: params.baseYm,
          status: res.status,
          resultCode: res.resultCode,
          resultMsg: res.resultMsg,
          itemCount: res.items.length,
          rawPayload: res.raw as object,
        });
      }
      results.push({
        sourceCode: `TOU_RES_DEM:${region.code}`,
        status: res.status === "ERROR" ? "FAILED" : "SUCCESS",
        itemCount: res.items.length,
        errorMessage: res.status === "ERROR" ? res.resultMsg : undefined,
      });
    }

    const visitorSource = sourceByCode.get("VISITOR_CNT");
    if (visitorSource) {
      const res = await fetchVisitorCnt({ serviceKey, baseUrl: visitorSource.baseUrl, areaCd: region.apiAreaCode, baseYm: params.baseYm });
      if (res.status === "SUCCESS") {
        for (const item of res.items) {
          if (item.visitorCnt !== undefined) {
            await upsertMetric(region.id, region.level, params.baseYm, METRIC_CODES.VISITOR_CNT, item.visitorCnt, "명", visitorSource.id);
          }
        }
      }
      if (res.raw !== null) {
        await upsertSnapshot({
          dataSourceId: visitorSource.id,
          regionId: region.id,
          baseYm: params.baseYm,
          status: res.status,
          resultCode: res.resultCode,
          resultMsg: res.resultMsg,
          itemCount: res.items.length,
          rawPayload: res.raw as object,
        });
      }
      results.push({
        sourceCode: `VISITOR_CNT:${region.code}`,
        status: res.status === "ERROR" ? "FAILED" : "SUCCESS",
        itemCount: res.items.length,
        errorMessage: res.status === "ERROR" ? res.resultMsg : undefined,
      });
    }

    const tourInfoSource = sourceByCode.get("TOUR_INFO");
    if (tourInfoSource && region.tourApiAreaCode) {
      const res = await fetchTourInfo({
        serviceKey,
        baseUrl: tourInfoSource.baseUrl,
        areaCode: region.tourApiAreaCode,
      });
      let upserted = 0;
      if (res.status === "SUCCESS") {
        // 이미 있는 장소(특히 큐레이션된 FIXTURE 데모 데이터)는 덮어쓰지 않는다 — 이름이 우연히
        // 겹치면 라이브 데이터(운영시간/휴무일 정보 없음)가 데모용 큐레이션 정보를 지워버릴 수 있다.
        const existing = await prisma.poi.findMany({
          where: { regionId: region.id },
          select: { name: true, sourceType: true },
        });
        const existingByName = new Map(existing.map((e) => [e.name, e.sourceType]));
        const addressKeyword = tourInfoAddressFilterKeyword(region);

        for (const item of res.items) {
          if (!item.title || !item.addr1 || item.mapx === undefined || item.mapy === undefined) continue;
          if (!item.addr1.includes(addressKeyword)) continue;
          const category = mapContentTypeToPoiCategory(item.contenttypeid);
          if (!category) continue;
          if (existingByName.get(item.title) === "FIXTURE") continue;

          await prisma.poi.upsert({
            where: { regionId_name: { regionId: region.id, name: item.title } },
            update: {
              category,
              address: item.addr1,
              lat: item.mapy,
              lng: item.mapx,
              sourceType: "API",
              sourceId: tourInfoSource.id,
              rawPayload: item,
            },
            create: {
              externalId: item.contentid,
              regionId: region.id,
              name: item.title,
              category,
              address: item.addr1,
              lat: item.mapy,
              lng: item.mapx,
              sourceType: "API",
              sourceId: tourInfoSource.id,
              rawPayload: item,
            },
          });
          upserted++;
        }
      }
      if (res.raw.pages.length > 0) {
        await upsertSnapshot({
          dataSourceId: tourInfoSource.id,
          regionId: region.id,
          baseYm: params.baseYm,
          status: res.status,
          resultCode: res.resultCode,
          resultMsg: res.resultMsg,
          itemCount: res.items.length,
          rawPayload: res.raw,
        });
      }
      results.push({
        sourceCode: `TOUR_INFO:${region.code}`,
        status: res.status === "ERROR" ? "FAILED" : "SUCCESS",
        itemCount: upserted,
        errorMessage: res.status === "ERROR" ? res.resultMsg : undefined,
      });
    } else {
      results.push({
        sourceCode: `TOUR_INFO:${region.code}`,
        status: "SKIPPED",
        itemCount: 0,
        errorMessage: "tourApiAreaCode 미설정 — fixture POI 데이터 사용 중",
      });
    }
    results.push({
      sourceCode: `POI_RELATION:${region.code}`,
      status: "SKIPPED",
      itemCount: 0,
      errorMessage: "정식 서비스명/baseUrl 미확인 — fixture 데이터 사용 중",
    });
  }

  const hasSuccess = results.some((r) => r.status === "SUCCESS");
  const hasFailure = results.some((r) => r.status === "FAILED");
  const overallStatus: SyncRunResult["overallStatus"] = !hasFailure ? "SUCCESS" : hasSuccess ? "PARTIAL" : "FAILED";

  await prisma.syncLog.create({
    data: {
      baseYm: params.baseYm,
      triggeredBy: params.triggeredBy,
      overallStatus,
      results: results as unknown as object,
      startedAt,
      endedAt: new Date(),
    },
  });

  return { baseYm: params.baseYm, skipped: false, overallStatus, results };
}
