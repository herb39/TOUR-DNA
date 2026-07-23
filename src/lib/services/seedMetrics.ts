import { prisma } from "@/lib/db";
import type { DataProvenance } from "@/lib/domain/types";

/**
 * 실 서비스키로 사람이 직접 확인한 기준월(2026-07-21, 대전/제천/양양/경주/강릉/제주/통영 7개 지역의
 * 202605·202606 값을 실 API 호출로 확인 — docs/public-api-status.md, src/lib/fixtures/metrics.ts 주석
 * 참고). 이 기준월의 STAY/SPEND/DIVERSITY/DEMAND_SERVICE 값은 "사람이 검증해 확정한 값"이라 CURATED,
 * 그 이전(202508/202509)은 실키 발급 전 지역 특성을 반영해 만든 추정치라 ESTIMATED로 구분한다.
 */
export const HUMAN_VERIFIED_BASE_YMS = new Set(["202605", "202606"]);

/** 위 기준월 판정 규칙을 순수 함수로 노출한다(테스트에서 DB 없이 검증 가능). */
export function classifyVerifiedMetricProvenance(baseYm: string): Extract<DataProvenance, "CURATED" | "ESTIMATED"> {
  return HUMAN_VERIFIED_BASE_YMS.has(baseYm) ? "CURATED" : "ESTIMATED";
}

/**
 * seed 전용 NormalizedMetric upsert(Phase 1-D, 2026-07-23). seed 데이터는 실제 API를 호출한 적이
 * 없으므로 DataSnapshot을 만들지 않는다 — `DataSnapshot.status`(SUCCESS/EMPTY/ERROR)에는 "fixture/
 * 큐레이션" 상태값 자체가 없어 SUCCESS를 붙이면 실제 API 성공 응답처럼 보이는 가짜 snapshot이 된다
 * (이전 구현의 문제, prisma/seed.ts 참고). `provenance`는 호출부가 명시적으로 결정한 CURATED 또는
 * ESTIMATED만 허용한다 — LIVE_API/CACHED_API는 실제 API 성공/재사용 근거가 있을 때만 쓰는 값이라
 * seed 데이터에는 쓰지 않는다(호출부에서 강제).
 */
export async function upsertSeedMetric(params: {
  sourceCode: string;
  regionCode: string;
  baseYm: string;
  metricCode: string;
  rawValue: number;
  unit: string;
  provenance: Extract<DataProvenance, "CURATED" | "ESTIMATED">;
}) {
  const source = await prisma.dataSource.findUniqueOrThrow({ where: { code: params.sourceCode } });
  const region = await prisma.region.findUniqueOrThrow({ where: { code: params.regionCode } });

  await prisma.normalizedMetric.upsert({
    where: {
      regionId_baseYm_metricCode: { regionId: region.id, baseYm: params.baseYm, metricCode: params.metricCode },
    },
    update: {
      rawValue: params.rawValue,
      unit: params.unit,
      adminLevel: region.level,
      sourceId: source.id,
      provenance: params.provenance,
    },
    create: {
      regionId: region.id,
      baseYm: params.baseYm,
      metricCode: params.metricCode,
      rawValue: params.rawValue,
      unit: params.unit,
      adminLevel: region.level,
      sourceId: source.id,
      provenance: params.provenance,
    },
  });
}
