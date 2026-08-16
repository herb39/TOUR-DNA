/**
 * TourAPI 신 분류체계의 레포츠(LS) 중분류를 실행안에서 설명 가능한 공식 분류로 노출한다.
 *
 * LS01~LS04보다 더 세밀한 겨울스포츠·골프·익스트림 등의 유형은 현재 확보한 공식 코드 근거가
 * 없으므로 장소명으로 추정하지 않는다. 이 모듈은 lclsSystm1=LS이고 lclsSystm2가 공식 목록에
 * 있는 경우에만 분류를 반환한다.
 */
export type LeisureActivitySubtypeCode = "LS01" | "LS02" | "LS03" | "LS04";

export type LeisureActivitySubtypeGroup = "LAND" | "WATER" | "AIR" | "COMBINED";

export interface LeisureActivityClassification {
  code: LeisureActivitySubtypeCode;
  label: string;
  group: LeisureActivitySubtypeGroup;
}

const LEISURE_ACTIVITY_CLASSIFICATIONS: Record<LeisureActivitySubtypeCode, LeisureActivityClassification> = {
  LS01: { code: "LS01", label: "육상레저스포츠", group: "LAND" },
  LS02: { code: "LS02", label: "수상레저스포츠", group: "WATER" },
  LS03: { code: "LS03", label: "항공레저스포츠", group: "AIR" },
  LS04: { code: "LS04", label: "복합레저스포츠", group: "COMBINED" },
};

export function classifyLeisureActivity(
  lclsSystm1: string | null | undefined,
  lclsSystm2: string | null | undefined,
): LeisureActivityClassification | null {
  if (lclsSystm1 !== "LS" || !lclsSystm2 || !(lclsSystm2 in LEISURE_ACTIVITY_CLASSIFICATIONS)) return null;
  return LEISURE_ACTIVITY_CLASSIFICATIONS[lclsSystm2 as LeisureActivitySubtypeCode];
}
