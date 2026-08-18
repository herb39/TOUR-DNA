"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { searchPoisInRegion } from "@/lib/services/poiDetails";
import type { CourseDay, PoiDetail, TransportCode } from "@/lib/domain/planBuilder";
import { enrichCourseDaysWithRealRoutes } from "@/lib/services/route/courseRouteEnrichment";
import { fetchCourseRouteGeometry, type RouteGeometrySegment } from "@/lib/services/route/routeGeometryService";
import { assertProjectAccessible, projectAccessCookieName } from "@/lib/services/projectAccess";
import { getProjectAnchor } from "@/lib/services/projectAnchorService";
import { findFestivalAnchorItems, validateFestivalAnchorCourseDays } from "@/lib/domain/festivalAnchorCourse";
import {
  generatePromoContentForProject,
  getPromoContentForProject,
  savePromoContentForProject,
  type GeneratePromoContentResult,
  type GetPromoContentResult,
  type SavePromoContentResult,
} from "@/lib/services/promoContentService";

async function requireProjectAccess(projectId: string): Promise<void> {
  const cookieStore = await cookies();
  await assertProjectAccessible(projectId, cookieStore.get(projectAccessCookieName(projectId))?.value);
}

export interface SavePlanFormState {
  success: boolean;
  message?: string;
  savedAt?: string;
  /** 저장 직후 서버가 실제로 반영한 course(카카오 실제 경로 enrichment 결과 포함)를 그대로 돌려준다.
   * PlanEditor의 days state는 클라이언트가 보낸 값으로 이미 채워져 있어 useActionState가 새 props를
   * 받아도 저절로 갱신되지 않는다(React가 이미 마운트된 컴포넌트의 state를 prop 변경만으로 되돌리지
   * 않음) — 그래서 저장 성공 시 이 필드로 서버가 계산한 최신 값을 클라이언트에 명시적으로 되돌려주고,
   * PlanEditor가 이 값으로 자신의 state를 덮어써야 한다(2026-08-06, 실제 경로 결과 미표시 버그 수정). */
  days?: CourseDay[];
}

export async function savePlanAction(
  planId: string,
  projectId: string,
  _prevState: SavePlanFormState,
  formData: FormData,
): Promise<SavePlanFormState> {
  const productName = String(formData.get("productName") ?? "").trim();
  const conceptText = String(formData.get("conceptText") ?? "").trim();
  const memo = String(formData.get("memo") ?? "");
  const kpiMemo = String(formData.get("kpiMemo") ?? "");
  const courseJson = String(formData.get("courseJson") ?? "");
  const operationChecklistJson = String(formData.get("operationChecklistJson") ?? "");
  const risksJson = String(formData.get("risksJson") ?? "");
  const kpisJson = String(formData.get("kpisJson") ?? "");

  await requireProjectAccess(projectId);

  if (!productName) {
    return { success: false, message: "상품명을 입력해주세요." };
  }

  let course: { days: CourseDay[] };
  let operationChecklist: unknown;
  let risks: unknown;
  let kpis: unknown;
  try {
    course = JSON.parse(courseJson);
    operationChecklist = JSON.parse(operationChecklistJson);
    risks = JSON.parse(risksJson);
    kpis = JSON.parse(kpisJson);
  } catch {
    return { success: false, message: "실행안 데이터 형식이 올바르지 않습니다." };
  }

  // P1-2b: 코스에 Anchor가 있을 때만 현재 ProjectAnchor를 읽어 snapshot 정합성을 확인한다.
  // Anchor가 없는 기존 실행안은 이 조회를 거치지 않아 레거시 Production 스키마에서도 계속 저장된다.
  const courseAnchorItems = findFestivalAnchorItems(course.days);
  if (courseAnchorItems.length > 0) {
    const anchorResult = await getProjectAnchor(projectId);
    if (anchorResult.storage === "UNAVAILABLE") {
      return { success: false, message: "축제 Anchor 저장소를 확인할 수 없어 저장할 수 없습니다. 기존 장소만 있는 실행안은 계속 저장할 수 있습니다." };
    }
    if (!anchorResult.anchor) {
      return { success: false, message: "현재 프로젝트에 확정된 Anchor가 없습니다. 코스에서 기존 Anchor를 먼저 코스에서만 제거해주세요." };
    }
    const anchorValidation = validateFestivalAnchorCourseDays(course.days, anchorResult.anchor);
    if (!anchorValidation.ok) {
      return { success: false, message: anchorValidation.message ?? "축제 Anchor 설정이 현재 프로젝트와 일치하지 않습니다. 다시 반영해주세요." };
    }
  }

  // 실제 도로 경로(Phase 12, 2026-08-05): PRIVATE_VEHICLE 실행안만, 저장 직전에 이전에 저장된 course와
  // 인접 구간(POI 쌍)을 비교해 바뀐 구간만 카카오를 새로 호출한다(순서 변경·추가·삭제로 실제로 바뀐
  // 구간만 재호출, 시간·체류시간만 바뀐 저장은 재호출 없음). 조회·enrichment가 실패해도 course는 이미
  // 클라이언트가 보낸 haversine 기반 값이므로 저장 자체는 항상 진행한다.
  try {
    const existing = await prisma.project.findUnique({
      where: { id: projectId },
      include: { input: true, selectedPlan: true },
    });
    const transport = existing?.input?.transport as TransportCode | undefined;
    if (transport) {
      const previousDays = (existing?.selectedPlan?.course as { days: CourseDay[] } | undefined)?.days ?? null;
      course = { days: await enrichCourseDaysWithRealRoutes(course.days, transport, previousDays) };
    }
  } catch (e) {
    console.error(
      JSON.stringify({ level: "error", source: "savePlanAction", message: "route enrichment failed, saving haversine estimates as-is", reason: e instanceof Error ? e.message : "unknown" }),
    );
  }

  await prisma.selectedPlan.update({
    where: { id: planId },
    data: {
      productName,
      conceptText,
      memo,
      kpiMemo,
      course: course as unknown as object,
      operationChecklist: operationChecklist as object,
      risks: risks as object,
      kpis: kpis as object,
    },
  });
  await prisma.project.update({ where: { id: projectId }, data: { status: "PLANNED" } });

  revalidatePath(`/projects/${projectId}/plan`);
  return { success: true, savedAt: new Date().toISOString(), days: course.days };
}

export interface FetchPlanRouteGeometryResult {
  segments: RouteGeometrySegment[];
}

/**
 * 실행안 지도(CourseMap)가 마운트된 뒤 클라이언트에서 호출하는 이동 동선 조회 액션(2026-08-06,
 * 2026-08-06 2차: 이동수단 구분 없이 모든 실행안에 적용). 좌표를 클라이언트가 넘기지 않는다 — 이
 * 프로젝트의 SelectedPlan.course를 서버가 직접 다시 읽어 인접 구간만 계산하므로, 임의의 좌표로 이
 * 액션을 카카오 프록시처럼 악용할 수 없다(요청 가능한 것은 이 프로젝트 자신의 이미 저장된 장소 쌍뿐).
 * 결과는 어디에도 저장하지 않고 그대로 반환만 한다 — DB write가 전혀 없다.
 *
 * 이동수단(WALK/PUBLIC_TRANSPORT/PRIVATE_VEHICLE/MIXED)과 무관하게 동일한 도로 기반 geometry를
 * 사용한다 — 현재 안정적으로 확보 가능한 geometry 소스가 카카오모빌리티 자동차 길찾기뿐이기 때문이며,
 * 이는 "이동수단별 정확한 경로"가 아니라 장소 간 이동 동선을 직선 대신 시각화하기 위한 것이다. 이
 * 구분은 사용자 화면에는 전혀 노출하지 않는다(CourseMap.tsx 주석 참고).
 */
export async function fetchPlanRouteGeometryAction(projectId: string): Promise<FetchPlanRouteGeometryResult> {
  await requireProjectAccess(projectId);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { selectedPlan: { select: { course: true } } },
  });
  if (!project?.selectedPlan) {
    return { segments: [] };
  }

  const days = (project.selectedPlan.course as unknown as { days: CourseDay[] }).days;
  const segments = await fetchCourseRouteGeometry(days);
  return { segments };
}

export async function backToAnalysisAction(projectId: string) {
  await requireProjectAccess(projectId);
  redirect(`/projects/${projectId}/analysis`);
}

/** 실행안 편집기의 "장소 추가" 검색창에서 호출한다. 해당 프로젝트의 지역으로 한정해 POI를 찾는다. */
export async function searchAvailablePoisAction(projectId: string, regionId: string, query: string): Promise<PoiDetail[]> {
  await requireProjectAccess(projectId);
  return searchPoisInRegion(regionId, query);
}

/**
 * Phase 5-C UI가 호출할 홍보자료 서버 액션. 지역·역할·국적·전략·Evidence 등 생성 입력은 클라이언트에서
 * 받지 않고 서비스 계층이 projectId로 DB를 다시 조회해 구성한다 — 여기서는 projectId와 제어값
 * (overwrite)만 전달한다. 저장에 성공했을 때만 실행안 페이지를 재검증한다.
 */
export async function generatePromoContentAction(
  projectId: string,
  options: { overwrite?: boolean } = {},
): Promise<GeneratePromoContentResult> {
  await requireProjectAccess(projectId);
  const result = await generatePromoContentForProject(projectId, options);
  if (result.ok) revalidatePath(`/projects/${projectId}/plan`);
  return result;
}

export async function getPromoContentAction(projectId: string): Promise<GetPromoContentResult> {
  await requireProjectAccess(projectId);
  return getPromoContentForProject(projectId);
}

/** 사용자가 편집한 홍보자료를 저장한다. content는 클라이언트가 보낸 unknown 값 그대로 넘기고,
 * 런타임 검증은 서비스 계층(savePromoContentForProject)에서만 수행한다. */
export async function savePromoContentAction(projectId: string, content: unknown): Promise<SavePromoContentResult> {
  await requireProjectAccess(projectId);
  const result = await savePromoContentForProject(projectId, content);
  if (result.ok) revalidatePath(`/projects/${projectId}/plan`);
  return result;
}
