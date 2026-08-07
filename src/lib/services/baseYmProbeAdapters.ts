import { prisma } from "@/lib/db";
import { fetchPublicDataJson } from "@/lib/public-data/client";
import type { CoreSourceProbeResult } from "./latestCommonBaseYm";

/**
 * 최신 공통월 탐색(`latestCommonBaseYm.ts`)이 실제 공공데이터 API를 호출하도록 연결하는 얇은 층
 * (2026-08-08 도입). 순수 탐색 로직과 분리해 이 파일만 `@/lib/db`/실제 fetch를 사용한다.
 *
 * 비용을 최소화하기 위해 다음을 지킨다:
 * - 대표 지역 1곳만 사용한다(전 지역이 아니라 제천시 — 여러 세션에 걸쳐 실키로 반복 확인된 안정적인
 *   지역이라 코드 오류로 인한 오탐 위험이 낮다).
 * - 각 소스마다 오퍼레이션 1개만 호출한다(TAR_SVC_DEM은 체류만, 다양성/소비는 확인하지 않는다 — 이
 *   탐색의 목적은 "그 달 데이터가 존재하는지"만 확인하는 것이라 하나면 충분하다).
 * - `numOfRows=1`로 응답 크기를 최소화한다.
 */

const PROBE_REGION = { areaCd: "43", signguCd: "43150" }; // 제천시

function isRateLimitedMessage(message: string | undefined): boolean {
  return message !== undefined && message.includes("429");
}

export async function probeTarSvcDemLive(baseYm: string): Promise<CoreSourceProbeResult> {
  const serviceKey = process.env.TOUR_API_SERVICE_KEY;
  if (!serviceKey) {
    return { ok: false, hasData: false, isRateLimited: false, errorMessage: "TOUR_API_SERVICE_KEY 미설정" };
  }
  const source = await prisma.dataSource.findUnique({ where: { code: "TAR_SVC_DEM" } });
  if (!source) {
    return { ok: false, hasData: false, isRateLimited: false, errorMessage: "DataSource TAR_SVC_DEM 미등록" };
  }
  const qs = new URLSearchParams({
    serviceKey,
    MobileOS: "ETC",
    MobileApp: "TourDNA",
    areaCd: PROBE_REGION.areaCd,
    signguCd: PROBE_REGION.signguCd,
    baseYm,
    tarSjrnDsIxCd: "2103",
    numOfRows: "1",
    pageNo: "1",
    _type: "json",
  });
  const res = await fetchPublicDataJson(`${source.baseUrl}/areaTarSjrnDsList?${qs.toString()}`, {
    sourceCode: "PROBE:TAR_SVC_DEM",
  });
  if (!res.ok) {
    return { ok: false, hasData: false, isRateLimited: isRateLimitedMessage(res.errorMessage), errorMessage: res.errorMessage };
  }
  const body = res.data as { response?: { body?: { totalCount?: number } } };
  const totalCount = body?.response?.body?.totalCount ?? 0;
  return { ok: true, hasData: totalCount > 0, isRateLimited: false };
}

export async function probeTouResDemLive(baseYm: string): Promise<CoreSourceProbeResult> {
  const serviceKey = process.env.TOUR_API_SERVICE_KEY;
  if (!serviceKey) {
    return { ok: false, hasData: false, isRateLimited: false, errorMessage: "TOUR_API_SERVICE_KEY 미설정" };
  }
  const source = await prisma.dataSource.findUnique({ where: { code: "TOU_RES_DEM" } });
  if (!source) {
    return { ok: false, hasData: false, isRateLimited: false, errorMessage: "DataSource TOU_RES_DEM 미등록" };
  }
  const qs = new URLSearchParams({
    serviceKey,
    MobileOS: "ETC",
    MobileApp: "TourDNA",
    areaCd: PROBE_REGION.areaCd,
    signguCd: PROBE_REGION.signguCd,
    baseYm,
    tarSvcDemIxCd: "1101",
    numOfRows: "1",
    pageNo: "1",
    _type: "json",
  });
  const res = await fetchPublicDataJson(`${source.baseUrl}/areaTarSvcDemList?${qs.toString()}`, {
    sourceCode: "PROBE:TOU_RES_DEM",
  });
  if (!res.ok) {
    return { ok: false, hasData: false, isRateLimited: isRateLimitedMessage(res.errorMessage), errorMessage: res.errorMessage };
  }
  const body = res.data as { response?: { body?: { totalCount?: number } } };
  const totalCount = body?.response?.body?.totalCount ?? 0;
  return { ok: true, hasData: totalCount > 0, isRateLimited: false };
}
