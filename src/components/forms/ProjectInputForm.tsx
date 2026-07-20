"use client";

import { useActionState, useMemo, useState } from "react";
import {
  AGE_GROUP_OPTIONS,
  BUDGET_LEVEL_OPTIONS,
  COMPANION_TYPE_OPTIONS,
  DURATION_OPTIONS,
  GROUP_TYPE_OPTIONS,
  NATIONALITY_OPTIONS,
  PRIMARY_GOAL_OPTIONS,
  ROLE_OPTIONS,
  TRANSPORT_OPTIONS,
} from "@/lib/validation/codes";
import type { RegionOption } from "@/lib/services/regionQueries";
import { createProjectAction, type CreateProjectFormState } from "@/app/projects/new/actions";
import { formatBaseYm } from "@/lib/format";

const initialState: CreateProjectFormState = { success: true, errors: {} };

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages || messages.length === 0) return null;
  return (
    <p className="mt-1 text-xs text-red-600" role="alert">
      {messages[0]}
    </p>
  );
}

export function ProjectInputForm({
  regionOptions,
  baseYm,
}: {
  regionOptions: RegionOption[];
  baseYm: string;
}) {
  const [state, formAction, isPending] = useActionState(createProjectAction, initialState);
  const [sidoCode, setSidoCode] = useState(regionOptions[0]?.code ?? "");
  const [ageGroups, setAgeGroups] = useState<string[]>([]);
  const [primaryGoal, setPrimaryGoal] = useState<string>(PRIMARY_GOAL_OPTIONS[0].code);
  const [secondaryGoal, setSecondaryGoal] = useState("");
  const [travelYear, setTravelYear] = useState(2026);
  const [travelMonth, setTravelMonth] = useState(9);

  const sigunguOptions = useMemo(
    () => regionOptions.find((r) => r.code === sidoCode)?.sigungus ?? [],
    [regionOptions, sidoCode],
  );

  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-8">
        {errors._root ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errors._root[0]}
          </div>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-900">기본 정보</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="projectName" className="block text-sm font-medium text-slate-700">
                프로젝트명
              </label>
              <input
                id="projectName"
                name="projectName"
                type="text"
                defaultValue="대전 9월 소규모 여행 기획"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <FieldError messages={errors.projectName} />
            </div>

            <fieldset>
              <legend className="block text-sm font-medium text-slate-700">역할</legend>
              <div className="mt-1 flex gap-4">
                {ROLE_OPTIONS.map((o) => (
                  <label key={o.code} className="flex items-center gap-1.5 text-sm text-slate-700">
                    <input type="radio" name="role" value={o.code} defaultChecked={o.code === "TRAVEL_AGENCY"} />
                    {o.label}
                  </label>
                ))}
              </div>
              <FieldError messages={errors.role} />
            </fieldset>

            <div>
              <label htmlFor="sidoCode" className="block text-sm font-medium text-slate-700">
                시·도
              </label>
              <select
                id="sidoCode"
                name="sidoCode"
                value={sidoCode}
                onChange={(e) => setSidoCode(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {regionOptions.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
              <FieldError messages={errors.sidoCode} />
            </div>

            <div>
              <label htmlFor="sigunguCode" className="block text-sm font-medium text-slate-700">
                시·군·구
              </label>
              <select
                id="sigunguCode"
                name="sigunguCode"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {sigunguOptions.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
              <FieldError messages={errors.sigunguCode} />
            </div>

            <div>
              <label htmlFor="travelYear" className="block text-sm font-medium text-slate-700">
                여행 연도
              </label>
              <select
                id="travelYear"
                name="travelYear"
                value={travelYear}
                onChange={(e) => setTravelYear(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {[2025, 2026, 2027, 2028].map((y) => (
                  <option key={y} value={y}>
                    {y}년
                  </option>
                ))}
              </select>
              <FieldError messages={errors.travelYear} />
            </div>

            <div>
              <label htmlFor="travelMonth" className="block text-sm font-medium text-slate-700">
                여행 월
              </label>
              <select
                id="travelMonth"
                name="travelMonth"
                value={travelMonth}
                onChange={(e) => setTravelMonth(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}월
                  </option>
                ))}
              </select>
              <FieldError messages={errors.travelMonth} />
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-900">타깃</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <fieldset>
              <legend className="block text-sm font-medium text-slate-700">내/외국인</legend>
              <div className="mt-1 flex gap-4">
                {NATIONALITY_OPTIONS.map((o) => (
                  <label key={o.code} className="flex items-center gap-1.5 text-sm text-slate-700">
                    <input type="radio" name="nationality" value={o.code} defaultChecked={o.code === "DOMESTIC"} />
                    {o.label}
                  </label>
                ))}
              </div>
              <FieldError messages={errors.nationality} />
            </fieldset>

            <div>
              <label htmlFor="companionType" className="block text-sm font-medium text-slate-700">
                동행 유형
              </label>
              <select
                id="companionType"
                name="companionType"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {COMPANION_TYPE_OPTIONS.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label}
                  </option>
                ))}
              </select>
              <FieldError messages={errors.companionType} />
            </div>

            <fieldset className="sm:col-span-2">
              <legend className="block text-sm font-medium text-slate-700">연령대 (복수 선택 가능)</legend>
              <div className="mt-1 flex flex-wrap gap-4">
                {AGE_GROUP_OPTIONS.map((o) => (
                  <label key={o.code} className="flex items-center gap-1.5 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      name="ageGroups"
                      value={o.code}
                      checked={ageGroups.includes(o.code)}
                      onChange={(e) => {
                        setAgeGroups((prev) =>
                          e.target.checked ? [...prev, o.code] : prev.filter((c) => c !== o.code),
                        );
                      }}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
              <FieldError messages={errors.ageGroups} />
            </fieldset>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-900">목표</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="primaryGoal" className="block text-sm font-medium text-slate-700">
                주 목표
              </label>
              <select
                id="primaryGoal"
                name="primaryGoal"
                value={primaryGoal}
                onChange={(e) => setPrimaryGoal(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {PRIMARY_GOAL_OPTIONS.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label}
                  </option>
                ))}
              </select>
              <FieldError messages={errors.primaryGoal} />
            </div>

            <div>
              <label htmlFor="secondaryGoal" className="block text-sm font-medium text-slate-700">
                보조 목표 (선택)
              </label>
              <select
                id="secondaryGoal"
                name="secondaryGoal"
                value={secondaryGoal}
                onChange={(e) => setSecondaryGoal(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">선택 안 함</option>
                {PRIMARY_GOAL_OPTIONS.filter((o) => o.code !== primaryGoal).map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label}
                  </option>
                ))}
              </select>
              <FieldError messages={errors.secondaryGoal} />
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-900">운영 조건</h2>
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <fieldset>
              <legend className="block text-sm font-medium text-slate-700">여행 기간</legend>
              <div className="mt-1 flex flex-col gap-1.5">
                {DURATION_OPTIONS.map((o) => (
                  <label key={o.code} className="flex items-center gap-1.5 text-sm text-slate-700">
                    <input type="radio" name="duration" value={o.code} defaultChecked={o.code === "ONE_NIGHT_TWO_DAYS"} />
                    {o.label}
                  </label>
                ))}
              </div>
              <FieldError messages={errors.duration} />
            </fieldset>

            <fieldset>
              <legend className="block text-sm font-medium text-slate-700">예산 수준</legend>
              <div className="mt-1 flex flex-col gap-1.5">
                {BUDGET_LEVEL_OPTIONS.map((o) => (
                  <label key={o.code} className="flex items-center gap-1.5 text-sm text-slate-700">
                    <input type="radio" name="budgetLevel" value={o.code} defaultChecked={o.code === "MID"} />
                    {o.label}
                  </label>
                ))}
              </div>
              <FieldError messages={errors.budgetLevel} />
            </fieldset>

            <fieldset>
              <legend className="block text-sm font-medium text-slate-700">이동 수단</legend>
              <div className="mt-1 flex flex-col gap-1.5">
                {TRANSPORT_OPTIONS.map((o) => (
                  <label key={o.code} className="flex items-center gap-1.5 text-sm text-slate-700">
                    <input type="radio" name="transport" value={o.code} defaultChecked={o.code === "MIXED"} />
                    {o.label}
                  </label>
                ))}
              </div>
              <FieldError messages={errors.transport} />
            </fieldset>

            <fieldset>
              <legend className="block text-sm font-medium text-slate-700">그룹 규모</legend>
              <div className="mt-1 flex flex-col gap-1.5">
                {GROUP_TYPE_OPTIONS.map((o) => (
                  <label key={o.code} className="flex items-center gap-1.5 text-sm text-slate-700">
                    <input type="radio" name="groupType" value={o.code} defaultChecked={o.code === "SMALL_10_20"} />
                    {o.label}
                  </label>
                ))}
              </div>
              <FieldError messages={errors.groupType} />
            </fieldset>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-900">테마 및 메모</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="preferredThemes" className="block text-sm font-medium text-slate-700">
                선호 테마 (쉼표로 구분, 선택)
              </label>
              <input
                id="preferredThemes"
                name="preferredThemes"
                type="text"
                placeholder="예: 미식, 야경"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <FieldError messages={errors.preferredThemes} />
            </div>
            <div>
              <label htmlFor="excludedThemes" className="block text-sm font-medium text-slate-700">
                제외 테마 (쉼표로 구분, 선택)
              </label>
              <input
                id="excludedThemes"
                name="excludedThemes"
                type="text"
                placeholder="예: 축제"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <FieldError messages={errors.excludedThemes} />
            </div>
            <div>
              <label htmlFor="memo" className="block text-sm font-medium text-slate-700">
                메모 (선택)
              </label>
              <textarea
                id="memo"
                name="memo"
                rows={3}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <FieldError messages={errors.memo} />
            </div>
          </div>
        </section>

        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
        >
          {isPending ? "분석 중..." : "분석 시작"}
        </button>
      </div>

      <aside className="no-print h-fit rounded-lg border border-slate-200 bg-white p-6 lg:sticky lg:top-6">
        <h2 className="text-sm font-semibold text-slate-900">입력 요약</h2>
        <dl className="mt-3 space-y-2 text-sm text-slate-600">
          <div className="flex justify-between">
            <dt>여행 시기</dt>
            <dd>
              {travelYear}년 {travelMonth}월
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>연령대</dt>
            <dd>{ageGroups.length > 0 ? `${ageGroups.length}개 선택` : "미선택"}</dd>
          </div>
        </dl>
        <div className="mt-4 rounded-md bg-slate-50 p-3 text-xs text-slate-500">
          이번 분석에는 <strong>{formatBaseYm(baseYm)}</strong> 기준 공공데이터가 사용됩니다.
        </div>
      </aside>
    </form>
  );
}
