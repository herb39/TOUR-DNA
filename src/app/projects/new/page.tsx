import { SiteHeader } from "@/components/layout/SiteHeader";
import { ProjectInputForm } from "@/components/forms/ProjectInputForm";
import { getRegionOptions } from "@/lib/services/regionQueries";
import { getLatestDataFreshness } from "@/lib/services/projectQueries";
import { DEFAULT_BASE_YM } from "@/lib/fixtures/metrics";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const regionOptions = await getRegionOptions();
  // 실제 분석(analyzeProject.ts)이 사용하는 값과 동일한 소스다 — 여기서 값을 바꾸면 화면 표시만 달라지고
  // 실제 분석 동작과 어긋나므로 그대로 둔다. "사용 가능 최신 데이터"는 메인 화면과 같은 DB 조회
  // (getLatestDataFreshness)를 별도로 써서, 이 값과 다르면 화면에 그 사실을 알린다(2026-07-29).
  const baseYm = process.env.TOUR_DATA_BASE_YM ?? DEFAULT_BASE_YM;
  let latestAvailableBaseYm: string | null = null;
  try {
    latestAvailableBaseYm = (await getLatestDataFreshness()).baseYm;
  } catch {
    // 최신 기준월 조회 실패는 치명적이지 않다 — 안내 문구를 생략하고 분석 기준월만 보여준다.
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-10">
        <h1 className="text-xl font-bold text-slate-900">기획 조건 입력</h1>
        <p className="mt-1 text-sm text-slate-600">
          지역과 여행 조건을 입력하면 관광 DNA 분석과 전략 3안을 자동으로 계산합니다.
        </p>
        <div className="mt-8">
          <ProjectInputForm
            regionOptions={regionOptions}
            baseYm={baseYm}
            latestAvailableBaseYm={latestAvailableBaseYm}
          />
        </div>
      </main>
    </>
  );
}
