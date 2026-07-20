import Link from "next/link";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getLatestDataFreshness, getDemoProject, listProjectSummaries } from "@/lib/services/projectQueries";
import { labelForRole } from "@/lib/validation/codes";
import { PROJECT_STATUS_LABEL, formatBaseYm, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

async function ProjectListSection() {
  let projects: Awaited<ReturnType<typeof listProjectSummaries>> = [];
  let loadError: string | null = null;

  try {
    projects = await listProjectSummaries();
  } catch {
    loadError = "프로젝트 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {loadError}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-sm text-slate-600">아직 생성된 프로젝트가 없습니다.</p>
        <Link
          href="/projects/new"
          className="mt-4 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          첫 관광상품 기획 시작하기
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">프로젝트명</th>
            <th scope="col" className="px-4 py-3 font-medium">지역</th>
            <th scope="col" className="px-4 py-3 font-medium">기준월</th>
            <th scope="col" className="px-4 py-3 font-medium">역할</th>
            <th scope="col" className="px-4 py-3 font-medium">선택 전략</th>
            <th scope="col" className="px-4 py-3 font-medium">수정일</th>
            <th scope="col" className="px-4 py-3 font-medium">상태</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const href =
              p.status === "PLANNED" ? `/projects/${p.id}/plan` : `/projects/${p.id}/analysis`;
            const topStrategyName = p.analysisResult?.strategyResults[0]?.name ?? "-";
            return (
              <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={href} className="font-medium text-slate-900 hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{p.region.name}</td>
                <td className="px-4 py-3 text-slate-600">
                  {p.travelYear}년 {p.travelMonth}월
                </td>
                <td className="px-4 py-3 text-slate-600">{labelForRole(p.role)}</td>
                <td className="px-4 py-3 text-slate-600">{topStrategyName}</td>
                <td className="px-4 py-3 text-slate-600">{formatDateTime(p.updatedAt)}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-700">
                    {PROJECT_STATUS_LABEL[p.status] ?? p.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function HomePage() {
  let freshness: Awaited<ReturnType<typeof getLatestDataFreshness>> = { baseYm: null, lastSyncedAt: null };
  let demoProject: Awaited<ReturnType<typeof getDemoProject>> = null;
  try {
    [freshness, demoProject] = await Promise.all([getLatestDataFreshness(), getDemoProject()]);
  } catch {
    // 데이터 기준월/데모 프로젝트 조회 실패는 치명적이지 않으므로 조용히 기본값을 사용한다.
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-10">
        <section className="rounded-xl border border-slate-200 bg-white p-8">
          <p className="text-sm font-medium text-slate-500">TOUR DNA</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
            데이터 기반 지역 관광상품 기획 엔진
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
            지역, 여행 시기, 타깃, 목표와 운영 조건을 입력하면 한국관광공사 공공데이터로 지역의 관광
            DNA를 진단하고, 데이터 근거가 연결된 관광상품 전략 3안과 실행안(코스·업종 연계·체크리스트·KPI)을
            자동으로 구성합니다.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Link
              href="/projects/new"
              className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              새 관광상품 기획
            </Link>
            {demoProject ? (
              <Link
                href={
                  demoProject.status === "PLANNED"
                    ? `/projects/${demoProject.id}/plan`
                    : `/projects/${demoProject.id}/analysis`
                }
                className="rounded-md border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                데모 프로젝트 열기 (대전 9월 시나리오)
              </Link>
            ) : null}
            <p className="text-xs text-slate-500">
              데이터 기준월 {formatBaseYm(freshness.baseYm)} · 마지막 동기화{" "}
              {formatDateTime(freshness.lastSyncedAt)}
            </p>
          </div>
        </section>

        <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { step: "1", title: "기획 조건 입력", desc: "지역·시기·타깃·목표·운영 조건을 입력합니다." },
            { step: "2", title: "관광 DNA 진단 및 전략 비교", desc: "5축 DNA와 데이터 근거가 연결된 전략 3안을 비교합니다." },
            { step: "3", title: "실행안 출력", desc: "코스·업종 연계·체크리스트·KPI를 편집하고 인쇄/PDF로 출력합니다." },
          ].map((s) => (
            <div key={s.step} className="rounded-lg border border-slate-200 bg-white p-5">
              <span className="text-xs font-semibold text-slate-400">STEP {s.step}</span>
              <h2 className="mt-1 text-base font-semibold text-slate-900">{s.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{s.desc}</p>
            </div>
          ))}
        </section>

        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">최근 프로젝트</h2>
          <ProjectListSection />
        </section>
      </main>
    </>
  );
}
