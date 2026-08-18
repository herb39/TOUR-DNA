"use client";

import { useActionState } from "react";
import { savePoiCurationAction, type SavePoiCurationState } from "@/app/admin/poi-curation/actions";

export type PoiCurationManagerRow = {
  id: string;
  name: string;
  categoryLabel: string;
  address: string;
  sourceTypeLabel: string;
  externalId: string | null;
  officialClassification: string;
  status: "UNREVIEWED" | "APPROVED" | "REJECTED";
  representation: "UNKNOWN" | "DESTINATION" | "SUPPORT" | "CONSUMPTION" | "LODGING";
  representativeness: number | null;
  reason: string;
  sourceLabel: string;
  reviewedAt: string | null;
  currentDecisionLabel: string;
  currentDecisionTone: "allow" | "demote" | "exclude";
};

const STATUS_OPTIONS = [
  { value: "UNREVIEWED", label: "미검수" },
  { value: "APPROVED", label: "승인" },
  { value: "REJECTED", label: "제외" },
] as const;

const REPRESENTATION_OPTIONS = [
  { value: "UNKNOWN", label: "미분류" },
  { value: "DESTINATION", label: "관광 목적지" },
  { value: "SUPPORT", label: "보조 자원" },
  { value: "CONSUMPTION", label: "소비 접점" },
  { value: "LODGING", label: "숙박" },
] as const;

const initialState: SavePoiCurationState = { success: false };

function decisionToneClass(tone: PoiCurationManagerRow["currentDecisionTone"]): string {
  if (tone === "allow") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "demote") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-300 bg-slate-100 text-slate-600";
}

function CurationRow({ row }: { row: PoiCurationManagerRow }) {
  const [state, formAction, isPending] = useActionState(savePoiCurationAction, initialState);

  return (
    <form action={formAction} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <input type="hidden" name="poiId" value={row.id} />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">{row.name}</h2>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
              {row.categoryLabel}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${decisionToneClass(row.currentDecisionTone)}`}>
              현재 판정: {row.currentDecisionLabel}
            </span>
          </div>
          <p className="mt-1 break-words text-xs text-slate-600">{row.address || "주소 없음"}</p>
          <p className="mt-1 text-[11px] text-slate-400">
            {row.sourceTypeLabel} · 공식 분류 {row.officialClassification}
            {row.externalId ? ` · 외부 ID ${row.externalId}` : ""}
          </p>
        </div>
        <span className="shrink-0 text-[11px] text-slate-400">
          {row.reviewedAt ? `최근 검수 ${row.reviewedAt}` : "아직 검수하지 않음"}
        </span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-[180px_180px_120px_1fr]">
        <label className="block text-xs font-medium text-slate-700">
          검수 상태
          <select
            name="status"
            defaultValue={row.status}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-medium text-slate-700">
          대표성 유형
          <select
            name="representation"
            defaultValue={row.representation}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {REPRESENTATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-medium text-slate-700">
          대표성 점수
          <input
            name="representativeness"
            type="number"
            min={0}
            max={100}
            step={1}
            defaultValue={row.representativeness ?? ""}
            placeholder="0~100"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="block text-xs font-medium text-slate-700 md:col-span-2 xl:col-span-1">
          검수 사유
          <textarea
            name="reason"
            defaultValue={row.reason}
            rows={2}
            maxLength={1000}
            placeholder="현장성·중복·대표성 판단 근거"
            className="mt-1 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block flex-1 text-xs font-medium text-slate-700">
          출처 라벨
          <input
            name="sourceLabel"
            defaultValue={row.sourceLabel}
            maxLength={200}
            placeholder="예: 현장 인터뷰, 지자체 확인, 운영자 검수"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <div className="flex items-center gap-3 sm:pb-0.5">
          {state.message ? (
            <p role={state.success ? "status" : "alert"} className={`text-xs ${state.success ? "text-emerald-600" : "text-red-600"}`}>
              {state.message}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={isPending}
            className="shrink-0 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "저장 중..." : "검수 저장"}
          </button>
        </div>
      </div>
    </form>
  );
}

export function PoiCurationManager({ rows }: { rows: PoiCurationManagerRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <p className="text-sm font-medium text-slate-700">조건에 맞는 POI가 없습니다.</p>
        <p className="mt-1 text-xs text-slate-500">지역·상태·검색어를 바꿔 다시 조회해보세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <CurationRow key={row.id} row={row} />
      ))}
    </div>
  );
}
