import { notFound } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getProjectDetail } from "@/lib/services/projectQueries";
import { DnaRadarChart, type DnaAxisChartDatum } from "@/components/charts/DnaRadarChart";
import { StrategyCard, type StrategyCardData } from "@/components/strategy/StrategyCard";
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
import { buildTourismMetricCards } from "@/lib/domain/tourismMetricSummary";
import { METRIC_CODES } from "@/lib/domain/types";
import { prisma } from "@/lib/db";

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
            <DnaRadarChart data={axisData} />
            <p className="mt-3 text-xs text-slate-500">
              ※ 이 점수는 실제 수치가 아니라, 같은 행정단위(시군구) 비교군 안에서의 상대 순위를
              0~100으로 환산한 정규화 점수입니다. 원값·비교 행정단위·기준월은 각 축의 &quot;근거
              보기&quot;에서 확인할 수 있습니다.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {axisData.map((a) => (
              <div key={a.axisKey} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-800">{a.label}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      a.status === "LIVE"
                        ? "border-emerald-300 text-emerald-700"
                        : a.status === "SNAPSHOT"
                          ? "border-amber-300 text-amber-700"
                          : "border-slate-300 text-slate-500"
                    }`}
                  >
                    {a.status === "MISSING" ? "데이터 부족" : a.status}
                  </span>
                </div>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {a.score === null ? "데이터 부족" : a.score}
                </p>
                {a.score === 0 ? (
                  <p className="mt-1 text-[11px] text-slate-500">
                    비교군 내 최저 상대 점수입니다 — 관광객·소비가 전혀 없다는 뜻이 아니라, 같은
                    행정단위 비교 지역 중 상대적으로 가장 낮다는 의미입니다.
                  </p>
                ) : null}
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-slate-500">근거 보기</summary>
                  <div className="mt-2">
                    <EvidenceTable items={axisEvidenceByAxis.get(a.axisKey) ?? []} />
                  </div>
                </details>
              </div>
            ))}
          </div>
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
          <h2 className="text-base font-semibold text-slate-900">전략 3안 비교</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {strategyCardsData.map((s) => (
              <StrategyCard
                key={s.id}
                strategy={s}
                isSelected={project.selectedStrategyResultId === s.id}
                onSelect={selectStrategyAction.bind(null, project.id, s.id)}
              />
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
