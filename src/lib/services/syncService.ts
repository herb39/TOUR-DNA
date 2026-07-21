import { prisma } from "@/lib/db";
import { fetchTarSvcDem } from "@/lib/public-data/adapters/tarSvcDem";
import { fetchTouDivIx } from "@/lib/public-data/adapters/touDivIx";
import { fetchTouResDem } from "@/lib/public-data/adapters/touResDem";
import { fetchVisitorCnt } from "@/lib/public-data/adapters/visitorCnt";
import { METRIC_CODES } from "@/lib/domain/types";
import type { RegionLevel } from "@/generated/prisma/enums";

export type SyncTrigger = "CRON" | "ADMIN" | "CLI";

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
          if (item.tarSvcDemIxVal !== undefined) {
            await upsertMetric(region.id, region.level, params.baseYm, METRIC_CODES.DEMAND_SERVICE, item.tarSvcDemIxVal, "지수", svcSource.id);
          }
          if (item.tarSjrnDsIxVal !== undefined) {
            await upsertMetric(region.id, region.level, params.baseYm, METRIC_CODES.STAY, item.tarSjrnDsIxVal, "지수", svcSource.id);
          }
          if (item.tarExpDsIxVal !== undefined) {
            await upsertMetric(region.id, region.level, params.baseYm, METRIC_CODES.SPEND, item.tarExpDsIxVal, "지수", svcSource.id);
          }
        }
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
      // touDivIxVal은 확인된 코드(touDivIxCd=3103="30대 방문객수") 단일 값이라 종합 다양성 점수가
      // 아니다(docs/public-api-status.md). 여러 연령/유형 코드를 모아 재계산하는 로직이 준비되기
      // 전까지는 fixture의 종합 다양성 점수를 의미가 다른 값으로 덮어쓰지 않도록 저장을 보류한다 —
      // API 연결 자체는 계속 확인하되(SyncLog에 SKIPPED로 기록), NormalizedMetric은 건드리지 않는다.
      results.push({
        sourceCode: `TOU_DIV_IX:${region.code}`,
        status: res.status === "ERROR" ? "FAILED" : "SKIPPED",
        itemCount: res.items.length,
        errorMessage:
          res.status === "ERROR"
            ? res.resultMsg
            : "다양성 재계산 로직 구현 전까지 저장 보류 — 종합 점수가 아닌 단일 연령대 지표라 fixture 값 유지",
      });
    }

    const resDemSource = sourceByCode.get("TOU_RES_DEM");
    if (resDemSource) {
      const res = await fetchTouResDem({ serviceKey, baseUrl: resDemSource.baseUrl, areaCd: region.apiAreaCode, baseYm: params.baseYm });
      if (res.status === "SUCCESS") {
        for (const item of res.items) {
          if (item.touResDemIxVal !== undefined) {
            await upsertMetric(region.id, region.level, params.baseYm, METRIC_CODES.DEMAND_RESOURCE, item.touResDemIxVal, "지수", resDemSource.id);
          }
        }
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
      results.push({
        sourceCode: `VISITOR_CNT:${region.code}`,
        status: res.status === "ERROR" ? "FAILED" : "SUCCESS",
        itemCount: res.items.length,
        errorMessage: res.status === "ERROR" ? res.resultMsg : undefined,
      });
    }

    // TOUR_INFO(국문 관광정보), POI_RELATION은 POI/연관관광지 데이터로 fixture가 이미 대체하고 있고,
    // 실 baseUrl/스키마가 미확인이므로 이번 sync 사이클에서는 상태만 SKIPPED로 기록한다.
    results.push({
      sourceCode: `TOUR_INFO:${region.code}`,
      status: "SKIPPED",
      itemCount: 0,
      errorMessage: "실 엔드포인트 미확인 — fixture POI 데이터 사용 중",
    });
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
