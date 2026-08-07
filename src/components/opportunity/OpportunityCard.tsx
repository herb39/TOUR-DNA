import type { OpportunityItem } from "@/lib/domain/businessOpportunity";

const CATEGORY_LABEL: Record<OpportunityItem["category"], string> = {
  WEAKNESS_RECOVERY: "취약축 보완",
  SEASONALITY_GAP: "계절 격차",
  SUPPLY_GAP: "공급 격차",
  TARGET_THEME_GAP: "타깃·테마 격차",
};

/** 관광사업 기회 카드 — 전략 카드와 달리 "선택" 개념이 없다(정보 제공용, 저장하지 않음). */
export function OpportunityCard({ opportunity, rank }: { opportunity: OpportunityItem; rank: number }) {
  return (
    <div className="flex flex-col rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">기회 {rank}</span>
        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
          {CATEGORY_LABEL[opportunity.category]}
        </span>
      </div>
      <h3 className="mt-2 text-base font-semibold text-slate-900">{opportunity.title}</h3>
      <p className="mt-1 text-xs font-medium text-amber-700">
        ※ 사업 기회 가설이며, 실행 가능한 코스·확정 매출 예측이 아닙니다.
      </p>

      <dl className="mt-3 space-y-1.5 rounded-md bg-slate-50 p-3 text-xs text-slate-700">
        <div>
          <dt className="font-medium text-slate-500">발견된 지역 문제</dt>
          <dd>{opportunity.problem}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">활용 가능한 강점·자원</dt>
          <dd>{opportunity.strengthsToLeverage}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">주요 타깃</dt>
          <dd>{opportunity.targetAudience}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">적정 시기</dt>
          <dd>{opportunity.timing}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">사업 방향</dt>
          <dd>{opportunity.direction}</dd>
        </div>
      </dl>

      <div className="mt-3 text-xs text-slate-600">
        <p className="font-medium text-slate-700">데이터 근거</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {opportunity.evidence.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </div>

      {opportunity.uniqueLimitationNote ? (
        // "한계 및 추가 확인사항" 라벨은 페이지 하단 통합 섹션에만 쓴다(2026-08-07) — 카드마다 같은
        // 라벨을 반복하지 않고, 이 기회에만 해당하는 참고 문구만 짧게 보여준다.
        <p className="mt-3 rounded-md border border-slate-100 bg-slate-50 p-2 text-[11px] text-slate-500">
          {opportunity.uniqueLimitationNote}
        </p>
      ) : null}
    </div>
  );
}
