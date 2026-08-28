"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  savePlanAction,
  searchAvailablePoisAction,
  type SavePlanErrorCode,
  type SavePlanFormState,
} from "@/app/projects/[id]/plan/actions";
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
  insertLodgingIntoDay,
  isFestivalAnchorItem,
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
import { PetEvidenceBadge } from "@/components/plan/PetEvidenceBadge";
import { AccessibilityEvidenceBadge } from "@/components/plan/AccessibilityEvidenceBadge";
import { AnimatedDetails } from "@/components/ui/AnimatedDetails";
import { computeCourseQuality, type CourseQualityReport } from "@/lib/domain/courseQualityValidation";
import { rerankCandidatesForCurrentCourse } from "@/lib/domain/candidateRerank";
import { unknownPetEvidence, type PetEvidenceDisplay } from "@/lib/domain/petTourEvidenceDisplay";
import { unknownAccessibilityEvidence, type AccessibilityEvidenceDisplay } from "@/lib/domain/accessibilityEvidenceDisplay";
import type { PoiFitResult } from "@/lib/domain/poiFit";
import type { PoiShortageNotice } from "@/lib/services/poiFitService";
import type { CandidatePoi } from "@/lib/services/candidatePoolService";
import { enrichKpis, type EnrichedKpi } from "@/lib/domain/kpiLinking";
import { AXIS_LABEL_KO } from "@/lib/domain/types";
import type { DurationCode } from "@/lib/domain/strategy";
import { travelSourceLabel, poiCategoryLabel } from "@/lib/format";
import { classifyLeisureActivity } from "@/lib/domain/leisureClassification";
import { poiRepresentationLabel } from "@/lib/domain/poiRecommendation";
import type { ProjectAnchorRecord } from "@/lib/services/projectAnchorService";
import type { AnchorCandidate, AnchorCandidateResult } from "@/lib/services/anchorCandidateService";
import {
  canApplyFestivalAnchor,
  findFestivalAnchorItems,
  formatFestivalAnchorCourseTime,
  insertFestivalAnchorIntoCourse,
  removeFestivalAnchorFromCourse,
  replaceFestivalAnchorInCourse,
  validateFestivalAnchorCourseDays,
  insertPoiAroundFestivalAnchor,
  type FestivalAnchorRelatedPosition,
} from "@/lib/domain/festivalAnchorCourse";

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
  /** P1-2a에서 읽은 현재 축제 Anchor. P1-2b에서도 자동 삽입하지 않고 사용자 명시 동작으로만 코스에 반영한다. */
  festivalAnchor?: ProjectAnchorRecord | null;
  /** 반려동물 조건이 선택된 경우에만 근거 badge/advisory를 활성화한다. */
  petConditionActive?: boolean;
  petEvidenceByPoiId?: Record<string, PetEvidenceDisplay>;
  petEvidenceRepositoryUnavailable?: boolean;
  accessibilityConditionActive?: boolean;
  accessibilityEvidenceByPoiId?: Record<string, AccessibilityEvidenceDisplay>;
  accessibilityEvidenceRepositoryUnavailable?: boolean;
}

const initialActionState: SavePlanFormState = { success: false };
type SaveFeedback = "CLEAN" | "SAVED" | "ERROR";
type DisplaySaveStatus = SaveFeedback | "DIRTY" | "SAVING";
type SaveClientStage =
  | "IDLE"
  | "BUTTON_CLICKED"
  | "FORM_SUBMIT"
  | "HANDLER_ENTERED"
  | "ACTION_DISPATCHED"
  | "ACTION_RESOLVED"
  | "ACTION_REJECTED";
const SAVE_PLAN_ERROR_MESSAGE = "변경사항을 저장하지 못했습니다. 다시 시도해주세요.";
const SAVE_PLAN_ERROR_CODES = new Set<SavePlanErrorCode>([
  "ACCESS_DENIED",
  "PAYLOAD_INVALID",
  "ANCHOR_VALIDATION_FAILED",
  "PLAN_NOT_FOUND",
  "DB_TRANSACTION_FAILED",
  "UNEXPECTED_SAVE_ERROR",
]);

function normalizedSavePlanResult(value: unknown): SavePlanFormState {
  if (!value || typeof value !== "object" || typeof (value as { success?: unknown }).success !== "boolean") {
    return { success: false, code: "UNEXPECTED_SAVE_ERROR", message: SAVE_PLAN_ERROR_MESSAGE };
  }

  const result = value as SavePlanFormState;
  if (!result.success) {
    const code = SAVE_PLAN_ERROR_CODES.has(result.code as SavePlanErrorCode) ? result.code : "UNEXPECTED_SAVE_ERROR";
    return {
      success: false,
      code,
      message: typeof result.message === "string" ? result.message : SAVE_PLAN_ERROR_MESSAGE,
    };
  }

  if (typeof result.savedAt !== "string" || result.savedAt.length === 0) {
    return { success: false, code: "UNEXPECTED_SAVE_ERROR", message: SAVE_PLAN_ERROR_MESSAGE };
  }
  return result;
}

type PlanSaveSnapshot = Pick<PlanEditorData, "productName" | "conceptText" | "memo" | "kpiMemo" | "operationChecklist" | "risks" | "kpis"> & {
  days: CourseDay[];
};

function createPlanSaveSnapshot(values: PlanSaveSnapshot): PlanSaveSnapshot {
  return {
    productName: values.productName,
    conceptText: values.conceptText,
    memo: values.memo,
    kpiMemo: values.kpiMemo,
    days: values.days,
    operationChecklist: values.operationChecklist,
    risks: values.risks,
    kpis: values.kpis,
  };
}

function serializePlanSaveSnapshot(values: PlanSaveSnapshot): string {
  return JSON.stringify(createPlanSaveSnapshot(values));
}

function parsePlanSaveSnapshot(value: string): PlanSaveSnapshot | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as PlanSaveSnapshot;
  } catch {
    return null;
  }
}

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
    const sourceDay = days.find((day) => day.dayIndex === source.dayIndex);
    if (sourceDay && isFestivalAnchorItem(sourceDay.items[source.index])) return null;
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
  anchorCandidates,
  strategyName,
}: {
  plan: PlanEditorData;
  poiFits?: Record<string, PoiFitResult>;
  poiShortage?: PoiShortageNotice | null;
  /** 추천 POI 후보 풀(Phase B 첫 단계, 2026-08-16) — null이면 조회 자체가 실패한 것(오류 상태로 표시),
   * 빈 배열이면 조회는 성공했으나 추천할 후보가 없는 것(빈 상태로 표시)이다. 서버(page.tsx)에서 이미
   * 전략/테마 관련성·SHOPPING dedup·최소 적합 기준을 반영해 계산해 둔 값을 그대로 받는다 — 이 컴포넌트는
   * 현재 course에 이미 있는 POI만 클라이언트에서 걸러낸다(추가/삭제 즉시 반영, 별도 재조회 없음). */
  candidatePois?: CandidatePoi[] | null;
  /** 확정·반영된 Anchor 주변 연계 후보. null은 조회 실패/구조 미적용으로, 결과 내부의 빈 상태와 구분한다. */
  anchorCandidates?: AnchorCandidateResult | null;
  /** 실행안 첫 화면의 흐름 안내에 표시할 선택 전략명(표시 전용). */
  strategyName?: string | null;
}) {
  const boundSave = savePlanAction.bind(null, plan.id, plan.projectId);
  const [clientStage, setClientStage] = useState<SaveClientStage>("IDLE");
  const [clientDiagnosticCode, setClientDiagnosticCode] = useState<SavePlanErrorCode | null>(null);

  function recordClientStage(stage: SaveClientStage) {
    setClientStage(stage);
  }

  const safeSave = async (previousState: SavePlanFormState, formData: FormData): Promise<SavePlanFormState> => {
    try {
      const result = normalizedSavePlanResult(await boundSave(previousState, formData));
      recordClientStage("ACTION_RESOLVED");
      return result;
    } catch {
      recordClientStage("ACTION_REJECTED");
      setClientDiagnosticCode("UNEXPECTED_SAVE_ERROR");
      return { success: false, code: "UNEXPECTED_SAVE_ERROR", message: SAVE_PLAN_ERROR_MESSAGE };
    }
  };
  const [state, formAction, isPending] = useActionState(safeSave, initialActionState);

  const [productName, setProductName] = useState(plan.productName);
  const [conceptText, setConceptText] = useState(plan.conceptText);
  const [memo, setMemo] = useState(plan.memo);
  const [kpiMemo, setKpiMemo] = useState(plan.kpiMemo);
  const [days, setDays] = useState<CourseDay[]>(plan.course.days);
  const [anchorActionMessage, setAnchorActionMessage] = useState<string | null>(null);
  const [operationChecklist, setOperationChecklist] = useState<string[]>(plan.operationChecklist);
  const [risks, setRisks] = useState<PlanEditorData["risks"]>(plan.risks);
  const [kpis, setKpis] = useState<PlanEditorData["kpis"]>(plan.kpis);

  const [savedSnapshot, setSavedSnapshot] = useState(
    serializePlanSaveSnapshot({
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
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback>("CLEAN");

  const currentSnapshot = useMemo(
    () =>
      serializePlanSaveSnapshot({
        productName,
        conceptText,
        memo,
        kpiMemo,
        days,
        operationChecklist,
        risks,
        kpis,
      }),
    [productName, conceptText, memo, kpiMemo, days, operationChecklist, risks, kpis],
  );

  const isDirty = currentSnapshot !== savedSnapshot;
  const saveRequestSnapshotRef = useRef<string | null>(null);
  const lastHandledActionStateRef = useRef(state);

  // 성공 시에만 서버가 실제로 저장한 payload를 새 baseline으로 삼는다. 저장 중 화면이 다시
  // 수정된 경우에는 서버 응답의 days로 현재 편집 상태를 덮어쓰지 않고, A 저장 성공 + B 편집
  // 상태를 DIRTY로 남긴다.
  useEffect(() => {
    if (state === lastHandledActionStateRef.current) return;
    lastHandledActionStateRef.current = state;

    if (state.success && state.savedAt) {
      const submittedSnapshot = saveRequestSnapshotRef.current ?? currentSnapshot;
      const submittedPayload = parsePlanSaveSnapshot(submittedSnapshot);
      const serverPayload = submittedPayload ?? parsePlanSaveSnapshot(currentSnapshot);
      if (serverPayload && state.days) serverPayload.days = state.days;
      const nextSavedSnapshot = serverPayload ? JSON.stringify(serverPayload) : submittedSnapshot;
      const currentStillMatchesSubmitted = submittedSnapshot === currentSnapshot;

      if (currentStillMatchesSubmitted && state.days) {
        setDays(state.days);
      }
      setSavedSnapshot(nextSavedSnapshot);
      setSaveFeedback(currentStillMatchesSubmitted ? "SAVED" : "CLEAN");
      setClientDiagnosticCode(null);
      saveRequestSnapshotRef.current = null;
      return;
    }

    if (!state.success) {
      setClientDiagnosticCode(state.code ?? "UNEXPECTED_SAVE_ERROR");
      setSaveFeedback("ERROR");
      saveRequestSnapshotRef.current = null;
    }
  }, [currentSnapshot, state]);

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirty) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const existingPoiIds = useMemo(
    () => new Set(days.flatMap((d) => [...d.items.map((i) => i.poiId), ...(d.lodging ? [d.lodging.poiId] : [])])),
    [days],
  );
  const courseAnchorItems = useMemo(() => findFestivalAnchorItems(days), [days]);
  const courseAnchor = courseAnchorItems[0] ?? null;
  const currentAnchorValidation = plan.festivalAnchor
    ? validateFestivalAnchorCourseDays(days, plan.festivalAnchor)
    : { ok: courseAnchorItems.length === 0 };
  const currentAnchorIsInCourse = Boolean(
    courseAnchor && plan.festivalAnchor && courseAnchor.item.anchorId === plan.festivalAnchor.id,
  );

  // 추천 후보 풀(Phase B 3단계): 서버가 계산한 후보의 자격·상한·dedup은 그대로 두고, 현재 편집 중인
  // 코스와의 관계만 client에서 다시 계산한다. 후보 추가·삭제·날짜 이동으로 days가 바뀌는 순간
  // useMemo가 재실행되며, Drag 중에는 days를 바꾸지 않으므로 매 프레임 재정렬하지 않는다.
  const rerankedCandidateItems = useMemo(
    () =>
      rerankCandidatesForCurrentCourse(
        candidatePois ?? [],
        days.flatMap((day) => [...day.items, ...(day.lodging ? [day.lodging] : [])]),
      ),
    [candidatePois, days],
  );
  const visibleCandidateItems = useMemo(
    () => rerankedCandidateItems.filter(({ candidate }) => !existingPoiIds.has(candidate.id)),
    [existingPoiIds, rerankedCandidateItems],
  );
  const visibleCandidates = useMemo(
    () => visibleCandidateItems.map(({ candidate }) => candidate),
    [visibleCandidateItems],
  );
  const visibleAnchorGroups = useMemo(() => {
    const empty: Record<"PRE_EVENT" | "MEAL" | "POST_EVENT" | "STAY", AnchorCandidate[]> = {
      PRE_EVENT: [],
      MEAL: [],
      POST_EVENT: [],
      STAY: [],
    };
    if (!anchorCandidates || anchorCandidates.status !== "AVAILABLE") return empty;
    return Object.fromEntries(
      Object.entries(anchorCandidates.groups).map(([role, candidates]) => [
        role,
        candidates.filter((candidate) => !existingPoiIds.has(candidate.id)),
      ]),
    ) as typeof empty;
  }, [anchorCandidates, existingPoiIds]);
  const [candidateAddDay, setCandidateAddDay] = useState<Record<string, number>>({});
  const [candidatePanelOpen, setCandidatePanelOpen] = useState(false);
  const [anchorMealPosition, setAnchorMealPosition] = useState<FestivalAnchorRelatedPosition>("AFTER_ANCHOR");
  const [anchorCandidateMessage, setAnchorCandidateMessage] = useState<string | null>(null);

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
        petConditionActive: plan.petConditionActive,
        petEvidenceByPoiId: plan.petEvidenceByPoiId,
        accessibilityConditionActive: plan.accessibilityConditionActive,
        accessibilityEvidenceByPoiId: plan.accessibilityEvidenceByPoiId,
      }),
    [
      days,
      plan.accessibilityConditionActive,
      plan.accessibilityEvidenceByPoiId,
      plan.petConditionActive,
      plan.petEvidenceByPoiId,
      plan.preferredThemes,
      plan.templateId,
      plan.transport,
      qualityDuration,
    ],
  );

  // 편집 상태를 다루는 순수 함수(재정렬/날짜 이동/POI 삽입)는 planBuilder.ts로 옮겨졌다(Phase B
  // 2단계, 2026-08-16) — 버튼 조작과 Drag & Drop이 정확히 같은 재계산 경로를 타도록 하기 위함이다.
  const toInput = courseItemToInput;

  // 저장 성공/실패 안내는 실제 저장 대상이 다시 편집된 순간에만 초기화한다. 상세 접기, 후보 날짜
  // 임시 선택, 필터·포커스·후보 재정렬처럼 snapshot에 없는 UI-only state는 이 함수를 호출하지 않는다.
  function markPlanEdited() {
    setSaveFeedback("CLEAN");
    setClientDiagnosticCode(null);
  }

  function moveItem(dayIndex: number, itemIndex: number, direction: -1 | 1) {
    markPlanEdited();
    setDays((prev) => reorderCourseItemWithinDay(prev, dayIndex, itemIndex, itemIndex + direction, plan.transport));
  }

  function removeItem(dayIndex: number, itemIndex: number) {
    markPlanEdited();
    setDays((prev) => {
      const targetDay = prev.find((d) => d.dayIndex === dayIndex);
      const targetItem = targetDay?.items[itemIndex];
      if (targetItem && isFestivalAnchorItem(targetItem)) {
        return removeFestivalAnchorFromCourse(prev, targetItem.anchorId!, plan.transport);
      }
      return prev.map((d) => {
        if (d.dayIndex !== dayIndex) return d;
        const items = d.items.filter((_, i) => i !== itemIndex);
        return { ...d, items: recomputeDayItems(items.map(toInput), plan.transport) };
      });
    });
  }

  function moveItemToDay(fromDayIndex: number, itemIndex: number, toDayIndex: number) {
    if (fromDayIndex === toDayIndex) return;
    markPlanEdited();
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
    if (outcome) {
      markPlanEdited();
      setDays(outcome.days);
    }
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
    markPlanEdited();
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
    markPlanEdited();
    setDays((prev) =>
      prev.map((d) => {
        if (d.dayIndex !== dayIndex) return d;
        return {
          ...d,
          items: d.items.map((it, i) => (i === itemIndex && !isFestivalAnchorItem(it) ? { ...it, timeSlot } : it)),
        };
      }),
    );
  }

  function updateItemStayMinutes(dayIndex: number, itemIndex: number, stayMinutes: number) {
    if (!Number.isFinite(stayMinutes) || stayMinutes < 0) return;
    markPlanEdited();
    setDays((prev) =>
      prev.map((d) => {
        if (d.dayIndex !== dayIndex) return d;
        return {
          ...d,
          items: d.items.map((it, i) => (i === itemIndex && !isFestivalAnchorItem(it) ? { ...it, stayMinutes } : it)),
        };
      }),
    );
  }

  function addAnchorCandidate(candidate: AnchorCandidate) {
    const anchor = plan.festivalAnchor;
    const courseAnchorId = courseAnchor?.item.anchorId;
    if (!anchor || !courseAnchorId || !currentAnchorIsInCourse || !currentAnchorValidation.ok) {
      setAnchorCandidateMessage("현재 코스의 Anchor가 최신 상태가 아닙니다. Anchor를 다시 반영한 뒤 후보를 추가해주세요.");
      return;
    }
    if (candidate.role === "STAY") {
      markPlanEdited();
      setDays((prev) => {
        const result = insertLodgingIntoDay(
          prev,
          candidate.dayIndex,
          {
            id: candidate.id,
            name: candidate.name,
            category: candidate.category,
            lat: candidate.lat,
            lng: candidate.lng,
            operatingHours: candidate.operatingHours,
            closedDays: candidate.closedDays,
            mealEligible: candidate.mealEligible,
            foodSubcategory: candidate.foodSubcategory,
            lclsSystm1: candidate.lclsSystm1,
            lclsSystm2: candidate.lclsSystm2,
          },
          plan.transport,
        );
        if (!result.ok) {
          setAnchorCandidateMessage(result.message);
          return prev;
        }
        setAnchorCandidateMessage(`${candidate.name}을(를) ${candidate.dayIndex}일차 숙박 슬롯에 추가했습니다. 저장하면 확정됩니다.`);
        return result.days;
      });
      return;
    }
    const position: FestivalAnchorRelatedPosition = candidate.role === "PRE_EVENT" ? "BEFORE_ANCHOR" : candidate.role === "MEAL" ? anchorMealPosition : "AFTER_ANCHOR";
    markPlanEdited();
    setDays((prev) => {
      const next = insertPoiAroundFestivalAnchor(
        prev,
        courseAnchorId,
        {
          poiId: candidate.id,
          poiName: candidate.name,
          category: candidate.category,
          lat: candidate.lat,
          lng: candidate.lng,
          operatingHours: candidate.operatingHours,
          closedDays: candidate.closedDays,
          mealEligible: candidate.mealEligible,
          foodSubcategory: candidate.foodSubcategory,
          lclsSystm1: candidate.lclsSystm1,
          lclsSystm2: candidate.lclsSystm2,
        },
        position,
        plan.transport,
      );
      setAnchorCandidateMessage(
        `${candidate.name}을(를) Anchor ${position === "BEFORE_ANCHOR" ? "앞" : "뒤"}에 추가했습니다. Anchor 시각은 고정되며 저장하면 확정됩니다.`,
      );
      return next;
    });
  }

  function applyFestivalAnchor(replace = false) {
    const anchor = plan.festivalAnchor;
    if (!anchor) {
      setAnchorActionMessage("현재 확정된 축제 Anchor가 없습니다.");
      return;
    }
    const result = replace
      ? replaceFestivalAnchorInCourse(days, anchor, plan.transport)
      : insertFestivalAnchorIntoCourse(days, anchor, plan.transport);
    if (!result.ok) {
      setAnchorActionMessage(result.message);
      return;
    }
    markPlanEdited();
    setDays(result.days);
    setAnchorActionMessage("축제 Anchor를 코스에 반영했습니다. 기존 장소는 유지되며, 저장 버튼을 눌러 확정하세요.");
  }

  function removeCourseAnchor() {
    if (!courseAnchor) return;
    markPlanEdited();
    setDays(removeFestivalAnchorFromCourse(days, courseAnchor.item.anchorId!, plan.transport));
    setAnchorActionMessage("Anchor를 코스에서만 제거했습니다. 프로젝트의 축제 확정은 유지됩니다.");
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
    markPlanEdited();
    setOperationChecklist((prev) => [...prev, text]);
    setNewChecklistText("");
  }

  function removeChecklistItem(index: number) {
    markPlanEdited();
    setOperationChecklist((prev) => prev.filter((_, i) => i !== index));
  }

  function addRisk() {
    const risk = newRiskText.trim();
    if (!risk) return;
    markPlanEdited();
    setRisks((prev) => [...prev, { risk, mitigation: newMitigationText.trim() }]);
    setNewRiskText("");
    setNewMitigationText("");
  }

  function removeRisk(index: number) {
    markPlanEdited();
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
    markPlanEdited();
    setKpis((prev) => [...prev, enriched]);
    setNewKpiName("");
    setNewKpiMethod("");
  }

  function removeKpi(index: number) {
    markPlanEdited();
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
    recordClientStage("FORM_SUBMIT");
    e.preventDefault();
    recordClientStage("HANDLER_ENTERED");
    try {
      const formData = new FormData(e.currentTarget);
      saveRequestSnapshotRef.current = currentSnapshot;
      setClientDiagnosticCode(null);
      recordClientStage("ACTION_DISPATCHED");
      startTransition(() => {
        formAction(formData);
      });
    } catch {
      recordClientStage("ACTION_REJECTED");
      setClientDiagnosticCode("UNEXPECTED_SAVE_ERROR");
      setSaveFeedback("ERROR");
      saveRequestSnapshotRef.current = null;
    }
  }

  const displaySaveStatus: DisplaySaveStatus = isPending
    ? "SAVING"
    : saveFeedback === "ERROR"
      ? "ERROR"
      : saveFeedback === "SAVED" && !isDirty
        ? "SAVED"
        : isDirty
          ? "DIRTY"
          : saveFeedback;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="courseJson" value={JSON.stringify({ days })} />
      <input type="hidden" name="operationChecklistJson" value={JSON.stringify(operationChecklist)} />
      <input type="hidden" name="risksJson" value={JSON.stringify(risks)} />
      <input type="hidden" name="kpisJson" value={JSON.stringify(kpis)} />

      <DndContext id="plan-editor-dnd" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <CourseStudioFlow strategyName={strategyName} days={days} quality={courseQuality} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">일자·시간대별 코스</h2>
          <div className="no-print mt-3">
            <CourseMap days={days} kakaoKey={plan.kakaoKey} projectId={plan.projectId} />
          </div>
          <section className="mt-3 rounded-md border border-violet-200 bg-violet-50 p-3" aria-label="축제 Anchor 연결">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-violet-900">확정된 축제 Anchor</h3>
                <p className="mt-1 text-[11px] text-violet-800">
                  사용자가 직접 확정한 축제만 지정 일차·정확한 시각에 고정합니다. 기존 장소는 자동으로 삭제하거나 이동하지 않습니다.
                </p>
              </div>
              {plan.festivalAnchor ? (
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-violet-700">프로젝트 확정</span>
              ) : null}
            </div>
            {plan.festivalAnchor ? (
              <div className="mt-2 rounded border border-violet-100 bg-white p-2 text-xs text-slate-700">
                <p className="font-medium">{plan.festivalAnchor.name}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  행사일 {plan.festivalAnchor.eventStartDate}~{plan.festivalAnchor.eventEndDate} · 연계 {plan.festivalAnchor.plannedDate} ·{" "}
                  {plan.festivalAnchor.plannedDayIndex}일차 ·{" "}
                  {plan.festivalAnchor.timeStart && plan.festivalAnchor.timeEnd
                    ? plan.festivalAnchor.timeStart + "~" + plan.festivalAnchor.timeEnd
                    : "정확한 시각 미확정"}{" "}
                  · 출처 {plan.festivalAnchor.source}
                </p>
              </div>
            ) : null}
            {courseAnchor ? (
              <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
                <p className="font-medium">코스에 고정된 Anchor: {courseAnchor.item.poiName}</p>
                <p className="mt-0.5 text-[11px]">
                  {courseAnchor.dayIndex}일차 · {formatFestivalAnchorCourseTime(courseAnchor.item)} · 이 일정은 드래그·시간·날짜 편집에서 제외됩니다.
                </p>
                {!plan.festivalAnchor ? (
                  <p className="mt-1 text-amber-700">프로젝트 Anchor가 삭제되었거나 조회되지 않습니다. 코스에서만 제거해야 새 Anchor를 반영할 수 있습니다.</p>
                ) : currentAnchorIsInCourse && !currentAnchorValidation.ok ? (
                  <p className="mt-1 text-amber-700">{currentAnchorValidation.message}</p>
                ) : currentAnchorIsInCourse ? (
                  <p className="mt-1">현재 프로젝트 Anchor와 일치합니다.</p>
                ) : (
                  <p className="mt-1 text-amber-700">현재 프로젝트 Anchor와 다른 일정입니다. 기존 Anchor를 코스에서만 제거한 뒤 반영하세요.</p>
                )}
                <button
                  type="button"
                  onClick={removeCourseAnchor}
                  className="no-print mt-2 cursor-pointer rounded border border-red-200 bg-white px-2 py-1 text-[11px] text-red-600 hover:bg-red-50"
                >
                  코스에서만 제거
                </button>
              </div>
            ) : plan.festivalAnchor ? (
              canApplyFestivalAnchor(plan.festivalAnchor) ? (
                <button
                  type="button"
                  onClick={() => applyFestivalAnchor(false)}
                  className="no-print mt-2 cursor-pointer rounded bg-violet-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-800"
                >
                  이 축제를 코스에 고정
                </button>
              ) : (
                <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                  시간대만 지정되었거나 공식 시각이 미확정입니다. 코스에 고정하려면 사용자가 정확한 시작·종료 시각을 확정해야 합니다.
                </p>
              )
            ) : (
              <p className="mt-2 text-[11px] text-slate-500">현재 프로젝트에 확정된 축제 Anchor가 없습니다.</p>
            )}
            {currentAnchorIsInCourse && plan.festivalAnchor && !currentAnchorValidation.ok ? (
              <button
                type="button"
                onClick={() => applyFestivalAnchor(true)}
                className="no-print mt-2 cursor-pointer rounded border border-violet-300 bg-white px-3 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-100"
              >
                변경한 Anchor 다시 반영
              </button>
            ) : null}
            {anchorActionMessage ? (
              <p className="mt-2 text-[11px] font-medium text-violet-800" role="status">
                {anchorActionMessage}
              </p>
            ) : null}
          </section>
          <CourseQualityPanel report={courseQuality} />
          {poiShortage ? (
            <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <p>확인: {poiShortage.message}</p>
              <p className="mt-1 text-amber-700">{poiShortage.suggestion}</p>
            </div>
          ) : null}
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
                            petEvidence={
                              plan.petConditionActive
                                ? plan.petEvidenceByPoiId?.[item.poiId] ?? unknownPetEvidence({ repositoryUnavailable: plan.petEvidenceRepositoryUnavailable })
                                : undefined
                            }
                            accessibilityEvidence={
                              plan.accessibilityConditionActive
                                ? plan.accessibilityEvidenceByPoiId?.[item.poiId] ?? unknownAccessibilityEvidence({ repositoryUnavailable: plan.accessibilityEvidenceRepositoryUnavailable })
                                : undefined
                            }
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
                    {plan.petConditionActive ? (
                      <PetEvidenceBadge
                        evidence={
                          plan.petEvidenceByPoiId?.[day.lodging.poiId] ??
                          unknownPetEvidence({ repositoryUnavailable: plan.petEvidenceRepositoryUnavailable })
                        }
                        compact
                      />
                    ) : null}
                    {plan.accessibilityConditionActive ? (
                      <AccessibilityEvidenceBadge
                        evidence={
                          plan.accessibilityEvidenceByPoiId?.[day.lodging.poiId] ??
                          unknownAccessibilityEvidence({ repositoryUnavailable: plan.accessibilityEvidenceRepositoryUnavailable })
                        }
                        compact
                      />
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

          <AnimatedDetails
            className="rounded-lg border border-slate-200 bg-white p-5"
            summary="상품 기획 요약"
            summaryClassName="cursor-pointer text-sm font-semibold text-slate-900"
          >
            <label htmlFor="productName" className="block text-sm font-medium text-slate-700">
              상품명
            </label>
            <input
              id="productName"
              name="productName"
              value={productName}
              onChange={(e) => {
                markPlanEdited();
                setProductName(e.target.value);
              }}
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
              onChange={(e) => {
                markPlanEdited();
                setConceptText(e.target.value);
              }}
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
          </AnimatedDetails>

        <AnimatedDetails
          className="rounded-lg border border-slate-200 bg-white p-5"
          summary={`운영 체크리스트 보기 (${operationChecklist.length}개)`}
          summaryClassName="cursor-pointer text-sm font-semibold text-slate-900"
        >
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {operationChecklist.map((c, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="list-disc">· {c}</span>
                <button
                  type="button"
                  onClick={() => removeChecklistItem(i)}
                  className="no-print shrink-0 cursor-pointer whitespace-nowrap rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
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
        </AnimatedDetails>

        <AnimatedDetails
          className="rounded-lg border border-slate-200 bg-white p-5"
          summary={`위험과 대응안 보기 (${risks.length}개)`}
          summaryClassName="cursor-pointer text-sm font-semibold text-slate-900"
        >
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {risks.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span>
                  <span className="font-medium text-slate-700">{r.risk}</span> — {r.mitigation}
                </span>
                <button
                  type="button"
                  onClick={() => removeRisk(i)}
                  className="no-print shrink-0 cursor-pointer whitespace-nowrap rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
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
        </AnimatedDetails>

        <AnimatedDetails
          className="rounded-lg border border-slate-200 bg-white p-5"
          summary={`KPI 보기 (${kpis.length}개)`}
          summaryClassName="cursor-pointer text-sm font-semibold text-slate-900"
        >
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
                    className="no-print shrink-0 cursor-pointer whitespace-nowrap rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
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
            onChange={(e) => {
              markPlanEdited();
              setKpiMemo(e.target.value);
            }}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </AnimatedDetails>

        <AnimatedDetails
          className="rounded-lg border border-slate-200 bg-white p-5"
          summary="운영 메모 보기"
          summaryClassName="cursor-pointer text-sm font-semibold text-slate-900"
        >
          <label htmlFor="memo" className="mt-2 block text-sm font-medium text-slate-700">
            메모
          </label>
          <textarea
            id="memo"
            name="memo"
            rows={3}
            value={memo}
            onChange={(e) => {
              markPlanEdited();
              setMemo(e.target.value);
            }}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </AnimatedDetails>
      </div>
      <aside className="no-print h-fit space-y-3 lg:sticky lg:top-6">
        {saveFeedback === "ERROR" ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {state.message ?? "변경사항을 저장하지 못했습니다. 다시 시도해주세요."}
          </div>
        ) : null}
        <section aria-label="실행안 저장" className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">저장·확정</h2>
            <p
              className={
                displaySaveStatus === "DIRTY"
                  ? "text-xs text-amber-600"
                  : displaySaveStatus === "SAVING"
                    ? "text-xs text-sky-600"
                    : displaySaveStatus === "SAVED"
                      ? "text-xs text-emerald-600"
                      : displaySaveStatus === "ERROR"
                        ? "text-xs text-red-600"
                        : "text-xs text-slate-500"
              }
              role="status"
              aria-label="저장 상태"
              aria-live="polite"
              data-save-client-stage={clientStage}
              data-save-diagnostic-code={
                displaySaveStatus === "ERROR" ? clientDiagnosticCode ?? state.code ?? "UNEXPECTED_SAVE_ERROR" : undefined
              }
            >
              {displaySaveStatus === "CLEAN"
                ? "현재 저장된 내용과 같습니다."
                : displaySaveStatus === "DIRTY"
                  ? "저장하지 않은 변경사항이 있습니다."
                  : displaySaveStatus === "SAVING"
                    ? "저장 중..."
                    : displaySaveStatus === "SAVED"
                      ? "모든 변경사항이 저장되었습니다."
                      : SAVE_PLAN_ERROR_MESSAGE}
            </p>
          </div>
          <p className="mt-1 text-xs text-slate-500">코스 편집을 마치면 저장해 실행안을 확정하세요.</p>
          <button
            type="submit"
            disabled={isPending}
            onClick={() => recordClientStage("BUTTON_CLICKED")}
            className="mt-3 w-full cursor-pointer rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "저장 중..." : "저장"}
          </button>
          <Link
            href={`/projects/${plan.projectId}/analysis`}
            className="mt-2 block w-full rounded-md border border-slate-300 px-4 py-2 text-center text-sm text-slate-700 hover:bg-slate-50"
          >
            전략 재선택
          </Link>
          <Link
            href={`/projects/${plan.projectId}/print`}
            className="mt-2 block w-full rounded-md border border-slate-300 px-4 py-2 text-center text-sm text-slate-700 hover:bg-slate-50"
          >
            인쇄/PDF 보기
          </Link>
        </section>
        {plan.festivalAnchor && anchorCandidates !== undefined ? (
          <section
            aria-label="축제 Anchor 연계 후보"
            className="rounded-lg border border-violet-200 bg-violet-50/50 p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-violet-950">축제 Anchor 연계 후보</h2>
              {anchorCandidates?.status === "AVAILABLE" ? (
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-violet-700">
                  {Object.values(visibleAnchorGroups).reduce((sum, group) => sum + group.length, 0)}개
                </span>
              ) : null}
            </div>
            <AnimatedDetails
              className="mt-3"
              summary="연계 후보 목록 보기"
              summaryClassName="cursor-pointer rounded border border-violet-200 bg-white px-2.5 py-2 text-xs font-medium text-violet-900 hover:bg-violet-50"
            >
              <p className="mt-2 text-xs text-violet-900/70">
                Anchor 시각은 고정합니다. 행사 전·후 연결을 제안할 뿐 자동으로 일정에 넣거나 재계획하지 않습니다.
                거리는 직선거리 추정입니다.
              </p>
              {anchorCandidates === null ? (
              <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Anchor 연계 후보를 불러오지 못했습니다. 기존 코스와 일반 추천 후보는 계속 사용할 수 있습니다.
              </p>
            ) : anchorCandidates.status !== "AVAILABLE" ? (
              <p className="mt-3 rounded-md border border-violet-200 bg-white px-3 py-2 text-xs text-violet-800">
                {anchorCandidates.message}
              </p>
            ) : Object.values(visibleAnchorGroups).every((group) => group.length === 0) ? (
              <p className="mt-3 rounded-md border border-violet-200 bg-white px-3 py-2 text-xs text-violet-800">
                표시할 새 연계 후보가 없습니다. 일반 추천 후보 풀을 함께 확인해주세요.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {visibleAnchorGroups.MEAL.length > 0 ? (
                  <div className="rounded border border-violet-200 bg-white p-2">
                    <p className="text-[11px] font-medium text-violet-900">식사 후보 추가 위치</p>
                    <div className="mt-1 flex gap-2 text-xs">
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          name="anchor-meal-position"
                          checked={anchorMealPosition === "BEFORE_ANCHOR"}
                          onChange={() => setAnchorMealPosition("BEFORE_ANCHOR")}
                        />
                        행사 전
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          name="anchor-meal-position"
                          checked={anchorMealPosition === "AFTER_ANCHOR"}
                          onChange={() => setAnchorMealPosition("AFTER_ANCHOR")}
                        />
                        행사 후
                      </label>
                    </div>
                  </div>
                ) : null}
                {(["PRE_EVENT", "MEAL", "POST_EVENT", "STAY"] as const).map((role) => {
                  const group = visibleAnchorGroups[role];
                  if (group.length === 0) return null;
                  const heading = role === "PRE_EVENT" ? "행사 전 연결" : role === "MEAL" ? "식사 연결" : role === "POST_EVENT" ? "행사 후 연결" : "숙박 연결";
                  return (
                    <div key={role}>
                      <h3 className="mb-1 text-xs font-semibold text-slate-800">{heading}</h3>
                      <ul className="space-y-2">
                        {group.map((candidate) => (
                          <AnchorCandidateCard
                            key={`${role}-${candidate.id}`}
                            candidate={candidate}
                            petEvidence={
                              plan.petConditionActive
                                ? plan.petEvidenceByPoiId?.[candidate.id] ?? unknownPetEvidence({ repositoryUnavailable: plan.petEvidenceRepositoryUnavailable })
                                : undefined
                            }
                            accessibilityEvidence={
                              plan.accessibilityConditionActive
                                ? plan.accessibilityEvidenceByPoiId?.[candidate.id] ?? unknownAccessibilityEvidence({ repositoryUnavailable: plan.accessibilityEvidenceRepositoryUnavailable })
                                : undefined
                            }
                            onAdd={() => addAnchorCandidate(candidate)}
                          />
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
              {anchorCandidateMessage ? (
                <p className="mt-2 text-xs font-medium text-violet-800" role="status">
                  {anchorCandidateMessage}
                </p>
              ) : null}
            </AnimatedDetails>
          </section>
        ) : null}
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">추천 후보</h2>
            {candidatePois !== null ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                {visibleCandidates.length}개
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            코스 아래에 길게 나열하지 않고 별도 패널에서 검토합니다. 관광 목적지와 보조 자원을 구분하며,
            마음에 드는 장소만 날짜를 선택해 추가할 수 있습니다.
          </p>
          <AnimatedDetails
            className="mt-3"
            open={candidatePanelOpen}
            onOpenChange={setCandidatePanelOpen}
            summary={`후보 목록 ${candidatePanelOpen ? "닫기" : "열기"}`}
            summaryClassName="cursor-pointer rounded border border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <div className="mt-2 max-h-[min(70vh,640px)] overflow-y-auto pr-1">
              {candidatePois === null ? (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  추천 후보를 불러오지 못했습니다. 기존 일정은 그대로 편집·저장할 수 있습니다.
                </p>
              ) : visibleCandidates.length === 0 ? (
                <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  현재 조건에서 추가로 추천할 수 있는 장소가 없습니다.
                </p>
              ) : (
                <ul className="grid grid-cols-1 gap-2">
                  {visibleCandidateItems.map(({ candidate, proximityKm }) => {
                    const selectedDay = candidateAddDay[candidate.id] ?? days[0]?.dayIndex ?? 1;
                    return (
                      <CandidateCard
                        key={candidate.id}
                        candidate={candidate}
                        petEvidence={
                          plan.petConditionActive
                            ? plan.petEvidenceByPoiId?.[candidate.id] ?? unknownPetEvidence({ repositoryUnavailable: plan.petEvidenceRepositoryUnavailable })
                            : undefined
                        }
                        accessibilityEvidence={
                          plan.accessibilityConditionActive
                            ? plan.accessibilityEvidenceByPoiId?.[candidate.id] ?? unknownAccessibilityEvidence({ repositoryUnavailable: plan.accessibilityEvidenceRepositoryUnavailable })
                            : undefined
                        }
                        days={days}
                        proximityKm={proximityKm}
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
            </div>
          </AnimatedDetails>
        </section>
      </aside>
      </div>
      </DndContext>
    </form>
  );
}

function CourseStudioFlow({
  strategyName,
  days,
  quality,
}: {
  strategyName?: string | null;
  days: CourseDay[];
  quality: CourseQualityReport;
}) {
  const placeCount = days.reduce((sum, day) => sum + day.items.length + (day.lodging ? 1 : 0), 0);
  const blockerCount = quality.warnings.filter((warning) => warning.severity === "BLOCKER").length;
  const reviewCount = quality.warnings.filter((warning) => warning.severity === "REVIEW").length;
  const qualitySummary = blockerCount > 0 ? `수정 권장 ${blockerCount}건` : reviewCount > 0 ? `확인 권장 ${reviewCount}건` : "추가 확인 없음";
  const steps = ["선택 전략", "자동 생성 코스", "직접 편집", "실시간 검증", "저장·확정"];

  return (
    <section
      aria-label="Course Studio 실행 흐름"
      data-testid="course-studio-flow"
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">코스 스튜디오</p>
          <h2 className="mt-1 text-base font-semibold text-slate-900">선택한 전략을 실행 가능한 코스로 완성하세요</h2>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5 text-[11px]">
          <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{days.length}일 일정 · {placeCount}개 장소</span>
          <span className={`rounded-full px-2 py-1 ${blockerCount > 0 ? "bg-red-50 text-red-700" : reviewCount > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
            {qualitySummary}
          </span>
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">{strategyName ? `선택 전략 · ${strategyName}` : "선택 전략이 자동 코스에 반영되었습니다."}</p>
      <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="실행안 작업 단계">
        {steps.map((step, index) => (
          <li
            key={step}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs ${index === 1 || index === 2 || index === 3 ? "border-slate-300 bg-slate-50 font-medium text-slate-800" : "border-slate-200 text-slate-500"}`}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">{index + 1}</span>
            {step}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] text-slate-500">현재 2~4단계입니다. 장소·시간을 조정하면 확인사항이 즉시 갱신되고, 편집을 마치면 저장하세요.</p>
    </section>
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
  petEvidence,
  accessibilityEvidence,
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
  petEvidence?: PetEvidenceDisplay;
  accessibilityEvidence?: AccessibilityEvidenceDisplay;
}) {
  const isAnchor = isFestivalAnchorItem(item);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: SCHEDULE_ITEM_DND_PREFIX + item.poiId,
    disabled: isAnchor,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const leisureType = classifyLeisureActivity(item.lclsSystm1, item.lclsSystm2);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm ${
        isAnchor ? "border-violet-300 bg-violet-50" : infeasible ? "border-red-300 bg-red-50" : "border-slate-100 bg-slate-50"
      }`}
    >
      <div className="flex items-start gap-2">
        {isAnchor ? (
          <span className="mt-0.5 rounded bg-violet-700 px-1.5 py-0.5 text-[10px] font-semibold text-white">축제 Anchor</span>
        ) : (
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`${item.poiName} 드래그로 순서·날짜 변경`}
            className="no-print mt-0.5 cursor-grab touch-none rounded border border-slate-200 bg-white px-1 py-0.5 text-slate-400 active:cursor-grabbing"
          >
            ⋮⋮
          </button>
        )}
        <div>
          <span className="font-medium text-slate-800">
            {isAnchor ? (
              <span className="mr-1 text-violet-800">{formatFestivalAnchorCourseTime(item)}</span>
            ) : (
              <input
                type="time"
                value={item.timeSlot}
                onChange={(e) => onUpdateItemTime(day.dayIndex, idx, e.target.value)}
                aria-label={`${item.poiName} 시간`}
                className="mr-1 rounded border border-slate-300 px-1 py-0.5 text-sm"
              />
            )}
            {item.poiName}
          </span>
          {isAnchor ? (
            <span className="ml-2 text-xs text-violet-800">
              ({item.anchorEventStartDate}~{item.anchorEventEndDate} · {item.stayMinutes}분 고정 · 출처 ID {item.anchorSourceId ?? "확인 필요"})
            </span>
          ) : (
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
          )}
          {idx > 0 && transport === "PRIVATE_VEHICLE" ? (
            <span className="ml-1 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-500">
              {travelSourceLabel(item.travelSource)}
            </span>
          ) : null}
          {infeasible ? (
            <p className="mt-0.5 text-xs font-medium text-red-600">일정 조정 필요: {feasibilityReason}</p>
          ) : null}
          {fit && !isAnchor ? (
            <AnimatedDetails
              className="mt-1"
              summary={
                <>
                  <span
                    className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${resolveFitBadge(fit).className}`}
                  >
                    {resolveFitBadge(fit).label}
                  </span>
                  <span className="ml-1 text-slate-400">이동·선택 근거</span>
                </>
              }
              summaryClassName="cursor-pointer text-xs"
            >
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
            </AnimatedDetails>
          ) : null}
          {petEvidence && !isAnchor ? <PetEvidenceBadge evidence={petEvidence} compact /> : null}
          {accessibilityEvidence && !isAnchor ? <AccessibilityEvidenceBadge evidence={accessibilityEvidence} compact /> : null}
        </div>
      </div>
      <div className="no-print flex items-center gap-1">
        {isAnchor ? (
          <button
            type="button"
            onClick={() => onRemoveItem(day.dayIndex, idx)}
            className="cursor-pointer rounded border border-red-200 bg-white px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
            aria-label={`${item.poiName} 코스에서만 제거`}
          >
            코스에서만 제거
          </button>
        ) : (
          <>
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
              className="shrink-0 cursor-pointer whitespace-nowrap rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
              aria-label={`${item.poiName} 삭제`}
            >
              삭제
            </button>
          </>
        )}
      </div>
    </li>
  );
}

/** 추천 후보 카드(Phase B 2단계, 2026-08-16) — 기존 날짜 select + "이 날짜에 추가" 버튼은 그대로
 * 두고, 드래그 손잡이만 추가해 원하는 일정 위치로 직접 끌어다 놓을 수 있게 한다. */
function CandidateCard({
  candidate,
  days,
  proximityKm,
  selectedDay,
  onSelectDay,
  onAdd,
  petEvidence,
  accessibilityEvidence,
}: {
  candidate: CandidatePoi;
  days: CourseDay[];
  proximityKm: number | null;
  selectedDay: number;
  onSelectDay: (dayIndex: number) => void;
  onAdd: () => void;
  petEvidence?: PetEvidenceDisplay;
  accessibilityEvidence?: AccessibilityEvidenceDisplay;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: CANDIDATE_DND_PREFIX + candidate.id,
  });
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 };
  const badge = resolveFitBadge(candidate.fit);
  const reason = candidate.fit.positiveReasons[0] ?? candidate.fit.cautions[0] ?? null;
  const leisureType = classifyLeisureActivity(candidate.lclsSystm1, candidate.lclsSystm2);
  const representation = candidate.representation ?? "UNKNOWN";
  const isSupportCandidate = candidate.recommendationStatus === "DEMOTE";
  const proximityLabel =
    proximityKm === null
      ? null
      : proximityKm < 1
        ? `${Math.max(0.1, proximityKm).toFixed(1)}km`
        : `${proximityKm.toFixed(1)}km`;

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
            <div className="mt-0.5 flex flex-wrap gap-1 text-[10px]">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">{poiCategoryLabel(candidate.category)}</span>
              <span
                className={`rounded px-1.5 py-0.5 ${isSupportCandidate ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}
              >
                {poiRepresentationLabel(representation)}
              </span>
            </div>
            {leisureType ? <p className="mt-0.5 text-slate-500">공식 분류: {leisureType.label}</p> : null}
          </div>
        </div>
        <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] ${badge.className}`}>
          {badge.label}
        </span>
      </div>
      {isSupportCandidate ? (
        <p className="mt-2 text-amber-700">자동 코스에는 넣지 않고, 직접 확인할 보조 후보입니다.</p>
      ) : reason ? (
        <p className="mt-2 text-slate-500">{reason}</p>
      ) : null}
      {proximityLabel ? <p className="mt-1 text-slate-500">현재 코스 기준 직선거리 약 {proximityLabel}</p> : null}
      {petEvidence ? <PetEvidenceBadge evidence={petEvidence} compact /> : null}
      {accessibilityEvidence ? <AccessibilityEvidenceBadge evidence={accessibilityEvidence} compact /> : null}
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

function AnchorCandidateCard({
  candidate,
  petEvidence,
  accessibilityEvidence,
  onAdd,
}: {
  candidate: AnchorCandidate;
  petEvidence?: PetEvidenceDisplay;
  accessibilityEvidence?: AccessibilityEvidenceDisplay;
  onAdd: () => void;
}) {
  const badge = resolveFitBadge(candidate.fit);
  return (
    <li className="rounded-md border border-violet-200 bg-white p-2.5 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-slate-800">{candidate.name}</p>
          <div className="mt-0.5 flex flex-wrap gap-1 text-[10px]">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{poiCategoryLabel(candidate.category)}</span>
            <span className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-800">직선거리 {candidate.distanceLabel}</span>
          </div>
        </div>
        <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] ${badge.className}`}>{badge.label}</span>
      </div>
      <p className="mt-1.5 text-slate-600">{candidate.reason}</p>
      {candidate.fit.dataSource.operatingHoursConfirmed ? (
        <p className="mt-1 text-[11px] text-slate-500">운영시간: {candidate.fit.dataSource.operatingHoursText}</p>
      ) : (
        <p className="mt-1 text-[11px] text-amber-700">운영시간 확인 필요</p>
      )}
      {petEvidence ? <PetEvidenceBadge evidence={petEvidence} compact /> : null}
      {accessibilityEvidence ? <AccessibilityEvidenceBadge evidence={accessibilityEvidence} compact /> : null}
      <button
        type="button"
        onClick={onAdd}
        className="mt-2 w-full cursor-pointer rounded border border-violet-300 bg-white px-2 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-50"
        aria-label={`${candidate.name} ${candidate.roleLabel} 후보를 일정에 추가`}
      >
        {candidate.role === "STAY" ? "숙박 슬롯에 추가" : candidate.role === "PRE_EVENT" ? "Anchor 앞에 추가" : candidate.role === "MEAL" ? "선택한 위치에 추가" : "Anchor 뒤에 추가"}
      </button>
    </li>
  );
}
