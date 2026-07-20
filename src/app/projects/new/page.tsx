import { SiteHeader } from "@/components/layout/SiteHeader";
import { ProjectInputForm } from "@/components/forms/ProjectInputForm";
import { getRegionOptions } from "@/lib/services/regionQueries";
import { DEFAULT_BASE_YM } from "@/lib/fixtures/metrics";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const regionOptions = await getRegionOptions();
  const baseYm = process.env.TOUR_DATA_BASE_YM ?? DEFAULT_BASE_YM;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-10">
        <h1 className="text-xl font-bold text-slate-900">기획 조건 입력</h1>
        <p className="mt-1 text-sm text-slate-600">
          지역과 여행 조건을 입력하면 관광 DNA 분석과 전략 3안을 자동으로 계산합니다.
        </p>
        <div className="mt-8">
          <ProjectInputForm regionOptions={regionOptions} baseYm={baseYm} />
        </div>
      </main>
    </>
  );
}
