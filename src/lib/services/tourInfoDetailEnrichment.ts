import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { fetchTourInfoDetail } from "@/lib/public-data/adapters/tourInfoDetail";
import {
  mergeTourInfoDetail,
  MAX_DETAIL_ITEMS_PER_RUN,
  selectTourInfoDetailCandidates,
  type TourInfoDetailEnrichmentPoi,
} from "@/lib/domain/tourInfoDetailEnrichment";
import { ALLOW_REMOTE_DATA_SYNC_ENV, checkDataSyncTarget } from "@/lib/services/dataSyncTargetGuard";

export interface TourInfoDetailEnrichmentResult {
  status: "COMPLETED" | "BLOCKED" | "FAILED";
  regionCode: string;
  candidates: number;
  attempted: number;
  updated: number;
  noData: number;
  failed: number;
  messages: string[];
}

/** 공식 구조 분류가 확인된 VE07 문화시설·LS 레포츠에 상세 API를 maxItems 이내 순차 호출하고,
 * 기존 rawPayload를 보존하며 병합한다. */
export async function enrichTourInfoDetail(params: {
  regionCode: string;
  maxItems: number;
}): Promise<TourInfoDetailEnrichmentResult> {
  if (params.maxItems < 1 || params.maxItems > MAX_DETAIL_ITEMS_PER_RUN) {
    return {
      status: "FAILED",
      regionCode: params.regionCode,
      candidates: 0,
      attempted: 0,
      updated: 0,
      noData: 0,
      failed: 0,
      messages: [`maxItems는 1~${MAX_DETAIL_ITEMS_PER_RUN} 범위여야 합니다.`],
    };
  }
  const target = checkDataSyncTarget(process.env.DATABASE_URL, process.env[ALLOW_REMOTE_DATA_SYNC_ENV]);
  if (!target.allowed) {
    return {
      status: "BLOCKED",
      regionCode: params.regionCode,
      candidates: 0,
      attempted: 0,
      updated: 0,
      noData: 0,
      failed: 0,
      messages: [target.blockedReason ?? "DB 대상이 허용되지 않았습니다."],
    };
  }

  const serviceKey = process.env.TOUR_API_SERVICE_KEY;
  if (!serviceKey) {
    return {
      status: "FAILED",
      regionCode: params.regionCode,
      candidates: 0,
      attempted: 0,
      updated: 0,
      noData: 0,
      failed: 0,
      messages: ["TOUR_API_SERVICE_KEY가 설정되지 않았습니다."],
    };
  }

  const region = await prisma.region.findUnique({ where: { code: params.regionCode }, select: { id: true, code: true, level: true } });
  if (!region) {
    return {
      status: "FAILED",
      regionCode: params.regionCode,
      candidates: 0,
      attempted: 0,
      updated: 0,
      noData: 0,
      failed: 0,
      messages: [`지역 코드를 찾을 수 없습니다: ${params.regionCode}`],
    };
  }
  if (region.level !== "SIGUNGU") {
    return {
      status: "FAILED",
      regionCode: params.regionCode,
      candidates: 0,
      attempted: 0,
      updated: 0,
      noData: 0,
      failed: 0,
      messages: [`${params.regionCode}는 SIGUNGU 지역 코드가 아닙니다.`],
    };
  }

  const source = await prisma.dataSource.findUnique({ where: { code: "TOUR_INFO" }, select: { baseUrl: true } });
  if (!source) {
    return {
      status: "FAILED",
      regionCode: params.regionCode,
      candidates: 0,
      attempted: 0,
      updated: 0,
      noData: 0,
      failed: 0,
      messages: ["TOUR_INFO DataSource가 없습니다."],
    };
  }

  const rows = await prisma.poi.findMany({
    where: { regionId: region.id, sourceType: "API" },
    select: { id: true, externalId: true, sourceType: true, operatingHours: true, closedDays: true, rawPayload: true },
  });
  const candidates = selectTourInfoDetailCandidates(rows as TourInfoDetailEnrichmentPoi[], params.maxItems);
  let attempted = 0;
  let updated = 0;
  let noData = 0;
  let failed = 0;
  const messages: string[] = [];

  for (const candidate of candidates) {
    attempted++;
    const result = await fetchTourInfoDetail({
      serviceKey,
      baseUrl: source.baseUrl,
      contentId: candidate.externalId,
      contentTypeId: candidate.contentTypeId,
    });
    if (result.status === "ERROR") {
      failed++;
      messages.push(`${candidate.externalId}: ${result.resultMsg}`);
      continue;
    }

    const detail = result.items.find((item) => item.contentId === candidate.externalId) ?? result.items[0] ?? null;
    const merged = mergeTourInfoDetail(candidate, detail, new Date().toISOString());
    await prisma.poi.update({
      where: { id: candidate.id },
      data: {
        operatingHours: merged.operatingHours,
        closedDays: merged.closedDays,
        rawPayload: merged.rawPayload as unknown as Prisma.InputJsonValue,
      },
    });
    updated++;
    if (!detail || (!detail.operatingHours && !detail.closedDays)) noData++;
  }

  return {
    status: failed > 0 && updated === 0 ? "FAILED" : "COMPLETED",
    regionCode: params.regionCode,
    candidates: candidates.length,
    attempted,
    updated,
    noData,
    failed,
    messages,
  };
}
