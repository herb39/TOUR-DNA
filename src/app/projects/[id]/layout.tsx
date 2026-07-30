import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getProjectAccessStatus, projectAccessCookieName } from "@/lib/services/projectAccess";
import { ProjectLockScreen } from "@/components/project/ProjectLockScreen";

/**
 * `/projects/[id]/analysis`, `/projects/[id]/plan`, `/projects/[id]/print`가 모두 이 레이아웃
 * 아래에 있다 — 접근 판정을 레이아웃 한 곳에서만 수행해, 보호된 프로젝트는 잠금 화면이 렌더링될 뿐
 * 하위 페이지의 데이터 조회 자체가 실행되지 않는다(화면마다 따로 판정하지 않는다, 2026-07-30).
 * `/projects/new`는 이 레이아웃 밖(형제 디렉터리)이라 영향받지 않는다.
 */
export default async function ProjectAccessLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const status = await getProjectAccessStatus(id, cookieStore.get(projectAccessCookieName(id))?.value);

  if (status.kind === "NOT_FOUND") notFound();
  if (status.kind === "LOCKED") return <ProjectLockScreen projectId={id} />;

  return <>{children}</>;
}
