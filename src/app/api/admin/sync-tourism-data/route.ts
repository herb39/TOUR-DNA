import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/services/cronAuth";
import { runTourismDataSync } from "@/lib/services/syncService";
import { DEFAULT_BASE_YM } from "@/lib/fixtures/metrics";

export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let baseYm = process.env.TOUR_DATA_BASE_YM ?? DEFAULT_BASE_YM;
  try {
    const body = await request.json().catch(() => null);
    if (body && typeof body.baseYm === "string") {
      baseYm = body.baseYm;
    }
  } catch {
    // 본문 없음/파싱 실패 시 기본 baseYm 사용
  }

  try {
    const result = await runTourismDataSync({ baseYm, triggeredBy: "ADMIN" });
    return NextResponse.json(result);
  } catch (e) {
    console.error(JSON.stringify({ level: "error", scope: "admin-sync", message: e instanceof Error ? e.message : "unknown" }));
    return NextResponse.json({ error: "sync failed" }, { status: 500 });
  }
}
