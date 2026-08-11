import { SiteHeader } from "@/components/layout/SiteHeader";
import { ProjectInputForm } from "@/components/forms/ProjectInputForm";
import { getRegionOptions } from "@/lib/services/regionQueries";
import { getLatestDataFreshness } from "@/lib/services/projectQueries";
import { getActiveDatasetBaseYm } from "@/lib/services/activeDataset";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const regionOptions = await getRegionOptions();
  // Phase 2-A(2026-08-11): 실제 분석(computeProjectAnalysis)이 쓰는 것과 동일하게 ACTIVE dataset만
  // 신뢰한다 — 예전에는 process.env.TOUR_DATA_BASE_YM ?? DEFAULT_BASE_YM(정적값)을 그대로 보여줬다.
  // "사용 가능 최신 데이터"는 여전히 getLatestDataFreshness()(DB의 가장 최신 DataSnapshot)로 따로
  // 보여줘, ACTIVE보다 새 데이터가 들어와 있으면 그 사실을 화면에서 알린다(2026-07-29 원안 유지).
  const baseYm = await getActiveDatasetBaseYm();
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
          {baseYm ? (
            <ProjectInputForm
              regionOptions={regionOptions}
              baseYm={baseYm}
              latestAvailableBaseYm={latestAvailableBaseYm}
            />
          ) : (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
              검증된 ACTIVE 데이터셋이 없어 지금은 새 관광상품 기획을 시작할 수 없습니다. 관리자가
              데이터셋을 활성화한 뒤 다시 시도해주세요.
            </p>
          )}
        </div>
      </main>
    </>
  );
}
