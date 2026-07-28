/**
 * Region 테이블의 행정구역 코드(apiAreaCode/apiSigunguCode)를 실제 VISITOR_CNT API 응답에서 관측된
 * 코드 전체와 대조하는 순수 함수(2026-07-28 도입). DB/API 접근은 호출부(scripts/audit-region-codes.ts)가
 * 담당하고, 이 함수는 이미 조회된 값만으로 감사 결과를 계산한다 — 실제 접근 없이 단위 테스트 가능.
 *
 * 매핑 기준은 행정구역 코드 자체다(지역명 문자열 비교로 자동 매핑하지 않는다) — 지역명은 사람이 감사
 * 결과를 읽을 때 참고하는 보조 정보로만 결과에 포함한다. 코드 앞자리 0 손실을 막기 위해 코드는 항상
 * 문자열로 다룬다(호출부도 숫자로 변환하면 안 된다).
 */

export interface RegionLike {
  code: string;
  name: string;
  level: "SIDO" | "SIGUNGU";
  apiAreaCode: string | null;
  apiSigunguCode: string | null;
}

export type RegionCodeIssueType = "MISSING_CODE" | "DUPLICATE_CODE" | "INVALID_FORMAT" | "API_ONLY" | "REGION_ONLY";

export interface RegionCodeIssue {
  type: RegionCodeIssueType;
  level: "SIDO" | "SIGUNGU" | null;
  regionCode: string | null;
  regionName: string | null;
  apiCode: string | null;
  detail: string;
}

export interface HighlightStatus {
  regionCode: string;
  name: string | null;
  apiSigunguCode: string | null;
  apiAreaCode: string | null;
  status: "OK" | RegionCodeIssueType | "NOT_FOUND";
}

export interface RegionCodeAuditResult {
  totalRegions: number;
  okCount: number;
  issues: RegionCodeIssue[];
  /** 강릉·경주·제천 대표 시나리오 매핑 상태(사용자 요구사항). */
  highlights: HighlightStatus[];
}

const AREA_CODE_PATTERN = /^\d{2}$/;
const SIGUNGU_CODE_PATTERN = /^\d{5}$/;

/** 강릉·경주·제천의 REGION_SEED 코드(src/lib/fixtures/regions.ts 기준). */
export const HIGHLIGHT_REGION_CODES = ["SGG_GANGNEUNG", "SGG_GYEONGJU", "SGG_JECHEON"];

function groupByCode<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = keyOf(item);
    const arr = map.get(k) ?? [];
    arr.push(item);
    map.set(k, arr);
  }
  return map;
}

export function auditRegionCodes(params: {
  regions: RegionLike[];
  /** 실제 metcoRegnVisitrDDList 응답에서 관측된 areaCode 전체(광역). */
  apiAreaCodes: Set<string>;
  /** 실제 locgoRegnVisitrDDList 응답에서 관측된 signguCode 전체(기초). */
  apiSignguCodes: Set<string>;
}): RegionCodeAuditResult {
  const { regions, apiAreaCodes, apiSignguCodes } = params;
  const issues: RegionCodeIssue[] = [];
  const issueRegionCodes = new Set<string>();

  function flag(region: RegionLike | null, type: RegionCodeIssueType, apiCode: string | null, detail: string) {
    issues.push({
      type,
      level: region?.level ?? null,
      regionCode: region?.code ?? null,
      regionName: region?.name ?? null,
      apiCode,
      detail,
    });
    if (region) issueRegionCodes.add(region.code);
  }

  // 1) 코드 누락 — SIGUNGU인데 apiSigunguCode 없음 / SIDO인데 apiAreaCode 없음.
  for (const r of regions) {
    if (r.level === "SIGUNGU" && !r.apiSigunguCode) {
      flag(r, "MISSING_CODE", null, "SIGUNGU인데 apiSigunguCode가 없음");
    }
    if (r.level === "SIDO" && !r.apiAreaCode) {
      flag(r, "MISSING_CODE", null, "SIDO인데 apiAreaCode가 없음");
    }
  }

  // 2) 형식/길이 오류 — 값이 있는 경우에 한해 검사(누락은 위에서 이미 별도 항목으로 처리했다).
  for (const r of regions) {
    if (r.apiAreaCode !== null && !AREA_CODE_PATTERN.test(r.apiAreaCode)) {
      flag(r, "INVALID_FORMAT", r.apiAreaCode, `apiAreaCode 형식 오류(2자리 숫자 기대): "${r.apiAreaCode}"`);
    }
    if (r.level === "SIGUNGU" && r.apiSigunguCode !== null && !SIGUNGU_CODE_PATTERN.test(r.apiSigunguCode)) {
      flag(r, "INVALID_FORMAT", r.apiSigunguCode, `apiSigunguCode 형식 오류(5자리 숫자 기대): "${r.apiSigunguCode}"`);
    }
  }

  // 3) 중복 코드.
  // apiAreaCode는 SIDO 사이에서만 유일해야 한다 — 같은 SIDO 아래 여러 SIGUNGU가 부모의 2자리 시도
  // 코드를 공유하는 것은 정상 구조이므로(예: 강릉시·양양군이 둘 다 "51") SIGUNGU까지 포함해 단순
  // 중복을 검사하면 대량의 오탐이 나온다. apiSigunguCode는 SIGUNGU 전체에서 유일해야 한다(시군구
  // 단위이므로 공유될 이유가 없다).
  const sidoAreaCodeGroups = groupByCode(
    regions.filter((r) => r.level === "SIDO" && r.apiAreaCode !== null),
    (r) => r.apiAreaCode as string,
  );
  for (const [code, group] of sidoAreaCodeGroups) {
    if (group.length > 1) {
      for (const r of group) {
        flag(r, "DUPLICATE_CODE", code, `SIDO apiAreaCode 중복: "${code}"를 ${group.map((g) => g.name).join(", ")}가 공유`);
      }
    }
  }
  const signguCodeGroups = groupByCode(
    regions.filter((r) => r.level === "SIGUNGU" && r.apiSigunguCode !== null),
    (r) => r.apiSigunguCode as string,
  );
  for (const [code, group] of signguCodeGroups) {
    if (group.length > 1) {
      for (const r of group) {
        flag(r, "DUPLICATE_CODE", code, `apiSigunguCode 중복: "${code}"를 ${group.map((g) => g.name).join(", ")}가 공유`);
      }
    }
  }

  // 4) API에만 존재 / Region에만 존재.
  const sidoAreaCodesInRegion = new Set(regions.filter((r) => r.level === "SIDO" && r.apiAreaCode).map((r) => r.apiAreaCode as string));
  const signguCodesInRegion = new Set(
    regions.filter((r) => r.level === "SIGUNGU" && r.apiSigunguCode).map((r) => r.apiSigunguCode as string),
  );

  for (const code of apiAreaCodes) {
    if (!sidoAreaCodesInRegion.has(code)) {
      flag(null, "API_ONLY", code, `광역 areaCode="${code}"가 API 응답에는 있지만 SIDO Region에 매핑되지 않음`);
    }
  }
  for (const code of apiSignguCodes) {
    if (!signguCodesInRegion.has(code)) {
      flag(null, "API_ONLY", code, `기초 signguCode="${code}"가 API 응답에는 있지만 SIGUNGU Region에 매핑되지 않음`);
    }
  }
  for (const r of regions) {
    if (r.level === "SIDO" && r.apiAreaCode && !apiAreaCodes.has(r.apiAreaCode)) {
      flag(r, "REGION_ONLY", r.apiAreaCode, `Region apiAreaCode="${r.apiAreaCode}"가 이번 API 응답에서 발견되지 않음`);
    }
    if (r.level === "SIGUNGU" && r.apiSigunguCode && !apiSignguCodes.has(r.apiSigunguCode)) {
      flag(r, "REGION_ONLY", r.apiSigunguCode, `Region apiSigunguCode="${r.apiSigunguCode}"가 이번 API 응답에서 발견되지 않음`);
    }
  }

  const okCount = regions.filter((r) => !issueRegionCodes.has(r.code)).length;

  const highlights: HighlightStatus[] = HIGHLIGHT_REGION_CODES.map((code) => {
    const region = regions.find((r) => r.code === code);
    if (!region) {
      return { regionCode: code, name: null, apiSigunguCode: null, apiAreaCode: null, status: "NOT_FOUND" };
    }
    const regionIssue = issues.find((i) => i.regionCode === code);
    return {
      regionCode: code,
      name: region.name,
      apiSigunguCode: region.apiSigunguCode,
      apiAreaCode: region.apiAreaCode,
      status: regionIssue ? regionIssue.type : "OK",
    };
  });

  return { totalRegions: regions.length, okCount, issues, highlights };
}
