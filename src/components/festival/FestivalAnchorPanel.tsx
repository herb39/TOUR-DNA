"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FestivalAnchorCandidate } from "@/lib/domain/festivalAnchor";
import type { FestivalAnchorLookup } from "@/lib/services/festivalAnchorService";

const STORAGE_PREFIX = "tour-dna:anchor-event:";

function formatDate(value: string): string {
  return value.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1.$2.$3");
}

export function FestivalAnchorPanel(props: {
  projectId: string;
  regionName: string;
  travelYear: number;
  travelMonth: number;
  lookup: FestivalAnchorLookup;
}) {
  const { lookup } = props;
  const storageKey = `${STORAGE_PREFIX}${props.projectId}`;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const selectionTouchedRef = useRef(false);
  const candidateIds = useMemo(() => new Set(lookup.candidates.map((candidate) => candidate.id)), [lookup.candidates]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const storedId = window.localStorage.getItem(storageKey);
        if (!selectionTouchedRef.current) {
          setSelectedId(storedId && candidateIds.has(storedId) ? storedId : null);
        }
      } catch {
        setSelectedId(null);
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [candidateIds, storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (selectedId) window.localStorage.setItem(storageKey, selectedId);
      else window.localStorage.removeItem(storageKey);
    } catch {
      // 브라우저 저장소가 차단된 환경에서도 후보 확인·선택 자체는 계속 가능하게 둔다.
    }
  }, [hydrated, selectedId, storageKey]);

  const selectCandidate = (candidate: FestivalAnchorCandidate) => {
    selectionTouchedRef.current = true;
    setSelectedId((current) => (current === candidate.id ? null : candidate.id));
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

      {lookup.status === "AVAILABLE" ? (
        <>
          <p className="mt-3 text-xs text-slate-600">연계할 행사를 하나 선택하세요. 선택해도 현재 코스나 전략 점수는 바뀌지 않습니다.</p>
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
        </>
      ) : (
        <div className="mt-3 rounded-md border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
          {lookup.message}
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-400">
        출처: {lookup.provenance.provider} {lookup.provenance.dataset} · 조회 시각 {lookup.provenance.fetchedAt.replace("T", " ").slice(0, 16)}
      </p>
      <p className="mt-1 text-[11px] text-slate-400">선택 상태는 현재 브라우저에 보관됩니다. 코스 반영과 서버 저장은 다음 단계에서 연결합니다.</p>
    </section>
  );
}
