import type { StrategyBudgetItem, StrategyPartnerLink } from "@/lib/domain/strategyResourcePlan";
import { AnimatedDetails } from "@/components/ui/AnimatedDetails";

/** 전략별 예산 항목·협력 대상을 보여주는 패널 — 분석 화면(전략 3안 각각)과 인쇄 화면(선택 전략)이
 * 동일한 데이터·레이아웃을 공유한다(2026-08-04). 금액은 항상 BUDGET_AMOUNT_PLACEHOLDER("기관 산정
 * 필요")이며 이 컴포넌트는 값을 가공하지 않고 그대로 표시한다.
 *
 * 전략 3개를 모두 펼쳐두면 첫 화면이 지나치게 길어져(2026-08-06) 기본은 접힘 상태로 두고, 요약(카테고리
 * 개수)만 보여준다 — "print-expand-details" 클래스는 이 화면을 그대로 인쇄할 때만(globals.css) 접힘
 * 상태와 무관하게 상세 내용을 강제로 보이게 한다(전용 인쇄 화면인 print/page.tsx는 이 컴포넌트를 쓰지
 * 않고 항상 펼쳐서 보여주므로 영향 없음). */
export function StrategyResourcePlanPanel({
  budgetItems,
  partners,
}: {
  budgetItems: StrategyBudgetItem[];
  partners: StrategyPartnerLink[];
}) {
  return (
    <AnimatedDetails
      className="print-expand-details mt-3 rounded-md border border-slate-100 bg-slate-50 p-3"
      summary={`예산 및 협력 대상 보기 (예산 카테고리 ${budgetItems.length} · 협력 대상 ${partners.length})`}
      summaryClassName="cursor-pointer text-xs font-medium text-slate-700"
    >
      <div className="mt-3 grid grid-cols-1 gap-3 text-xs text-slate-600 sm:grid-cols-2">
        <div>
          <p className="font-medium text-slate-700">예상 예산 항목</p>
          <ul className="mt-1 space-y-1">
            {budgetItems.map((item) => (
              <li key={item.category} className="rounded-md bg-white p-2">
                <p className="flex items-center justify-between font-medium text-slate-700">
                  <span>{item.category}</span>
                  <span className="text-slate-500">{item.amount}</span>
                </p>
                <p className="mt-0.5 text-slate-600">{item.description}</p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-medium text-slate-700">협력 대상</p>
          <ul className="mt-1 space-y-1">
            {partners.map((partner) => (
              <li key={partner.category} className="rounded-md bg-white p-2">
                <p className="font-medium text-slate-700">
                  {partner.category} — {partner.name}
                </p>
                <p className="mt-0.5 text-slate-600">{partner.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AnimatedDetails>
  );
}
