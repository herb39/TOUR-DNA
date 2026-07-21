"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { savePlanAction, type SavePlanFormState } from "@/app/projects/[id]/plan/actions";

interface CourseItem {
  order: number;
  poiId: string;
  poiName: string;
  category: string;
  timeSlot: string;
  stayMinutes: number;
  travel: string;
}
interface CourseDay {
  dayIndex: number;
  items: CourseItem[];
}

export interface PlanEditorData {
  id: string;
  projectId: string;
  productName: string;
  conceptText: string;
  background: string;
  targetSummary: string;
  sellingPoints: string[];
  course: { days: CourseDay[] };
  operationChecklist: string[];
  risks: { risk: string; mitigation: string }[];
  kpis: { name: string; method: string }[];
  memo: string;
  kpiMemo: string;
}

const initialActionState: SavePlanFormState = { success: false };

export function PlanEditor({ plan }: { plan: PlanEditorData }) {
  const boundSave = savePlanAction.bind(null, plan.id, plan.projectId);
  const [state, formAction, isPending] = useActionState(boundSave, initialActionState);

  const [productName, setProductName] = useState(plan.productName);
  const [conceptText, setConceptText] = useState(plan.conceptText);
  const [memo, setMemo] = useState(plan.memo);
  const [kpiMemo, setKpiMemo] = useState(plan.kpiMemo);
  const [days, setDays] = useState<CourseDay[]>(plan.course.days);

  const [savedSnapshot, setSavedSnapshot] = useState(
    JSON.stringify({ productName: plan.productName, conceptText: plan.conceptText, memo: plan.memo, kpiMemo: plan.kpiMemo, days: plan.course.days }),
  );
  const [lastHandledSavedAt, setLastHandledSavedAt] = useState(state.savedAt);

  const currentSnapshot = useMemo(
    () => JSON.stringify({ productName, conceptText, memo, kpiMemo, days }),
    [productName, conceptText, memo, kpiMemo, days],
  );

  // 저장이 성공하면(state.savedAt 변경) 저장 시점의 스냅샷을 기준선으로 갱신한다.
  // (React 권장 패턴: effect 대신 렌더 중 상태를 조정 — https://react.dev/learn/you-might-not-need-an-effect)
  if (state.success && state.savedAt !== lastHandledSavedAt) {
    setLastHandledSavedAt(state.savedAt);
    setSavedSnapshot(currentSnapshot);
  }

  const isDirty = currentSnapshot !== savedSnapshot;

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirty) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  function moveItem(dayIndex: number, itemIndex: number, direction: -1 | 1) {
    setDays((prev) =>
      prev.map((d) => {
        if (d.dayIndex !== dayIndex) return d;
        const items = [...d.items];
        const target = itemIndex + direction;
        if (target < 0 || target >= items.length) return d;
        // timeSlot/travel은 시간대(슬롯) 자체에 속한 값이라 자리를 바꾸지 않는다 — 장소 정보(poiId/poiName/
        // category/stayMinutes)만 교환해야 이동한 장소가 새 위치의 시간대를 그대로 물려받는다.
        const a = items[itemIndex];
        const b = items[target];
        items[itemIndex] = { ...a, poiId: b.poiId, poiName: b.poiName, category: b.category, stayMinutes: b.stayMinutes };
        items[target] = { ...b, poiId: a.poiId, poiName: a.poiName, category: a.category, stayMinutes: a.stayMinutes };
        return { ...d, items: items.map((it, i) => ({ ...it, order: i + 1 })) };
      }),
    );
  }

  return (
    <form action={formAction} className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <input type="hidden" name="courseJson" value={JSON.stringify({ days })} />

      <div className="space-y-6">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <label htmlFor="productName" className="block text-sm font-medium text-slate-700">
            상품명
          </label>
          <input
            id="productName"
            name="productName"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />

          <label htmlFor="conceptText" className="mt-4 block text-sm font-medium text-slate-700">
            콘셉트 문구
          </label>
          <textarea
            id="conceptText"
            name="conceptText"
            rows={2}
            value={conceptText}
            onChange={(e) => setConceptText(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />

          <p className="mt-4 text-xs font-medium text-slate-500">기획 배경 (데이터 근거, 수정 불가)</p>
          <p className="mt-1 text-sm text-slate-600">{plan.background}</p>

          <p className="mt-4 text-xs font-medium text-slate-500">핵심 타깃</p>
          <p className="mt-1 text-sm text-slate-600">{plan.targetSummary}</p>

          <p className="mt-4 text-xs font-medium text-slate-500">판매 포인트</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-slate-600">
            {plan.sellingPoints.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">일자·시간대별 코스</h2>
          <div className="mt-3 space-y-4">
            {days.map((day) => (
              <div key={day.dayIndex}>
                <p className="text-xs font-semibold text-slate-500">{day.dayIndex}일차</p>
                <ul className="mt-2 space-y-2">
                  {day.items.map((item, idx) => (
                    <li
                      key={item.poiId + item.order}
                      className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
                    >
                      <div>
                        <span className="font-medium text-slate-800">
                          {item.timeSlot} {item.poiName}
                        </span>
                        <span className="ml-2 text-xs text-slate-500">
                          ({item.category}, 체류 {item.stayMinutes}분, {item.travel})
                        </span>
                      </div>
                      <div className="no-print flex gap-1">
                        <button
                          type="button"
                          onClick={() => moveItem(day.dayIndex, idx, -1)}
                          disabled={idx === 0}
                          className="rounded border border-slate-300 px-2 py-0.5 text-xs disabled:opacity-40"
                          aria-label={`${item.poiName} 위로 이동`}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItem(day.dayIndex, idx, 1)}
                          disabled={idx === day.items.length - 1}
                          className="rounded border border-slate-300 px-2 py-0.5 text-xs disabled:opacity-40"
                          aria-label={`${item.poiName} 아래로 이동`}
                        >
                          ↓
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">운영 체크리스트</h2>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-600">
            {plan.operationChecklist.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">위험과 대응안</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {plan.risks.map((r, i) => (
              <li key={i}>
                <span className="font-medium text-slate-700">{r.risk}</span> — {r.mitigation}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">KPI</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {plan.kpis.map((k, i) => (
              <li key={i}>
                <span className="font-medium text-slate-700">{k.name}</span> — {k.method}
              </li>
            ))}
          </ul>
          <label htmlFor="kpiMemo" className="mt-3 block text-sm font-medium text-slate-700">
            KPI 메모
          </label>
          <textarea
            id="kpiMemo"
            name="kpiMemo"
            rows={2}
            value={kpiMemo}
            onChange={(e) => setKpiMemo(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <label htmlFor="memo" className="block text-sm font-medium text-slate-700">
            메모
          </label>
          <textarea
            id="memo"
            name="memo"
            rows={3}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </section>
      </div>

      <aside className="no-print h-fit space-y-3 lg:sticky lg:top-6">
        {state.message ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {state.message}
          </div>
        ) : null}
        {isDirty ? (
          <p className="text-xs text-amber-600" role="status">
            저장하지 않은 변경사항이 있습니다.
          </p>
        ) : (
          <p className="text-xs text-emerald-600" role="status">
            모든 변경사항이 저장되었습니다.
          </p>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
        >
          {isPending ? "저장 중..." : "저장"}
        </button>
        <Link
          href={`/projects/${plan.projectId}/analysis`}
          className="block w-full rounded-md border border-slate-300 px-4 py-2 text-center text-sm text-slate-700 hover:bg-slate-50"
        >
          전략 재선택
        </Link>
        <Link
          href={`/projects/${plan.projectId}/print`}
          className="block w-full rounded-md border border-slate-300 px-4 py-2 text-center text-sm text-slate-700 hover:bg-slate-50"
        >
          인쇄/PDF 보기
        </Link>
      </aside>
    </form>
  );
}
