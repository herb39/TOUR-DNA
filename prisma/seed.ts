import { prisma } from "../src/lib/db";
import { REGION_SEED } from "../src/lib/fixtures/regions";
import { DATA_SOURCE_SEED } from "../src/lib/fixtures/dataSources";
import { METRIC_FIXTURES } from "../src/lib/fixtures/metrics";
import { POI_SEED, POI_RELATION_SEED } from "../src/lib/fixtures/pois";
import { METRIC_CODES } from "../src/lib/domain/types";
import { runAnalysisForProject } from "../src/lib/services/analyzeProject";
import { ensureSelectedPlan } from "../src/lib/services/planService";

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
      update: { name: r.name, level: r.level, apiAreaCode: r.apiAreaCode, apiSigunguCode: r.apiSigunguCode },
      create: { code: r.code, name: r.name, level: r.level, apiAreaCode: r.apiAreaCode, apiSigunguCode: r.apiSigunguCode },
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
        parentId: parent.id,
      },
      create: {
        code: r.code,
        name: r.name,
        level: r.level,
        apiAreaCode: r.apiAreaCode,
        apiSigunguCode: r.apiSigunguCode,
        parentId: parent.id,
      },
    });
  }
  console.log(`  Region ${REGION_SEED.length}건 반영`);
}

function envelope(item: unknown, resultCode = "0000", resultMsg = "NORMAL SERVICE.") {
  return {
    response: {
      header: { resultCode, resultMsg },
      body: {
        items: { item },
        numOfRows: Array.isArray(item) ? item.length : item === "" ? 0 : 1,
        pageNo: 1,
        totalCount: Array.isArray(item) ? item.length : item === "" ? 0 : 1,
      },
    },
  };
}

async function upsertSnapshotAndMetric(params: {
  sourceCode: string;
  regionCode: string;
  baseYm: string;
  metricCode: string;
  rawValue: number;
  unit: string;
  rawPayload: unknown;
  itemCount: number;
  status: "SUCCESS" | "EMPTY" | "ERROR";
}) {
  const source = await prisma.dataSource.findUniqueOrThrow({ where: { code: params.sourceCode } });
  const region = await prisma.region.findUniqueOrThrow({ where: { code: params.regionCode } });

  await prisma.dataSnapshot.upsert({
    where: {
      dataSourceId_regionId_baseYm: { dataSourceId: source.id, regionId: region.id, baseYm: params.baseYm },
    },
    update: {
      status: params.status,
      resultCode: "0000",
      resultMsg: "NORMAL SERVICE.",
      itemCount: params.itemCount,
      rawPayload: params.rawPayload as object,
      fetchedAt: new Date(),
    },
    create: {
      dataSourceId: source.id,
      regionId: region.id,
      baseYm: params.baseYm,
      status: params.status,
      resultCode: "0000",
      resultMsg: "NORMAL SERVICE.",
      itemCount: params.itemCount,
      rawPayload: params.rawPayload as object,
    },
  });

  if (params.status !== "SUCCESS") return;

  await prisma.normalizedMetric.upsert({
    where: {
      regionId_baseYm_metricCode: { regionId: region.id, baseYm: params.baseYm, metricCode: params.metricCode },
    },
    update: { rawValue: params.rawValue, unit: params.unit, adminLevel: region.level, sourceId: source.id },
    create: {
      regionId: region.id,
      baseYm: params.baseYm,
      metricCode: params.metricCode,
      rawValue: params.rawValue,
      unit: params.unit,
      adminLevel: region.level,
      sourceId: source.id,
    },
  });
}

async function seedMetrics() {
  for (const m of METRIC_FIXTURES) {
    // 대전 202508의 관광자원 수요(TOU_RES_DEM)는 "빈 items" 응답 사례를 재현한다.
    const isEmptyCase = m.regionCode === "SGG_JECHEON" && m.baseYm === "202508";

    await upsertSnapshotAndMetric({
      sourceCode: "TAR_SVC_DEM",
      regionCode: m.regionCode,
      baseYm: m.baseYm,
      metricCode: METRIC_CODES.DEMAND_SERVICE,
      rawValue: m.tarSvcDemIxVal,
      unit: "지수",
      itemCount: 3,
      status: "SUCCESS",
      rawPayload: envelope([
        { areaCd: null, baseYm: m.baseYm, tarSvcDemIxCd: "11", tarSvcDemIxVal: String(m.tarSvcDemIxVal) },
        { areaCd: null, baseYm: m.baseYm, tarSjrnDsIxCd: "21", tarSjrnDsIxVal: String(m.tarSjrnDsIxVal) },
        { areaCd: null, baseYm: m.baseYm, tarExpDsIxCd: "22", tarExpDsIxVal: String(m.tarExpDsIxVal) },
      ]),
    });
    // 체류/소비 강도는 같은 원본 응답(TAR_SVC_DEM)에서 나오는 별도 지표이므로 NormalizedMetric만 추가 반영
    await prisma.normalizedMetric.upsert({
      where: {
        regionId_baseYm_metricCode: {
          regionId: (await prisma.region.findUniqueOrThrow({ where: { code: m.regionCode } })).id,
          baseYm: m.baseYm,
          metricCode: METRIC_CODES.STAY,
        },
      },
      update: { rawValue: m.tarSjrnDsIxVal },
      create: {
        regionId: (await prisma.region.findUniqueOrThrow({ where: { code: m.regionCode } })).id,
        baseYm: m.baseYm,
        metricCode: METRIC_CODES.STAY,
        rawValue: m.tarSjrnDsIxVal,
        unit: "지수",
        adminLevel: (await prisma.region.findUniqueOrThrow({ where: { code: m.regionCode } })).level,
        sourceId: (await prisma.dataSource.findUniqueOrThrow({ where: { code: "TAR_SVC_DEM" } })).id,
      },
    });
    await prisma.normalizedMetric.upsert({
      where: {
        regionId_baseYm_metricCode: {
          regionId: (await prisma.region.findUniqueOrThrow({ where: { code: m.regionCode } })).id,
          baseYm: m.baseYm,
          metricCode: METRIC_CODES.SPEND,
        },
      },
      update: { rawValue: m.tarExpDsIxVal },
      create: {
        regionId: (await prisma.region.findUniqueOrThrow({ where: { code: m.regionCode } })).id,
        baseYm: m.baseYm,
        metricCode: METRIC_CODES.SPEND,
        rawValue: m.tarExpDsIxVal,
        unit: "지수",
        adminLevel: (await prisma.region.findUniqueOrThrow({ where: { code: m.regionCode } })).level,
        sourceId: (await prisma.dataSource.findUniqueOrThrow({ where: { code: "TAR_SVC_DEM" } })).id,
      },
    });

    await upsertSnapshotAndMetric({
      sourceCode: "TOU_DIV_IX",
      regionCode: m.regionCode,
      baseYm: m.baseYm,
      metricCode: METRIC_CODES.DIVERSITY,
      rawValue: m.touDivIxVal,
      unit: "지수",
      itemCount: 1,
      status: "SUCCESS",
      rawPayload: envelope({ areaCd: null, baseYm: m.baseYm, touDivIxCd: "31", touDivIxVal: String(m.touDivIxVal) }),
    });

    if (isEmptyCase) {
      await upsertSnapshotAndMetric({
        sourceCode: "TOU_RES_DEM",
        regionCode: m.regionCode,
        baseYm: m.baseYm,
        metricCode: METRIC_CODES.DEMAND_RESOURCE,
        rawValue: 0,
        unit: "지수",
        itemCount: 0,
        status: "EMPTY",
        rawPayload: envelope(""),
      });
    } else {
      await upsertSnapshotAndMetric({
        sourceCode: "TOU_RES_DEM",
        regionCode: m.regionCode,
        baseYm: m.baseYm,
        metricCode: METRIC_CODES.DEMAND_RESOURCE,
        rawValue: m.touResDemIxVal,
        unit: "지수",
        itemCount: 1,
        status: "SUCCESS",
        rawPayload: envelope({ areaCd: null, baseYm: m.baseYm, touResDemIxVal: String(m.touResDemIxVal) }),
      });
    }

    await upsertSnapshotAndMetric({
      sourceCode: "VISITOR_CNT",
      regionCode: m.regionCode,
      baseYm: m.baseYm,
      metricCode: METRIC_CODES.VISITOR_CNT,
      rawValue: m.visitorCnt,
      unit: "명",
      itemCount: 1,
      status: "SUCCESS",
      rawPayload: envelope({ areaCd: null, baseYm: m.baseYm, visitorCnt: String(m.visitorCnt) }),
    });
  }
  console.log(`  DataSnapshot/NormalizedMetric ${METRIC_FIXTURES.length}개 지역×기준월 반영`);
}

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
