"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionCookieValue, SITE_ACCESS_COOKIE_NAME } from "@/lib/services/siteAuth";

export interface LoginFormState {
  error?: string;
}

/** "/" 밖으로 나가는 경로만 next로 허용한다(오픈 리다이렉트 방지). */
function safeNextPath(next: FormDataEntryValue | null): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export async function loginAction(_prevState: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const password = process.env.SITE_ACCESS_PASSWORD;
  const input = formData.get("password");
  const next = safeNextPath(formData.get("next"));

  if (!password) {
    return { error: "SITE_ACCESS_PASSWORD가 설정되지 않았습니다. 운영자에게 문의하세요." };
  }
  if (typeof input !== "string" || input !== password) {
    return { error: "비밀번호가 올바르지 않습니다." };
  }

  const session = createSessionCookieValue(password);
  const cookieStore = await cookies();
  cookieStore.set(SITE_ACCESS_COOKIE_NAME, session.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: session.expires,
    path: "/",
  });

  redirect(next);
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SITE_ACCESS_COOKIE_NAME);
  redirect("/login");
}
