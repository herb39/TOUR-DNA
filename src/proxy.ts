import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SITE_ACCESS_COOKIE_NAME, isValidSessionCookieValue } from "@/lib/services/siteAuth";

/**
 * 계정/로그인 시스템 없이, 공유 비밀번호 하나로 사이트 전체를 외부에서 못 보게 막는 최소 게이트다.
 * /api(자체 CRON_SECRET 인증 사용)와 /login, 정적 자산은 matcher에서 제외한다.
 * SITE_ACCESS_PASSWORD가 설정되지 않으면 게이트를 비활성화한다(로컬 개발 편의 — 배포 환경에는
 * 반드시 설정해야 한다).
 */
export function proxy(request: NextRequest) {
  const password = process.env.SITE_ACCESS_PASSWORD;
  if (!password) return NextResponse.next();

  const cookieValue = request.cookies.get(SITE_ACCESS_COOKIE_NAME)?.value;
  if (isValidSessionCookieValue(cookieValue, password)) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login).*)"],
};
