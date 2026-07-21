"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { savePlanAction, searchAvailablePoisAction, type SavePlanFormState } from "@/app/projects/[id]/plan/actions";
import {
  recomputeDayItems,
  MAX_ITEMS_PER_DAY,
  type CourseItem,
  type CourseDay,
  type CourseItemInput,
  type TransportCode,
  type PoiDetail,
} from "@/lib/domain/planBuilder";

const POI_SEARCH_DEBOUNCE_MS = 300;

export interface PlanEditorData {
  id: string;
  projectId: string;
  regionId: string;
  transport: TransportCode;
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

  const existingPoiIds = useMemo(() => new Set(days.flatMap((d) => d.items.map((i) => i.poiId))), [days]);

  const [addingToDay, setAddingToDay] = useState<number | null>(null);
  const [poiQuery, setPoiQuery] = useState("");
  const [poiResults, setPoiResults] = useState<PoiDetail[]>([]);
  const [poiSearchPending, setPoiSearchPending] = useState(false);

  function toInput(item: CourseItem): CourseItemInput {
    return {
      poiId: item.poiId,
      poiName: item.poiName,
      category: item.category,
      stayMinutes: item.stayMinutes,
      lat: item.lat,
      lng: item.lng,
    };
  }

  function moveItem(dayIndex: number, itemIndex: number, direction: -1 | 1) {
    setDays((prev) =>
      prev.map((d) => {
        if (d.dayIndex !== dayIndex) return d;
        const items = [...d.items];
        const target = itemIndex + direction;
        if (target < 0 || target >= items.length) return d;
        // 전체 항목을 자리째 바꾼 뒤 처음부터 다시 계산한다 — timeSlot은 위치(자리) 기준으로,
        // travel은 새로 이웃한 장소 쌍의 실제 거리 기준으로 다시 나온다.
        [items[itemIndex], items[target]] = [items[target], items[itemIndex]];
        return { ...d, items: recomputeDayItems(items.map(toInput), plan.transport) };
      }),
    );
  }

  function removeItem(dayIndex: number, itemIndex: number) {
    setDays((prev) =>
      prev.map((d) => {
        if (d.dayIndex !== dayIndex) return d;
        const items = d.items.filter((_, i) => i !== itemIndex);
        return { ...d, items: recomputeDayItems(items.map(toInput), plan.transport) };
      }),
    );
  }

  function moveItemToDay(fromDayIndex: number, itemIndex: number, toDayIndex: number) {
    if (fromDayIndex === toDayIndex) return;
    setDays((prev) => {
      const fromDay = prev.find((d) => d.dayIndex === fromDayIndex);
      const toDay = prev.find((d) => d.dayIndex === toDayIndex);
      if (!fromDay || !toDay) return prev;
      if (toDay.items.length >= MAX_ITEMS_PER_DAY) return prev;
      const moved = fromDay.items[itemIndex];
      if (!moved) return prev;

      return prev.map((d) => {
        if (d.dayIndex === fromDayIndex) {
          return { ...d, items: recomputeDayItems(d.items.filter((_, i) => i !== itemIndex).map(toInput), plan.transport) };
        }
        if (d.dayIndex === toDayIndex) {
          return { ...d, items: recomputeDayItems([...d.items.map(toInput), toInput(moved)], plan.transport) };
        }
        return d;
      });
    });
  }

  function addPoiToDay(dayIndex: number, poi: PoiDetail) {
    setDays((prev) =>
      prev.map((d) => {
        if (d.dayIndex !== dayIndex) return d;
        if (d.items.length >= MAX_ITEMS_PER_DAY) return d;
        const input: CourseItemInput = {
          poiId: poi.id,
          poiName: poi.name,
          category: poi.category,
          stayMinutes: 60,
          lat: poi.lat,
          lng: poi.lng,
        };
        return { ...d, items: recomputeDayItems([...d.items.map(toInput), input], plan.transport) };
      }),
    );
    setAddingToDay(null);
    setPoiQuery("");
    setPoiResults([]);
  }

  const trimmedPoiQuery = poiQuery.trim();

  useEffect(() => {
    if (addingToDay === null || trimmedPoiQuery.length === 0) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setPoiSearchPending(true);
      const results = await searchAvailablePoisAction(plan.regionId, trimmedPoiQuery);
      if (!cancelled) {
        setPoiResults(results);
        setPoiSearchPending(false);
      }
    }, POI_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [addingToDay, trimmedPoiQuery, plan.regionId]);

  const visiblePoiResults =
    trimmedPoiQuery.length === 0 ? [] : poiResults.filter((p) => !existingPoiIds.has(p.id));

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
                      <div className="no-print flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveItem(day.dayIndex, idx, -1)}
                          disabled={idx === 0}
                          className="cursor-pointer rounded border border-slate-300 px-2 py-0.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`${item.poiName} 위로 이동`}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItem(day.dayIndex, idx, 1)}
                          disabled={idx === day.items.length - 1}
                          className="cursor-pointer rounded border border-slate-300 px-2 py-0.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`${item.poiName} 아래로 이동`}
                        >
                          ↓
                        </button>
                        {days.length > 1 ? (
                          <select
                            aria-label={`${item.poiName} 다른 날짜로 이동`}
                            value={day.dayIndex}
                            onChange={(e) => moveItemToDay(day.dayIndex, idx, Number(e.target.value))}
                            className="cursor-pointer rounded border border-slate-300 px-1 py-0.5 text-xs"
                          >
                            {days.map((d) => (
                              <option key={d.dayIndex} value={d.dayIndex} disabled={d.dayIndex !== day.dayIndex && d.items.length >= MAX_ITEMS_PER_DAY}>
                                {d.dayIndex}일차
                              </option>
                            ))}
                          </select>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => removeItem(day.dayIndex, idx)}
                          className="cursor-pointer rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                          aria-label={`${item.poiName} 삭제`}
                        >
                          삭제
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="no-print mt-2">
                  {addingToDay === day.dayIndex ? (
                    <div className="rounded-md border border-slate-200 p-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          autoFocus
                          value={poiQuery}
                          onChange={(e) => setPoiQuery(e.target.value)}
                          placeholder="장소 이름 검색"
                          className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setAddingToDay(null);
                            setPoiQuery("");
                            setPoiResults([]);
                          }}
                          className="cursor-pointer whitespace-nowrap rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          닫기
                        </button>
                      </div>
                      {poiSearchPending ? <p className="mt-1 text-xs text-slate-400">검색 중...</p> : null}
                      {!poiSearchPending && poiQuery.trim().length > 0 && visiblePoiResults.length === 0 ? (
                        <p className="mt-1 text-xs text-slate-400">일치하는 장소가 없습니다.</p>
                      ) : null}
                      {visiblePoiResults.length > 0 ? (
                        <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto">
                          {visiblePoiResults.map((poi) => (
                            <li key={poi.id} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-slate-50">
                              <span>
                                {poi.name} <span className="text-slate-400">({poi.category}, {poi.address})</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => addPoiToDay(day.dayIndex, poi)}
                                className="cursor-pointer rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100"
                              >
                                추가
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddingToDay(day.dayIndex)}
                      disabled={day.items.length >= MAX_ITEMS_PER_DAY}
                      className="cursor-pointer rounded border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {day.items.length >= MAX_ITEMS_PER_DAY ? "이 날짜는 가득 찼습니다 (최대 4곳)" : "+ 장소 추가"}
                    </button>
                  )}
                </div>
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
          className="w-full cursor-pointer rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
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
