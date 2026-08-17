import { prisma } from "@/lib/db";

/**
 * 현장 확인으로 합의된 POI 검수 데이터의 초기 입력.
 *
 * 이 목록은 추천 알고리즘의 blacklist가 아니다. PoiCuration 테이블에 지역·POI별 검수 이력으로
 * 저장되며, 이후 관리자 검수 화면이나 운영 배치에서 같은 계약으로 추가·수정할 수 있다.
 */
const INITIAL_REVIEWS = [
  {
    regionCode: "SGG_CHUNGBUK_113",
    name: "문암생태공원",
    representation: "SUPPORT" as const,
    reason: "현지 사용자 피드백상 생활권 공원으로, 자연·웰니스 대표 관광지로 자동 확정하지 않음",
  },
  {
    regionCode: "SGG_CHUNGBUK_113",
    name: "문암생태공원캠핑장",
    representation: "SUPPORT" as const,
    reason: "문암생태공원 부속 캠핑시설로, 독립 관광 목적지로 중복 추천하지 않음",
  },
  {
    regionCode: "SGG_CHUNGBUK_113",
    name: "청주 가로수길",
    representation: "SUPPORT" as const,
    reason: "현지 사용자 피드백상 일상 이동·생활권 경관으로, 대표 관광지로 자동 확정하지 않음",
  },
  {
    regionCode: "SGG_CHUNGBUK_113",
    name: "청주 발산공원",
    representation: "SUPPORT" as const,
    reason: "현지 사용자 피드백상 생활권 공원으로, 대표 관광지로 자동 확정하지 않음",
  },
  {
    regionCode: "SGG_CHUNGBUK_113",
    name: "바른스포츠월드",
    representation: "SUPPORT" as const,
    reason: "현지 사용자 피드백상 일반 체육시설로, 자연·웰니스 대표 관광지로 자동 확정하지 않음",
  },
  {
    regionCode: "SGG_CHUNGBUK_113",
    name: "메리제인호텔",
    representation: "LODGING" as const,
    reason: "숙박시설은 관광 후보가 아니라 실행안의 숙박 슬롯으로 분리",
  },
  {
    regionCode: "SGG_CHUNGBUK_113",
    name: "뉴베라관광호텔",
    representation: "LODGING" as const,
    reason: "숙박시설은 관광 후보가 아니라 실행안의 숙박 슬롯으로 분리",
  },
] as const;

async function main() {
  for (const review of INITIAL_REVIEWS) {
    const poi = await prisma.poi.findFirst({
      where: { name: review.name, region: { code: review.regionCode } },
      select: { id: true },
    });
    if (!poi) throw new Error(`POI를 찾지 못했습니다: ${review.regionCode} / ${review.name}`);

    await prisma.poiCuration.upsert({
      where: { poiId: poi.id },
      create: {
        poiId: poi.id,
        status: "REJECTED",
        representation: review.representation,
        reason: review.reason,
        sourceLabel: "청주 현지 사용자 피드백",
        reviewedBy: "LOCAL_USER_FEEDBACK",
        reviewedAt: new Date(),
      },
      update: {
        status: "REJECTED",
        representation: review.representation,
        reason: review.reason,
        sourceLabel: "청주 현지 사용자 피드백",
        reviewedBy: "LOCAL_USER_FEEDBACK",
        reviewedAt: new Date(),
      },
    });
  }
  console.log(`POI 큐레이션 ${INITIAL_REVIEWS.length}건을 반영했습니다.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
