"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createProjectAccessCookieValue, projectAccessCookieName, verifyProjectPassword } from "@/lib/services/projectAccess";

export interface ProjectAccessFormState {
  error?: string;
}

/** 프로젝트 잠금 화면의 비밀번호 확인 Server Action. 성공하면 이 프로젝트 전용 서명 쿠키만 설정한다 —
 * 다른 프로젝트의 잠금에는 전혀 영향을 주지 않는다(쿠키 이름과 서명 모두 projectId에 종속). */
export async function verifyProjectAccessAction(
  projectId: string,
  _prevState: ProjectAccessFormState,
  formData: FormData,
): Promise<ProjectAccessFormState> {
  const input = formData.get("password");
  const password = typeof input === "string" ? input : "";

  const result = await verifyProjectPassword(projectId, password);
  if (!result.ok) {
    return { error: result.message };
  }

  const session = createProjectAccessCookieValue(projectId, result.passwordHash);
  if (!session) {
    return { error: "서버 설정 오류로 접근 확인을 처리할 수 없습니다. 운영자에게 문의하세요." };
  }

  const cookieStore = await cookies();
  cookieStore.set(projectAccessCookieName(projectId), session.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: session.expires,
    path: `/projects/${projectId}`,
  });

  redirect(`/projects/${projectId}/analysis`);
}
