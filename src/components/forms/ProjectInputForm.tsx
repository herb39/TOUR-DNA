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
  labelForNationality,
  labelForRole,
} from "@/lib/validation/codes";
import type { RegionOption } from "@/lib/services/regionQueries";
import { createProjectAction, type CreateProjectFormState } from "@/app/projects/new/actions";
import { formatBaseYm } from "@/lib/format";
import { REPRESENTATIVE_SCENARIOS, type RepresentativeScenario } from "@/lib/domain/contestScenarios";

const initialState: CreateProjectFormState = { success: true, errors: {} };

/** 시나리오 카드 선택 시 폼 상태만 채운다 — 이 함수는 어떤 분석 결과도 만들지 않는다(단순 필드 매핑). */
function scenarioToFormValues(s: RepresentativeScenario) {
  return {
    sidoCode: s.sidoCode,
    sigunguCode: s.sigunguCode,
    role: s.role,
    nationality: s.nationality,
    ageGroups: s.ageGroups,
    companionType: s.companionType,
    primaryGoal: s.primaryGoal,
    secondaryGoal: s.secondaryGoal ?? "",
    duration: s.duration,
    budgetLevel: s.budgetLevel,
    transport: s.transport,
    groupType: s.groupType,
    preferredThemesText: s.preferredThemes.join(", "),
    excludedThemesText: s.excludedThemes.join(", "),
    travelYear: s.travelYear,
    travelMonth: s.travelMonth,
  };
}

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
  latestAvailableBaseYm,
}: {
  regionOptions: RegionOption[];
  baseYm: string;
  /** 메인 화면과 같은 조회(getLatestDataFreshness)로 구한 "사용 가능 최신 데이터" 기준월. baseYm과 값이
   * 같으면 굳이 별도 안내를 보여주지 않는다(불필요한 문구 추가 방지). */
  latestAvailableBaseYm?: string | null;
}) {
  const [state, formAction, isPending] = useActionState(createProjectAction, initialState);
  const [sidoCode, setSidoCode] = useState(regionOptions[0]?.code ?? "");
  const [sigunguCode, setSigunguCode] = useState(regionOptions[0]?.sigungus[0]?.code ?? "");
  const [role, setRole] = useState<string>("TRAVEL_AGENCY");
  const [nationality, setNationality] = useState<string>("DOMESTIC");
  const [ageGroups, setAgeGroups] = useState<string[]>([]);
  const [companionType, setCompanionType] = useState<string>(COMPANION_TYPE_OPTIONS[0].code);
  const [primaryGoal, setPrimaryGoal] = useState<string>(PRIMARY_GOAL_OPTIONS[0].code);
  const [secondaryGoal, setSecondaryGoal] = useState("");
  const [duration, setDuration] = useState<string>("ONE_NIGHT_TWO_DAYS");
  const [budgetLevel, setBudgetLevel] = useState<string>("MID");
  const [transport, setTransport] = useState<string>("MIXED");
  const [groupType, setGroupType] = useState<string>("SMALL_10_20");
  const [preferredThemesText, setPreferredThemesText] = useState("");
  const [excludedThemesText, setExcludedThemesText] = useState("");
  const [travelYear, setTravelYear] = useState(2026);
  const [travelMonth, setTravelMonth] = useState(9);
  const [projectName, setProjectName] = useState("");
  const [projectNameTouched, setProjectNameTouched] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const sigunguOptions = useMemo(
    () => regionOptions.find((r) => r.code === sidoCode)?.sigungus ?? [],
    [regionOptions, sidoCode],
  );

  function handleSidoChange(nextSidoCode: string) {
    setSidoCode(nextSidoCode);
    setSigunguCode(regionOptions.find((r) => r.code === nextSidoCode)?.sigungus[0]?.code ?? "");
  }

  /** 대표 시나리오 카드를 고르면 입력폼 상태만 채운다 — 분석 결과나 점수는 여기서 계산하지 않는다.
   * 적용 후에도 사용자는 아래 필드를 자유롭게 다시 수정할 수 있다(모두 controlled 상태이므로). */
  function applyPreset(scenario: RepresentativeScenario) {
    const values = scenarioToFormValues(scenario);
    setSelectedPresetId(scenario.id);
    setSidoCode(values.sidoCode);
    setSigunguCode(values.sigunguCode);
    setRole(values.role);
    setNationality(values.nationality);
    setAgeGroups(values.ageGroups);
    setCompanionType(values.companionType);
    setPrimaryGoal(values.primaryGoal);
    setSecondaryGoal(values.secondaryGoal);
    setDuration(values.duration);
    setBudgetLevel(values.budgetLevel);
    setTransport(values.transport);
    setGroupType(values.groupType);
    setPreferredThemesText(values.preferredThemesText);
    setExcludedThemesText(values.excludedThemesText);
    setTravelYear(values.travelYear);
    setTravelMonth(values.travelMonth);
  }

  const sidoName = regionOptions.find((r) => r.code === sidoCode)?.name ?? "";
  const suggestedProjectName = `${sidoName} ${travelMonth}월 소규모 여행 기획`;

  const errors = state.errors ?? {};

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (password.length > 0 && password !== passwordConfirm) e.preventDefault();
      }}
      className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]"
    >
      <div className="space-y-8">
        {errors._root ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errors._root[0]}
          </div>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-900">대표 시나리오로 빠르게 시작(선택)</h2>
          <p className="mt-1 text-xs text-slate-500">
            아래 카드를 고르면 지역·역할·타깃·테마·여행 월이 자동으로 채워집니다. 적용 후에도 모든 값을
            자유롭게 다시 수정할 수 있습니다. 직접 입력하려면 카드를 고르지 않고 아래 폼을 바로 채우면 됩니다.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {REPRESENTATIVE_SCENARIOS.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                aria-pressed={selectedPresetId === scenario.id}
                onClick={() => applyPreset(scenario)}
                className={`cursor-pointer rounded-lg border p-4 text-left text-sm transition-colors ${
                  selectedPresetId === scenario.id
                    ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
                    : "border-slate-200 bg-white hover:border-slate-400"
                }`}
              >
                <p className="font-semibold text-slate-900">{scenario.title}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {scenario.regionLabel} · {labelForRole(scenario.role)} · {labelForNationality(scenario.nationality)} ·{" "}
                  {scenario.preferredThemes.join("·")} · {scenario.travelMonth}월
                </p>
                <p className="mt-2 text-xs text-slate-600">{scenario.description}</p>
                <p className="mt-2 text-[11px] text-slate-400">{scenario.intent}</p>
              </button>
            ))}
          </div>
        </section>

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
                value={projectNameTouched ? projectName : suggestedProjectName}
                onChange={(e) => {
                  setProjectNameTouched(true);
                  setProjectName(e.target.value);
                }}
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
          <h2 className="text-sm font-semibold text-slate-900">접근 보호 (선택)</h2>
          <p className="mt-1 text-xs text-slate-500">
            비밀번호를 입력하면 이 프로젝트는 비밀번호를 확인한 사람만 열람·수정할 수 있습니다. 비워두면
            공개 프로젝트로 생성됩니다. 계정이나 소유자 개념은 없으며, 비밀번호를 아는 사람은 누구나
            접근할 수 있습니다.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                비밀번호 (선택, 최소 6자)
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <FieldError messages={errors.password} />
            </div>
            <div>
              <label htmlFor="passwordConfirm" className="block text-sm font-medium text-slate-700">
                비밀번호 확인
              </label>
              <input
                id="passwordConfirm"
                type="password"
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              {password.length > 0 && passwordConfirm.length > 0 && password !== passwordConfirm ? (
                <p className="mt-1 text-xs text-red-600" role="alert">
                  비밀번호가 일치하지 않습니다.
                </p>
              ) : null}
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
                placeholder="예: 미식, 야경"
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
          className="cursor-pointer rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
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
          <p>
            이번 분석에는 <strong>{formatBaseYm(baseYm)}</strong> 기준 공공데이터가 사용됩니다.
          </p>
          {latestAvailableBaseYm && latestAvailableBaseYm !== baseYm ? (
            <p className="mt-1">사용 가능 최신 데이터: {formatBaseYm(latestAvailableBaseYm)} 기준</p>
          ) : null}
        </div>
      </aside>
    </form>
  );
}
