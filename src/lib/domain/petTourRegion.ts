export interface PetTourRegionCodeSource {
  apiAreaCode: string | null;
  apiSigunguCode: string | null;
  tourApiLdongRegnCd: string | null;
  tourApiLdongSignguCd: string | null;
}

function normalizeLdongSignguCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 3 ? digits.slice(-3) : null;
}

/**
 * Region master의 코드를 PET 공식 API 파라미터로 변환한다.
 *
 * 세종처럼 API가 시도·시군구를 동일한 5자리 단일 코드로 반환하는
 * 행정단위는 lDongSignguCd가 null로 저장된다. apiSigunguCode가
 * lDongRegnCd와 같다는 구조적 신호를 사용해 같은 코드를 두 파라미터에
 * 전달하며, 특정 지역명이나 POI를 예외 처리하지 않는다.
 */
export function resolvePetTourRegionCodes(region: PetTourRegionCodeSource): {
  lDongRegnCd: string | null;
  lDongSignguCd: string | null;
} {
  if (
    region.tourApiLdongRegnCd &&
    region.tourApiLdongSignguCd === null &&
    region.apiSigunguCode === region.tourApiLdongRegnCd
  ) {
    return {
      lDongRegnCd: region.tourApiLdongRegnCd,
      lDongSignguCd: region.tourApiLdongRegnCd,
    };
  }

  return {
    lDongRegnCd: region.tourApiLdongRegnCd ?? region.apiAreaCode,
    lDongSignguCd: region.tourApiLdongSignguCd ?? normalizeLdongSignguCode(region.apiSigunguCode),
  };
}
