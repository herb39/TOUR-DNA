import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getProjectDetail } from "@/lib/services/projectQueries";
import { getRegionOptions } from "@/lib/services/regionQueries";
import { ProjectEditForm } from "@/components/forms/ProjectEditForm";
import { readProjectPreferences } from "@/lib/validation/project-preferences";

export const dynamic = "force-dynamic";

/**
 * 기존 프로젝트의 조건 수정·재분석 진입점(Phase 6, 2026-08-01). `src/app/projects/[id]/layout.tsx`가
 * 이 라우트도 함께 감싸므로, 비밀번호로 보호된 프로젝트는 잠금 화면만 보이고 이 페이지의 데이터 조회
 * 자체가 실행되지 않는다(분석/실행안/인쇄 화면과 동일한 접근 제어 적용).
 */
export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [project, regionOptions] = await Promise.all([getProjectDetail(id), getRegionOptions()]);
  if (!project) notFound();
  if (!project.input) notFound();
  const preferences = readProjectPreferences(project.input.preferredThemes);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-10">
        <p className="text-xs font-medium text-slate-500">{project.name}</p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">조건 수정 및 재분석</h1>
        <p className="mt-1 text-sm text-slate-600">
          지역·역할·타깃·기간 등 기획 조건을 수정하면 관광 DNA와 전략 3안을 새 조건으로 다시 계산합니다.
        </p>
        <div className="mt-8">
          <ProjectEditForm
            projectId={id}
            regionOptions={regionOptions}
            projectUpdatedAt={project.updatedAt.toISOString()}
            hasSelectedPlan={project.selectedPlan !== null}
            hasPromoContent={project.selectedPlan?.promoContent != null}
            initial={{
              projectName: project.name,
              role: project.role,
              sidoCode: project.sidoCode,
              sigunguCode: project.sigunguCode,
              travelYear: project.travelYear,
              travelMonth: project.travelMonth,
              nationality: project.input.nationality,
              ageGroups: project.input.ageGroups as string[],
              companionType: project.input.companionType,
              primaryGoal: project.input.primaryGoal,
              secondaryGoal: project.input.secondaryGoal,
              duration: project.input.duration,
              budgetLevel: project.input.budgetLevel,
              transport: project.input.transport,
              groupType: project.input.groupType,
              preferredThemes: preferences.themeLabels.join(", "),
              preferredThemeCodes: preferences.themeCodes,
              travelConditionCodes: preferences.travelConditionCodes,
              excludedThemes: (project.input.excludedThemes as string[]).join(", "),
              memo: project.input.memo ?? "",
            }}
          />
        </div>
      </main>
    </>
  );
}
