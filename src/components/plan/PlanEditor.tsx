"use client";

import { startTransition, useActionState, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { savePlanAction, searchAvailablePoisAction, type SavePlanFormState } from "@/app/projects/[id]/plan/actions";
import {
  recomputeDayItems,
  estimateTravel,
  parseTimeSlotToMinutes,
  minutesToTimeSlot,
  describeCourseItemPurpose,
  courseItemToInput,
  reorderCourseItemWithinDay,
  moveCourseItemToDay,
  insertPoiIntoDay,
  type CourseItem,
  type CourseDay,
  type TransportCode,
  type PoiDetail,
} from "@/lib/domain/planBuilder";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CourseMap } from "@/components/map/CourseMap";
import { CourseQualityPanel } from "@/components/plan/CourseQualityPanel";
import { computeCourseQuality } from "@/lib/domain/courseQualityValidation";
import type { PoiFitResult } from "@/lib/domain/poiFit";
import type { PoiShortageNotice } from "@/lib/services/poiFitService";
import type { CandidatePoi } from "@/lib/services/candidatePoolService";
import { enrichKpis, type EnrichedKpi } from "@/lib/domain/kpiLinking";
import { AXIS_LABEL_KO } from "@/lib/domain/types";
import type { DurationCode } from "@/lib/domain/strategy";
import { travelSourceLabel, poiCategoryLabel } from "@/lib/format";
import { classifyLeisureActivity } from "@/lib/domain/leisureClassification";

const POI_SEARCH_DEBOUNCE_MS = 300;

export interface PlanEditorData {
  id: string;
  projectId: string;
  regionId: string;
  transport: TransportCode;
  /** 실시간 품질검증에 쓰는 기존 프로젝트 조건. 레거시 테스트/저장 데이터는 아래 기본값으로 안전하게 추정한다. */
  duration?: DurationCode;
  templateId?: string | null;
  preferredThemes?: string[];
  kakaoKey?: string;
  productName: string;
  conceptText: string;
  background: string;
  targetSummary: string;
  sellingPoints: string[];
  course: { days: CourseDay[] };
  operationChecklist: string[];
  risks: { risk: string; mitigation: string }[];
  kpis: EnrichedKpi[];
  memo: string;
  kpiMemo: string;
  /** 사용자가 새 KPI를 추가할 때도 같은 사업 목표를 연결하기 위해 그대로 전달한다(kpiLinking.ts). */
  primaryGoalCode: string | null;
  primaryGoalLabel: string | null;
}

const initialActionState: SavePlanFormState = { success: false };

/** 적합도 등급별 배지 스타일(P0-1, 2026-07-30) — 점수 자체는 poiFit.ts가 결정하고, 여기서는 표시만
 * 담당한다. */
const FIT_GRADE_BADGE_CLASS: Record<PoiFitResult["grade"], string> = {
  HIGH: "border-emerald-300 bg-emerald-50 text-emerald-700",
  MEDIUM: "border-amber-300 bg-amber-50 text-amber-700",
  LOW: "border-slate-300 bg-slate-100 text-slate-600",
};
/** 하루 코스 중 실제 도로 기준(카카오, 캐시 포함) 구간과 추정치 구간이 각각 몇 개인지 요약한다(Phase 12,
 * 2026-08-05) — PRIVATE_VEHICLE 실행안에서만 의미가 있어 호출부에서 이동수단을 먼저 확인한다. 첫 항목
 * (숙소/집결지에서 이동)은 애초에 계산 대상이 아니라 집계에서 제외한다. */
function summarizeDayTravelSources(day: CourseDay): string {
  const edges = [...day.items.slice(1), ...(day.lodging ? [day.lodging] : [])];
  const real = edges.filter((e) => e.travelSource === "LIVE_API" || e.travelSource === "CACHED_API").length;
  const estimated = edges.length - real;
  return `실제 도로 기준 ${real}개 구간 · 직선거리 기반 추정 ${estimated}개 구간`;
}

const FIT_GRADE_LABEL: Record<PoiFitResult["grade"], string> = {
  HIGH: "적합도 높음",
  MEDIUM: "적합도 보통",
  LOW: "적합도 낮음",
};

/**
 * 적합도 배지 표시(2026-08-11, 라벨 정확성 감사) — poiFit.ts의 grade/threshold는 그대로 두고, 화면
 * 문구만 실제 의미에 맞게 세분화한다. category(CORE/SUPPLEMENT)는 확실히 일치하는데 선호 테마
 * 키워드만 장소명에서 확인되지 않아 grade가 LOW로 떨어진 경우("확인된 부적합"이 아니라 "이름만으로는
 * 근거 불확실")까지 "적합도 낮음"이라고 부르면, FOOD/LODGING처럼 등급과 무관하게 항상 코스에 포함되는
 * 필수 슬롯에도 이 문구가 그대로 붙어 마치 그 장소 선택 자체가 나쁜 것처럼 오해하게 만든다
 * (recommendationStatus는 이 경우 BELOW_MINIMUM_FIT이 아니라 정상적으로 포함될 수도 있는
 * INSUFFICIENT_EVALUATION_DATA/REQUIRED_SLOT과 섞여 관찰됨). 카테고리 자체가 전략과 무관한
 * FALLBACK 티어인 경우는 실제로 낮은 게 맞으므로 "적합도 낮음"을 그대로 유지한다.
 */
function resolveFitBadge(fit: PoiFitResult): { label: string; className: string } {
  // 2026-08-13: CORE_MINIMUM_RESERVE는 이름 키워드로는 테마가 확인되지 않지만, 이 자리를 채울 다른
  // 후보가 없어 전략 핵심 카테고리 최소 보존을 위해 실제로 코스에 포함된 경우다 — "적합도 낮음"·
  // "제외됨" 계열 문구를 붙이면 실제 상태와 어긋나므로 별도 라벨을 쓴다.
  if (fit.recommendationStatus === "CORE_MINIMUM_RESERVE") {
    return { label: "후보 부족으로 보완 추천", className: FIT_GRADE_BADGE_CLASS.MEDIUM };
  }
  if (fit.grade !== "LOW") {
    // 2026-08-14(운영 문제 재현 보완): 선호 테마를 아예 입력하지 않으면(themeFit.evaluated===false)
    // 만점 기준(maxScore)에서 테마 항목이 빠져 카테고리+계절만으로도 100점에 도달하기 쉽다 — 그 결과
    // 문화·역사 전략에서 워터파크·청소년수련관처럼 실제로는 테마와 무관할 수 있는 장소도 "적합도
    // 높음"으로 표시돼, 사용자가 이를 "테마까지 확인된 높은 적합도"로 오해할 수 있다(실제 운영에서
    // 확인됨). 판정 산식(grade/threshold)은 그대로 두고, 화면 문구에만 "테마 미입력으로 카테고리·시즌만
    // 반영됨"을 짧게 덧붙여 실제 근거 범위를 명확히 한다.
    if (!fit.breakdown.themeFit.evaluated) {
      return { label: `${FIT_GRADE_LABEL[fit.grade]} (테마 미입력)`, className: FIT_GRADE_BADGE_CLASS[fit.grade] };
    }
    return { label: FIT_GRADE_LABEL[fit.grade], className: FIT_GRADE_BADGE_CLASS[fit.grade] };
  }
  const { categoryFit, themeFit } = fit.breakdown;
  const themeUnconfirmedOnly = themeFit.evaluated && !themeFit.matched && categoryFit.tier !== "FALLBACK";
  if (themeUnconfirmedOnly) {
    const tierLabel = categoryFit.tier === "CORE" ? "핵심 카테고리 일치" : "보완 카테고리 일치";
    return { label: `${tierLabel} · 테마 근거 약함`, className: FIT_GRADE_BADGE_CLASS.MEDIUM };
  }
  return { label: FIT_GRADE_LABEL.LOW, className: FIT_GRADE_BADGE_CLASS.LOW };
}

/** Drag & Drop(Phase B 2단계, 2026-08-16) dnd-kit id 접두사 — 일정 항목/날짜 드롭 영역/추천 후보를
 * 하나의 DndContext 안에서 구분하기 위한 문자열 규약이다. POI id는 코스 전체에서 유일하므로(같은
 * 장소가 두 날짜에 동시에 있을 수 없음) poiId만으로 항목을 특정할 수 있다. */
const SCHEDULE_ITEM_DND_PREFIX = "schedule-item:";
const DAY_CONTAINER_DND_PREFIX = "day-container:";
const CANDIDATE_DND_PREFIX = "candidate:";

function findScheduleItemLocation(
  days: CourseDay[],
  poiId: string,
): { dayIndex: number; index: number } | null {
  for (const day of days) {
    const index = day.items.findIndex((it) => it.poiId === poiId);
    if (index !== -1) return { dayIndex: day.dayIndex, index };
  }
  return null;
}

function resolveDragDropTarget(
  days: CourseDay[],
  overId: string,
): { dayIndex: number; index: number } | null {
  if (overId.startsWith(DAY_CONTAINER_DND_PREFIX)) {
    const dayIndex = Number(overId.slice(DAY_CONTAINER_DND_PREFIX.length));
    const day = days.find((d) => d.dayIndex === dayIndex);
    if (!day) return null;
    return { dayIndex, index: day.items.length };
  }
  if (overId.startsWith(SCHEDULE_ITEM_DND_PREFIX)) {
    return findScheduleItemLocation(days, overId.slice(SCHEDULE_ITEM_DND_PREFIX.length));
  }
  return null;
}

/**
 * dnd-kit의 (active, over) id만으로 최종 결과를 계산하는 순수 함수(Phase B 2단계, 2026-08-16) —
 * 실제 포인터/터치 이동 처리는 dnd-kit이 담당하고, 이 함수는 "무엇을 어디에 놓았는지"만 받아 기존
 * reorderCourseItemWithinDay/moveCourseItemToDay/insertPoiIntoDay(모두 버튼 조작과 동일 경로)로
 * 위임한다. drop 대상이 없거나(over===null) 해석할 수 없으면 null을 반환해 아무 것도 바꾸지 않는다.
 */
export function computeDragOutcome(
  days: CourseDay[],
  candidates: CandidatePoi[],
  transport: TransportCode,
  activeId: string,
  overId: string | null,
): { days: CourseDay[] } | null {
  if (!overId) return null;
  const target = resolveDragDropTarget(days, overId);
  if (!target) return null;

  if (activeId.startsWith(CANDIDATE_DND_PREFIX)) {
    const candidateId = activeId.slice(CANDIDATE_DND_PREFIX.length);
    const candidate = candidates.find((c) => c.id === candidateId);
    if (!candidate) return null;
    return { days: insertPoiIntoDay(days, target.dayIndex, candidate, target.index, transport) };
  }

  if (activeId.startsWith(SCHEDULE_ITEM_DND_PREFIX)) {
    const poiId = activeId.slice(SCHEDULE_ITEM_DND_PREFIX.length);
    const source = findScheduleItemLocation(days, poiId);
    if (!source) return null;
    return {
      days: moveCourseItemToDay(days, source.dayIndex, source.index, target.dayIndex, target.index, transport),
    };
  }

  return null;
}

export function PlanEditor({
  plan,
  poiFits,
  poiShortage,
  candidatePois,
}: {
  plan: PlanEditorData;
  poiFits?: Record<string, PoiFitResult>;
  poiShortage?: PoiShortageNotice | null;
  /** 추천 POI 후보 풀(Phase B 첫 단계, 2026-08-16) — null이면 조회 자체가 실패한 것(오류 상태로 표시),
   * 빈 배열이면 조회는 성공했으나 추천할 후보가 없는 것(빈 상태로 표시)이다. 서버(page.tsx)에서 이미
   * 전략/테마 관련성·SHOPPING dedup·최소 적합 기준을 반영해 계산해 둔 값을 그대로 받는다 — 이 컴포넌트는
   * 현재 course에 이미 있는 POI만 클라이언트에서 걸러낸다(추가/삭제 즉시 반영, 별도 재조회 없음). */
  candidatePois?: CandidatePoi[] | null;
}) {
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
  //
  // state.days도 함께 반영한다(2026-08-06, 실제 경로 결과 미표시 버그 수정) — savePlanAction은 클라이언트가
  // 보낸 course를 그대로 저장하는 게 아니라 PRIVATE_VEHICLE 인접 구간을 카카오 실제 경로로 다시
  // enrichment한 뒤 저장한다. 그 결과(travelSource/travelDistanceKm 등)는 서버에만 있고, days는 이미
  // 마운트된 이 컴포넌트의 로컬 state라 부모(Server Component)가 revalidatePath로 새 props를 내려줘도
  // useState가 자동으로 따라가지 않는다 — 저장 응답에 실려온 days로 명시적으로 덮어써야 화면에 실제
  // 경로 결과가 보인다.
  if (state.success && state.savedAt !== lastHandledSavedAt) {
    setLastHandledSavedAt(state.savedAt);
    const adoptedDays = state.days ?? days;
    if (state.days) setDays(state.days);
    setSavedSnapshot(
      JSON.stringify({ productName, conceptText, memo, kpiMemo, days: adoptedDays, operationChecklist, risks, kpis }),
    );
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

  // 추천 후보 풀(Phase B 첫 단계, 2026-08-16): 서버가 이미 계산해 둔 후보 목록에서 현재 course에 있는
  // POI만 클라이언트에서 걸러낸다 — 후보를 추가하면 existingPoiIds에 즉시 반영되어 후보 풀에서
  // 사라지고, 삭제하면 즉시 다시 나타난다(별도 재조회·캐시 없이 리렌더링만으로 동작).
  const visibleCandidates = useMemo(
    () => (candidatePois ?? []).filter((c) => !existingPoiIds.has(c.id)),
    [candidatePois, existingPoiIds],
  );
  const [candidateAddDay, setCandidateAddDay] = useState<Record<string, number>>({});

  const [addingToDay, setAddingToDay] = useState<number | null>(null);
  const [poiQuery, setPoiQuery] = useState("");
  const [poiResults, setPoiResults] = useState<PoiDetail[]>([]);
  const [poiSearchPending, setPoiSearchPending] = useState(false);

  const qualityDuration: DurationCode =
    plan.duration ??
    (days.length >= 3 ? "TWO_NIGHTS_THREE_DAYS" : days.length === 2 ? "ONE_NIGHT_TWO_DAYS" : "DAY_TRIP");
  const courseQuality = useMemo(
    () =>
      computeCourseQuality({
        days,
        duration: qualityDuration,
        transport: plan.transport,
        templateId: plan.templateId,
        preferredThemes: plan.preferredThemes ?? [],
      }),
    [days, plan.preferredThemes, plan.templateId, plan.transport, qualityDuration],
  );

  // 편집 상태를 다루는 순수 함수(재정렬/날짜 이동/POI 삽입)는 planBuilder.ts로 옮겨졌다(Phase B
  // 2단계, 2026-08-16) — 버튼 조작과 Drag & Drop이 정확히 같은 재계산 경로를 타도록 하기 위함이다.
  const toInput = courseItemToInput;

  function moveItem(dayIndex: number, itemIndex: number, direction: -1 | 1) {
    setDays((prev) => reorderCourseItemWithinDay(prev, dayIndex, itemIndex, itemIndex + direction, plan.transport));
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
      const toDay = prev.find((d) => d.dayIndex === toDayIndex);
      if (!toDay) return prev;
      // 날짜 select는 항상 끝자리에 추가한다(기존 동작 유지) — 원래 날짜에서 쓰던 시간을 그대로
      // 들고 온다. 새 날짜에서 다른 일정과 겹치면 아래 실행 가능성 표시(빨간 경고)로 바로 드러나므로,
      // 사용자가 필요할 때만 시간을 다시 조정하면 된다.
      return moveCourseItemToDay(prev, fromDayIndex, itemIndex, toDayIndex, toDay.items.length, plan.transport);
    });
  }

  /** Drag & Drop 결과 반영(Phase B 2단계, 2026-08-16) — computeDragOutcome이 계산한 새 days를 그대로
   * 적용한다. 대상을 해석할 수 없으면(빈 공간에 놓임 등) null이 반환되어 아무 것도 바뀌지 않는다. */
  function handleDragEnd(event: DragEndEvent) {
    const overId = event.over ? String(event.over.id) : null;
    const outcome = computeDragOutcome(days, visibleCandidates, plan.transport, String(event.active.id), overId);
    if (outcome) setDays(outcome.days);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // 후보 풀(CandidatePoi)과 검색 결과(PoiDetail)가 공통으로 가진 최소 필드만 요구한다(2026-08-16) —
  // "기존 장소 추가 기능을 그대로 재사용한다"는 원칙에 따라 이 함수 자체는 바꾸지 않고 시그니처만 넓힌다.
  function addPoiToDay(
    dayIndex: number,
    poi: Pick<
      PoiDetail,
      "id" | "name" | "category" | "lat" | "lng" | "mealEligible" | "foodSubcategory" | "lclsSystm1" | "lclsSystm2"
    > &
      Partial<Pick<PoiDetail, "operatingHours" | "closedDays">>,
  ) {
    // 버튼 기반 추가는 항상 끝자리에 삽입한다(기존 동작 유지) — Drag & Drop만 드롭 위치에 맞는
    // 자리를 computeDragOutcome을 통해 넘긴다.
    setDays((prev) => {
      const day = prev.find((d) => d.dayIndex === dayIndex);
      if (!day) return prev;
      return insertPoiIntoDay(prev, dayIndex, poi, day.items.length, plan.transport);
    });
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
    // 사용자가 직접 추가하는 KPI도 같은 연결 규칙(kpiLinking.ts)으로 보강한다 — 축 데이터는 이 화면에
    // 없으므로(analysisResult 미포함) targetBasis는 항상 "기관 설정 필요"로 정직하게 표시된다.
    const [enriched] = enrichKpis([{ name, method: newKpiMethod.trim() }], {
      axisScores: null,
      primaryGoalCode: plan.primaryGoalCode,
      primaryGoalLabel: plan.primaryGoalLabel,
    });
    setKpis((prev) => [...prev, enriched]);
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
      const results = await searchAvailablePoisAction(plan.projectId, plan.regionId, trimmedPoiQuery);
      if (!cancelled) {
        setPoiResults(results);
        setPoiSearchPending(false);
      }
    }, POI_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [addingToDay, trimmedPoiQuery, plan.projectId, plan.regionId]);

  const visiblePoiResults =
    trimmedPoiQuery.length === 0 ? [] : poiResults.filter((p) => !existingPoiIds.has(p.id));

  /**
   * <form action={formAction}>로 직접 연결하면, 저장이 성공한 뒤 React가 진행형 향상(progressive
   * enhancement)을 위해 폼을 네이티브 form.reset()으로 자동 리셋한다. 날짜 select처럼 "값이 실제로는
   * 안 바뀌었지만 페이지가 다시 그려지는" 컨트롤은, React가 이전 값과 같다고 보고 DOM을 다시 써주지
   * 않아 리셋된 첫 번째 옵션("1일차")이 화면에 그대로 남는다 — 이 select를 강제로 다시 마운트시켜도
   * 리셋 자체가 그 이후에도 한 번 더 걸리므로 소용없다(직접 재현 확인됨). 근본 해결은 애초에 이
   * 자동 리셋 경로를 타지 않는 것 — action을 폼에 직접 연결하지 않고, onSubmit에서 막은 뒤 같은
   * formAction을 수동으로 호출한다(useActionState의 상태 관리·isPending은 그대로 동작).
   */
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <input type="hidden" name="courseJson" value={JSON.stringify({ days })} />
      <input type="hidden" name="operationChecklistJson" value={JSON.stringify(operationChecklist)} />
      <input type="hidden" name="risksJson" value={JSON.stringify(risks)} />
      <input type="hidden" name="kpisJson" value={JSON.stringify(kpis)} />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="space-y-6">
        <details className="rounded-lg border border-slate-200 bg-white p-5">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">상품 기획 요약</summary>
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
        </details>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">일자·시간대별 코스</h2>
          <CourseQualityPanel report={courseQuality} />
          {poiShortage ? (
            <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <p>확인: {poiShortage.message}</p>
              <p className="mt-1 text-amber-700">{poiShortage.suggestion}</p>
            </div>
          ) : null}
          <div className="no-print mt-3">
            <CourseMap days={days} kakaoKey={plan.kakaoKey} projectId={plan.projectId} />
          </div>
          <p className="mt-3 text-[11px] text-slate-400 xl:hidden">PC에서는 날짜별 열로 배치해 날짜 간 이동을 쉽게 확인할 수 있습니다.</p>
          <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
            {days.map((day) => (
              <div key={day.dayIndex}>
                <p className="text-xs font-semibold text-slate-500">{day.dayIndex}일차</p>
                {plan.transport === "PRIVATE_VEHICLE" ? (
                  <p className="mt-0.5 text-[11px] text-slate-400">{summarizeDayTravelSources(day)}</p>
                ) : null}
                {day.notices?.map((notice, i) => (
                  <p key={i} className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                      확인: {notice}
                  </p>
                ))}
                <DayDropZone dayIndex={day.dayIndex}>
                  <SortableContext
                    items={day.items.map((it) => SCHEDULE_ITEM_DND_PREFIX + it.poiId)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul className="mt-2 space-y-2">
                      {day.items.map((item, idx) => {
                        const feasibility = checkFeasibility(day.items, idx);
                        const fit = poiFits?.[item.poiId];
                        return (
                          <ScheduleItemRow
                            key={item.poiId + item.order}
                            item={item}
                            idx={idx}
                            day={day}
                            days={days}
                            fit={fit}
                            infeasible={feasibility.infeasible}
                            feasibilityReason={feasibility.reason}
                            transport={plan.transport}
                            onUpdateItemTime={updateItemTime}
                            onUpdateItemStayMinutes={updateItemStayMinutes}
                            onMoveItem={moveItem}
                            onMoveItemToDay={moveItemToDay}
                            onRemoveItem={removeItem}
                          />
                        );
                      })}
                    </ul>
                  </SortableContext>
                </DayDropZone>

                {day.lodging != null ? (
                  <div className="mt-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm">
                    <span className="mr-2 rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-semibold text-indigo-700">
                      숙박
                    </span>
                    <span className="font-medium text-indigo-900">{day.lodging.timeSlot} 체크인</span>
                    <span className="ml-2 text-slate-700">{day.lodging.poiName}</span>
                    <span className="ml-2 text-xs text-slate-500">
                      ({day.lodging.category}, {day.lodging.travel})
                    </span>
                    {plan.transport === "PRIVATE_VEHICLE" ? (
                      <span className="ml-1 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-500">
                        {travelSourceLabel(day.lodging.travelSource)}
                      </span>
                    ) : null}
                  </div>
                ) : null}

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

        <section className="no-print rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">추천 후보</h2>
          <p className="mt-1 text-xs text-slate-500">
            공식 분류와 선택한 전략·테마의 적합도가 확인된 대체 장소입니다. 공원·가로수길·캠핑장처럼
            지역 대표성을 자동 확정하기 어려운 보조시설과 숙박은 일반 후보에서 분리했습니다. 마음에 드는
            장소는 직접 골라 원하는 날짜에 추가할 수 있습니다.
          </p>
          {candidatePois === null ? (
            <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              추천 후보를 불러오지 못했습니다. 기존 일정은 그대로 편집·저장할 수 있습니다.
            </p>
          ) : visibleCandidates.length === 0 ? (
            <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              현재 조건에서 추가로 추천할 수 있는 장소가 없습니다.
            </p>
          ) : (
            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {visibleCandidates.map((candidate) => {
                const selectedDay = candidateAddDay[candidate.id] ?? days[0]?.dayIndex ?? 1;
                return (
                  <CandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    days={days}
                    selectedDay={selectedDay}
                    onSelectDay={(dayIndex) =>
                      setCandidateAddDay((prev) => ({ ...prev, [candidate.id]: dayIndex }))
                    }
                    onAdd={() => addPoiToDay(selectedDay, candidate)}
                  />
                );
              })}
            </ul>
          )}
        </section>

        <details className="rounded-lg border border-slate-200 bg-white p-5">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">
            운영 체크리스트 보기 ({operationChecklist.length}개)
          </summary>
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
        </details>

        <details className="rounded-lg border border-slate-200 bg-white p-5">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">
            위험과 대응안 보기 ({risks.length}개)
          </summary>
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
        </details>

        <details className="rounded-lg border border-slate-200 bg-white p-5">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">KPI 보기 ({kpis.length}개)</summary>
          <ul className="mt-2 space-y-2 text-sm text-slate-600">
            {kpis.map((k, i) => (
              <li key={i} className="rounded-md border border-slate-100 bg-slate-50 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    <span className="font-medium text-slate-700">{k.name}</span> — {k.method}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeKpi(i)}
                    className="no-print shrink-0 cursor-pointer rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                    aria-label={`KPI "${k.name}" 삭제`}
                  >
                    삭제
                  </button>
                </div>
                {k.purpose ? (
                  <dl className="mt-1.5 grid grid-cols-1 gap-x-3 gap-y-0.5 text-[11px] text-slate-500 sm:grid-cols-2">
                    <div>
                      <dt className="inline font-medium text-slate-500">측정 목적: </dt>
                      <dd className="inline">{k.purpose}</dd>
                    </div>
                    <div>
                      <dt className="inline font-medium text-slate-500">연결된 DNA 축: </dt>
                      <dd className="inline">{k.linkedAxis ? AXIS_LABEL_KO[k.linkedAxis] : "해당 없음(운영 지표)"}</dd>
                    </div>
                    <div>
                      <dt className="inline font-medium text-slate-500">연결된 사업 목표: </dt>
                      <dd className="inline">{k.linkedGoalLabel ?? "목표 미설정"}</dd>
                    </div>
                    <div>
                      <dt className="inline font-medium text-slate-500">권장 측정 시점: </dt>
                      <dd className="inline">{k.recommendedTiming}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="inline font-medium text-slate-500">목표값 설정 근거: </dt>
                      <dd className="inline">{k.targetBasis}</dd>
                    </div>
                  </dl>
                ) : null}
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
        </details>

        <details className="rounded-lg border border-slate-200 bg-white p-5">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">운영 메모 보기</summary>
          <label htmlFor="memo" className="mt-2 block text-sm font-medium text-slate-700">
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
        </details>
      </div>
      </DndContext>

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

/** 하루 일정 전체를 감싸는 드롭 영역(Phase B 2단계, 2026-08-16) — 항목 사이가 아니라 빈 공간(마지막
 * 항목 아래, 또는 항목이 아예 없는 날)에 드롭해도 그 날짜의 끝자리에 추가되도록 항상 존재하는 드롭
 * 대상이다. 항목 위에 정확히 드롭하면(SortableContext의 개별 item id) 그 자리에 삽입된다. */
function DayDropZone({ dayIndex, children }: { dayIndex: number; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id: DAY_CONTAINER_DND_PREFIX + dayIndex });
  return <div ref={setNodeRef}>{children}</div>;
}

/** 일정 항목 한 줄(Phase B 2단계, 2026-08-16) — 기존 UI(시간/체류시간 입력, 적합도 배지, 위/아래
 * 이동·날짜 이동·삭제 버튼)는 그대로 두고, 맨 앞에 드래그 손잡이(⋮⋮)만 추가한다. 버튼 조작은 이
 * 컴포넌트 안에서 여전히 동일하게 동작하므로(드래그는 부가 기능) 키보드·스크린리더 사용자도 기존
 * 방식으로 완전히 같은 작업을 할 수 있다. */
function ScheduleItemRow({
  item,
  idx,
  day,
  days,
  fit,
  infeasible,
  feasibilityReason,
  transport,
  onUpdateItemTime,
  onUpdateItemStayMinutes,
  onMoveItem,
  onMoveItemToDay,
  onRemoveItem,
}: {
  item: CourseItem;
  idx: number;
  day: CourseDay;
  days: CourseDay[];
  fit?: PoiFitResult;
  infeasible: boolean;
  feasibilityReason: string | null;
  transport: TransportCode;
  onUpdateItemTime: (dayIndex: number, itemIndex: number, timeSlot: string) => void;
  onUpdateItemStayMinutes: (dayIndex: number, itemIndex: number, stayMinutes: number) => void;
  onMoveItem: (dayIndex: number, itemIndex: number, direction: -1 | 1) => void;
  onMoveItemToDay: (fromDayIndex: number, itemIndex: number, toDayIndex: number) => void;
  onRemoveItem: (dayIndex: number, itemIndex: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: SCHEDULE_ITEM_DND_PREFIX + item.poiId,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const leisureType = classifyLeisureActivity(item.lclsSystm1, item.lclsSystm2);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm ${
        infeasible ? "border-red-300 bg-red-50" : "border-slate-100 bg-slate-50"
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`${item.poiName} 드래그로 순서·날짜 변경`}
          className="no-print mt-0.5 cursor-grab touch-none rounded border border-slate-200 bg-white px-1 py-0.5 text-slate-400 active:cursor-grabbing"
        >
          ⋮⋮
        </button>
        <div>
          <span className="font-medium text-slate-800">
            <input
              type="time"
              value={item.timeSlot}
              onChange={(e) => onUpdateItemTime(day.dayIndex, idx, e.target.value)}
              aria-label={`${item.poiName} 시간`}
              className="mr-1 rounded border border-slate-300 px-1 py-0.5 text-sm"
            />
            {item.poiName}
          </span>
          <span className="ml-2 text-xs text-slate-500">
            ({describeCourseItemPurpose(item)}, 체류{" "}
            <input
              type="number"
              min={0}
              step={10}
              value={item.stayMinutes}
              onChange={(e) => onUpdateItemStayMinutes(day.dayIndex, idx, Number(e.target.value))}
              aria-label={`${item.poiName} 체류시간(분)`}
              className="w-14 rounded border border-slate-300 px-1 py-0.5 text-xs"
            />
            분, {item.travel})
          </span>
          {idx > 0 && transport === "PRIVATE_VEHICLE" ? (
            <span className="ml-1 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-500">
              {travelSourceLabel(item.travelSource)}
            </span>
          ) : null}
          {infeasible ? (
            <p className="mt-0.5 text-xs font-medium text-red-600">일정 조정 필요: {feasibilityReason}</p>
          ) : null}
          {fit ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${resolveFitBadge(fit).className}`}
                >
                  {resolveFitBadge(fit).label}
                </span>
                <span className="ml-1 text-slate-400">이동·선택 근거</span>
              </summary>
              <div className="mt-1 max-w-md space-y-1 rounded border border-slate-100 bg-white p-2 text-[11px] text-slate-600">
                {fit.positiveReasons.length > 0 ? (
                  <ul className="list-disc space-y-0.5 pl-4">
                    {fit.positiveReasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                ) : null}
                {fit.cautions.length > 0 ? (
                  <ul className="list-disc space-y-0.5 pl-4 text-amber-700">
                    {fit.cautions.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                ) : null}
                <p className="text-slate-400">
                  데이터 출처: {fit.dataSource.sourceLabel}
                  {fit.dataSource.operatingHoursConfirmed
                    ? ` · 운영시간: ${fit.dataSource.operatingHoursText}`
                    : " · 운영시간 확인 필요"}
                </p>
                {leisureType ? <p className="text-slate-400">공식 레저 분류: {leisureType.label}</p> : null}
              </div>
            </details>
          ) : null}
        </div>
      </div>
      <div className="no-print flex items-center gap-1">
        <button
          type="button"
          onClick={() => onMoveItem(day.dayIndex, idx, -1)}
          disabled={idx === 0}
          className="cursor-pointer rounded border border-slate-300 px-2 py-0.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`${item.poiName} 위로 이동`}
        >
          ↑
        </button>
        <button
          type="button"
          onClick={() => onMoveItem(day.dayIndex, idx, 1)}
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
            onChange={(e) => onMoveItemToDay(day.dayIndex, idx, Number(e.target.value))}
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
          onClick={() => onRemoveItem(day.dayIndex, idx)}
          className="cursor-pointer rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
          aria-label={`${item.poiName} 삭제`}
        >
          삭제
        </button>
      </div>
    </li>
  );
}

/** 추천 후보 카드(Phase B 2단계, 2026-08-16) — 기존 날짜 select + "이 날짜에 추가" 버튼은 그대로
 * 두고, 드래그 손잡이만 추가해 원하는 일정 위치로 직접 끌어다 놓을 수 있게 한다. */
function CandidateCard({
  candidate,
  days,
  selectedDay,
  onSelectDay,
  onAdd,
}: {
  candidate: CandidatePoi;
  days: CourseDay[];
  selectedDay: number;
  onSelectDay: (dayIndex: number) => void;
  onAdd: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: CANDIDATE_DND_PREFIX + candidate.id,
  });
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 };
  const badge = resolveFitBadge(candidate.fit);
  const reason = candidate.fit.positiveReasons[0] ?? candidate.fit.cautions[0] ?? null;
  const leisureType = classifyLeisureActivity(candidate.lclsSystm1, candidate.lclsSystm2);

  return (
    <li ref={setNodeRef} style={style} className="rounded-md border border-slate-200 p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`${candidate.name} 드래그로 일정에 놓기`}
            className="no-print mt-0.5 cursor-grab touch-none rounded border border-slate-200 bg-white px-1 py-0.5 text-slate-400 active:cursor-grabbing"
          >
            ⋮⋮
          </button>
          <div>
            <p className="font-medium text-slate-800">{candidate.name}</p>
            <p className="mt-0.5 text-slate-400">{poiCategoryLabel(candidate.category)}</p>
            {leisureType ? <p className="mt-0.5 text-slate-500">공식 분류: {leisureType.label}</p> : null}
          </div>
        </div>
        <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] ${badge.className}`}>
          {badge.label}
        </span>
      </div>
      {reason ? <p className="mt-2 text-slate-500">{reason}</p> : null}
      <div className="mt-2 flex items-center gap-2">
        <label className="sr-only" htmlFor={`candidate-day-${candidate.id}`}>
          {candidate.name} 추가할 날짜
        </label>
        <select
          id={`candidate-day-${candidate.id}`}
          value={selectedDay}
          onChange={(e) => onSelectDay(Number(e.target.value))}
          className="rounded border border-slate-300 px-1.5 py-1 text-xs"
        >
          {days.map((d) => (
            <option key={d.dayIndex} value={d.dayIndex}>
              {d.dayIndex}일차
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onAdd}
          aria-label={`${candidate.name} ${selectedDay}일차에 추가`}
          className="cursor-pointer rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
        >
          이 날짜에 추가
        </button>
      </div>
    </li>
  );
}
