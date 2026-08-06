import { notFound } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getProjectDetail } from "@/lib/services/projectQueries";
import { DnaRadarChart, type DnaAxisChartDatum } from "@/components/charts/DnaRadarChart";
import { StrategyCard, type StrategyCardData } from "@/components/strategy/StrategyCard";
import { StrategyComparisonTable, type StrategyComparisonRow } from "@/components/strategy/StrategyComparisonTable";
import { StrategyResourcePlanPanel } from "@/components/strategy/StrategyResourcePlanPanel";
import {
  buildStrategyBudgetItems,
  buildStrategyComparisonRows,
  buildStrategyPartners,
  STRATEGY_RESOURCE_PLAN_RULE_VERSION,
} from "@/lib/domain/strategyResourcePlan";
import { EvidenceTable, type EvidenceRow } from "@/components/evidence/EvidenceTable";
import { MapOrFallback, type MapPoi } from "@/components/map/MapOrFallback";
import { selectStrategyAction } from "./actions";
import { AXIS_LABEL_KO, type DataProvenance, type DnaAxisKey } from "@/lib/domain/types";
import {
  labelForAgeGroup,
  labelForBudgetLevel,
  labelForCompanionType,
  labelForDuration,
  labelForGroupType,
  labelForNationality,
  labelForPrimaryGoal,
  labelForRole,
  labelForTransport,
} from "@/lib/validation/codes";
import { formatBaseYm, formatDateTime, summarizeEvidenceBaseYms } from "@/lib/format";
import { summarizeAxisSource } from "@/lib/domain/axisSourceSummary";
import { buildTourismMetricCards } from "@/lib/domain/tourismMetricSummary";
import { METRIC_CODES } from "@/lib/domain/types";
import { prisma } from "@/lib/db";
import { computeBusinessOpportunities } from "@/lib/domain/businessOpportunity";
import type { PoiCategoryCode } from "@/lib/domain/strategyTemplates";
import { OpportunityCard } from "@/components/opportunity/OpportunityCard";
import { fetchPoisByCategory } from "@/lib/services/fetchPoisByCategory";
import {
  computeRegionSimilarityComparisons,
  resolveAnalysisBaseYmMismatchNote,
  REGION_SIMILARITY_RULE_VERSION,
} from "@/lib/domain/regionSimilarity";
import { fetchRegionComparisonProfiles } from "@/lib/services/fetchRegionComparisonProfiles";
import { RegionComparisonCard } from "@/components/comparison/RegionComparisonCard";
import { DEFAULT_BASE_YM } from "@/lib/fixtures/metrics";

export const dynamic = "force-dynamic";

const AXIS_ORDER: DnaAxisKey[] = ["demand", "stay", "spend", "diversity", "network"];

function toEvidenceRow(e: {
  metricCode: string;
  rawValue: number;
  normalizedValue: number | null;
  unit: string;
  adminLevel: string;
  regionCode: string;
  baseYm: string;
  sourceCode: string;
  collectedAt: Date;
  appliedRule: string;
  provenance?: DataProvenance | null;
}): EvidenceRow {
  return e;
}

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let project: Awaited<ReturnType<typeof getProjectDetail>> = null;
  let loadError: string | null = null;
  try {
    project = await getProjectDetail(id);
  } catch {
    loadError = "분석 결과를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
  }

  if (loadError) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-10">
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            {loadError}
          </div>
        </main>
      </>
    );
  }

  if (!project) notFound();

  if (!project.analysisResult) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-10">
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">
            아직 분석 결과가 없습니다. 조건 입력을 다시 완료해주세요.
          </div>
        </main>
      </>
    );
  }

  const { analysisResult, input } = project;
  if (!input) notFound();

  const axisData: DnaAxisChartDatum[] = AXIS_ORDER.map((axis) => {
    const scoreKey = `${axis}Score` as const;
    const statusKey = `${axis}Status` as const;
    return {
      axisKey: axis,
      label: AXIS_LABEL_KO[axis],
      score: analysisResult[scoreKey] as number | null,
      status: analysisResult[statusKey] as "LIVE" | "SNAPSHOT" | "MISSING",
    };
  });

  // 헤더에는 env 상수가 아니라 이 프로젝트의 분석에 실제로 사용된 기준월(evidence에 저장된 값)을
  // 표시한다(2026-07-29) — 메인/기획 화면과 다른 소스를 쓰던 것을 바로잡는다. 지표마다 기준월이 다르면
  // 하나로 뭉개지 않고 그 사실을 알린다.
  const baseYmSummary = summarizeEvidenceBaseYms(analysisResult.evidences);

  // 2026-07-29(2차 개선 Section 4): 핵심 관광 지표 요약카드 — 분석 시점에 저장된 Evidence만 사용한다
  // (새 DB 조회 없음). 값이 없는 지표는 findEvidence가 null을 반환해 카드 자체가 생략된다.
  const findEvidence = (metricCode: string) =>
    analysisResult.evidences.find((e) => e.metricCode === metricCode) ?? null;
  const tourismMetricCards = buildTourismMetricCards({
    visitor: findEvidence(METRIC_CODES.VISITOR_CNT),
    growth: findEvidence(METRIC_CODES.DEMAND_VISITOR_GROWTH_DISPLAY),
    stay: findEvidence(METRIC_CODES.STAY),
    spend: findEvidence(METRIC_CODES.SPEND),
  });

  const axisEvidenceByAxis = new Map<string, EvidenceRow[]>();
  for (const e of analysisResult.evidences) {
    const list = axisEvidenceByAxis.get(e.axis ?? "") ?? [];
    list.push(toEvidenceRow(e));
    axisEvidenceByAxis.set(e.axis ?? "", list);
  }

  // 축 출처 배지(2026-08-06) — 기존에는 LIVE/SNAPSHOT/MISSING enum 원문을 그대로 노출해 SNAPSHOT이
  // CACHED_API(과거 API 캐시)·CURATED(정제 데이터)·ESTIMATED(추정값)를 전부 뭉뚱그려 "저장된 과거
  // 스냅샷"처럼 오해하기 쉬웠다. 점수·상태 산식(dna.ts)은 그대로 두고, 이미 저장된 Evidence의
  // provenance만 다시 읽어 순수 표시용 문구를 만든다.
  const axisSourceSummaries = new Map<string, ReturnType<typeof summarizeAxisSource>>(
    AXIS_ORDER.map((axis) => [
      axis,
      summarizeAxisSource(
        axis,
        (axisEvidenceByAxis.get(axis) ?? []).map((e) => ({ ...e, provenance: e.provenance ?? null })),
      ),
    ]),
  );

  // 유사지역 비교(2026-08-02, DNA 5축 바로 다음에 표시) — 이 분석의 근거에 실제로 저장된 기준월과
  // 동일한 baseYm으로 지원 지역 전체의 DNA·POI 구성을 다시 계산한다(같은 baseYm이어야 min-max 코호트가
  // 일치해 점수가 서로 비교 가능함). DNA 5축 산식(dna.ts)은 그대로 재사용하며 전혀 바꾸지 않는다.
  const analysisOwnBaseYm = baseYmSummary.primary;
  const regionComparisonBaseYm = analysisOwnBaseYm ?? DEFAULT_BASE_YM;
  const regionProfiles = await fetchRegionComparisonProfiles(regionComparisonBaseYm);
  const targetRegionProfile = regionProfiles.find((p) => p.code === project.region.code);
  const regionComparisonAnalysis = targetRegionProfile
    ? computeRegionSimilarityComparisons(targetRegionProfile, regionProfiles)
    : {
        targetRegionName: project.region.name,
        comparisonBaseYm: regionComparisonBaseYm,
        mixedBaseYm: false,
        baseYmNote: null,
        comparisons: [],
        uniqueStrengthNote: null,
        note: "이 지역의 비교 데이터를 찾지 못해 유사지역 비교를 생성하지 못했습니다.",
        commonLimitationNote: null,
        candidatePoolSize: 0,
        isSmallCandidatePool: true,
        ruleVersion: REGION_SIMILARITY_RULE_VERSION,
      };
  // 이 프로젝트의 분석 기준월과 유사지역 비교에 실제로 쓰인 기준월이 다르면(예: 분석 근거에 기준월
  // 정보가 없어 대체값을 쓴 경우) 숨기지 않고 안내한다 — 분석·인쇄 화면이 이 함수를 동일하게 호출한다.
  const analysisBaseYmMismatchNote = resolveAnalysisBaseYmMismatchNote(
    analysisOwnBaseYm,
    regionComparisonAnalysis.comparisonBaseYm,
  );

  const strategyCardsData: StrategyCardData[] = analysisResult.strategyResults.map((s) => ({
    id: s.id,
    rank: s.rank,
    name: s.name,
    concept: s.concept,
    totalScore: s.totalScore,
    scoreBreakdown: s.scoreBreakdown as unknown as StrategyCardData["scoreBreakdown"],
    reasons: s.reasons as string[],
    targetDescription: s.targetDescription,
    consumptionTouchpoints: s.consumptionTouchpoints as unknown as StrategyCardData["consumptionTouchpoints"],
    risks: s.risks as string[],
    evidences: s.evidences.map(toEvidenceRow),
    coreProblem: s.coreProblem,
    coreResource: s.coreResource,
    stayStyle: s.stayStyle,
    executionDifficulty: s.executionDifficulty as "LOW" | "MEDIUM" | "HIGH" | null,
    expectedEffect: s.expectedEffect,
  }));

  // 전략 비교 표 + 예산 항목·협력 대상(2026-08-04) — templateId는 StrategyResult 도입 이래 항상 존재하는
  // 필수 컬럼이라 레거시 분석 결과에도 예외 없이 계산 가능하다. coreProblem 등 5개 차별화 필드는
  // 2026-07-31 마이그레이션 이전 레거시 분석에는 없을 수 있어(전부 null), buildStrategyComparisonRows가
  // 인쇄 화면과 동일한 판정 로직으로 "이전 분석 결과" 안내를 붙인다(원인 조사: 2026-08-04).
  const strategyComparisonRows: StrategyComparisonRow[] = buildStrategyComparisonRows(
    analysisResult.strategyResults.map((s) => ({
      id: s.id,
      rank: s.rank,
      name: s.name,
      totalScore: s.totalScore,
      templateId: s.templateId,
      coreProblem: s.coreProblem,
      coreResource: s.coreResource,
      stayStyle: s.stayStyle,
      executionDifficulty: s.executionDifficulty as "LOW" | "MEDIUM" | "HIGH" | null,
      expectedEffect: s.expectedEffect,
      risks: s.risks as string[],
    })),
  );
  const strategyResourcePlans = new Map(
    analysisResult.strategyResults.map((s) => [
      s.id,
      {
        budgetItems: buildStrategyBudgetItems(s.templateId, project.role),
        partners: buildStrategyPartners(s.templateId, project.role),
      },
    ]),
  );

  const allPoiIds = Array.from(
    new Set(analysisResult.strategyResults.flatMap((s) => s.poiIds as string[])),
  );
  const poiRows = allPoiIds.length > 0 ? await prisma.poi.findMany({ where: { id: { in: allPoiIds } } }) : [];
  const mapPois: MapPoi[] = poiRows.map((p) => ({
    id: p.id,
    name: p.name,
    address: p.address,
    lat: p.lat,
    lng: p.lng,
  }));

  // 관광사업 기회 3안(2026-08-02, DNA 진단과 전략 3안 사이에 표시) — 전략처럼 저장하지 않고 매 렌더링
  // 시점에 순수 함수로 다시 계산한다. 단, 공급 격차(SUPPLY_GAP/TARGET_THEME_GAP) 판정의 입력인 지역
  // POI 카테고리별 개수는 분석 시점에 AnalysisResult.poiCategorySummary로 저장해둔 스냅샷을 우선
  // 사용한다 — 이후 POI 동기화로 최신 공급량이 바뀌어도 이미 만들어진 분석 결과가 임의로 바뀌지
  // 않도록 고정하기 위함이다(재현성 보완, 2026-08-02). 이 컬럼 도입 이전에 생성된 레거시 분석 결과는
  // 스냅샷이 없으므로(null) 그 경우에만 예외적으로 현재 DB를 조회하는 기존 방식으로 대체한다.
  const poiCountByCategory = (analysisResult.poiCategorySummary as Partial<Record<PoiCategoryCode, number>> | null) ??
    Object.fromEntries(
      Object.entries(await fetchPoisByCategory(project.region.code)).map(([category, pois]) => [
        category,
        pois?.length ?? 0,
      ]),
    ) as Partial<Record<PoiCategoryCode, number>>;
  const usingLivePoiFallback = analysisResult.poiCategorySummary === null;
  const opportunityAnalysis = computeBusinessOpportunities({
    regionName: project.region.name,
    axisScores: axisData.map((a) => ({ axis: a.axisKey as DnaAxisKey, score: a.score, status: a.status })),
    role: project.role,
    travelMonth: project.travelMonth,
    preferredThemes: (input.preferredThemes as string[] | undefined) ?? [],
    poiCountByCategory,
  });

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500">{project.name}</p>
            <h1 className="mt-1 text-xl font-bold text-slate-900">관광 DNA 분석 · 전략 비교</h1>
            <p className="mt-1 text-sm text-slate-600">
              {project.region.name} · {project.travelYear}년 {project.travelMonth}월 ·{" "}
              {labelForRole(project.role)}
            </p>
            <Link
              href={`/projects/${project.id}/edit`}
              className="mt-2 inline-block text-xs text-slate-500 underline hover:text-slate-900"
            >
              조건 수정
            </Link>
          </div>
          <div className="rounded-md border border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">
            <p>
              분석 기준월{" "}
              <strong>{baseYmSummary.primary ? formatBaseYm(baseYmSummary.primary) : "확인 불가"}</strong>
            </p>
            {baseYmSummary.mixed ? (
              <p className="text-[11px] text-amber-700">
                일부 지표는 서로 다른 기준월의 데이터를 사용합니다({baseYmSummary.all.map(formatBaseYm).join(", ")})
              </p>
            ) : null}
            <p>데이터 버전 {analysisResult.dataVersion}</p>
            <p>모델 버전 {analysisResult.modelVersion}</p>
            <p>
              데이터 상태{" "}
              <span className="font-semibold text-slate-700">
                {analysisResult.overallDataMode} {analysisResult.liveAxisCount}/5
              </span>
            </p>
          </div>
        </div>

        {tourismMetricCards.length > 0 ? (
          <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tourismMetricCards.map((card) => (
              <div key={card.key} className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold text-slate-500">{card.label}</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{card.valueText}</p>
                <p className="mt-1 text-[11px] text-slate-400">{card.metaText}</p>
                {card.note ? <p className="mt-1 text-[11px] text-slate-500">{card.note}</p> : null}
              </div>
            ))}
          </section>
        ) : (
          <section className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-4 text-xs text-slate-500">
            핵심 관광 지표(방문자수·증감률·체류/소비 지수)를 표시할 데이터가 아직 확보되지 않았습니다.
          </section>
        )}

        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">입력 조건 요약</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm text-slate-600 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-slate-400">내/외국인</dt>
              <dd>{labelForNationality(input.nationality)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">연령대</dt>
              <dd>{(input.ageGroups as string[]).map(labelForAgeGroup).join(", ")}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">동행 유형</dt>
              <dd>{labelForCompanionType(input.companionType)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">주 목표</dt>
              <dd>{labelForPrimaryGoal(input.primaryGoal)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">여행 기간</dt>
              <dd>{labelForDuration(input.duration)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">예산 수준</dt>
              <dd>{labelForBudgetLevel(input.budgetLevel)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">이동 수단</dt>
              <dd>{labelForTransport(input.transport)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">그룹 규모</dt>
              <dd>{labelForGroupType(input.groupType)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">선호 테마</dt>
              <dd>{(input.preferredThemes as string[]).join(", ") || "-"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">제외 테마</dt>
              <dd>{(input.excludedThemes as string[]).join(", ") || "-"}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-slate-400">
            ※ 역할·국적·테마·여행월은 지역의 객관적 관광 DNA(수요 적합도/공급 적합도)를 바꾸지 않고,
            역할 적합도·타깃 적합도·운영 적합도·시즌 적합도와 추천 근거·실행안에만 반영됩니다.
          </p>
        </section>

        <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">관광 DNA 5축</h2>
            <DnaRadarChart
              data={axisData.map((a) => ({ ...a, sourceLabel: axisSourceSummaries.get(a.axisKey)?.label }))}
            />
            <p className="mt-3 text-xs text-slate-500">
              ※ 이 점수는 실제 수치가 아니라, 같은 행정단위(시군구) 비교군 안에서의 상대 순위를
              0~100으로 환산한 정규화 점수입니다. 원값·비교 행정단위·기준월은 각 축의 &quot;근거
              보기&quot;에서 확인할 수 있습니다.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {axisData.map((a) => {
              const source = axisSourceSummaries.get(a.axisKey);
              return (
                <div key={a.axisKey} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-800">{a.label}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                        source?.tier === "ALL_LIVE"
                          ? "border-emerald-300 text-emerald-700"
                          : source?.tier === "MIXED"
                            ? "border-amber-300 text-amber-700"
                            : "border-slate-300 text-slate-500"
                      }`}
                      title="이 축의 점수 계산에 실제로 쓰인 근거들의 출처 구성입니다. 개별 근거의 정확한 값·기준월은 아래 근거 보기에서 확인할 수 있습니다."
                    >
                      {source?.label ?? "데이터 부족"}
                    </span>
                  </div>
                  <p className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
                    {a.score === null ? "데이터 부족" : a.score}
                    {a.score === 0 ? (
                      <span
                        className="rounded-full border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-500"
                        title="관광객·소비가 전혀 없다는 뜻이 아니라, 같은 행정단위 비교 지역 중 상대적으로 가장 낮다는 의미입니다."
                      >
                        비교지역 내 최저
                      </span>
                    ) : null}
                  </p>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-slate-500">근거 보기</summary>
                    <div className="mt-2">
                      <EvidenceTable items={axisEvidenceByAxis.get(a.axisKey) ?? []} />
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-8">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">유사지역 비교</h2>
            <span
              className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"
              title="공공데이터 상대 비교와 사람이 정한 기획 규칙(CURATED)으로 도출한 참고 정보이며, 통계·머신러닝 예측치가 아닙니다."
            >
              CURATED 규칙 · {regionComparisonAnalysis.ruleVersion}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            현재 지원 지역 데이터 기준 비교입니다(조회 시점 최신 데이터, 기준월 {regionComparisonAnalysis.comparisonBaseYm}) —
            DNA 5축·관광 자원 구성이 현재 지원 지역 중 가장 비슷한 지역과 비교해, 이 지역의 점수가
            상대적으로 어떤 의미인지 보여줍니다.
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            현재 지원지역 {regionComparisonAnalysis.candidatePoolSize + 1}곳 중 대상 지역을 제외한{" "}
            {regionComparisonAnalysis.candidatePoolSize}곳을 비교했습니다 — 전국 전체가 아닌, 현재
            데이터가 준비된 지역 내 비교 결과입니다.
          </p>
          {regionComparisonAnalysis.isSmallCandidatePool && regionComparisonAnalysis.candidatePoolSize > 0 ? (
            <p className="mt-1 text-[11px] text-amber-700">
              ※ 비교 가능한 지역이 아직 적어({regionComparisonAnalysis.candidatePoolSize}곳) 통계적으로
              의미 있는 &quot;유사 지역&quot;이라기보다 참고용으로만 활용해주세요.
            </p>
          ) : null}
          {analysisBaseYmMismatchNote ? (
            <p className="mt-1 text-xs text-amber-700">{analysisBaseYmMismatchNote}</p>
          ) : null}
          {regionComparisonAnalysis.baseYmNote ? (
            <p className="mt-1 text-xs text-amber-700">{regionComparisonAnalysis.baseYmNote}</p>
          ) : null}
          {regionComparisonAnalysis.comparisons.length > 0 ? (
            <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
              {regionComparisonAnalysis.comparisons.map((c, i) => (
                <RegionComparisonCard
                  key={c.regionCode}
                  comparison={c}
                  rank={i + 1}
                  comparisonBaseYm={regionComparisonAnalysis.comparisonBaseYm}
                />
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              현재 확보된 데이터로는 근거 있는 유사지역 비교를 만들지 못했습니다.
            </div>
          )}
          {regionComparisonAnalysis.uniqueStrengthNote ? (
            <p className="mt-2 text-xs text-slate-600">{regionComparisonAnalysis.uniqueStrengthNote}</p>
          ) : null}
          {regionComparisonAnalysis.note ? (
            <p className="mt-2 text-xs text-slate-500">{regionComparisonAnalysis.note}</p>
          ) : null}
          {regionComparisonAnalysis.commonLimitationNote ? (
            <p className="mt-3 rounded-md border border-slate-100 bg-slate-50 p-2 text-[11px] text-slate-500">
              <span className="font-medium text-slate-600">한계 및 추가 확인사항: </span>
              {regionComparisonAnalysis.commonLimitationNote}
            </p>
          ) : null}
        </section>

        <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-xs font-semibold text-slate-500">강점</h3>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">
              {(analysisResult.strengths as string[]).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-xs font-semibold text-slate-500">기회</h3>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">
              {(analysisResult.opportunities as string[]).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-xs font-semibold text-slate-500">주의</h3>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">
              {(analysisResult.cautions as string[]).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-8">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">관광사업 기회 3안</h2>
            <span
              className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"
              title="공공데이터 상대 비교와 사람이 정한 기획 규칙(CURATED)으로 도출한 가설이며, 통계·머신러닝 예측치가 아닙니다."
            >
              CURATED 규칙 · {opportunityAnalysis.ruleVersion}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            지역의 취약점·강점, 여행 시기, 타깃·테마, 관광지 공급을 조합해 지금 검토할 가치가 있는 사업
            기회를 근거와 함께 제시합니다. 아래 전략 3안과 달리 선택·저장하지 않으며, 실제 사업성은
            별도 검증이 필요합니다.
          </p>
          {usingLivePoiFallback ? (
            <p className="mt-1 text-xs text-slate-400">
              ※ 이 분석은 공급 격차 스냅샷 도입 이전에 생성돼 현재 시점의 지역 POI 공급량을 대신
              사용합니다 — 이후 POI 자료가 갱신되면 이 기회 결과도 함께 바뀔 수 있습니다.
            </p>
          ) : null}
          {opportunityAnalysis.items.length > 0 ? (
            <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
              {opportunityAnalysis.items.map((o, i) => (
                <OpportunityCard key={o.category} opportunity={o} rank={i + 1} />
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              현재 확보된 데이터(여행월·선호 테마·지역 POI)로는 근거 있는 사업 기회를 도출하지 못했습니다.
            </div>
          )}
          {opportunityAnalysis.note ? (
            <p className="mt-2 text-xs text-slate-500">{opportunityAnalysis.note}</p>
          ) : null}
          {opportunityAnalysis.commonLimitationNote ? (
            <p className="mt-3 rounded-md border border-slate-100 bg-slate-50 p-2 text-[11px] text-slate-500">
              <span className="font-medium text-slate-600">한계 및 추가 확인사항: </span>
              {opportunityAnalysis.commonLimitationNote}
            </p>
          ) : null}
        </section>

        <section className="mt-8">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">전략 3안 비교</h2>
            <span
              className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"
              title="사람이 정한 기획 규칙(CURATED)으로 도출한 참고 정보이며, 실제 사업비·매출 예측치가 아닙니다."
            >
              CURATED 규칙 · {STRATEGY_RESOURCE_PLAN_RULE_VERSION}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            해결 문제·활용 자원·체류 방식·실행 난이도·기대 효과·주요 위험·적합 역할을 한 화면에서
            비교합니다. 각 항목의 세부 근거는 아래 전략 카드에서 확인할 수 있습니다.
          </p>
          <div className="mt-3">
            <StrategyComparisonTable rows={strategyComparisonRows} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {strategyCardsData.map((s) => (
              <div key={s.id}>
                <StrategyCard
                  strategy={s}
                  isSelected={project.selectedStrategyResultId === s.id}
                  onSelect={selectStrategyAction.bind(null, project.id, s.id)}
                />
                {strategyResourcePlans.has(s.id) ? (
                  <StrategyResourcePlanPanel
                    budgetItems={strategyResourcePlans.get(s.id)!.budgetItems}
                    partners={strategyResourcePlans.get(s.id)!.partners}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-base font-semibold text-slate-900">전략 관련 지도</h2>
          <div className="mt-3">
            <MapOrFallback pois={mapPois} kakaoKey={process.env.NEXT_PUBLIC_KAKAO_MAP_KEY} />
          </div>
        </section>

        <div className="mt-8 text-xs text-slate-400">
          분석 생성일 {formatDateTime(analysisResult.createdAt)} ·{" "}
          <Link href="/" className="underline">
            프로젝트 목록으로
          </Link>
        </div>
      </main>
    </>
  );
}
