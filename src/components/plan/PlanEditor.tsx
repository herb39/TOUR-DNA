"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { savePlanAction, searchAvailablePoisAction, type SavePlanFormState } from "@/app/projects/[id]/plan/actions";
import {
  recomputeDayItems,
  estimateTravel,
  parseTimeSlotToMinutes,
  minutesToTimeSlot,
  type CourseItem,
  type CourseDay,
  type CourseItemInput,
  type TransportCode,
  type PoiDetail,
} from "@/lib/domain/planBuilder";
import { CourseMap } from "@/components/map/CourseMap";

const POI_SEARCH_DEBOUNCE_MS = 300;

export interface PlanEditorData {
  id: string;
  projectId: string;
  regionId: string;
  transport: TransportCode;
  kakaoKey?: string;
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
  const [operationChecklist, setOperationChecklist] = useState<string[]>(plan.operationChecklist);
  const [risks, setRisks] = useState<PlanEditorData["risks"]>(plan.risks);
  const [kpis, setKpis] = useState<PlanEditorData["kpis"]>(plan.kpis);

  const [savedSnapshot, setSavedSnapshot] = useState(
    JSON.stringify({
      productName: plan.productName,
      conceptText: plan.conceptText,
      memo: plan.memo,
      kpiMemo: plan.kpiMemo,
      days: plan.course.days,
      operationChecklist: plan.operationChecklist,
      risks: plan.risks,
      kpis: plan.kpis,
    }),
  );
  const [lastHandledSavedAt, setLastHandledSavedAt] = useState(state.savedAt);

  const currentSnapshot = useMemo(
    () => JSON.stringify({ productName, conceptText, memo, kpiMemo, days, operationChecklist, risks, kpis }),
    [productName, conceptText, memo, kpiMemo, days, operationChecklist, risks, kpis],
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
      timeSlot: item.timeSlot,
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
      const moved = fromDay.items[itemIndex];
      if (!moved) return prev;

      return prev.map((d) => {
        if (d.dayIndex === fromDayIndex) {
          return { ...d, items: recomputeDayItems(d.items.filter((_, i) => i !== itemIndex).map(toInput), plan.transport) };
        }
        if (d.dayIndex === toDayIndex) {
          // 원래 날짜에서 쓰던 시간을 그대로 들고 온다 — 새 날짜에서 다른 일정과 겹치면 아래 실행
          // 가능성 표시(빨간 경고)로 바로 드러나므로, 사용자가 필요할 때만 시간을 다시 조정하면 된다.
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

  function updateItemTime(dayIndex: number, itemIndex: number, timeSlot: string) {
    setDays((prev) =>
      prev.map((d) => {
        if (d.dayIndex !== dayIndex) return d;
        return { ...d, items: d.items.map((it, i) => (i === itemIndex ? { ...it, timeSlot } : it)) };
      }),
    );
  }

  function updateItemStayMinutes(dayIndex: number, itemIndex: number, stayMinutes: number) {
    if (!Number.isFinite(stayMinutes) || stayMinutes < 0) return;
    setDays((prev) =>
      prev.map((d) => {
        if (d.dayIndex !== dayIndex) return d;
        return { ...d, items: d.items.map((it, i) => (i === itemIndex ? { ...it, stayMinutes } : it)) };
      }),
    );
  }

  /** 이전 장소의 체류 종료 시각부터 이 장소 시작 시각까지의 여유가 예상 이동시간보다 부족하면 실행 불가로 본다. */
  function checkFeasibility(items: CourseItem[], itemIndex: number): { infeasible: boolean; reason: string | null } {
    if (itemIndex === 0) return { infeasible: false, reason: null };
    const prev = items[itemIndex - 1];
    const cur = items[itemIndex];
    const prevEndMinutes = parseTimeSlotToMinutes(prev.timeSlot);
    const curStartMinutes = parseTimeSlotToMinutes(cur.timeSlot);
    if (prevEndMinutes === null || curStartMinutes === null) return { infeasible: false, reason: null };

    const gap = curStartMinutes - (prevEndMinutes + prev.stayMinutes);
    const travel = estimateTravel(prev, cur, plan.transport);
    if (travel.minutes === null) return { infeasible: false, reason: null };

    if (gap < travel.minutes) {
      const prevEndLabel = minutesToTimeSlot(prevEndMinutes + prev.stayMinutes);
      return {
        infeasible: true,
        reason:
          gap < 0
            ? `이전 일정이 ${prevEndLabel}에 끝나는데 이 장소는 그 전에 시작합니다.`
            : `이동에 약 ${travel.minutes}분이 필요하지만(이전 일정 종료 ${prevEndLabel}), 여유는 ${gap}분뿐입니다.`,
      };
    }
    return { infeasible: false, reason: null };
  }

  const [newChecklistText, setNewChecklistText] = useState("");
  const [newRiskText, setNewRiskText] = useState("");
  const [newMitigationText, setNewMitigationText] = useState("");
  const [newKpiName, setNewKpiName] = useState("");
  const [newKpiMethod, setNewKpiMethod] = useState("");

  function addChecklistItem() {
    const text = newChecklistText.trim();
    if (!text) return;
    setOperationChecklist((prev) => [...prev, text]);
    setNewChecklistText("");
  }

  function removeChecklistItem(index: number) {
    setOperationChecklist((prev) => prev.filter((_, i) => i !== index));
  }

  function addRisk() {
    const risk = newRiskText.trim();
    if (!risk) return;
    setRisks((prev) => [...prev, { risk, mitigation: newMitigationText.trim() }]);
    setNewRiskText("");
    setNewMitigationText("");
  }

  function removeRisk(index: number) {
    setRisks((prev) => prev.filter((_, i) => i !== index));
  }

  function addKpi() {
    const name = newKpiName.trim();
    if (!name) return;
    setKpis((prev) => [...prev, { name, method: newKpiMethod.trim() }]);
    setNewKpiName("");
    setNewKpiMethod("");
  }

  function removeKpi(index: number) {
    setKpis((prev) => prev.filter((_, i) => i !== index));
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
      <input type="hidden" name="operationChecklistJson" value={JSON.stringify(operationChecklist)} />
      <input type="hidden" name="risksJson" value={JSON.stringify(risks)} />
      <input type="hidden" name="kpisJson" value={JSON.stringify(kpis)} />

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
          <div className="no-print mt-3">
            <CourseMap days={days} kakaoKey={plan.kakaoKey} />
          </div>
          <div className="mt-3 space-y-4">
            {days.map((day) => (
              <div key={day.dayIndex}>
                <p className="text-xs font-semibold text-slate-500">{day.dayIndex}일차</p>
                <ul className="mt-2 space-y-2">
                  {day.items.map((item, idx) => {
                    const feasibility = checkFeasibility(day.items, idx);
                    return (
                      <li
                        key={item.poiId + item.order}
                        className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm ${
                          feasibility.infeasible ? "border-red-300 bg-red-50" : "border-slate-100 bg-slate-50"
                        }`}
                      >
                        <div>
                          <span className="font-medium text-slate-800">
                            <input
                              type="time"
                              value={item.timeSlot}
                              onChange={(e) => updateItemTime(day.dayIndex, idx, e.target.value)}
                              aria-label={`${item.poiName} 시간`}
                              className="mr-1 rounded border border-slate-300 px-1 py-0.5 text-sm"
                            />
                            {item.poiName}
                          </span>
                          <span className="ml-2 text-xs text-slate-500">
                            ({item.category}, 체류{" "}
                            <input
                              type="number"
                              min={0}
                              step={10}
                              value={item.stayMinutes}
                              onChange={(e) => updateItemStayMinutes(day.dayIndex, idx, Number(e.target.value))}
                              aria-label={`${item.poiName} 체류시간(분)`}
                              className="w-14 rounded border border-slate-300 px-1 py-0.5 text-xs"
                            />
                            분, {item.travel})
                          </span>
                          {feasibility.infeasible ? (
                            <p className="mt-0.5 text-xs font-medium text-red-600">⚠ {feasibility.reason}</p>
                          ) : null}
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
                                <option key={d.dayIndex} value={d.dayIndex}>
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
                    );
                  })}
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
                                aria-label={`${poi.name} 코스에 추가`}
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
                      className="cursor-pointer rounded border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      + 장소 추가
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">운영 체크리스트</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {operationChecklist.map((c, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="list-disc">· {c}</span>
                <button
                  type="button"
                  onClick={() => removeChecklistItem(i)}
                  className="no-print cursor-pointer rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                  aria-label={`체크리스트 "${c}" 삭제`}
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
          <div className="no-print mt-2 flex items-center gap-2">
            <input
              type="text"
              value={newChecklistText}
              onChange={(e) => setNewChecklistText(e.target.value)}
              placeholder="새 체크리스트 항목"
              className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={addChecklistItem}
              className="cursor-pointer whitespace-nowrap rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
            >
              추가
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">위험과 대응안</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {risks.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span>
                  <span className="font-medium text-slate-700">{r.risk}</span> — {r.mitigation}
                </span>
                <button
                  type="button"
                  onClick={() => removeRisk(i)}
                  className="no-print cursor-pointer rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                  aria-label={`위험 요인 "${r.risk}" 삭제`}
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
          <div className="no-print mt-2 space-y-1">
            <input
              type="text"
              value={newRiskText}
              onChange={(e) => setNewRiskText(e.target.value)}
              placeholder="새 위험 요인"
              className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
            />
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newMitigationText}
                onChange={(e) => setNewMitigationText(e.target.value)}
                placeholder="대응안"
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={addRisk}
                className="cursor-pointer whitespace-nowrap rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
              >
                추가
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">KPI</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {kpis.map((k, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span>
                  <span className="font-medium text-slate-700">{k.name}</span> — {k.method}
                </span>
                <button
                  type="button"
                  onClick={() => removeKpi(i)}
                  className="no-print cursor-pointer rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                  aria-label={`KPI "${k.name}" 삭제`}
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
          <div className="no-print mt-2 space-y-1">
            <input
              type="text"
              value={newKpiName}
              onChange={(e) => setNewKpiName(e.target.value)}
              placeholder="새 KPI 이름"
              className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
            />
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newKpiMethod}
                onChange={(e) => setNewKpiMethod(e.target.value)}
                placeholder="측정 방법"
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={addKpi}
                className="cursor-pointer whitespace-nowrap rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
              >
                추가
              </button>
            </div>
          </div>
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
