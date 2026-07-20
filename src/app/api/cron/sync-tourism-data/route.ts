import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/services/cronAuth";
import { runTourismDataSync } from "@/lib/services/syncService";
import { DEFAULT_BASE_YM } from "@/lib/fixtures/metrics";

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseYm = process.env.TOUR_DATA_BASE_YM ?? DEFAULT_BASE_YM;
  try {
    const result = await runTourismDataSync({ baseYm, triggeredBy: "CRON" });
    return NextResponse.json(result);
  } catch (e) {
    console.error(JSON.stringify({ level: "error", scope: "cron-sync", message: e instanceof Error ? e.message : "unknown" }));
    return NextResponse.json({ error: "sync failed" }, { status: 500 });
  }
}
