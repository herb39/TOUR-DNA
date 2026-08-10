import { prisma } from "@/lib/db";
import { fetchTarSvcDem } from "@/lib/public-data/adapters/tarSvcDem";
import { fetchTouDivIx } from "@/lib/public-data/adapters/touDivIx";
import { fetchTouResDem } from "@/lib/public-data/adapters/touResDem";
import { fetchLocgoRegnVisitr, fetchMetcoRegnVisitr, type VisitorCntFetchResult } from "@/lib/public-data/adapters/visitorCnt";
import { fetchTourInfo, mapContentTypeToPoiCategory } from "@/lib/public-data/adapters/tourInfo";
import { withRequestCounter, type RequestCountSnapshot } from "@/lib/public-data/requestCounter";
import { enforceCombinedDateCompleteness } from "@/lib/services/visitorMonthCompleteness";
import { checkDataSyncTarget, ALLOW_REMOTE_DATA_SYNC_ENV } from "@/lib/services/dataSyncTargetGuard";
import { METRIC_CODES, type DataProvenance } from "@/lib/domain/types";
import type { RegionLevel } from "@/generated/prisma/enums";

export type SyncTrigger = "CRON" | "ADMIN" | "CLI";

// lDongRegnCd(법정동 시도 코드, 신 체계)도 구 areaCode와 마찬가지로 시/도 단위(예: 강원/충북)라
// 시/군/구보다 훨씬 넓은 범위를 반환할 수 있다. region.tourApiLdongSignguCd가 채워져 있으면 요청
// 자체가 시군구 단위로 좁혀지지만(2026-07-27 전환, 신 체계의 lDongSignguCd 파라미터), 아직 값이
// 없는 지역이 많으므로(위 tourInfo.ts 상단 주석 참고 — 실 코드값 미확인) 기존 주소(addr1) 키워드
// 필터를 방어적으로 그대로 유지한다(2026-07-21 실제 발견: 필터 없이 upsert하면 평창/강릉/영덕처럼
// 서로 먼 시/군/구가 한 Region에 뒤섞여 코스가 비현실적으로 넓어졌다). 기본값은 region.name(예:
// "양양군")이면 충분하다 — 대전만 예외였는데, 대전은 도시 전체가 15km 안쪽이라(여러 시/군/구를
// 아우르는 도 단위가 아님) 원래는 override가 필요 없었다. 한때 통계청 지표(DNA 점수)가 유성구
// 하나만 대표하는 것과 맞추려고 POI도 "유성구"로 좁혀 뒀었는데(2026-07-21), 그 결과 성심당
// 본점(중구)처럼 대전 하면 바로 떠오르는 다른 구 명소가 실제로 검색돼도 반영되지 못하는 부작용이
// 있었다(2026-07-22 발견) — 지표(DNA 점수)는 여전히 유성구 대표값이지만 POI 후보 풀은 대전 전체로
// 되돌린다. 다른 지역에서 비슷한 예외가 필요해지면 여기 추가한다.
const TOUR_INFO_ADDRESS_FILTER_OVERRIDE: Record<string, string> = {
  // "대구 중구"라는 표시명은 실제 주소("대구광역시 중구 ...")에 부분 문자열로 나타나지 않아
  // region.name을 그대로 쓰면 POI가 전부 걸러진다(2026-08-07 발견). API 호출 자체는 이미
  // lDongRegnCd/lDongSignguCd로 대구 중구만 좁혀 조회하므로 "중구"만으로도 다른 도시 중구가
  // 섞여 들어올 위험은 없다.
  SGG_DAEGU_JUNG: "중구",
};

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

/**
 * NormalizedMetric을 upsert한다. `provenance`는 호출부가 명시적으로 결정한다(Phase 1-C, 2026-07-23) —
 * 이 함수는 오직 `res.status === "SUCCESS"`인 이번 실행의 실제 응답 처리 블록 안에서만 호출되므로,
 * 그 호출 자체가 "이번에 실제 성공 응답으로 갱신됨"의 증거다. 다만 VISITOR_CNT처럼 API 성공 여부와
 * 무관하게 필드 의미 자체가 아직 검증되지 않은 지표는 호출부가 `"ESTIMATED"`를 넘긴다
 * (docs/public-api-status.md: "지역별 방문자수 API — 여전히 미확인").
 */
async function upsertMetric(
  regionId: string,
  adminLevel: RegionLevel,
  baseYm: string,
  metricCode: string,
  rawValue: number,
  unit: string,
  sourceId: string,
  provenance: DataProvenance,
) {
  await prisma.normalizedMetric.upsert({
    where: { regionId_baseYm_metricCode: { regionId, baseYm, metricCode } },
    update: { rawValue, unit, adminLevel, sourceId, collectedAt: new Date(), provenance },
    create: { regionId, baseYm, metricCode, rawValue, unit, adminLevel, sourceId, provenance },
  });
}

/**
 * 같은 [regionId, baseYm]의 지정된 metricCode들 중 provenance가 정확히 "LIVE_API"인 것만 "CACHED_API"로
 * 바꾼다(Phase 1-C, 2026-07-23). value/baseYm/sourceId 등 업무 값은 건드리지 않는다.
 *
 * 호출 시점: `upsertSnapshot()`이 "기존 SUCCESS/EMPTY 스냅샷을 보존하고 이번 ERROR는 기록하지 않았다"고
 * 판단한 바로 그 실행 컨텍스트에서만 호출한다 — 이 순간이 "최신 API 호출이 실패해 이전 성공값을
 * 재사용한다"는 CACHED_API 정의를 실제로 만족하는 유일한 지점이다(DataSnapshot이 SUCCESS 상태를
 * 유지하는 한 사후적으로는 이 사실을 재구성할 방법이 없다 — 아래 upsertSnapshot 반환값 설계 참고).
 * provenance가 이미 "LIVE_API"가 아닌 행(NULL 포함)은 건드리지 않는다 — 그 행이 정말 "재사용된 실제
 * 성공값"이었다는 근거가 없기 때문이다(임의 backfill 금지 원칙).
 */
async function markMetricsAsCached(regionId: string, baseYm: string, metricCodes: string[]) {
  if (metricCodes.length === 0) return;
  await prisma.normalizedMetric.updateMany({
    where: { regionId, baseYm, metricCode: { in: metricCodes }, provenance: "LIVE_API" },
    data: { provenance: "CACHED_API" },
  });
}

/**
 * 어댑터가 실제로 받은 원본 응답(rawPayload)을 DataSnapshot에 upsert한다(Phase 1-B, 2026-07-23).
 * 호출 시점에 실제 본문이 하나도 없었으면(네트워크/timeout/JSON 파싱 실패) 이 함수 자체를 호출하지
 * 않는다 — rawPayload는 스키마상 NOT NULL이라 "본문 없음"을 지어낸 값 없이 정직하게 표현할 방법이
 * 없기 때문이다(기존 성공 스냅샷이 있다면 그것을 그대로 둔다 — 삭제하지 않는다).
 *
 * 갱신 정책(Phase 1-B 보완, 2026-07-23): 같은 [dataSourceId, regionId, baseYm]에 이미 SUCCESS/EMPTY
 * 스냅샷이 있는데 이번 응답이 ERROR(HTTP 통신은 됐지만 API 본문이 오류)라면, 이번 오류로 덮어쓰지 않고
 * 마지막 정상 스냅샷을 그대로 둔다 — 일시적 API 오류가 근거로 쓰이고 있는 마지막 정상 원본을 복구
 * 불가능하게 지우면 안 되기 때문이다. 같은 key에 정상 스냅샷이 아직 없으면(최초 호출이거나 이전에도
 * ERROR였으면) 실제로 받은 ERROR 본문을 그대로 저장한다. 이후 정상 응답을 받으면 그 ERROR 스냅샷은
 * 정상적으로 SUCCESS/EMPTY로 갱신된다(아래 upsert가 처리).
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
}): Promise<"WRITTEN" | "PRESERVED"> {
  const where = {
    dataSourceId_regionId_baseYm: {
      dataSourceId: params.dataSourceId,
      regionId: params.regionId,
      baseYm: params.baseYm,
    },
  };

  if (params.status === "ERROR") {
    const existing = await prisma.dataSnapshot.findUnique({ where, select: { status: true } });
    if (existing && (existing.status === "SUCCESS" || existing.status === "EMPTY")) {
      return "PRESERVED"; // 마지막 정상 스냅샷 보존 — 이번 오류 시도는 기록하지 않는다.
    }
  }

  await prisma.dataSnapshot.upsert({
    where,
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
  return "WRITTEN";
}

/**
 * VISITOR_CNT 전국 조회 결과(locgoResult/metcoResult)에서 region 하나에 해당하는 코드(signguCode 또는
 * areaCode)를 찾아 NormalizedMetric/DataSnapshot을 갱신한다. SIGUNGU/SIDO 양쪽 모두 이 함수로 처리한다.
 * ERROR면 기존 SUCCESS 스냅샷을 보존(upsertSnapshot의 preserve 정책)하고, 이 지역의 코드가 이번 응답에
 * 없으면(진짜 0건) EMPTY로 기록한다 — 지어낸 값을 upsert하지 않는다.
 *
 * 불변조건(2026-07-29 2차 수정): `syncVisitorCnt`는 `enforceCombinedDateCompleteness`가
 * `complete: true`를 반환했을 때만 이 함수를 호출한다 — 그 경우 locgo/metco는 항상 SUCCESS이므로
 * SUCCESS/EMPTY 분기에 도달했다는 것 자체가 "완전성 검증을 통과했다"는 증거가 되고, rawPayload에
 * `completeMonthVerified: true`를 안전하게 남길 수 있다(캐시 판정 근거, visitorCntCacheStore.ts 참고).
 * 완전성 검증에 실패한 경우는 이 함수를 아예 호출하지 않고 `reportVisitorCntIncomplete`가 대신 처리한다
 * (신규 DataSnapshot을 만들지 않기 위해서) — 아래 ERROR 분기는 이 함수가 직접(게이트 밖에서) 호출되는
 * 경우를 위한 방어 코드로 남겨둔다.
 */
async function upsertVisitorCntForRegion(params: {
  region: { id: string; code: string; level: RegionLevel };
  code: string | null;
  result: VisitorCntFetchResult | null;
  visitorSourceId: string;
  baseYm: string;
}): Promise<SyncSourceResult> {
  const { region, code, result, visitorSourceId, baseYm } = params;
  const sourceCode = `VISITOR_CNT:${region.code}`;

  if (!code || !result) {
    return {
      sourceCode,
      status: "SKIPPED",
      itemCount: 0,
      errorMessage: !code ? "apiAreaCode/apiSigunguCode 미설정 — 방문자수 매핑 제외" : "VISITOR_CNT 소스 미설정",
    };
  }

  if (result.status === "ERROR") {
    // rawPages가 비어 있으면 네트워크 실패 등으로 실제 응답 본문 자체를 받지 못한 것이다(다른 어댑터의
    // raw===null과 동일한 의미) — 지어낸 본문을 snapshot에 남기지 않고 조용히 건너뛴다.
    if (result.rawPages.length > 0) {
      const outcome = await upsertSnapshot({
        dataSourceId: visitorSourceId,
        regionId: region.id,
        baseYm,
        status: "ERROR",
        resultCode: result.resultCode,
        resultMsg: result.resultMsg,
        itemCount: 0,
        rawPayload: { resultCode: result.resultCode, resultMsg: result.resultMsg },
      });
      if (outcome === "PRESERVED") {
        await markMetricsAsCached(region.id, baseYm, [METRIC_CODES.VISITOR_CNT, METRIC_CODES.VISITOR_CNT_LOCAL]);
      }
    }
    return { sourceCode, status: "FAILED", itemCount: 0, errorMessage: result.resultMsg };
  }

  const agg = result.byCode.get(code);
  if (agg) {
    await upsertMetric(region.id, region.level, baseYm, METRIC_CODES.VISITOR_CNT, agg.visitorCnt, "명", visitorSourceId, "LIVE_API");
    await upsertMetric(region.id, region.level, baseYm, METRIC_CODES.VISITOR_CNT_LOCAL, agg.localNum, "명", visitorSourceId, "LIVE_API");
  }
  await upsertSnapshot({
    dataSourceId: visitorSourceId,
    regionId: region.id,
    baseYm,
    status: agg ? "SUCCESS" : "EMPTY",
    resultCode: result.resultCode,
    resultMsg: result.resultMsg,
    itemCount: agg?.rawItems.length ?? 0,
    // 전국 원본이 아니라 이 지역 코드에 해당하는 실제 응답 행만 추려 저장한다(원문 그대로, 가공 없음).
    // completeMonthVerified: 위 함수 doc의 불변조건 참고 — 이 값이 기록된 스냅샷만 checkVisitorCntCacheViaDataSnapshot이
    // 캐시로 인정한다.
    rawPayload: { code, items: agg?.rawItems ?? [], completeMonthVerified: true },
  });
  return { sourceCode, status: "SUCCESS", itemCount: agg?.rawItems.length ?? 0 };
}

/**
 * 완전성 게이트가 불완전 판정을 내렸을 때 지역 하나에 대한 보고만 만든다 — DataSnapshot은 절대 쓰지
 * 않는다(신규든 갱신이든). 기존에 이 region+baseYm에 LIVE_API metric이 있었다면(과거에 실제로 완전한
 * 달로 저장된 적이 있다면) 그 값이 "최신 시도가 실패해 재사용 중"이라는 사실을 반영해 CACHED_API로
 * 낮춘다 — markMetricsAsCached는 provenance="LIVE_API"인 행만 골라 바꾸므로, 아무 것도 없던 지역에는
 * 안전하게 no-op이다.
 */
async function reportVisitorCntIncomplete(params: {
  region: { id: string; code: string };
  code: string | null;
  baseYm: string;
  reason: string;
}): Promise<SyncSourceResult> {
  const { region, code, baseYm, reason } = params;
  const sourceCode = `VISITOR_CNT:${region.code}`;
  if (!code) {
    return { sourceCode, status: "SKIPPED", itemCount: 0, errorMessage: "apiAreaCode/apiSigunguCode 미설정 — 방문자수 매핑 제외" };
  }
  await markMetricsAsCached(region.id, baseYm, [METRIC_CODES.VISITOR_CNT, METRIC_CODES.VISITOR_CNT_LOCAL]);
  return {
    sourceCode,
    status: "FAILED",
    itemCount: 0,
    errorMessage: `기준월 ${baseYm} 완전성 검증 실패(${reason}) — 저장하지 않고 기존 SUCCESS/EMPTY 스냅샷을 보존한다`,
  };
}

/**
 * VISITOR_CNT 전용 동기화(2026-07-28 분리, 2026-07-29 원자적 게이트로 변경) — 전국 시군구/광역 응답을
 * baseYm당 한 번씩만 조회하고, 기초·광역이 **모두** SUCCESS이고 날짜가 완전할 때만 저장한다
 * (enforceCombinedDateCompleteness). 하나라도 불완전하면 저장 루프 자체에 진입하지 않는다(early
 * return) — 합성 ERROR 원문을 만들어 저장 함수에 넘긴 뒤 그 함수 내부에서 우회적으로 막는 방식은
 * 기존 스냅샷이 없는 지역에서도 신규 ERROR DataSnapshot을 만들어버리는 결함이 있어 폐기했다
 * (2026-07-29 2차 수정). `runTourismDataSync`(전체 6개 소스 동기화)와 `scripts/sync-visitor.ts`
 * (VISITOR_CNT만 동기화하는 CLI) 양쪽이 이 함수를 공유해 지역 매핑·저장 로직을 중복 구현하지 않는다.
 */
export async function syncVisitorCnt(params: {
  baseYm: string;
  serviceKey: string;
  visitorSource: { id: string; baseUrl: string };
  sigunguRegions: Array<{ id: string; code: string; level: RegionLevel; apiSigunguCode: string | null }>;
  sidoRegions: Array<{ id: string; code: string; level: RegionLevel; apiAreaCode: string | null }>;
}): Promise<SyncSourceResult[]> {
  const { baseYm, serviceKey, visitorSource, sigunguRegions, sidoRegions } = params;

  const [rawLocgo, rawMetco] = await Promise.all([
    fetchLocgoRegnVisitr({ serviceKey, baseUrl: visitorSource.baseUrl, baseYm }),
    fetchMetcoRegnVisitr({ serviceKey, baseUrl: visitorSource.baseUrl, baseYm }),
  ]);
  const gate = enforceCombinedDateCompleteness(baseYm, rawLocgo, rawMetco);

  if (!gate.complete) {
    const results: SyncSourceResult[] = [];
    for (const region of sigunguRegions) {
      results.push(await reportVisitorCntIncomplete({ region, code: region.apiSigunguCode, baseYm, reason: gate.assessment.reason ?? "UNKNOWN" }));
    }
    for (const region of sidoRegions) {
      results.push(await reportVisitorCntIncomplete({ region, code: region.apiAreaCode, baseYm, reason: gate.assessment.reason ?? "UNKNOWN" }));
    }
    return results;
  }

  const { locgo: locgoResult, metco: metcoResult } = gate;
  const results: SyncSourceResult[] = [];
  for (const region of sigunguRegions) {
    results.push(
      await upsertVisitorCntForRegion({
        region,
        code: region.apiSigunguCode,
        result: locgoResult,
        visitorSourceId: visitorSource.id,
        baseYm,
      }),
    );
  }
  for (const region of sidoRegions) {
    results.push(
      await upsertVisitorCntForRegion({
        region,
        code: region.apiAreaCode,
        result: metcoResult,
        visitorSourceId: visitorSource.id,
        baseYm,
      }),
    );
  }
  return results;
}

// apiAreaCode/apiSigunguCode는 null 가능(Region 스키마 그대로)이지만, 호출부가 이미 둘 다 채워진
// 지역만 골라 이 타입을 쓰는 함수들에 넘긴다(runTourismDataSync/runResumableLocalBatchSync의 null 체크
// 참고) — 어댑터 호출 시점에는 항상 실제 문자열이다.
type SigunguForSync = {
  id: string;
  code: string;
  name: string;
  level: RegionLevel;
  apiAreaCode: string | null;
  apiSigunguCode: string | null;
  tourApiLdongRegnCd: string | null;
  tourApiLdongSignguCd: string | null;
};

/**
 * region×데이터소스 1건에 대한 실 API 호출·저장 로직을 하나씩 담당하는 함수들(2026-08-09 추출) —
 * `runTourismDataSync`의 기존 인라인 루프 본문을 그대로 옮긴 것으로 동작을 바꾸지 않았다(회귀
 * 테스트로 확인). `runResumableLocalBatchSync`(재개 가능한 전국 배치)가 지역별 스킵 판정 후 실제
 * 호출이 필요한 조합에서만 이 함수들을 호출해 재사용한다 — API 호출·저장 로직을 중복 구현하지
 * 않기 위함이다.
 */
async function syncTarSvcDemForRegion(params: {
  region: SigunguForSync;
  baseYm: string;
  serviceKey: string;
  source: { id: string; baseUrl: string };
}): Promise<SyncSourceResult> {
  const { region, baseYm, serviceKey, source } = params;
  const res = await fetchTarSvcDem({
    serviceKey,
    baseUrl: source.baseUrl,
    areaCd: region.apiAreaCode!,
    signguCd: region.apiSigunguCode!,
    baseYm,
  });
  if (res.status === "SUCCESS") {
    for (const item of res.items) {
      if (item.tarSjrnDsIxVal !== undefined) {
        await upsertMetric(region.id, region.level, baseYm, METRIC_CODES.STAY, item.tarSjrnDsIxVal, "지수", source.id, "LIVE_API");
      }
      if (item.tarExpDsIxVal !== undefined) {
        await upsertMetric(region.id, region.level, baseYm, METRIC_CODES.SPEND, item.tarExpDsIxVal, "지수", source.id, "LIVE_API");
      }
    }
  }
  if (res.raw.stay !== null || res.raw.spend !== null) {
    const outcome = await upsertSnapshot({
      dataSourceId: source.id,
      regionId: region.id,
      baseYm,
      status: res.status,
      resultCode: res.resultCode,
      resultMsg: res.resultMsg,
      itemCount: res.items.length,
      rawPayload: res.raw,
    });
    if (outcome === "PRESERVED") {
      await markMetricsAsCached(region.id, baseYm, [METRIC_CODES.STAY, METRIC_CODES.SPEND]);
    }
  }
  return {
    sourceCode: `TAR_SVC_DEM:${region.code}`,
    status: res.status === "SUCCESS" ? "SUCCESS" : res.status === "EMPTY" ? "SUCCESS" : "FAILED",
    itemCount: res.items.length,
    errorMessage: res.status === "ERROR" ? res.resultMsg : undefined,
  };
}

async function syncTouDivIxForRegion(params: {
  region: SigunguForSync;
  baseYm: string;
  serviceKey: string;
  source: { id: string; baseUrl: string };
}): Promise<SyncSourceResult> {
  const { region, baseYm, serviceKey, source } = params;
  const res = await fetchTouDivIx({
    serviceKey,
    baseUrl: source.baseUrl,
    areaCd: region.apiAreaCode!,
    signguCd: region.apiSigunguCode!,
    baseYm,
  });
  if (res.status === "SUCCESS" && res.composite !== null) {
    await upsertMetric(region.id, region.level, baseYm, METRIC_CODES.DIVERSITY, res.composite, "지수", source.id, "LIVE_API");
  }
  const hasRealDivData = res.raw.tou.some((t) => t.data !== null) || res.raw.exp.some((e) => e.data !== null) || res.raw.intl.data !== null;
  if (hasRealDivData) {
    const outcome = await upsertSnapshot({
      dataSourceId: source.id,
      regionId: region.id,
      baseYm,
      status: res.status,
      resultCode: null,
      resultMsg: null,
      itemCount: res.itemCount,
      rawPayload: res.raw,
    });
    if (outcome === "PRESERVED") {
      await markMetricsAsCached(region.id, baseYm, [METRIC_CODES.DIVERSITY]);
    }
  }
  // res.quotaSignal은 res.status와 별개다 — 13개 코드 중 일부만 quota/429를 맞아도 나머지가 정상이면
  // res.status는 SUCCESS/EMPTY로 정상 계산되지만(이미 위에서 그 값 그대로 저장함), 이 지역이 실제로
  // quota 초과를 겪었다는 사실 자체는 감춰서는 안 된다 — FAILED로 강제해 아래 호출부의
  // isQuotaOrRateLimitSignal이 배치를 즉시 중단하게 한다(2026-08-10 수정, 저장된 데이터는 이미
  // 위에서 정상 처리됐으므로 여기서 상태를 바꿔도 데이터 정합성에 영향 없음).
  if (res.quotaSignal) {
    return { sourceCode: `TOU_DIV_IX:${region.code}`, status: "FAILED", itemCount: 0, errorMessage: res.quotaSignal };
  }
  return {
    sourceCode: `TOU_DIV_IX:${region.code}`,
    status: res.status === "ERROR" ? "FAILED" : "SUCCESS",
    itemCount: res.status === "ERROR" ? 0 : 1,
    errorMessage: res.status === "ERROR" ? res.resultMsg : undefined,
  };
}

async function syncTouResDemForRegion(params: {
  region: SigunguForSync;
  baseYm: string;
  serviceKey: string;
  source: { id: string; baseUrl: string };
}): Promise<SyncSourceResult> {
  const { region, baseYm, serviceKey, source } = params;
  const res = await fetchTouResDem({
    serviceKey,
    baseUrl: source.baseUrl,
    areaCd: region.apiAreaCode!,
    signguCd: region.apiSigunguCode!,
    baseYm,
  });
  if (res.status === "SUCCESS") {
    for (const item of res.items) {
      if (item.tarSvcDemIxVal !== undefined) {
        await upsertMetric(region.id, region.level, baseYm, METRIC_CODES.DEMAND_SERVICE, item.tarSvcDemIxVal, "지수", source.id, "LIVE_API");
      }
    }
  }
  if (res.raw !== null) {
    const outcome = await upsertSnapshot({
      dataSourceId: source.id,
      regionId: region.id,
      baseYm,
      status: res.status,
      resultCode: res.resultCode,
      resultMsg: res.resultMsg,
      itemCount: res.items.length,
      rawPayload: res.raw as object,
    });
    if (outcome === "PRESERVED") {
      await markMetricsAsCached(region.id, baseYm, [METRIC_CODES.DEMAND_SERVICE]);
    }
  }
  return {
    sourceCode: `TOU_RES_DEM:${region.code}`,
    status: res.status === "ERROR" ? "FAILED" : "SUCCESS",
    itemCount: res.items.length,
    errorMessage: res.status === "ERROR" ? res.resultMsg : undefined,
  };
}

async function syncTourInfoForRegion(params: {
  region: SigunguForSync;
  baseYm: string;
  serviceKey: string;
  source: { id: string; baseUrl: string } | undefined;
}): Promise<SyncSourceResult> {
  const { region, baseYm, serviceKey, source } = params;
  if (!source || !region.tourApiLdongRegnCd) {
    return {
      sourceCode: `TOUR_INFO:${region.code}`,
      status: "SKIPPED",
      itemCount: 0,
      errorMessage: "tourApiLdongRegnCd 미설정 — fixture POI 데이터 사용 중",
    };
  }
  const res = await fetchTourInfo({
    serviceKey,
    baseUrl: source.baseUrl,
    lDongRegnCd: region.tourApiLdongRegnCd,
    lDongSignguCd: region.tourApiLdongSignguCd ?? undefined,
  });
  let upserted = 0;
  if (res.status === "SUCCESS") {
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
          sourceId: source.id,
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
          sourceId: source.id,
          rawPayload: item,
        },
      });
      upserted++;
    }
  }
  if (res.raw.pages.length > 0) {
    await upsertSnapshot({
      dataSourceId: source.id,
      regionId: region.id,
      baseYm,
      status: res.status,
      resultCode: res.resultCode,
      resultMsg: res.resultMsg,
      itemCount: res.items.length,
      rawPayload: res.raw,
    });
  }
  return {
    sourceCode: `TOUR_INFO:${region.code}`,
    status: res.status === "ERROR" ? "FAILED" : "SUCCESS",
    itemCount: upserted,
    errorMessage: res.status === "ERROR" ? res.resultMsg : undefined,
  };
}

/**
 * 6개 공공데이터 API를 동기화한다. DATA_MODE=snapshot이거나 서비스키가 없으면 라이브 호출을
 * 생략하고 기존 성공 데이터를 그대로 유지한다(스냅샷 모드로 전체 데모 지속 가능). 일부 API가
 * 실패해도 다른 API의 기존 성공 데이터를 삭제하지 않는다 — 실패한 지표만 갱신을 건너뛴다.
 */
export async function runTourismDataSync(params: {
  baseYm: string;
  triggeredBy: SyncTrigger;
  /** 지정하면 이 SIGUNGU 지역 1곳만 동기화한다(2026-08-08 도입, 로컬 개발·전국 확장 대비 CLI 옵션) —
   * 생략하면 기존과 동일하게 전체 SIGUNGU를 동기화한다. 존재하지 않는 코드이거나 SIDO 코드면 API를
   * 전혀 호출하지 않고 즉시 실패를 반환한다(잘못된 지역을 조용히 전체 동기화로 넘기지 않는다). */
  regionCode?: string | null;
}): Promise<SyncRunResult> {
  const startedAt = new Date();
  const serviceKey = process.env.TOUR_API_SERVICE_KEY;
  const dataMode = process.env.DATA_MODE ?? "hybrid";
  const results: SyncSourceResult[] = [];

  // 대량 동기화 원격 DB 안전장치(2026-08-08) — CLI·cron·admin 세 진입점이 전부 이 함수 하나를
  // 공유하므로 여기서 한 번만 확인하면 셋 다 보호된다. DB 조회·API 호출 어느 쪽도 시작하기 전에
  // 순수 문자열 판정만으로 끝난다(dataSyncTargetGuard.ts 참고).
  const targetCheck = checkDataSyncTarget(process.env.DATABASE_URL, process.env[ALLOW_REMOTE_DATA_SYNC_ENV]);
  console.log(`[sync] ${targetCheck.targetLabel}`);
  if (!targetCheck.allowed) {
    return {
      baseYm: params.baseYm,
      skipped: true,
      overallStatus: "FAILED",
      results: [
        {
          sourceCode: "DATA_SYNC_TARGET_GUARD",
          status: "FAILED",
          itemCount: 0,
          errorMessage: targetCheck.blockedReason,
        },
      ],
    };
  }

  let targetRegion: Awaited<ReturnType<typeof prisma.region.findUnique>> = null;
  if (params.regionCode) {
    targetRegion = await prisma.region.findUnique({ where: { code: params.regionCode } });
    if (!targetRegion) {
      return {
        baseYm: params.baseYm,
        skipped: true,
        overallStatus: "FAILED",
        results: [
          {
            sourceCode: "REGION_FILTER",
            status: "FAILED",
            itemCount: 0,
            errorMessage: `지역 코드를 찾을 수 없습니다: "${params.regionCode}" — src/lib/fixtures/regions.ts의 REGION_SEED에 등록된 코드인지 확인하세요.`,
          },
        ],
      };
    }
    if (targetRegion.level !== "SIGUNGU") {
      return {
        baseYm: params.baseYm,
        skipped: true,
        overallStatus: "FAILED",
        results: [
          {
            sourceCode: "REGION_FILTER",
            status: "FAILED",
            itemCount: 0,
            errorMessage: `"${params.regionCode}"은(는) SIDO(시/도) 코드입니다 — --region-code에는 SIGUNGU(시/군/구) 코드만 지정할 수 있습니다.`,
          },
        ],
      };
    }
  }

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
  const regions = targetRegion ? [targetRegion] : await prisma.region.findMany({ where: { level: "SIGUNGU" } });

  // VISITOR_CNT(DataLabService)는 지역 필터가 없는 API라, 지역마다 반복 호출하지 않고 이번 baseYm의
  // 전국 응답을 시군구/광역 각각 1회만 조회한 뒤(syncVisitorCnt 내부에서 페이지네이션·날짜 완전성 검사·
  // 지역 매핑을 모두 처리) 결과를 붙인다(2026-07-28). SIDO는 위 regions(SIGUNGU 전용)에 없으므로 별도
  // 조회한다. targetRegion(단일 지역 필터)이 있으면 그 지역과 무관한 SIDO 집계 행을 건드리지 않도록
  // SIDO는 아예 대상에서 뺀다(2026-08-08) — API 호출 자체는 전국 응답 1회로 동일하지만, DB 갱신은
  // 요청한 지역 하나로만 좁힌다.
  const visitorSource = sourceByCode.get("VISITOR_CNT");
  if (visitorSource) {
    const sidoRegions = targetRegion ? [] : await prisma.region.findMany({ where: { level: "SIDO" } });
    results.push(
      ...(await syncVisitorCnt({
        baseYm: params.baseYm,
        serviceKey,
        visitorSource,
        sigunguRegions: regions,
        sidoRegions,
      })),
    );
  }

  for (const region of regions) {
    // 통계청 코드(apiAreaCode/apiSigunguCode)가 필요한 3개 소스만 여기서 건너뛴다 — TOUR_INFO는
    // 이 코드를 쓰지 않으므로(위 STAT_CODE_SOURCE_CODES 주석 참고) 코드 유무와 무관하게 항상 시도한다
    // (2026-08-09 전남광주통합 27곳 검증에서 발견한 과잉 차단 수정 — 예전에는 이 지역 전체를
    // "REGION:code SKIPPED" 한 줄로 건너뛰어 TOUR_INFO까지 불필요하게 막았었다).
    const hasStatCode = !!(region.apiAreaCode && region.apiSigunguCode);

    const svcSource = sourceByCode.get("TAR_SVC_DEM");
    if (svcSource) {
      results.push(
        hasStatCode
          ? await syncTarSvcDemForRegion({ region, baseYm: params.baseYm, serviceKey, source: svcSource })
          : {
              sourceCode: `TAR_SVC_DEM:${region.code}`,
              status: "SKIPPED",
              itemCount: 0,
              errorMessage: "apiAreaCode/apiSigunguCode 미설정 — 통계청 계열 소스 제외",
            },
      );
    }

    const divSource = sourceByCode.get("TOU_DIV_IX");
    if (divSource) {
      results.push(
        hasStatCode
          ? await syncTouDivIxForRegion({ region, baseYm: params.baseYm, serviceKey, source: divSource })
          : {
              sourceCode: `TOU_DIV_IX:${region.code}`,
              status: "SKIPPED",
              itemCount: 0,
              errorMessage: "apiAreaCode/apiSigunguCode 미설정 — 통계청 계열 소스 제외",
            },
      );
    }

    const resDemSource = sourceByCode.get("TOU_RES_DEM");
    if (resDemSource) {
      results.push(
        hasStatCode
          ? await syncTouResDemForRegion({ region, baseYm: params.baseYm, serviceKey, source: resDemSource })
          : {
              sourceCode: `TOU_RES_DEM:${region.code}`,
              status: "SKIPPED",
              itemCount: 0,
              errorMessage: "apiAreaCode/apiSigunguCode 미설정 — 통계청 계열 소스 제외",
            },
      );
    }

    const tourInfoSource = sourceByCode.get("TOUR_INFO");
    results.push(await syncTourInfoForRegion({ region, baseYm: params.baseYm, serviceKey, source: tourInfoSource }));
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

/** 실제 지역별 API 호출을 하는 4개 소스만 재개 가능한 전국 배치의 스킵 판정 대상이다. VISITOR_CNT는
 * 지역 필터 없는 전국 1회 호출(위 syncVisitorCnt 참고)이라 지역×소스 단위 스킵 모델에 맞지 않고,
 * POI_RELATION은 실 서비스가 없어 항상 SKIPPED이므로 둘 다 이 배치의 "대상 지역/완료/건너뜀/실패/
 * 남은 항목" 집계에서 제외한다(둘 다 결과 자체는 SyncLog·results 배열에는 그대로 남긴다). */
const RESUMABLE_SOURCE_CODES = ["TAR_SVC_DEM", "TOU_DIV_IX", "TOU_RES_DEM", "TOUR_INFO"] as const;

/** 통계청 행정표준코드(region.apiAreaCode/apiSigunguCode)가 실제로 필요한 소스만 여기 속한다
 * (2026-08-09 전남광주통합 27곳 검증에서 확인 — tarSvcDem.ts/touDivIx.ts/touResDem.ts 어댑터 파라미터
 * 타입이 모두 areaCd/signguCd를 필수로 요구한다). TOUR_INFO(tourInfo.ts)는 이 코드를 전혀 쓰지 않고
 * region.tourApiLdongRegnCd/tourApiLdongSignguCd만 쓰므로 여기 포함하지 않는다 — 포함시키면 통계청
 * 코드가 없다는 이유만으로 TOUR_INFO까지 불필요하게 건너뛰게 된다(과거 버그, 이번에 분리). */
const STAT_CODE_SOURCE_CODES: ReadonlySet<string> = new Set(["TAR_SVC_DEM", "TOU_DIV_IX", "TOU_RES_DEM"]);

/**
 * `fetchPublicDataJson`(client.ts)은 HTTP 429를 받으면 `errorMessage`에 문자열 `"HTTP 429"`만 남기고
 * (구조화된 상태 코드를 별도로 넘기지 않는다), `parsePublicDataEnvelope`(types.ts)는 HTTP 200이지만
 * 본문 resultCode가 실패인 경우를 그대로 통과시킨다(이 코드베이스에 quota 전용 resultCode 상수는
 * 정의돼 있지 않다 — 실제 확인된 것은 HTTP 429뿐이다, docs/public-api-status.md 참고). 따라서 quota/
 * 호출한도 신호는 이 문자열들을 통해서만 감지할 수 있다. "LIMITED_NUMBER_OF_SERVICE_REQUESTS"는
 * 공공데이터포털이 흔히 쓰는 오류 문구를 방어적으로 함께 검사한 것으로, 이 프로젝트에서 실제로 관측된
 * 사례는 아니다 — 두 신호 모두 만족 시 안전하게 종료하는 것이 놓치는 것보다 낫다는 판단이다.
 */
function isQuotaOrRateLimitSignal(message: string | undefined): boolean {
  if (!message) return false;
  return /HTTP\s*429|rate limit|too many requests|LIMITED_NUMBER_OF_SERVICE_REQUESTS/i.test(message);
}

async function getExistingSnapshotStatus(
  dataSourceId: string,
  regionId: string,
  baseYm: string,
): Promise<"SUCCESS" | "EMPTY" | "ERROR" | null> {
  const existing = await prisma.dataSnapshot.findUnique({
    where: { dataSourceId_regionId_baseYm: { dataSourceId, regionId, baseYm } },
    select: { status: true },
  });
  return existing?.status ?? null;
}

/**
 * VISITOR_CNT는 지역 필터 없는 전국 1회 호출이라(syncVisitorCnt 참고) 위 `getExistingSnapshotStatus`의
 * 지역×소스 단위 스킵 모델을 그대로 쓸 수 없다 — 대신 "이번 배치의 대상 지역 전체가 이미 이 baseYm에
 * 대해 SUCCESS/EMPTY인가"를 한 번의 쿼리로 확인한다(2026-08-10 도입). 전국 배치는 매번 sigunguRegions에
 * 전체 SIGUNGU를, sidoRegions에 전체 SIDO를 그대로 넘기므로(--max-regions와 무관), 처음 한 번
 * 완전히 성공하면 그 이후의 모든 배치 실행에서 이 함수가 true를 반환해 전국 API 재호출 자체를
 * 생략할 수 있다.
 *
 * apiAreaCode/apiSigunguCode가 없는 지역(예: 전남광주통합 SIDO)은 애초에 `upsertVisitorCntForRegion`이
 * 항상 SKIPPED만 반환하고 DataSnapshot을 아예 만들지 않는다 — 이런 지역까지 "SUCCESS/EMPTY 스냅샷이
 * 있어야 완료"로 요구하면 영원히 완료 판정이 나지 않으므로, 코드가 없는 지역은 애초에 대상에서 뺀다.
 */
async function isVisitorCntComplete(
  visitorSourceId: string,
  baseYm: string,
  sigunguRegions: Array<{ id: string; apiSigunguCode: string | null }>,
  sidoRegions: Array<{ id: string; apiAreaCode: string | null }>,
): Promise<boolean> {
  const eligibleIds = [
    ...sigunguRegions.filter((r) => r.apiSigunguCode).map((r) => r.id),
    ...sidoRegions.filter((r) => r.apiAreaCode).map((r) => r.id),
  ];
  if (eligibleIds.length === 0) return true;

  const snapshots = await prisma.dataSnapshot.findMany({
    where: { dataSourceId: visitorSourceId, baseYm, regionId: { in: eligibleIds }, status: { in: ["SUCCESS", "EMPTY"] } },
    select: { regionId: true },
  });
  const completedIds = new Set(snapshots.map((s) => s.regionId));
  return eligibleIds.every((id) => completedIds.has(id));
}

/** `isVisitorCntComplete`가 true일 때 실제 API를 부르지 않고 채우는 결과 — 코드가 있는 지역은 "이미
 * 완료돼 재호출 생략", 코드가 없는 지역은 `upsertVisitorCntForRegion`이 항상 만들어내는 것과 정확히
 * 같은 SKIPPED 메시지를 그대로 재현해 결과의 의미를 왜곡하지 않는다. */
function skippedVisitorCntResult(region: { code: string }, hasCode: boolean): SyncSourceResult {
  return {
    sourceCode: `VISITOR_CNT:${region.code}`,
    status: "SKIPPED",
    itemCount: 0,
    errorMessage: hasCode
      ? "이미 완료된 baseYm — 전국 API 재호출 생략(기존 SUCCESS/EMPTY 유지)"
      : "apiAreaCode/apiSigunguCode 미설정 — 방문자수 매핑 제외",
  };
}

export interface LocalBatchSyncResult {
  baseYm: string;
  /** 실제 DB 조회로 확인한 전체 SIGUNGU 지역 수(하드코딩 없음). */
  totalRegions: number;
  /** 이번 실행에서 실제로 새 API 호출을 1건 이상 시도한 지역 수(--max-regions 예산 소비 기준). */
  processedRegions: number;
  /** 이번 실행에서 새로 성공한 지역×소스 조합 수. */
  completed: number;
  /** 이미 완료돼 재호출하지 않았거나(SUCCESS/EMPTY 보존) 설정 미비로 건너뛴 지역×소스 조합 수. */
  skipped: number;
  /** 이번 실행에서 실패한 지역×소스 조합 수. */
  failed: number;
  /** 이번 실행에서 아직 시도조차 하지 못한 지역×소스 조합 수(예산 도달 또는 quota 중단으로 인한). */
  remaining: number;
  /** quota/429 감지로 중단됐는지 여부. */
  stoppedDueToQuota: boolean;
  /** 이번 실행에서 실제로 시도된 외부 API 요청 수(재시도 포함, 데이터소스별 — requestCounter.ts
   * 참고). 조기 종료(원격 DB 차단, quota 중단)여도 그 시점까지의 실제 값이 들어간다. */
  requestCounts: RequestCountSnapshot;
  results: SyncSourceResult[];
}

/**
 * 재개 가능한 전국 순차 로컬 배치 동기화(2026-08-09 도입). 같은 baseYm에 이미 SUCCESS/EMPTY
 * DataSnapshot이 있는 (지역, 데이터소스) 조합은 재호출하지 않는다 — EMPTY는 "API 호출은 성공했지만
 * 실제로 0건"이라는, 과거 확정된 달에 대해서는 다시 불러도 바뀌지 않는 사실이므로(schema.prisma의
 * SnapshotStatus 주석 "API 성공 응답이지만 0건" 참고) SUCCESS와 동일하게 "이미 완료"로 취급해 재호출
 * 대상에서 뺀다. ERROR나 스냅샷이 아예 없는 조합만 이번 실행의 재호출 대상이 된다.
 *
 * `--max-regions`는 실제로 새 API 호출을 시도한 지역 수를 기준으로 예산을 소비한다 — 이미 완료돼
 * 건너뛰기만 하는 지역은 API를 전혀 부르지 않으므로 예산을 쓰지 않고 무료로 통과한다. 지역 순회
 * 도중 한 소스라도 quota/429 신호(`isQuotaOrRateLimitSignal`)를 감지하면 그 지역의 남은 소스와 이후
 * 지역은 전혀 호출하지 않고 즉시 멈춘다(트랜잭션 롤백 없음 — 이미 저장된 SUCCESS/EMPTY 스냅샷은 그대로
 * 남는다). 다음 실행에서 같은 `--base-ym`으로 다시 호출하면 이미 완료된 조합은 건너뛰고 이어서
 * 진행된다.
 *
 * VISITOR_CNT(전국 지역 필터 없는 1회 호출)와 POI_RELATION(fixture 전용, 실 서비스 없음)은 이 배치의
 * 지역×소스 재개 모델과 맞지 않아 "대상 지역/완료/건너뜀/실패/남은 항목" 집계에서 제외한다(VISITOR_CNT는
 * 그대로 한 번 호출해 결과를 남기고, 거기서도 quota 신호가 나오면 지역 순회 자체를 시작하지 않고
 * 즉시 종료한다).
 */
interface RunResumableLocalBatchSyncParams {
  baseYm: string;
  triggeredBy: SyncTrigger;
  /** 이번 실행에서 실제 API 호출을 시도할 최대 지역 수. 기본값을 추정하지 않으므로 호출부(CLI)가
   * 항상 명시적으로 넘겨야 한다. */
  maxRegions: number;
}

/**
 * `runResumableLocalBatchSync`의 실제 구현. `requestCounts`를 뺀 결과를 반환하고, 바깥의
 * `withRequestCounter`가 이 함수 실행 동안의 실제 API 요청 집계를 붙여 최종 결과를 만든다 —
 * 계측 로직과 기존 배치 로직을 분리해 회귀 위험 없이 관측 기능만 얹은 것이다.
 */
async function runResumableLocalBatchSyncImpl(
  params: RunResumableLocalBatchSyncParams,
): Promise<Omit<LocalBatchSyncResult, "requestCounts">> {
  const { baseYm, triggeredBy, maxRegions } = params;
  const startedAt = new Date();
  const serviceKey = process.env.TOUR_API_SERVICE_KEY;
  const dataMode = process.env.DATA_MODE ?? "hybrid";
  const results: SyncSourceResult[] = [];

  const emptyResult = (
    overrides: Partial<Omit<LocalBatchSyncResult, "requestCounts">>,
  ): Omit<LocalBatchSyncResult, "requestCounts"> => ({
    baseYm,
    totalRegions: 0,
    processedRegions: 0,
    completed: 0,
    skipped: 0,
    failed: 0,
    remaining: 0,
    stoppedDueToQuota: false,
    results,
    ...overrides,
  });

  const targetCheck = checkDataSyncTarget(process.env.DATABASE_URL, process.env[ALLOW_REMOTE_DATA_SYNC_ENV]);
  console.log(`[sync-batch] ${targetCheck.targetLabel}`);
  if (!targetCheck.allowed) {
    results.push({ sourceCode: "DATA_SYNC_TARGET_GUARD", status: "FAILED", itemCount: 0, errorMessage: targetCheck.blockedReason });
    return emptyResult({});
  }

  if (!serviceKey || dataMode === "snapshot") {
    const errorMessage = !serviceKey
      ? "TOUR_API_SERVICE_KEY 미설정 — 라이브 호출 생략, 기존 스냅샷 유지"
      : "DATA_MODE=snapshot — 라이브 호출 생략, 기존 스냅샷 유지";
    console.log(`[sync-batch] ${errorMessage}`);
    results.push({ sourceCode: "ALL", status: "SKIPPED", itemCount: 0, errorMessage });
    await prisma.syncLog.create({
      data: { baseYm, triggeredBy, overallStatus: "SUCCESS", results: results as unknown as object, startedAt, endedAt: new Date() },
    });
    return emptyResult({});
  }

  const dataSources = await prisma.dataSource.findMany();
  const sourceByCode = new Map(dataSources.map((d) => [d.code, d]));
  const regions = await prisma.region.findMany({ where: { level: "SIGUNGU" }, orderBy: { code: "asc" } });
  const totalRegions = regions.length;
  const activeSourceCodes = RESUMABLE_SOURCE_CODES.filter((code) => sourceByCode.has(code));

  let completed = 0;
  let skipped = 0;
  let failed = 0;
  let processedRegions = 0;
  let stoppedDueToQuota = false;

  // 지역별 "단위 수" = 실제 사용 가능한 소스 수(activeSourceCodes.length)로 지역마다 동일하다
  // (2026-08-09 수정 — 예전에는 통계청 코드 미설정 지역을 "REGION 스킵 항목 1개"로 뭉뚱그렸는데, 그
  // 지역의 TOUR_INFO까지 함께 세지 못했다. 이제 각 소스는 자신에게 필요한 코드가 있는지 개별적으로
  // 판단하므로(아래 루프), 지역당 단위 수는 언제나 activeSourceCodes.length다). 남은 항목(remaining)을
  // 어디서 멈추든 정확히 계산하기 위해 미리 총합을 구해 둔다(하드코딩 없음).
  const totalUnits = regions.length * activeSourceCodes.length;

  const visitorSource = sourceByCode.get("VISITOR_CNT");
  if (visitorSource) {
    const sidoRegions = await prisma.region.findMany({ where: { level: "SIDO" } });
    const alreadyComplete = await isVisitorCntComplete(visitorSource.id, baseYm, regions, sidoRegions);
    let visitorResults: SyncSourceResult[];
    if (alreadyComplete) {
      console.log(`[sync-batch] VISITOR_CNT — 대상 지역 전부 이미 완료(SUCCESS/EMPTY) — 전국 API 재호출 생략`);
      visitorResults = [
        ...regions.map((r) => skippedVisitorCntResult(r, !!r.apiSigunguCode)),
        ...sidoRegions.map((r) => skippedVisitorCntResult(r, !!r.apiAreaCode)),
      ];
    } else {
      visitorResults = await syncVisitorCnt({ baseYm, serviceKey, visitorSource, sigunguRegions: regions, sidoRegions });
    }
    results.push(...visitorResults);
    const visitorQuotaHit = visitorResults.some((r) => r.status === "FAILED" && isQuotaOrRateLimitSignal(r.errorMessage));
    if (visitorQuotaHit) {
      console.log(`[sync-batch] VISITOR_CNT에서 quota/429 감지 — 지역 순회를 시작하지 않고 즉시 종료`);
      stoppedDueToQuota = true;
      console.log(
        `[sync-batch] 종료 — 대상 지역: ${totalRegions}, 완료: 0, 건너뜀: 0, 실패: 0, 남은 항목: ${totalUnits}, quota 중단: 예`,
      );
      await prisma.syncLog.create({
        data: { baseYm, triggeredBy, overallStatus: "PARTIAL", results: results as unknown as object, startedAt, endedAt: new Date() },
      });
      return emptyResult({ totalRegions, remaining: totalUnits, stoppedDueToQuota: true });
    }
  }

  outer: for (let idx = 0; idx < regions.length; idx++) {
    const region = regions[idx];

    if (processedRegions >= maxRegions) {
      console.log(`[sync-batch] 예산(--max-regions=${maxRegions}) 도달 — 지역 순회 중단`);
      break;
    }

    let regionAttempted = false;

    for (const sourceCode of activeSourceCodes) {
      const source = sourceByCode.get(sourceCode)!;

      // 통계청 코드가 필요한 소스인데 이 지역에 없으면(예: 전남광주통합 27곳) 그 소스만 건너뛴다 —
      // TOUR_INFO는 STAT_CODE_SOURCE_CODES에 없으므로 이 분기를 타지 않고 항상 시도한다(2026-08-09
      // 수정, 예전에는 지역 전체를 건너뛰어 TOUR_INFO까지 막았었다).
      if (STAT_CODE_SOURCE_CODES.has(sourceCode) && (!region.apiAreaCode || !region.apiSigunguCode)) {
        console.log(`[${idx + 1}/${totalRegions}] ${region.name} - ${sourceCode} 건너뜀(apiAreaCode/apiSigunguCode 미설정)`);
        results.push({
          sourceCode: `${sourceCode}:${region.code}`,
          status: "SKIPPED",
          itemCount: 0,
          errorMessage: "apiAreaCode/apiSigunguCode 미설정 — 통계청 계열 소스 제외",
        });
        skipped++;
        continue;
      }

      const existingStatus = await getExistingSnapshotStatus(source.id, region.id, baseYm);
      if (existingStatus === "SUCCESS" || existingStatus === "EMPTY") {
        console.log(`[${idx + 1}/${totalRegions}] ${region.name} - ${sourceCode} 건너뜀(이미 완료)`);
        results.push({
          sourceCode: `${sourceCode}:${region.code}`,
          status: "SKIPPED",
          itemCount: 0,
          errorMessage: "이미 완료된 지역×데이터소스 — 재호출하지 않음",
        });
        skipped++;
        continue;
      }

      let sourceResult: SyncSourceResult;
      switch (sourceCode) {
        case "TAR_SVC_DEM":
          sourceResult = await syncTarSvcDemForRegion({ region, baseYm, serviceKey, source });
          break;
        case "TOU_DIV_IX":
          sourceResult = await syncTouDivIxForRegion({ region, baseYm, serviceKey, source });
          break;
        case "TOU_RES_DEM":
          sourceResult = await syncTouResDemForRegion({ region, baseYm, serviceKey, source });
          break;
        case "TOUR_INFO":
          sourceResult = await syncTourInfoForRegion({ region, baseYm, serviceKey, source });
          break;
      }
      results.push(sourceResult);

      if (sourceResult.status === "SKIPPED") {
        // TOUR_INFO가 tourApiLdongRegnCd 미설정으로 API 자체를 부르지 않은 경우 — 실제 호출이 없었으므로
        // regionAttempted를 켜지 않는다(다른 소스가 이미 켰다면 그대로 유지).
        console.log(`[${idx + 1}/${totalRegions}] ${region.name} - ${sourceCode} 건너뜀(${sourceResult.errorMessage ?? "설정 미비"})`);
        skipped++;
        continue;
      }

      regionAttempted = true;

      if (sourceResult.status === "FAILED") {
        console.log(`[${idx + 1}/${totalRegions}] ${region.name} - ${sourceCode} 실패${sourceResult.errorMessage ? `: ${sourceResult.errorMessage}` : ""}`);
        failed++;
        if (isQuotaOrRateLimitSignal(sourceResult.errorMessage)) {
          console.log(`[sync-batch] ${region.name} - ${sourceCode}에서 quota/429 감지 — 이후 호출을 멈추고 안전 종료(이미 수집된 데이터는 보존됨)`);
          stoppedDueToQuota = true;
          if (regionAttempted) processedRegions++;
          break outer;
        }
      } else {
        console.log(`[${idx + 1}/${totalRegions}] ${region.name} - ${sourceCode} 수집 완료`);
        completed++;
      }
    }

    if (regionAttempted) processedRegions++;
  }

  const remaining = Math.max(0, totalUnits - (completed + skipped + failed));

  console.log(
    `[sync-batch] 종료 — 대상 지역: ${totalRegions}, 완료: ${completed}, 건너뜀: ${skipped}, 실패: ${failed}, ` +
      `남은 항목: ${remaining}, quota 중단: ${stoppedDueToQuota ? "예" : "아니오"}`,
  );

  const overallStatus: SyncRunResult["overallStatus"] = failed === 0 ? "SUCCESS" : completed > 0 || skipped > 0 ? "PARTIAL" : "FAILED";
  await prisma.syncLog.create({
    data: { baseYm, triggeredBy, overallStatus, results: results as unknown as object, startedAt, endedAt: new Date() },
  });

  return {
    baseYm,
    totalRegions,
    processedRegions,
    completed,
    skipped,
    failed,
    remaining,
    stoppedDueToQuota,
    results,
  };
}

/** 종료 요약에 표시할 5개 데이터소스 — 사용자가 실제로 보고 싶어 하는 구분과 정확히 일치시킨다. */
const REPORTED_DATA_SOURCE_CODES = ["TAR_SVC_DEM", "TOU_DIV_IX", "TOU_RES_DEM", "VISITOR_CNT", "TOUR_INFO"] as const;

function logRequestCounts(counts: RequestCountSnapshot): void {
  const parts = REPORTED_DATA_SOURCE_CODES.map((code) => `${code}: ${counts.byDataSource[code] ?? 0}회`);
  console.log(`[sync-batch] API 요청 집계 — ${parts.join(", ")}, 합계: ${counts.total}회`);
}

/**
 * 전국 재개형 로컬 배치 동기화(공개 API) — 실제 로직은 `runResumableLocalBatchSyncImpl`에 그대로
 * 있고, 이 함수는 그 실행 전체를 `withRequestCounter`로 감싸 실제 외부 API 요청 수(재시도 포함)를
 * 데이터소스별로 집계해 결과에 붙이기만 한다(2026-08-10 도입). 원격 DB 차단이나 quota 중단처럼
 * 도중에 끝나는 경우도 그 시점까지의 실제 집계값이 그대로 반영된다 — impl 내부의 어떤 return
 * 경로를 타든 항상 여기서 한 번만 로그를 남기므로 누락 걱정이 없다.
 */
export async function runResumableLocalBatchSync(params: RunResumableLocalBatchSyncParams): Promise<LocalBatchSyncResult> {
  const { result, requestCounts } = await withRequestCounter(() => runResumableLocalBatchSyncImpl(params));
  logRequestCounts(requestCounts);
  return { ...result, requestCounts };
}
