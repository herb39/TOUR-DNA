import { prisma } from "../src/lib/db";
import { REGION_SEED } from "../src/lib/fixtures/regions";
import { DATA_SOURCE_SEED } from "../src/lib/fixtures/dataSources";
import { METRIC_FIXTURES } from "../src/lib/fixtures/metrics";
import { POI_SEED, POI_RELATION_SEED } from "../src/lib/fixtures/pois";
import { METRIC_CODES } from "../src/lib/domain/types";
import { runAnalysisForProject } from "../src/lib/services/analyzeProject";
import { ensureSelectedPlan } from "../src/lib/services/planService";
import { classifyVerifiedMetricProvenance, upsertSeedMetric } from "../src/lib/services/seedMetrics";

async function upsertDataSources() {
  for (const ds of DATA_SOURCE_SEED) {
    await prisma.dataSource.upsert({
      where: { code: ds.code },
      update: { name: ds.name, baseUrl: ds.baseUrl, description: ds.description },
      create: ds,
    });
  }
  console.log(`  DataSource ${DATA_SOURCE_SEED.length}건 반영`);
}

async function upsertRegions() {
  // 부모(시도) 먼저, 자식(시군구) 나중에 — parentId FK 순서 보장
  const parents = REGION_SEED.filter((r) => r.parentCode === null);
  const children = REGION_SEED.filter((r) => r.parentCode !== null);

  for (const r of parents) {
    await prisma.region.upsert({
      where: { code: r.code },
      update: {
        name: r.name,
        level: r.level,
        apiAreaCode: r.apiAreaCode,
        apiSigunguCode: r.apiSigunguCode,
        tourApiAreaCode: r.tourApiAreaCode,
      },
      create: {
        code: r.code,
        name: r.name,
        level: r.level,
        apiAreaCode: r.apiAreaCode,
        apiSigunguCode: r.apiSigunguCode,
        tourApiAreaCode: r.tourApiAreaCode,
      },
    });
  }
  for (const r of children) {
    const parent = await prisma.region.findUniqueOrThrow({ where: { code: r.parentCode! } });
    await prisma.region.upsert({
      where: { code: r.code },
      update: {
        name: r.name,
        level: r.level,
        apiAreaCode: r.apiAreaCode,
        apiSigunguCode: r.apiSigunguCode,
        tourApiAreaCode: r.tourApiAreaCode,
        parentId: parent.id,
      },
      create: {
        code: r.code,
        name: r.name,
        level: r.level,
        apiAreaCode: r.apiAreaCode,
        apiSigunguCode: r.apiSigunguCode,
        tourApiAreaCode: r.tourApiAreaCode,
        parentId: parent.id,
      },
    });
  }
  console.log(`  Region ${REGION_SEED.length}건 반영`);
}

async function seedMetrics() {
  for (const m of METRIC_FIXTURES) {
    // 대전 202508의 관광자원 수요(TOU_RES_DEM)는 "값 자체가 없는" 사례를 재현한다 — 가짜 EMPTY snapshot
    // 대신, 이 지표의 NormalizedMetric을 아예 만들지 않아 기존 MISSING 축 처리를 그대로 타게 한다.
    const isEmptyCase = m.regionCode === "SGG_JECHEON" && m.baseYm === "202508";
    // CURATED/ESTIMATED 판정 규칙은 src/lib/services/seedMetrics.ts의 순수 함수로 분리되어 있다
    // (DB 없이 단위테스트 가능 — tests/unit/seedMetrics.test.ts 참고).
    const humanVerifiedProvenance = classifyVerifiedMetricProvenance(m.baseYm);

    // DEMAND_SERVICE(tarSvcDemIxVal)의 실제 출처는 TOU_RES_DEM(AreaTarResDemService/areaTarSvcDemList)이다
    // — TAR_SVC_DEM(AreaTarDemDsService)에는 이 오퍼레이션 자체가 없다(docs/public-api-status.md
    // "이전에는 TAR_SVC_DEM 쪽에서 찾고 있었는데 실제로는 TOU_RES_DEM 소속이었다", syncService.ts도
    // 이미 TOU_RES_DEM 블록에서 이 metricCode를 upsert한다). seed는 이 정정 이전 attribution이
    // 남아있었다 — 실제 파이프라인과 일치하도록 바로잡는다.
    await upsertSeedMetric({
      sourceCode: "TOU_RES_DEM",
      regionCode: m.regionCode,
      baseYm: m.baseYm,
      metricCode: METRIC_CODES.DEMAND_SERVICE,
      rawValue: m.tarSvcDemIxVal,
      unit: "지수",
      provenance: humanVerifiedProvenance,
    });
    await upsertSeedMetric({
      sourceCode: "TAR_SVC_DEM",
      regionCode: m.regionCode,
      baseYm: m.baseYm,
      metricCode: METRIC_CODES.STAY,
      rawValue: m.tarSjrnDsIxVal,
      unit: "지수",
      provenance: humanVerifiedProvenance,
    });
    await upsertSeedMetric({
      sourceCode: "TAR_SVC_DEM",
      regionCode: m.regionCode,
      baseYm: m.baseYm,
      metricCode: METRIC_CODES.SPEND,
      rawValue: m.tarExpDsIxVal,
      unit: "지수",
      provenance: humanVerifiedProvenance,
    });
    await upsertSeedMetric({
      sourceCode: "TOU_DIV_IX",
      regionCode: m.regionCode,
      baseYm: m.baseYm,
      metricCode: METRIC_CODES.DIVERSITY,
      rawValue: m.touDivIxVal,
      unit: "지수",
      provenance: humanVerifiedProvenance,
    });

    if (!isEmptyCase) {
      // touResDemIxVal(문화자원수요)은 baseYm과 무관하게 항상 ESTIMATED다 — API 자체가 여전히
      // 미확인이라(docs/public-api-status.md) "사람이 검증한 값"이라고 부를 근거가 없다.
      await upsertSeedMetric({
        sourceCode: "TOU_RES_DEM",
        regionCode: m.regionCode,
        baseYm: m.baseYm,
        metricCode: METRIC_CODES.DEMAND_RESOURCE,
        rawValue: m.touResDemIxVal,
        unit: "지수",
        provenance: "ESTIMATED",
      });
    }

    // 방문자수 API도 필드 의미가 미확인이라(Phase 1-C와 동일 정책) 항상 ESTIMATED다.
    await upsertSeedMetric({
      sourceCode: "VISITOR_CNT",
      regionCode: m.regionCode,
      baseYm: m.baseYm,
      metricCode: METRIC_CODES.VISITOR_CNT,
      rawValue: m.visitorCnt,
      unit: "명",
      provenance: "ESTIMATED",
    });
  }
  console.log(
    `  NormalizedMetric ${METRIC_FIXTURES.length}개 지역×기준월 반영(DataSnapshot 미생성 — 실제 API 호출이 없었으므로 가짜 성공 응답을 만들지 않는다)`,
  );
}

/**
 * seed POI는 항상 `sourceType: "FIXTURE"`로 만든다(Phase 1-D 재확인, 2026-07-23) — 사람이 직접 고른
 * 큐레이션 장소이며 API 성공 응답으로 만들어진 적이 없다. `buildDnaEngineInput.ts`의 Network provenance
 * 판정이 `sourceType !== "API"`를 fallback(CURATED) 신호로 쓰므로, 이 값은 그 규칙과 이미 일치한다
 * (변경 불필요 — 처음부터 올바르게 구현돼 있었음).
 */
async function seedPois() {
  const keyToId = new Map<string, string>();
  const tourInfoSource = await prisma.dataSource.findUniqueOrThrow({ where: { code: "TOUR_INFO" } });

  for (const p of POI_SEED) {
    const region = await prisma.region.findUniqueOrThrow({ where: { code: p.regionCode } });
    const row = await prisma.poi.upsert({
      where: { regionId_name: { regionId: region.id, name: p.name } },
      update: {
        category: p.category,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
        operatingHours: p.operatingHours,
        closedDays: p.closedDays,
      },
      create: {
        externalId: p.key,
        regionId: region.id,
        name: p.name,
        category: p.category,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
        operatingHours: p.operatingHours,
        closedDays: p.closedDays,
        sourceType: "FIXTURE",
        sourceId: tourInfoSource.id,
      },
    });
    keyToId.set(p.key, row.id);
  }

  // PoiRelation은 사람이 구성한 데모 관계다. 정식 서비스명조차 미확인인 실제 연관관광지 API를
  // syncService.ts가 절대 호출하지 않으므로(항상 POI_RELATION:SKIPPED), 존재하는 PoiRelation 행은
  // 전부 이 seed에서만 만들어진다 — `buildDnaEngineInput.ts`가 `relatedPoiCount > 0`을 CURATED 신호로
  // 쓰는 것과 정확히 일치한다(변경 불필요, 코드 경로로 이미 명확함).
  const poiRelationSource = await prisma.dataSource.findUniqueOrThrow({ where: { code: "POI_RELATION" } });
  for (const rel of POI_RELATION_SEED) {
    const centerId = keyToId.get(rel.centerKey);
    const relatedId = keyToId.get(rel.relatedKey);
    if (!centerId || !relatedId) continue;
    await prisma.poiRelation.upsert({
      where: { centerPoiId_relatedPoiId: { centerPoiId: centerId, relatedPoiId: relatedId } },
      update: { relationType: rel.relationType, distanceM: rel.distanceM },
      create: {
        centerPoiId: centerId,
        relatedPoiId: relatedId,
        relationType: rel.relationType,
        distanceM: rel.distanceM,
        sourceId: poiRelationSource.id,
      },
    });
  }
  console.log(`  Poi ${POI_SEED.length}건, PoiRelation ${POI_RELATION_SEED.length}건 반영`);
}

async function seedDemoProject() {
  const region = await prisma.region.findUniqueOrThrow({ where: { code: "SGG_DAEJEON" } });

  const existing = await prisma.project.findFirst({ where: { name: "[데모] 대전 9월 소규모 여행 기획" } });
  const project = existing
    ? existing
    : await prisma.project.create({
        data: {
          name: "[데모] 대전 9월 소규모 여행 기획",
          role: "TRAVEL_AGENCY",
          regionId: region.id,
          sidoCode: "SIDO_DAEJEON",
          sigunguCode: "SGG_DAEJEON",
          travelYear: 2026,
          travelMonth: 9,
          status: "DRAFT",
        },
      });

  await prisma.projectInput.upsert({
    where: { projectId: project.id },
    update: {},
    create: {
      projectId: project.id,
      nationality: "DOMESTIC",
      ageGroups: ["AGE_20S", "AGE_30S"],
      companionType: "COMPANION_FRIENDS",
      primaryGoal: "GOAL_STAY_SPEND_EXPANSION",
      secondaryGoal: null,
      duration: "ONE_NIGHT_TWO_DAYS",
      budgetLevel: "MID",
      transport: "MIXED",
      groupType: "SMALL_10_20",
      preferredThemes: [],
      excludedThemes: [],
      memo: "2026 관광데이터 활용 공모전 데모 시나리오",
    },
  });

  const existingAnalysis = await prisma.analysisResult.findUnique({ where: { projectId: project.id } });
  const analysisResultId = existingAnalysis
    ? existingAnalysis.id
    : await runAnalysisForProject(project.id);

  const topStrategy = await prisma.strategyResult.findFirstOrThrow({
    where: { analysisResultId, rank: 1 },
  });

  await prisma.project.update({
    where: { id: project.id },
    data: { selectedStrategyResultId: topStrategy.id },
  });

  // 실행안은 앱과 동일한 결정론적 빌더(ensureSelectedPlan)로 생성한다 — 계산식을 seed와 앱에 중복 구현하지 않는다.
  await ensureSelectedPlan(project.id);
  await prisma.project.update({ where: { id: project.id }, data: { status: "PLANNED" } });
  console.log(`  데모 프로젝트 반영 완료 (${project.id})`);
}

async function main() {
  console.log("[seed] 시작");
  await upsertDataSources();
  await upsertRegions();
  await seedMetrics();
  await seedPois();
  await seedDemoProject();
  console.log("[seed] 완료");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
