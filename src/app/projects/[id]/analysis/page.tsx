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
import { toDisplayDnaScore } from "@/lib/domain/dnaDisplayScore";
import { buildTourismMetricCards } from "@/lib/domain/tourismMetricSummary";
import { METRIC_CODES } from "@/lib/domain/types";
import { prisma } from "@/lib/db";
import { computeBusinessOpportunities } from "@/lib/domain/businessOpportunity";
import { buildRoleDecisionSummary } from "@/lib/domain/roleDecisionSummary";
import { buildRegionBenchmarkInsight } from "@/lib/domain/regionBenchmarkInsight";
import type { PoiCategoryCode } from "@/lib/domain/strategyTemplates";
import { OpportunityCard } from "@/components/opportunity/OpportunityCard";
import { fetchPoisByCategory } from "@/lib/services/fetchPoisByCategory";
import { resolveAnalysisBaseYmMismatchNote } from "@/lib/domain/regionSimilarity";
import { resolveRegionComparisonAnalysis } from "@/lib/services/resolveRegionComparisonAnalysis";
import { RegionComparisonCard } from "@/components/comparison/RegionComparisonCard";
import { computePreLaunchValidation } from "@/lib/domain/preLaunchValidation";
import { PreLaunchValidationSection } from "@/components/plan/PreLaunchValidationSection";
import { AnimatedDetails } from "@/components/ui/AnimatedDetails";
import { readProjectPreferences } from "@/lib/validation/project-preferences";
import { FestivalAnchorPanel } from "@/components/festival/FestivalAnchorPanel";
import { fetchFestivalAnchorCandidates } from "@/lib/services/festivalAnchorService";
import { getProjectAnchor } from "@/lib/services/projectAnchorService";
import {
  deleteFestivalAnchorAction,
  saveFestivalAnchorAction,
} from "./festivalAnchorActions";

export const dynamic = "force-dynamic";

const AXIS_ORDER: DnaAxisKey[] = ["demand", "stay", "spend", "diversity", "network"];

/** overallDataMode(LIVE/HYBRID/SNAPSHOT) enum 원문을 화면에 그대로 노출하지 않고, 사용자가 실제로
 *궁금한 "지금 몇 개 축이 최신 데이터인지"만 자연스러운 한국어로 알려준다(2026-08-07). 산식(dna.ts의
 * overallDataMode 판정)은 그대로 두고 표시 문구만 바꾼다. */
function describeOverallDataMode(mode: "LIVE" | "HYBRID" | "SNAPSHOT", liveAxisCount: number): string {
  if (mode === "LIVE") return "5개 축 모두 최신 데이터";
  if (mode === "SNAPSHOT") return "저장된 데이터 사용";
  return `${liveAxisCount}/5축 최신 데이터`;
}

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
  const preferences = readProjectPreferences(input.preferredThemes);
  // P1-2a: 후보 조회와 프로젝트 Anchor 읽기는 서로 독립적이다. 새 Anchor 테이블이 아직 없는
  // Production에서도 읽기 결과가 UNAVAILABLE로 내려가 분석 화면 전체를 중단하지 않는다.
  const [festivalAnchorLookup, projectAnchorResult] = await Promise.all([
    fetchFestivalAnchorCandidates({
      regionCode: project.region.code,
      travelYear: project.travelYear,
      travelMonth: project.travelMonth,
    }),
    getProjectAnchor(project.id),
  ]);

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

  // 상단 핵심 요약(2026-08-08, 정보 위계 개선) — DNA 산식(dna.ts)은 건드리지 않고, 이미 계산된
  // axisData 점수를 화면 표시용으로만 재정렬해 "가장 강한 축"/"가장 개선이 필요한 축"을 뽑는다.
  // dna.ts의 buildStrengthsOpportunitiesCautions와 같은 정렬 기준(점수 내림/오름차순)이라 결과가
  // analysisResult.strengths/opportunities와 항상 일치한다 — 새 점수 기준을 만들지 않는다.
  const scoredAxes = axisData.filter(
    (a): a is DnaAxisChartDatum & { score: number } => a.score !== null,
  );
  const topAxes = [...scoredAxes].sort((a, b) => b.score - a.score).slice(0, 2);
  const topAxisKeys = new Set(topAxes.map((a) => a.axisKey));
  const bottomAxes = [...scoredAxes]
    .sort((a, b) => a.score - b.score)
    .filter((a) => !topAxisKeys.has(a.axisKey))
    .slice(0, 2);
  const bottomAxisKeys = new Set(bottomAxes.map((a) => a.axisKey));

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

  // 내부 분석점수 vs 사용자 표시지수 분리(2026-08-07) — 27개 지역 실제 분포 조사 결과, 설명 문구만으로는
  // 0/100 절대값 오해를 완전히 막기 어려워 표시 계층 자체를 도입했다. 강점/개선 판정(topAxes/bottomAxes,
  // 이 파일 위쪽에서 이미 axisData의 내부점수로 계산됨)과 전략 계산은 이 표시값을 전혀 참조하지 않는다 —
  // 오직 화면에 숫자를 그릴 때만 사용한다(dnaDisplayScore.ts 참고).
  const axisDisplayScoreByAxis = new Map<string, number | null>(
    axisData.map((a) => [a.axisKey, toDisplayDnaScore(a.score)]),
  );
  const displayAxisText = (axis: DnaAxisChartDatum): string => {
    const score = axisDisplayScoreByAxis.get(axis.axisKey);
    return score === null || score === undefined ? `${axis.label} (데이터 부족)` : `${axis.label} (DNA 상대지수 ${score})`;
  };
  // 저장 당시 만들어진 요약 문구는 과거 내부점수(예: 7)를 포함할 수 있다. 화면에서는 현재 카드·
  // 레이더와 같은 표시지수만 사용해 한 화면 안의 숫자 기준을 하나로 맞춘다.
  const canonicalStrengths = topAxes.map((axis) => `${displayAxisText(axis)}가 비교지역 안에서 상대적으로 높습니다.`);
  const canonicalOpportunities = bottomAxes.map((axis) => `${displayAxisText(axis)}부터 개선 여지를 확인해보세요.`);
  const canonicalCautions = [
    "개별 근거의 정규화값은 축 최종 지수와 다른 값이며, 세부 근거에서 구분해 표시합니다.",
    ...axisData.filter((axis) => axis.score === null).map((axis) => `${axis.label} 축은 비교 가능한 데이터가 부족합니다.`),
  ];

  // 유사지역 비교(2026-08-02, DNA 5축 바로 다음에 표시) — 이 분석의 근거에 실제로 저장된 기준월과
  // 동일한 baseYm으로 지원 지역 전체의 DNA·POI 구성을 다시 계산한다(같은 baseYm이어야 min-max 코호트가
  // 일치해 점수가 서로 비교 가능함). DNA 5축 산식(dna.ts)은 그대로 재사용하며 전혀 바꾸지 않는다.
  const analysisOwnBaseYm = baseYmSummary.primary;
  const allPoiIds = Array.from(
    new Set(analysisResult.strategyResults.flatMap((s) => s.poiIds as string[])),
  );

  // 2026-08-13(로딩 성능 개선): 유사지역 비교 재계산, 전략 관련 지도용 POI 조회, (레거시 분석만
  // 발생하는) 카테고리별 POI 재조회는 서로 완전히 독립적인데 이전에는 순차 await로 걸려 있었다 —
  // Promise.all로 병렬화한다(각 계산 로직·산식 자체는 바꾸지 않음).
  const [
    { analysis: regionComparisonAnalysis, usingLiveFallback: usingLiveRegionComparisonFallback },
    poiRows,
    poiCategoryFallback,
  ] = await Promise.all([
    resolveRegionComparisonAnalysis({
      regionCode: project.region.code,
      regionName: project.region.name,
      snapshot: analysisResult.regionComparisonSnapshot,
      analysisOwnBaseYm,
    }),
    allPoiIds.length > 0 ? prisma.poi.findMany({ where: { id: { in: allPoiIds } } }) : Promise.resolve([]),
    analysisResult.poiCategorySummary === null ? fetchPoisByCategory(project.region.code) : Promise.resolve(null),
  ]);
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
    role: project.role,
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
      Object.entries(poiCategoryFallback ?? {}).map(([category, pois]) => [
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
    preferredThemes: preferences.themeLabels,
    poiCountByCategory,
  });
  const topStrategyName = analysisResult.strategyResults.find((s) => s.rank === 1)?.name ?? null;
  const roleDecisionSummary = buildRoleDecisionSummary({
    role: project.role,
    axisScores: axisData.map((a) => ({ axis: a.axisKey as DnaAxisKey, score: a.score })),
    topStrategyName,
    displayScores: Object.fromEntries(axisData.map((axis) => [axis.axisKey, axisDisplayScoreByAxis.get(axis.axisKey)])),
  });
  // 유사지역 벤치마킹 인사이트(2026-08-13) — 이미 계산된 유사지역 비교(regionComparisonAnalysis)만
  // 재사용한다(새 유사도 계산 없음). 아래에서 계산.
  const regionBenchmarkAnalysis = buildRegionBenchmarkInsight({
    targetAxisScores: axisData.map((a) => ({ axis: a.axisKey as DnaAxisKey, score: a.score })),
    comparisons: regionComparisonAnalysis.comparisons,
    role: project.role,
  });

  // 사업 사전검증 리포트를 실행안 선택 전(no-plan) 단계에도 보여준다(2026-08-13) — 이전에는 plan/print
  // 화면에만 있었다. computePreLaunchValidation()은 이미 코스가 없어도(totalCourseDays=0) POI 공급·
  // 이동 현실성을 안전하게 "확인 필요"(UNKNOWN)로 처리하도록 설계돼 있어(plan.tsx의 코스 있는 호출과
  // 동일한 함수), 이 단계에서 판단 가능한 두 신호(데이터 신뢰도·지역 차별성)만으로 새 로직 없이
  // 그대로 재사용한다. 위험·KPI는 아직 실행안이 없어 빈 배열로 전달한다.
  const analysisStagePreLaunchValidation = computePreLaunchValidation({
    axisScores: axisData.map((a) => ({
      axis: a.axisKey as DnaAxisKey,
      score: a.score,
      evidenceProvenances: (axisEvidenceByAxis.get(a.axisKey) ?? []).map((e) => e.provenance ?? null),
    })),
    poiShortage: null,
    travelNoticeCount: 0,
    totalCourseDays: 0,
    regionComparisonCount: regionComparisonAnalysis.comparisons.length,
    regionUniqueStrengthNote: regionComparisonAnalysis.uniqueStrengthNote,
    riskMitigations: [],
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
              {" · "}
              <span className="font-semibold text-slate-700">
                {describeOverallDataMode(analysisResult.overallDataMode, analysisResult.liveAxisCount)}
              </span>
            </p>
            {baseYmSummary.mixed ? (
              <p className="mt-1 text-[11px] text-amber-700">
                일부 지표는 서로 다른 기준월의 데이터를 사용합니다({baseYmSummary.all.map(formatBaseYm).join(", ")})
              </p>
            ) : null}
          </div>
        </div>

        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-slate-900">
            {project.region.name}의 강점은{" "}
            {topAxes[0] ? (
              <span className="text-emerald-700">{topAxes[0].label}</span>
            ) : (
              "특정할 데이터 부족"
            )}
            이며,{" "}
            {bottomAxes[0] ? (
              <span className="text-amber-700">{bottomAxes[0].label}</span>
            ) : (
              "특정할 데이터 부족"
            )}
            {" "}개선이 필요합니다.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {topAxes.map((a) => (
              <span
                key={a.axisKey}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
              >
                강점 · {a.label} {axisDisplayScoreByAxis.get(a.axisKey)}
              </span>
            ))}
            {bottomAxes.map((a) => (
              <span
                key={a.axisKey}
                className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700"
              >
                개선 · {a.label} {axisDisplayScoreByAxis.get(a.axisKey)}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            ※ 위 지수는 절대평가가 아니라, 현재 비교지역 안에서 극단적인 차이를 완화해 보여주는 상대
            수준입니다.
          </p>
          {roleDecisionSummary ? (
            <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-800">
              {roleDecisionSummary}
            </p>
          ) : null}
          <a
            href="#strategies"
            className="mt-4 inline-block rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-700"
          >
            전략 3안 확인하기 →
          </a>
        </section>

        <div className="mt-6">
          <FestivalAnchorPanel
            projectId={project.id}
            regionName={project.region.name}
            travelYear={project.travelYear}
            travelMonth={project.travelMonth}
            lookup={festivalAnchorLookup}
            duration={input.duration}
            projectUpdatedAt={project.updatedAt.toISOString()}
            initialAnchor={projectAnchorResult.anchor}
            anchorStorage={projectAnchorResult.storage}
            anchorStorageMessage={projectAnchorResult.storage === "UNAVAILABLE" ? projectAnchorResult.message : undefined}
            saveAction={saveFestivalAnchorAction.bind(null, project.id)}
            deleteAction={deleteFestivalAnchorAction.bind(null, project.id)}
          />
        </div>

        {/* 사업 사전검증 리포트(2026-08-13, 실행안 선택 전 단계에도 노출) — 코스·KPI·위험은 아직 없어
         * POI 공급 충분성·이동 현실성은 "확인 필요"로 안전하게 남는다(같은 함수를 plan 화면과 동일하게
         * 재사용, 새 로직 없음). 실행안을 선택하면 plan/print 화면에서 네 신호 전부가 채워진 전체
         * 리포트를 다시 볼 수 있다. */}
        <div className="mt-6">
          <PreLaunchValidationSection report={analysisStagePreLaunchValidation} preliminary compact />
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

        <AnimatedDetails
          className="mt-6 rounded-lg border border-slate-200 bg-white p-5"
          summary="입력 조건 보기"
          summaryClassName="cursor-pointer text-sm font-semibold text-slate-900"
        >
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
              <dd>{preferences.themeLabels.join(", ") || "-"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">여행 조건</dt>
              <dd>{preferences.travelConditionLabels.join(", ") || "-"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">제외 테마</dt>
              <dd>{(input.excludedThemes as string[]).join(", ") || "-"}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-slate-400">
            ※ 선택한 역할·타깃·여행 시기를 반영해 추천 전략과 실행안을 조정했습니다.
          </p>
        </AnimatedDetails>

        <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">관광 DNA 5축</h2>
            <DnaRadarChart
              data={axisData.map((a) => ({
                ...a,
                score: axisDisplayScoreByAxis.get(a.axisKey) ?? null,
                sourceLabel: axisSourceSummaries.get(a.axisKey)?.label,
              }))}
            />
            <p className="mt-3 text-xs text-slate-500">
              ※ 이 지수는 실제 관광량이나 절대평가 점수가 아니라, 같은 행정단위(시군구) 비교지역
              데이터를 기준으로 극단적인 차이를 완화해 보여주는 상대지수입니다. 원값·비교 행정단위·
              기준월은 각 축의 &quot;근거 보기&quot;에서 확인할 수 있습니다.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {axisData.map((a) => {
              const source = axisSourceSummaries.get(a.axisKey);
              const displayScore = axisDisplayScoreByAxis.get(a.axisKey) ?? null;
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
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-2xl font-bold text-slate-900">
                    {displayScore === null ? "데이터 부족" : displayScore}
                    {displayScore !== null ? (
                      <span className="text-[11px] font-medium text-slate-400">DNA 상대지수</span>
                    ) : null}
                    {topAxisKeys.has(a.axisKey) ? (
                      <span className="text-xs font-medium text-emerald-700">강점</span>
                    ) : bottomAxisKeys.has(a.axisKey) ? (
                      <span className="text-xs font-medium text-amber-700">개선 필요</span>
                    ) : null}
                  </p>
                  <AnimatedDetails
                    className="mt-2"
                    summary="근거 보기"
                    summaryClassName="cursor-pointer text-xs text-slate-500"
                  >
                    <div className="mt-2">
                     <EvidenceTable
                       items={axisEvidenceByAxis.get(a.axisKey) ?? []}
                       note="정규화값은 개별 지표 값입니다. 위 카드의 DNA 상대지수는 이 축에 포함된 지표들을 종합한 표시값입니다."
                     />
                    </div>
                  </AnimatedDetails>
                </div>
              );
            })}
          </div>
        </section>

        <AnimatedDetails
          className="mt-8 rounded-lg border border-slate-200 bg-white p-5"
          summary="유사지역 비교 보기"
          summaryClassName="cursor-pointer text-base font-semibold text-slate-900"
        >
          <div className="mt-2">
          <p
            className="mt-1 text-xs text-slate-500"
            title="DNA 5축·관광 자원 구성이 가장 비슷한 지역과 비교합니다. 전국 전체가 아니라 현재 데이터가 준비된 지원지역 내 비교입니다."
          >
            비교 후보 {regionComparisonAnalysis.candidatePoolSize}곳 중 상위 3곳(기준월{" "}
            {regionComparisonAnalysis.comparisonBaseYm})
          </p>
          {usingLiveRegionComparisonFallback ? (
            <p className="mt-1 text-xs text-slate-400">
              ※ 이 분석은 유사지역 비교 스냅샷 도입 이전에 생성돼 현재 시점의 데이터로 다시 계산한
              결과를 대신 보여줍니다 — 이후 데이터가 갱신되면 이 비교 결과도 함께 바뀔 수 있습니다.
            </p>
          ) : null}
          {regionComparisonAnalysis.isSmallCandidatePool && regionComparisonAnalysis.candidatePoolSize > 0 ? (
            <p className="mt-1 text-[11px] text-amber-700">
              ※ 비교 가능한 지역이 아직 적어({regionComparisonAnalysis.candidatePoolSize}곳) 참고용으로만
              활용해주세요.
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
          {regionComparisonAnalysis.comparisons.length > 0 ? (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-slate-900">벤치마킹 포인트</h3>
              {regionBenchmarkAnalysis.insights.length > 0 ? (
                <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {regionBenchmarkAnalysis.insights.map((insight) => (
                    <div
                      key={`${insight.benchmarkRegionName}-${insight.targetAxis}`}
                      className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 text-xs text-slate-700"
                    >
                      <p className="text-sm font-semibold text-slate-900">
                        {insight.benchmarkRegionName} — {insight.targetAxisLabel} 구조 참고
                      </p>
                      <p className="mt-1 text-slate-500">{insight.whyCompared}</p>
                      <p className="mt-1">{insight.whatIsBetter}</p>
                      <p className="mt-1">{insight.whatToReference}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500">{regionBenchmarkAnalysis.emptyStateNote}</p>
              )}
              <p className="mt-2 text-[11px] text-slate-400">
                ※ 벤치마킹 포인트는 인과관계를 증명하는 것이 아니라, 이미 계산된 DNA 축 차이·관광지 구성
                차이를 근거로 참고 가치를 제시하는 상대 비교입니다.
              </p>
            </div>
          ) : null}
          </div>
        </AnimatedDetails>

        <AnimatedDetails
          className="mt-6 rounded-lg border border-slate-200 bg-white p-4"
          summary="강점·기회·주의 상세 보기"
          summaryClassName="cursor-pointer text-xs font-semibold text-slate-700"
        >
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <h3 className="text-xs font-semibold text-slate-500">강점</h3>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">
                {canonicalStrengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-500">기회</h3>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">
                {canonicalOpportunities.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-500">주의</h3>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">
                {canonicalCautions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          </div>
        </AnimatedDetails>

        <AnimatedDetails
          className="mt-8 rounded-lg border border-slate-200 bg-white p-5"
          summary="관광사업 기회 3안 보기"
          summaryClassName="cursor-pointer text-base font-semibold text-slate-900"
        >
          <div className="mt-2">
          <p className="mt-1 text-xs text-slate-500">이 지역에서 지금 검토할 만한 사업 기회입니다.</p>
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
          </div>
        </AnimatedDetails>

        <section id="strategies" className="mt-8 scroll-mt-6">
          <h2 className="text-base font-semibold text-slate-900">전략 3안 비교</h2>
          <p className="mt-1 text-xs text-slate-500">
            핵심 방향·기대 효과·난이도·위험을 비교해 1순위 전략을 확인하세요.
          </p>
          <div className="mt-3">
            <StrategyComparisonTable rows={strategyComparisonRows} currentRole={project.role} />
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

        {/* 유사지역 비교·관광사업 기회 각 섹션에 반복되던 "한계 및 추가 확인사항"을 여기 한 곳으로
         * 통합한다(2026-08-07) — 삭제가 아니라 위치 이동이며, 문구 자체도 유지한다. 화면이 계속
         * 스스로 결과를 부정하는 인상을 주지 않도록 접힌 상세 영역에 한 번만 정리해서 둔다. */}
        {(regionComparisonAnalysis.commonLimitationNote || opportunityAnalysis.commonLimitationNote) ? (
          <AnimatedDetails
            className="mt-8 rounded-lg border border-slate-200 bg-white p-4"
            summary="데이터 기준 및 확인사항"
            summaryClassName="cursor-pointer text-xs font-semibold text-slate-700"
          >
            <div className="mt-3 space-y-2 text-xs text-slate-600">
              <p>
                공공데이터와 지역 비교 분석을 바탕으로 도출한 사업 검토안입니다. 실제 추진 전 현장
                여건과 사업성을 함께 확인해 주세요.
              </p>
              {regionComparisonAnalysis.commonLimitationNote ? (
                <p>
                  <span className="font-medium text-slate-700">유사지역 비교: </span>
                  {regionComparisonAnalysis.commonLimitationNote}
                </p>
              ) : null}
              {opportunityAnalysis.commonLimitationNote ? (
                <p>
                  <span className="font-medium text-slate-700">관광사업 기회: </span>
                  {opportunityAnalysis.commonLimitationNote}
                </p>
              ) : null}
            </div>
          </AnimatedDetails>
        ) : null}

        <div className="mt-8 text-xs text-slate-400">
          분석 생성일 {formatDateTime(analysisResult.createdAt)} ·{" "}
          <Link href="/" className="underline">
            홈으로 돌아가기
          </Link>
        </div>
      </main>
    </>
  );
}
