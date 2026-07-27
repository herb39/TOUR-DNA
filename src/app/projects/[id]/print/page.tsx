import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProjectDetail } from "@/lib/services/projectQueries";
import {
  labelForBudgetLevel,
  labelForDuration,
  labelForGroupType,
  labelForRole,
  labelForTransport,
} from "@/lib/validation/codes";
import { formatBaseYm, formatDateTime } from "@/lib/format";
import { DEFAULT_BASE_YM } from "@/lib/fixtures/metrics";
import { PrintButton } from "@/components/plan/PrintButton";
import { describeCourseItemPurpose, type CourseDay } from "@/lib/domain/planBuilder";
import { parsePromoContent } from "@/lib/validation/promoContent.schema";

export const dynamic = "force-dynamic";

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectDetail(id);
  if (!project) notFound();
  if (!project.selectedPlan || !project.analysisResult) {
    redirect(`/projects/${id}/analysis`);
  }

  const plan = project.selectedPlan;
  const analysisResult = project.analysisResult;
  const selectedStrategy = analysisResult.strategyResults.find((s) => s.id === plan.strategyResultId);
  const course = plan.course as unknown as { days: CourseDay[] };
  const evidenceSummary = analysisResult.evidences.slice(0, 6);

  // 저장된 promoContent가 없으면(DB NULL) 섹션 자체를 만들지 않는다. 값이 있어도 Phase 5-B와 동일한
  // 검증 경계(parsePromoContent)를 통과하지 못하면 잘못된 데이터를 그대로 출력하지 않고 조용히 생략한다.
  const promoContentParsed = plan.promoContent !== null ? parsePromoContent(plan.promoContent) : null;
  const promoContent = promoContentParsed?.ok ? promoContentParsed.value : null;

  return (
    <div className="mx-auto max-w-[840px] px-8 py-8 text-slate-900">
      <div className="no-print mb-4">
        <Link href={`/projects/${id}/plan`} className="text-sm text-slate-600 underline hover:text-slate-900">
          ← 실행안으로 돌아가기
        </Link>
      </div>
      <PrintButton />

      <header className="border-b border-slate-300 pb-4">
        <p className="text-xs text-slate-500">TOUR DNA · {project.region.name}</p>
        <h1 className="mt-1 text-xl font-bold">{plan.productName}</h1>
        <p className="mt-1 text-sm text-slate-600">{plan.conceptText}</p>
        <p className="mt-2 text-xs text-slate-500">
          {project.travelYear}년 {project.travelMonth}월 · {labelForRole(project.role)} ·{" "}
          {labelForDuration(project.input?.duration ?? "")} ·{" "}
          {labelForBudgetLevel(project.input?.budgetLevel ?? "")} ·{" "}
          {labelForTransport(project.input?.transport ?? "")} · {labelForGroupType(project.input?.groupType ?? "")}
        </p>
      </header>

      <section className="mt-4">
        <h2 className="text-sm font-semibold">기획 배경</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-700">{plan.background}</p>
      </section>

      {selectedStrategy ? (
        <section className="mt-4">
          <h2 className="text-sm font-semibold">
            선택 전략: {selectedStrategy.name} ({selectedStrategy.totalScore}점)
          </h2>
          <p className="mt-1 text-xs text-slate-600">타깃: {plan.targetSummary}</p>
        </section>
      ) : null}

      <section className="mt-4">
        <h2 className="text-sm font-semibold">코스</h2>
        <div className="mt-1 grid grid-cols-2 gap-4">
          {course.days.map((day) => (
            <div key={day.dayIndex}>
              <p className="text-xs font-semibold text-slate-600">{day.dayIndex}일차</p>
              <ol className="mt-1 space-y-1 text-xs text-slate-700">
                {day.items.map((item, i) => (
                  <li key={i}>
                    {item.timeSlot} {item.poiName} ({describeCourseItemPurpose(item)}, {item.stayMinutes}분)
                  </li>
                ))}
              </ol>
              {day.lodging != null ? (
                <p className="mt-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                  <span className="font-semibold">[숙박]</span> {day.lodging.timeSlot} {day.lodging.poiName} (
                  {day.lodging.category}, {day.lodging.travel})
                </p>
              ) : null}
              {day.notices?.map((notice, i) => (
                <p key={i} className="mt-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">
                  ⚠ {notice}
                </p>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <h2 className="text-sm font-semibold">운영 체크리스트</h2>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-700">
            {(plan.operationChecklist as string[]).map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold">위험과 대응안</h2>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-700">
            {(plan.risks as { risk: string; mitigation: string }[]).map((r, i) => (
              <li key={i}>
                {r.risk} — {r.mitigation}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-4">
        <h2 className="text-sm font-semibold">KPI</h2>
        <ul className="mt-1 space-y-0.5 text-xs text-slate-700">
          {(plan.kpis as { name: string; method: string }[]).map((k, i) => (
            <li key={i}>
              {k.name} — {k.method}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4">
        <h2 className="text-sm font-semibold">데이터 근거 요약</h2>
        <table className="mt-1 w-full text-left text-[10px] text-slate-600">
          <thead>
            <tr className="border-b border-slate-300">
              <th className="py-1 pr-2">지표</th>
              <th className="py-1 pr-2">값</th>
              <th className="py-1 pr-2">기준월</th>
              <th className="py-1 pr-2">출처</th>
            </tr>
          </thead>
          <tbody>
            {evidenceSummary.map((e, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-0.5 pr-2 font-mono">{e.metricCode}</td>
                <td className="py-0.5 pr-2">{e.rawValue}</td>
                <td className="py-0.5 pr-2">{formatBaseYm(e.baseYm)}</td>
                <td className="py-0.5 pr-2">{e.sourceCode}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {promoContent ? (
        <section className="mt-4 border-t border-slate-300 pt-3">
          <h2 className="text-sm font-semibold">홍보자료</h2>

          <div className="mt-2">
            <h3 className="text-xs font-semibold text-slate-700">제안서 요약</h3>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-slate-700">
              {promoContent.proposalSummary.sentences.map((sentence, i) => (
                <li key={i}>{sentence}</li>
              ))}
            </ol>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-700">랜딩페이지</h3>
              <p className="mt-1 text-xs font-medium text-slate-800">{promoContent.landing.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-700">{promoContent.landing.body}</p>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-700">블로그</h3>
              <p className="mt-1 text-xs font-medium text-slate-800">{promoContent.blog.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-700">{promoContent.blog.body}</p>
            </div>
          </div>

          <div className="mt-3">
            <h3 className="text-xs font-semibold text-slate-700">Instagram</h3>
            <p className="mt-1 text-xs text-slate-700">{promoContent.instagram.caption}</p>
            {promoContent.instagram.hashtags.length > 0 ? (
              <p className="mt-0.5 text-xs text-slate-500">
                {promoContent.instagram.hashtags.map((tag) => `#${tag}`).join(" ")}
              </p>
            ) : null}
          </div>

          <div className="mt-3">
            {promoContent.roleContent.role === "TRAVEL_AGENCY" ? (
              <>
                <h3 className="text-xs font-semibold text-slate-700">여행상품 홍보자료</h3>
                <p className="mt-1 text-xs text-slate-700">
                  <span className="font-medium">{promoContent.roleContent.productName}</span> ·{" "}
                  {promoContent.roleContent.targetAudience}
                </p>
                <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs text-slate-700">
                  {promoContent.roleContent.sellingPoints.map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
                <p className="mt-0.5 text-xs text-slate-700">{promoContent.roleContent.itineraryHighlight}</p>
              </>
            ) : (
              <>
                <h3 className="text-xs font-semibold text-slate-700">보도자료</h3>
                <p className="mt-1 text-xs font-medium text-slate-800">{promoContent.roleContent.title}</p>
                <p className="mt-0.5 text-xs text-slate-700">{promoContent.roleContent.lead}</p>
                <p className="mt-0.5 text-xs text-slate-700">추진 배경: {promoContent.roleContent.background}</p>
                <p className="mt-0.5 text-xs text-slate-700">핵심 프로그램: {promoContent.roleContent.coreProgram}</p>
                {promoContent.roleContent.dataBasedEvidence.length > 0 ? (
                  <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs text-slate-700">
                    {promoContent.roleContent.dataBasedEvidence.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                ) : null}
                {promoContent.roleContent.expectedEffects.length > 0 ? (
                  <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs text-slate-700">
                    {promoContent.roleContent.expectedEffects.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>
        </section>
      ) : null}

      <footer className="mt-6 flex justify-between border-t border-slate-300 pt-2 text-[10px] text-slate-400">
        <span>
          생성일 {formatDateTime(new Date())} · 데이터 기준월{" "}
          {formatBaseYm(process.env.TOUR_DATA_BASE_YM ?? DEFAULT_BASE_YM)}
        </span>
        <span>모델 버전 {analysisResult.modelVersion}</span>
      </footer>
    </div>
  );
}
