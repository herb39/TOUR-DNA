"use client";

import Link from "next/link";
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
import { updateProjectAndReanalyzeAction, type UpdateProjectFormState } from "@/app/projects/[id]/edit/actions";

const initialState: UpdateProjectFormState = { success: true, errors: {} };

export interface ProjectEditFormInitialValues {
  projectName: string;
  role: string;
  sidoCode: string;
  sigunguCode: string;
  travelYear: number;
  travelMonth: number;
  nationality: string;
  ageGroups: string[];
  companionType: string;
  primaryGoal: string;
  secondaryGoal: string | null;
  duration: string;
  budgetLevel: string;
  transport: string;
  groupType: string;
  preferredThemes: string;
  excludedThemes: string;
  memo: string;
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages || messages.length === 0) return null;
  return (
    <p className="mt-1 text-xs text-red-600" role="alert">
      {messages[0]}
    </p>
  );
}

/**
 * 기존 프로젝트 조건 수정 + 재분석 폼(Phase 6, 2026-08-01 도입, 2026-08-02 정책 단순화).
 * `ProjectInputForm.tsx`(신규 생성용)와 필드 구성은 같지만, 대표 시나리오 카드·비밀번호 설정은 이
 * 화면 목적과 무관해 넣지 않았고 현재 값을 초기값으로 채운다. 실행안(및 홍보자료)이 있는 프로젝트는
 * 재분석 시 그것들이 삭제된다는 사실을 명확히 경고하고, 체크박스로 확인해야만 제출할 수 있다 — 서버
 * 액션도 같은 조건을 다시 검사한다(폼을 우회한 요청도 확인 없이 통과하지 못하게).
 */
export function ProjectEditForm({
  projectId,
  regionOptions,
  projectUpdatedAt,
  hasSelectedPlan,
  hasPromoContent,
  initial,
}: {
  projectId: string;
  regionOptions: RegionOption[];
  projectUpdatedAt: string;
  hasSelectedPlan: boolean;
  hasPromoContent: boolean;
  initial: ProjectEditFormInitialValues;
}) {
  const boundAction = updateProjectAndReanalyzeAction.bind(null, projectId);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  const [sidoCode, setSidoCode] = useState(initial.sidoCode);
  const [sigunguCode, setSigunguCode] = useState(initial.sigunguCode);
  const [role, setRole] = useState(initial.role);
  const [nationality, setNationality] = useState(initial.nationality);
  const [ageGroups, setAgeGroups] = useState<string[]>(initial.ageGroups);
  const [companionType, setCompanionType] = useState(initial.companionType);
  const [primaryGoal, setPrimaryGoal] = useState(initial.primaryGoal);
  const [secondaryGoal, setSecondaryGoal] = useState(initial.secondaryGoal ?? "");
  const [duration, setDuration] = useState(initial.duration);
  const [budgetLevel, setBudgetLevel] = useState(initial.budgetLevel);
  const [transport, setTransport] = useState(initial.transport);
  const [groupType, setGroupType] = useState(initial.groupType);
  const [preferredThemesText, setPreferredThemesText] = useState(initial.preferredThemes);
  const [excludedThemesText, setExcludedThemesText] = useState(initial.excludedThemes);
  const [travelYear, setTravelYear] = useState(initial.travelYear);
  const [travelMonth, setTravelMonth] = useState(initial.travelMonth);
  const [projectName, setProjectName] = useState(initial.projectName);
  const [acknowledged, setAcknowledged] = useState(false);

  const sigunguOptions = useMemo(
    () => regionOptions.find((r) => r.code === sidoCode)?.sigungus ?? [],
    [regionOptions, sidoCode],
  );

  function handleSidoChange(nextSidoCode: string) {
    setSidoCode(nextSidoCode);
    setSigunguCode(regionOptions.find((r) => r.code === nextSidoCode)?.sigungus[0]?.code ?? "");
  }

  const errors = state.errors ?? {};
  const needsAcknowledgement = hasSelectedPlan;

  return (
    <form action={formAction} className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-8">
        {errors._root ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errors._root[0]}
          </div>
        ) : null}

        {needsAcknowledgement ? (
          <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-semibold">이 프로젝트에는 이미 실행안{hasPromoContent ? "과 홍보자료" : ""}이 있습니다.</p>
            <p className="mt-2">
              조건을 저장하면 관광 DNA와 전략 3안을 새 조건으로 다시 계산하며,{" "}
              <strong>기존 실행안{hasPromoContent ? "과 홍보자료" : ""}은 삭제됩니다.</strong> 삭제된
              내용은 복구할 수 없으며, 재분석 이후 분석 화면에서 새 전략 3안 중 하나를 다시 선택해
              실행안을 새로 만들어야 합니다.
            </p>
            <label className="mt-3 flex items-start gap-2 text-sm font-medium text-red-900">
              <input
                type="checkbox"
                name="acknowledgeOverwrite"
                required
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5"
              />
              위 내용을 확인했으며 재분석을 진행합니다.
            </label>
          </div>
        ) : null}

        <input type="hidden" name="projectUpdatedAt" value={projectUpdatedAt} />

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
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <FieldError messages={errors.projectName} />
            </div>

            <fieldset>
              <legend className="block text-sm font-medium text-slate-700">역할</legend>
              <div className="mt-1 flex gap-4">
                {ROLE_OPTIONS.map((o) => (
                  <label key={o.code} className="flex items-center gap-1.5 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="role"
                      value={o.code}
                      checked={role === o.code}
                      onChange={() => setRole(o.code)}
                    />
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
                onChange={(e) => handleSidoChange(e.target.value)}
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
                value={sigunguCode}
                onChange={(e) => setSigunguCode(e.target.value)}
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
                    <input
                      type="radio"
                      name="nationality"
                      value={o.code}
                      checked={nationality === o.code}
                      onChange={() => setNationality(o.code)}
                    />
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
                value={companionType}
                onChange={(e) => setCompanionType(e.target.value)}
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
                    <input
                      type="radio"
                      name="duration"
                      value={o.code}
                      checked={duration === o.code}
                      onChange={() => setDuration(o.code)}
                    />
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
                    <input
                      type="radio"
                      name="budgetLevel"
                      value={o.code}
                      checked={budgetLevel === o.code}
                      onChange={() => setBudgetLevel(o.code)}
                    />
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
                    <input
                      type="radio"
                      name="transport"
                      value={o.code}
                      checked={transport === o.code}
                      onChange={() => setTransport(o.code)}
                    />
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
                    <input
                      type="radio"
                      name="groupType"
                      value={o.code}
                      checked={groupType === o.code}
                      onChange={() => setGroupType(o.code)}
                    />
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
                placeholder="예: 미식, 문화예술, 야경"
                value={preferredThemesText}
                onChange={(e) => setPreferredThemesText(e.target.value)}
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
                value={excludedThemesText}
                onChange={(e) => setExcludedThemesText(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <FieldError messages={errors.excludedThemes} />
            </div>
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending || (needsAcknowledgement && !acknowledged)}
            className="cursor-pointer rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "저장하고 재분석 중..." : "저장하고 재분석"}
          </button>
          <Link href={`/projects/${projectId}/analysis`} className="text-sm text-slate-600 hover:text-slate-900">
            취소하고 돌아가기
          </Link>
        </div>
      </div>

      <aside className="no-print h-fit rounded-lg border border-slate-200 bg-white p-6 lg:sticky lg:top-6">
        <h2 className="text-sm font-semibold text-slate-900">변경 요약</h2>
        <dl className="mt-3 space-y-2 text-sm text-slate-600">
          <div className="flex justify-between">
            <dt>지역</dt>
            <dd>{sigunguOptions.find((s) => s.code === sigunguCode)?.name ?? sigunguCode}</dd>
          </div>
          <div className="flex justify-between">
            <dt>역할</dt>
            <dd>{ROLE_OPTIONS.find((o) => o.code === role)?.label ?? role}</dd>
          </div>
          <div className="flex justify-between">
            <dt>내/외국인</dt>
            <dd>{NATIONALITY_OPTIONS.find((o) => o.code === nationality)?.label ?? nationality}</dd>
          </div>
          <div className="flex justify-between">
            <dt>여행 시기</dt>
            <dd>
              {travelYear}년 {travelMonth}월
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>선호 테마</dt>
            <dd>{preferredThemesText.trim() || "미선택"}</dd>
          </div>
          <div className="flex justify-between">
            <dt>연령대</dt>
            <dd>{ageGroups.length > 0 ? `${ageGroups.length}개 선택` : "미선택"}</dd>
          </div>
        </dl>
        <p className="mt-4 rounded-md bg-slate-50 p-3 text-xs text-slate-500">
          {sidoCode === initial.sidoCode && sigunguCode === initial.sigunguCode
            ? "저장하면 이 조건에 맞춰 추천 전략과 실행안을 새로 계산합니다. 지역은 그대로이므로 관광 DNA 5축 점수는 바뀌지 않습니다."
            : "지역을 변경했습니다 — 관광 DNA 5축부터 전략·실행안까지 새 지역 기준으로 전부 다시 계산합니다."}{" "}
          계산 중 오류가 발생하면 기존 분석 결과는 그대로 유지되며 아무것도 바뀌지 않습니다.
        </p>
      </aside>
    </form>
  );
}
