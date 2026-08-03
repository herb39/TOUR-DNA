import type { StrategyBudgetItem, StrategyPartnerLink } from "@/lib/domain/strategyResourcePlan";

/** 전략별 예산 항목·협력 대상을 보여주는 패널 — 분석 화면(전략 3안 각각)과 인쇄 화면(선택 전략)이
 * 동일한 데이터·레이아웃을 공유한다(2026-08-04). 금액은 항상 BUDGET_AMOUNT_PLACEHOLDER("기관 산정
 * 필요")이며 이 컴포넌트는 값을 가공하지 않고 그대로 표시한다. */
export function StrategyResourcePlanPanel({
  budgetItems,
  partners,
}: {
  budgetItems: StrategyBudgetItem[];
  partners: StrategyPartnerLink[];
}) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 text-xs text-slate-600 sm:grid-cols-2">
      <div>
        <p className="font-medium text-slate-700">예상 예산 항목</p>
        <ul className="mt-1 space-y-1">
          {budgetItems.map((item) => (
            <li key={item.category} className="rounded-md bg-slate-50 p-2">
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
            <li key={partner.category} className="rounded-md bg-slate-50 p-2">
              <p className="font-medium text-slate-700">
                {partner.category} — {partner.name}
              </p>
              <p className="mt-0.5 text-slate-600">{partner.reason}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
