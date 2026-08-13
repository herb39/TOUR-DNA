import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ProjectPageSizeSelect } from "@/components/project/ProjectPageSizeSelect";
import { getLatestDataFreshness, getDemoProject, listProjectSummaries } from "@/lib/services/projectQueries";
import { getActiveDatasetBaseYm } from "@/lib/services/activeDataset";
import { labelForRole } from "@/lib/validation/codes";
import { PROJECT_STATUS_LABEL, formatBaseYm, formatDateTime } from "@/lib/format";
import {
  clampPageToTotal,
  computeTotalPages,
  parsePage,
  parsePageSize,
  buildPageWindow,
  type PageSize,
} from "@/lib/pagination";
import { perfNow, perfMark } from "@/lib/perfLog";

export const dynamic = "force-dynamic";

function pageHref(page: number, pageSize: PageSize): string {
  return `/?page=${page}&pageSize=${pageSize}`;
}

function PaginationControls({
  page,
  pageSize,
  totalCount,
  totalPages,
}: {
  page: number;
  pageSize: PageSize;
  totalCount: number;
  totalPages: number;
}) {
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);
  const pageWindow = buildPageWindow(page, totalPages);

  return (
    <div className="border-t border-slate-200 px-4 py-3 text-sm">
      <p className="text-center text-xs text-slate-500 sm:text-left">
        전체 {totalCount}건 중 {rangeStart}–{rangeEnd}건
      </p>
      <nav aria-label="페이지 이동" className="mt-2 flex flex-wrap items-center justify-center gap-1">
        <Link
          href={pageHref(Math.max(page - 1, 1), pageSize)}
          aria-disabled={page <= 1}
          className={`rounded-md border px-2.5 py-1 text-xs ${
            page <= 1
              ? "pointer-events-none border-slate-100 text-slate-300"
              : "border-slate-300 text-slate-700 hover:bg-slate-50"
          }`}
        >
          이전
        </Link>
        {pageWindow.map((p, i) =>
          p === "…" ? (
            <span key={`ellipsis-${i}`} className="px-1 text-xs text-slate-400">
              …
            </span>
          ) : (
            <Link
              key={p}
              href={pageHref(p, pageSize)}
              aria-current={p === page ? "page" : undefined}
              className={`min-w-[2rem] rounded-md border px-2.5 py-1 text-center text-xs ${
                p === page
                  ? "border-slate-900 bg-slate-900 font-medium text-white"
                  : "border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {p}
            </Link>
          ),
        )}
        <Link
          href={pageHref(Math.min(page + 1, totalPages), pageSize)}
          aria-disabled={page >= totalPages}
          className={`rounded-md border px-2.5 py-1 text-xs ${
            page >= totalPages
              ? "pointer-events-none border-slate-100 text-slate-300"
              : "border-slate-300 text-slate-700 hover:bg-slate-50"
          }`}
        >
          다음
        </Link>
      </nav>
    </div>
  );
}

export async function ProjectListSection({ page, pageSize }: { page: number; pageSize: PageSize }) {
  // 2026-08-13(임시 진단) — HomePage의 Promise.all과 별개로(다른 async 컴포넌트라 렌더 시점이 이후임)
  // 이 조회가 실제로 얼마나 걸리는지 별도로 기록한다. 원인 확인 후 제거 예정.
  const t0 = perfNow();
  let projects: Awaited<ReturnType<typeof listProjectSummaries>>["projects"] = [];
  let totalCount = 0;
  let loadError: string | null = null;

  try {
    const result = await listProjectSummaries({ page, pageSize });
    projects = result.projects;
    totalCount = result.totalCount;
  } catch {
    loadError = "프로젝트 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
  }
  perfMark(t0, "project-list-section");

  if (loadError) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {loadError}
      </div>
    );
  }

  if (totalCount === 0) {
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

  // 잘못된/범위를 벗어난 page(예: 마지막 페이지 데이터가 삭제된 경우)는 유효한 페이지로 안전하게
  // 되돌린다. clampPageToTotal은 "더 큰 값"만 보정하므로 무한 리다이렉트 위험이 없다(보정된 page는
  // 항상 1~totalPages 범위 안에 있고, 그 값으로 다시 조회하면 이 분기를 다시 타지 않는다).
  const totalPages = computeTotalPages(totalCount, pageSize);
  const clamped = clampPageToTotal(page, totalPages);
  if (clamped.wasClamped) {
    redirect(pageHref(clamped.page, pageSize));
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
            <th scope="col" className="px-4 py-3 font-medium">생성일</th>
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
                  {p.isProtected ? (
                    <span className="ml-2 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">
                      🔒 비밀번호 보호됨
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-slate-600">{p.region.name}</td>
                <td className="px-4 py-3 text-slate-600">
                  {p.travelYear}년 {p.travelMonth}월
                </td>
                <td className="px-4 py-3 text-slate-600">{labelForRole(p.role)}</td>
                <td className="px-4 py-3 text-slate-600">{topStrategyName}</td>
                <td className="px-4 py-3 text-slate-600">{formatDateTime(p.createdAt)}</td>
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
      <PaginationControls page={page} pageSize={pageSize} totalCount={totalCount} totalPages={totalPages} />
    </div>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[]; pageSize?: string | string[] }>;
}) {
  // 2026-08-13(임시 진단, Production 최초 Document ~6초 병목 조사) — 단계별 소요시간만 ms로 기록한다.
  // 값(데이터 내용)은 로그에 남기지 않는다. 원인 확인 후 제거 예정.
  const perfStart = perfNow();

  const { page: pageParam, pageSize: pageSizeParam } = await searchParams;
  const page = parsePage(pageParam);
  const pageSize = parsePageSize(pageSizeParam);
  perfMark(perfStart, "searchParams-resolved");

  let freshness: Awaited<ReturnType<typeof getLatestDataFreshness>> = { baseYm: null, lastSyncedAt: null };
  let demoProject: Awaited<ReturnType<typeof getDemoProject>> = null;
  // Phase 2-A(2026-08-11): "데이터 기준월"은 DB의 가장 최신 DataSnapshot이 아니라 실제 분석에 쓰이는
  // ACTIVE dataset을 보여준다 — 둘이 다를 수 있다는 점(202607이 STAGING으로 일부 들어와 있어도 분석은
  // 여전히 202606 ACTIVE를 쓰는 상황)이 바로 이 화면의 오해 소지였다. lastSyncedAt은 "동기화 자체가
  // 언제 마지막으로 있었는지"라는 별개 정보라 그대로 둔다.
  let activeBaseYm: string | null = null;
  try {
    [freshness, demoProject, activeBaseYm] = await Promise.all([
      getLatestDataFreshness(),
      getDemoProject(),
      getActiveDatasetBaseYm(),
    ]);
  } catch {
    // 데이터 기준월/데모 프로젝트 조회 실패는 치명적이지 않으므로 조용히 기본값을 사용한다.
  }
  perfMark(perfStart, "home-parallel-queries-done");

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
              데이터 기준월 {activeBaseYm ? formatBaseYm(activeBaseYm) : "미설정"} · 마지막 동기화{" "}
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
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">최근 프로젝트</h2>
            <ProjectPageSizeSelect pageSize={pageSize} />
          </div>
          <ProjectListSection page={page} pageSize={pageSize} />
        </section>
      </main>
    </>
  );
}
