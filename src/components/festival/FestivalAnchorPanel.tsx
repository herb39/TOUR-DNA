"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  FESTIVAL_ANCHOR_TIME_SLOT_CODES,
  getFestivalAnchorDayCount,
  getFestivalAnchorPlannedDates,
  type FestivalAnchorActionState,
} from "@/lib/domain/festivalAnchorProject";
import { festivalAnchorCandidateId, type FestivalAnchorCandidate } from "@/lib/domain/festivalAnchor";
import type { FestivalAnchorLookup } from "@/lib/services/festivalAnchorService";
import type { ProjectAnchorRecord } from "@/lib/services/projectAnchorService";

const STORAGE_PREFIX = "tour-dna:anchor-event:";

type AnchorFormAction = (
  state: FestivalAnchorActionState,
  formData: FormData,
) => Promise<FestivalAnchorActionState>;

const unavailableAction: AnchorFormAction = async () => ({
  success: false,
  message: "이 화면에서는 서버 확정 작업을 사용할 수 없습니다.",
});

const TIME_SLOT_LABELS: Record<(typeof FESTIVAL_ANCHOR_TIME_SLOT_CODES)[number], string> = {
  MORNING: "오전 기획 블록",
  AFTERNOON: "오후 기획 블록",
  EVENING: "저녁 기획 블록",
  CUSTOM: "직접 입력 시각",
};

function formatDate(value: string): string {
  return value.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1.$2.$3");
}

function formatAnchorTime(anchor: ProjectAnchorRecord): string {
  if (anchor.timeStatus === "UNCONFIRMED") return "공식 행사 시각 미확정";
  if (anchor.timeSlot === "CUSTOM" && anchor.timeStart && anchor.timeEnd) {
    return `${anchor.timeStart}~${anchor.timeEnd} (기획자 지정)`;
  }
  return `${anchor.timeSlot ? TIME_SLOT_LABELS[anchor.timeSlot] : "시간대 미기록"} (기획자 지정)`;
}

export function FestivalAnchorPanel(props: {
  projectId: string;
  regionName: string;
  travelYear: number;
  travelMonth: number;
  duration?: string;
  projectUpdatedAt?: string;
  lookup: FestivalAnchorLookup;
  initialAnchor?: ProjectAnchorRecord | null;
  anchorStorage?: "AVAILABLE" | "UNAVAILABLE";
  anchorStorageMessage?: string;
  saveAction?: AnchorFormAction;
  deleteAction?: AnchorFormAction;
}) {
  const { lookup } = props;
  const storageKey = `${STORAGE_PREFIX}${props.projectId}`;
  const serverCandidateId = props.initialAnchor ? festivalAnchorCandidateId(props.initialAnchor.sourceId) : null;
  const candidateIds = useMemo(() => new Set(lookup.candidates.map((candidate) => candidate.id)), [lookup.candidates]);
  const dayCount = getFestivalAnchorDayCount(props.duration ?? "DAY_TRIP") ?? 1;
  const [selectedId, setSelectedId] = useState<string | null>(serverCandidateId);
  const [plannedDate, setPlannedDate] = useState(props.initialAnchor?.plannedDate ?? "");
  const [plannedDayIndex, setPlannedDayIndex] = useState(
    props.initialAnchor?.plannedDayIndex ? String(props.initialAnchor.plannedDayIndex) : "",
  );
  const [timeStatus, setTimeStatus] = useState<"" | "UNCONFIRMED" | "USER_CONFIRMED">(
    props.initialAnchor?.timeStatus ?? "",
  );
  const [timeSlot, setTimeSlot] = useState<string>(props.initialAnchor?.timeSlot ?? "");
  const [timeStart, setTimeStart] = useState(props.initialAnchor?.timeStart ?? "");
  const [timeEnd, setTimeEnd] = useState(props.initialAnchor?.timeEnd ?? "");
  const [hydrated, setHydrated] = useState(false);
  const selectionTouchedRef = useRef(false);
  const saveFormAction = props.saveAction ?? unavailableAction;
  const deleteFormAction = props.deleteAction ?? unavailableAction;
  const [saveState, saveAction, isSavePending] = useActionState(saveFormAction, { success: false });
  const [deleteState, deleteAction, isDeletePending] = useActionState(deleteFormAction, { success: false });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        if (!selectionTouchedRef.current && props.initialAnchor) {
          setSelectedId(serverCandidateId);
        } else if (!selectionTouchedRef.current && !props.initialAnchor) {
          const storedId = window.localStorage.getItem(storageKey);
          setSelectedId(storedId && candidateIds.has(storedId) ? storedId : null);
        }
      } catch {
        if (!props.initialAnchor) setSelectedId(null);
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [candidateIds, props.initialAnchor, serverCandidateId, storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (selectedId) window.localStorage.setItem(storageKey, selectedId);
      else window.localStorage.removeItem(storageKey);
    } catch {
      // 브라우저 저장소가 차단되어도 서버 확정과 후보 확인은 계속 가능하게 둔다.
    }
  }, [hydrated, selectedId, storageKey]);

  const selectedCandidate = lookup.candidates.find((candidate) => candidate.id === selectedId) ?? null;
  const plannedDates = selectedCandidate
    ? getFestivalAnchorPlannedDates({
        eventStartDate: selectedCandidate.startDate,
        eventEndDate: selectedCandidate.endDate,
        travelYear: props.travelYear,
        travelMonth: props.travelMonth,
      })
    : [];
  const hasSavedAnchor = props.initialAnchor !== null && props.initialAnchor !== undefined;
  const isChangingSavedAnchor = hasSavedAnchor && selectedId !== serverCandidateId;
  const customTimeInvalid = timeSlot === "CUSTOM" && (!/^\d{2}:\d{2}$/.test(timeStart) || !/^\d{2}:\d{2}$/.test(timeEnd));
  const canSubmit = Boolean(
    selectedCandidate &&
      plannedDate &&
      plannedDayIndex &&
      timeStatus &&
      (timeStatus === "UNCONFIRMED" || (timeSlot && !customTimeInvalid)) &&
      props.anchorStorage !== "UNAVAILABLE",
  );

  const selectCandidate = (candidate: FestivalAnchorCandidate) => {
    selectionTouchedRef.current = true;
    const nextSelectedId = selectedId === candidate.id ? null : candidate.id;
    setSelectedId(nextSelectedId);
    if (nextSelectedId === serverCandidateId && props.initialAnchor) {
      setPlannedDate(props.initialAnchor.plannedDate);
      setPlannedDayIndex(String(props.initialAnchor.plannedDayIndex));
      setTimeStatus(props.initialAnchor.timeStatus);
      setTimeSlot(props.initialAnchor.timeSlot ?? "");
      setTimeStart(props.initialAnchor.timeStart ?? "");
      setTimeEnd(props.initialAnchor.timeEnd ?? "");
    } else if (nextSelectedId) {
      // 행사 기간이 여러 날이면 시작일을 자동 확정하지 않고, 사용자가 날짜를 직접 선택하게 한다.
      setPlannedDate("");
      setPlannedDayIndex("");
      setTimeStatus("");
      setTimeSlot("");
      setTimeStart("");
      setTimeEnd("");
    }
  };

  const onTimeStatusChange = (value: "" | "UNCONFIRMED" | "USER_CONFIRMED") => {
    setTimeStatus(value);
    if (value === "UNCONFIRMED" || value === "") {
      setTimeSlot("");
      setTimeStart("");
      setTimeEnd("");
    }
  };

  return (
    <section className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-5" aria-labelledby="festival-anchor-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-indigo-700">기획 계기</p>
          <h2 id="festival-anchor-title" className="mt-1 text-base font-semibold text-slate-900">
            축제·이벤트 연계 후보
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            {props.regionName} · {props.travelYear}년 {props.travelMonth}월 · 행사 기간이 여행월과 겹치는 후보입니다.
          </p>
        </div>
        {lookup.status === "AVAILABLE" ? (
          <span className="rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-700">
            {selectedId ? "1건 선택됨" : "선택 전"}
          </span>
        ) : null}
      </div>

      {props.anchorStorage === "UNAVAILABLE" ? (
        <div role="alert" className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          {props.anchorStorageMessage ?? "프로젝트 Anchor 서버 저장 구조가 아직 적용되지 않았습니다."} 후보 선택은 계속
          확인할 수 있지만, 명시적 확정 저장은 DB 적용 후 사용할 수 있습니다.
        </div>
      ) : null}

      {hasSavedAnchor ? (
        <section className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-4" aria-label="현재 확정된 축제 Anchor">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold text-emerald-700">현재 프로젝트에 확정 저장됨</p>
              <h3 className="mt-1 text-sm font-semibold text-slate-900">{props.initialAnchor?.name}</h3>
              <p className="mt-1 text-xs text-slate-700">
                {formatDate(props.initialAnchor!.plannedDate)} · {props.initialAnchor!.plannedDayIndex}일차 · {formatAnchorTime(props.initialAnchor!)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                공식 행사 기간 {formatDate(props.initialAnchor!.eventStartDate)} ~ {formatDate(props.initialAnchor!.eventEndDate)} · 저장된
                스냅샷은 원천 API 변경으로 자동 갱신되지 않습니다.
              </p>
            </div>
            <form action={deleteAction}>
              <input type="hidden" name="expectedProjectUpdatedAt" value={props.projectUpdatedAt ?? ""} />
              <button
                type="submit"
                disabled={isDeletePending || props.anchorStorage === "UNAVAILABLE"}
                className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeletePending ? "삭제 중..." : "확정 Anchor 삭제"}
              </button>
            </form>
          </div>
        </section>
      ) : null}

      {deleteState.message ? (
        <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-xs text-red-700">
          {deleteState.message}
        </p>
      ) : null}

      {lookup.status === "AVAILABLE" ? (
        <>
          <p className="mt-3 text-xs text-slate-600">
            후보를 고른 뒤 연계 날짜·일차·시간 조건을 직접 확인해야 프로젝트 Anchor로 저장됩니다. 저장해도 현재 코스와 전략 점수는 바뀌지 않습니다.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {lookup.candidates.map((candidate) => {
              const selected = selectedId === candidate.id;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => selectCandidate(candidate)}
                  className={`rounded-lg border p-4 text-left transition ${
                    selected
                      ? "border-indigo-500 bg-white ring-2 ring-indigo-200"
                      : "border-slate-200 bg-white hover:border-indigo-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-900">{candidate.name}</h3>
                    <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                      {selected ? "선택됨" : "선택"}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-700">
                    {formatDate(candidate.startDate)} ~ {formatDate(candidate.endDate)}
                  </p>
                  {candidate.address ? <p className="mt-1 text-xs text-slate-500">{candidate.address}</p> : null}
                </button>
              );
            })}
          </div>

          {selectedCandidate ? (
            <form action={saveAction} className="mt-4 rounded-md border border-slate-200 bg-white p-4">
              <input type="hidden" name="candidateId" value={selectedCandidate.id} />
              <input type="hidden" name="expectedProjectUpdatedAt" value={props.projectUpdatedAt ?? ""} />
              <input type="hidden" name="timeStatus" value={timeStatus} />
              <input type="hidden" name="timeSlot" value={timeSlot} />
              <input type="hidden" name="timeStart" value={timeStart} />
              <input type="hidden" name="timeEnd" value={timeEnd} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Anchor 확정 조건</h3>
                  <p className="mt-1 text-[11px] text-slate-500">행사 시작일을 여행 시작일로 간주하지 않습니다. 실제 연계 날짜와 일차를 직접 지정해주세요.</p>
                </div>
                {isChangingSavedAnchor ? (
                  <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">기존 Anchor 변경</span>
                ) : null}
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="text-xs font-medium text-slate-700">
                  연계 날짜
                  <select
                    name="plannedDate"
                    value={plannedDate}
                    onChange={(event) => setPlannedDate(event.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm font-normal"
                  >
                    <option value="">날짜 선택</option>
                    {plannedDates.map((date) => (
                      <option key={date} value={date}>
                        {formatDate(date)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-700">
                  여행 일차
                  <select
                    name="plannedDayIndex"
                    value={plannedDayIndex}
                    onChange={(event) => setPlannedDayIndex(event.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm font-normal"
                  >
                    <option value="">일차 선택</option>
                    {Array.from({ length: dayCount }, (_, index) => index + 1).map((dayIndex) => (
                      <option key={dayIndex} value={dayIndex}>
                        {dayIndex}일차
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-700">
                  시간 조건
                  <select
                    value={timeStatus}
                    onChange={(event) => onTimeStatusChange(event.target.value as typeof timeStatus)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm font-normal"
                  >
                    <option value="">시간 조건 선택</option>
                    <option value="UNCONFIRMED">공식 시각 미확정</option>
                    <option value="USER_CONFIRMED">기획 시간대 지정</option>
                  </select>
                </label>
              </div>
              {timeStatus === "UNCONFIRMED" ? (
                <p className="mt-2 text-[11px] text-slate-500">현재 공식 API에는 정확한 행사 시각이 없어, 시각을 지어내지 않고 미확정 상태로 저장합니다.</p>
              ) : null}
              {timeStatus === "USER_CONFIRMED" ? (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="text-xs font-medium text-slate-700 sm:col-span-1">
                    기획 시간대
                    <select
                      value={timeSlot}
                      onChange={(event) => {
                        setTimeSlot(event.target.value);
                        if (event.target.value !== "CUSTOM") {
                          setTimeStart("");
                          setTimeEnd("");
                        }
                      }}
                      className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm font-normal"
                    >
                      <option value="">시간대 선택</option>
                      {FESTIVAL_ANCHOR_TIME_SLOT_CODES.map((slot) => (
                        <option key={slot} value={slot}>
                          {TIME_SLOT_LABELS[slot]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {timeSlot === "CUSTOM" ? (
                    <>
                      <label className="text-xs font-medium text-slate-700">
                        시작 시각
                        <input type="time" value={timeStart} onChange={(event) => setTimeStart(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm font-normal" />
                      </label>
                      <label className="text-xs font-medium text-slate-700">
                        종료 시각
                        <input type="time" value={timeEnd} onChange={(event) => setTimeEnd(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm font-normal" />
                      </label>
                    </>
                  ) : null}
                </div>
              ) : null}
              {saveState.message ? (
                <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-xs text-red-700">
                  {saveState.message}
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={isSavePending || !canSubmit}
                  className="rounded-md bg-indigo-700 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSavePending ? "Anchor 확정 저장 중..." : hasSavedAnchor ? "변경한 Anchor 확정 저장" : "이 조건으로 Anchor 확정"}
                </button>
                {!canSubmit && !saveState.message ? <span className="text-[11px] text-slate-500">날짜·일차·시간 조건을 모두 선택해주세요.</span> : null}
              </div>
            </form>
          ) : null}
        </>
      ) : (
        <div className="mt-3 rounded-md border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
          {lookup.message}
          {hasSavedAnchor ? <p className="mt-2 text-xs text-emerald-700">현재 확정된 Anchor 스냅샷은 위에 보존되어 있습니다.</p> : null}
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-400">
        출처: {lookup.provenance.provider} {lookup.provenance.dataset} · 조회 시각 {lookup.provenance.fetchedAt.replace("T", " ").slice(0, 16)}
      </p>
      <p className="mt-1 text-[11px] text-slate-400">
        후보 선택은 임시 브라우저 상태로도 가능하지만, 다른 브라우저와 공유되는 상태는 사용자가 확정 저장한 Anchor뿐입니다. 코스 삽입과 전략 점수 변경은 이 단계에서 하지 않습니다.
      </p>
    </section>
  );
}
