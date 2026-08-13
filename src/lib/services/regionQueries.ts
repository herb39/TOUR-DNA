import { prisma } from "@/lib/db";

export interface RegionOption {
  code: string;
  name: string;
  sigungus: { code: string; name: string }[];
}

/**
 * (2026-08-13 정리) `SGG_DAEJEON`은 대전 전국 확장(동구/중구/서구/대덕구 4개 SIGUNGU 추가, 2026-08-09)
 * 이전에 만들어진 대전의 유일한 SIGUNGU 레코드로, 실제로는 유성구 데이터(apiSigunguCode=30200,
 * tourApiLdongSignguCd=200)를 담고 있으면서 `Region.name`만 "대전광역시"로 남아 있었다. 그 결과
 * 시/도 드롭다운에서 "대전광역시"를 고르면 시/군/구 드롭다운에 실제 5개 자치구(동구/중구/서구/유성구/
 * 대덕구) 대신 "대전광역시"(진짜 유성구)와 나머지 4개가 섞여 나와 마치 시/도명이 시/군/구 레벨에도
 * 중복 표시되는 오류처럼 보였다. 근본 원인이 `Region.name` 자체의 오기입이었으므로, 화면 표시만
 * 덮어씌우는 대신 `Region.name`을 "유성구"로 직접 바로잡았다(단발성 DB 보정, code/FK는 변경하지
 * 않음 — `scripts/`의 일회성 스크립트로 실행 후 삭제, `src/lib/fixtures/regions.ts`의 seed 값도
 * 함께 맞춰 향후 재시드에도 동일하게 반영되도록 했다). 이제 별도 표시 override가 필요 없다.
 *
 * 참고: 이 지역의 DNA 5축(통계청 지표) 데이터는 API 호출 자체가 `lDongSignguCd=200`으로 유성구만
 * 좁혀 수집돼 정확히 유성구 것이다. POI(388/396건)도 대부분 API 수집이라 유성구 주소로 확인되지만,
 * 최초 데모용으로 넣은 FIXTURE 8건 중 4건(한밭수목원·장태산자연휴양림·성심당 본점·대전중앙시장 먹거리
 * 타운)은 대전 전체를 대표하는 명소로 큐레이션된 것이라 실제로는 서구/중구 주소다 — 삭제하지 않고
 * 그대로 두었다(작은 규모의 기존 데모 큐레이션 잔재로만 기록).
 */
export async function getRegionOptions(): Promise<RegionOption[]> {
  const regions = await prisma.region.findMany({ orderBy: { name: "asc" } });
  const sidos = regions.filter((r) => r.level === "SIDO");
  const sigungus = regions.filter((r) => r.level === "SIGUNGU");

  return sidos.map((sido) => ({
    code: sido.code,
    name: sido.name,
    sigungus: sigungus.filter((s) => s.parentId === sido.id).map((s) => ({ code: s.code, name: s.name })),
  }));
}
