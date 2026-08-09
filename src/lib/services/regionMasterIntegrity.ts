/**
 * REGION_SEED(src/lib/fixtures/regions.ts) 자체의 구조적 무결성만 검사하는 순수 함수(2026-08-09
 * 도입, 전국 Region 마스터 확장과 함께 추가). DB/API 접근이 전혀 없다 — REGION_SEED 배열만 입력받아
 * 즉시 계산되므로 단위테스트·CI에서 안전하게 반복 실행할 수 있다.
 *
 * regionCodeAudit.ts(2026-07-28 도입)와의 차이: 그쪽은 "Region 코드가 실제 API 응답과 일치하는가"를
 * 확인하는 API 대조용이고(실 API 응답이 있어야 의미가 있음), 이 모듈은 "REGION_SEED 배열 자체가
 * 내적으로 일관된 구조인가"만 본다(부모 연결, 코드 중복, 필수 코드 누락) — API 호출 없이도 매 커밋마다
 * 돌릴 수 있는 게 이 모듈의 존재 이유다.
 */

export interface RegionMasterEntry {
  code: string;
  name: string;
  level: "SIDO" | "SIGUNGU";
  parentCode: string | null;
  apiAreaCode: string | null;
  apiSigunguCode: string | null;
  tourApiLdongRegnCd: string | null;
  tourApiLdongSignguCd: string | null;
}

export interface RegionMasterIntegrityResult {
  totalSido: number;
  totalSigungu: number;
  /** Region.code 중복(레벨 무관 — 유일해야 하는 기본키 역할). */
  duplicateRegionCodes: string[];
  /** parentCode가 없거나(null), 있어도 SIDO 목록에서 찾을 수 없는 SIGUNGU. */
  sigunguWithoutValidParent: string[];
  /** apiAreaCode/apiSigunguCode(통계청 행정표준코드) 중 하나라도 없는 SIGUNGU — TAR_SVC_DEM 등
   * 3개 지표 API 호출이 불가능하다. */
  sigunguMissingStatCode: string[];
  /** tourApiLdongRegnCd가 없는 SIGUNGU — TOUR_INFO는 없어도 SKIPPED로 정상 동작하므로 오류가 아니라
   * 참고용 목록이다. */
  sigunguMissingLdongCode: string[];
  /** 같은 부모 SIDO 아래에서 tourApiLdongSignguCd(시군구 3자리)가 중복되는 경우 — 정상 구조라면
   * 있을 수 없다(같은 시/도 안에서 시군구 코드는 유일해야 함). */
  duplicateSigunguCodeWithinSido: string[];
  /** apiSigunguCode(5자리 전체) 중복 — SIGUNGU 전체를 통틀어 유일해야 한다. */
  duplicateApiSigunguCode: string[];
}

/**
 * `모든 검사를 통과했는가`를 한 번에 판정하고 싶을 때 쓰는 헬퍼. tourApiLdongRegnCd 누락은 TOUR_INFO만
 * SKIPPED로 만들 뿐 다른 4개 소스(TAR_SVC_DEM/TOU_DIV_IX/TOU_RES_DEM/VISITOR_CNT)는 정상 동작하므로
 * "치명적 결함" 판정에서 제외한다.
 */
export function isRegionMasterHealthy(result: RegionMasterIntegrityResult): boolean {
  return (
    result.duplicateRegionCodes.length === 0 &&
    result.sigunguWithoutValidParent.length === 0 &&
    result.sigunguMissingStatCode.length === 0 &&
    result.duplicateSigunguCodeWithinSido.length === 0 &&
    result.duplicateApiSigunguCode.length === 0
  );
}

export function checkRegionMasterIntegrity(regions: RegionMasterEntry[]): RegionMasterIntegrityResult {
  const sidoCodes = new Set(regions.filter((r) => r.level === "SIDO").map((r) => r.code));

  const codeCounts = new Map<string, number>();
  for (const r of regions) codeCounts.set(r.code, (codeCounts.get(r.code) ?? 0) + 1);
  const duplicateRegionCodes = [...codeCounts.entries()].filter(([, c]) => c > 1).map(([code]) => code);

  const sigungu = regions.filter((r) => r.level === "SIGUNGU");

  const sigunguWithoutValidParent = sigungu
    .filter((r) => !r.parentCode || !sidoCodes.has(r.parentCode))
    .map((r) => r.code);

  const sigunguMissingStatCode = sigungu
    .filter((r) => !r.apiAreaCode || !r.apiSigunguCode)
    .map((r) => r.code);

  const sigunguMissingLdongCode = sigungu.filter((r) => !r.tourApiLdongRegnCd).map((r) => r.code);

  const apiSigunguCodeCounts = new Map<string, number>();
  for (const r of sigungu) {
    if (!r.apiSigunguCode) continue;
    apiSigunguCodeCounts.set(r.apiSigunguCode, (apiSigunguCodeCounts.get(r.apiSigunguCode) ?? 0) + 1);
  }
  const duplicateApiSigunguCode = [...apiSigunguCodeCounts.entries()]
    .filter(([, c]) => c > 1)
    .map(([code]) => code);

  const bySidoLdongSignguCd = new Map<string, string[]>();
  for (const r of sigungu) {
    if (!r.parentCode || !r.tourApiLdongSignguCd) continue;
    const arr = bySidoLdongSignguCd.get(r.parentCode) ?? [];
    arr.push(r.tourApiLdongSignguCd);
    bySidoLdongSignguCd.set(r.parentCode, arr);
  }
  const duplicateSigunguCodeWithinSido: string[] = [];
  for (const [sidoCode, codes] of bySidoLdongSignguCd) {
    const seen = new Set<string>();
    for (const c of codes) {
      if (seen.has(c)) duplicateSigunguCodeWithinSido.push(`${sidoCode}:${c}`);
      seen.add(c);
    }
  }

  return {
    totalSido: regions.filter((r) => r.level === "SIDO").length,
    totalSigungu: sigungu.length,
    duplicateRegionCodes,
    sigunguWithoutValidParent,
    sigunguMissingStatCode,
    sigunguMissingLdongCode,
    duplicateSigunguCodeWithinSido,
    duplicateApiSigunguCode,
  };
}
