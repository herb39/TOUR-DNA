import { prisma } from "@/lib/db";

export interface RegionOption {
  code: string;
  name: string;
  sigungus: { code: string; name: string }[];
}

/**
 * 대전은 통계청 API가 자치구 단위로만 데이터를 제공해 대표 자치구 유성구를 시군구 레코드로 쓰지만,
 * Region.name 자체는 "대전광역시"다(제품명 등 다른 화면에서 시/도명 그대로 보이도록 하기 위함). 그 결과
 * 시/도 드롭다운에서 "대전광역시"를 고르면 시/군/구 드롭다운에도 똑같이 "대전광역시"만 나와 마치 오류처럼
 * 보인다 — 시/군/구 드롭다운 라벨만 이렇게 구분해서 보여준다(Region.name 자체는 바꾸지 않는다).
 * "유성구 데이터 기준"은 DNA 5축 점수(통계청 지표)에만 해당한다 — POI/코스 후보는 대전 전체에서 뽑는다
 * (2026-07-22, syncService.ts의 TOUR_INFO_ADDRESS_FILTER_OVERRIDE 참고).
 */
const SIGUNGU_DISPLAY_LABEL_OVERRIDE: Record<string, string> = {
  SGG_DAEJEON: "대전광역시 (DNA 지표는 유성구 기준)",
};

export async function getRegionOptions(): Promise<RegionOption[]> {
  const regions = await prisma.region.findMany({ orderBy: { name: "asc" } });
  const sidos = regions.filter((r) => r.level === "SIDO");
  const sigungus = regions.filter((r) => r.level === "SIGUNGU");

  return sidos.map((sido) => ({
    code: sido.code,
    name: sido.name,
    sigungus: sigungus
      .filter((s) => s.parentId === sido.id)
      .map((s) => ({ code: s.code, name: SIGUNGU_DISPLAY_LABEL_OVERRIDE[s.code] ?? s.name })),
  }));
}
