import { prisma } from "@/lib/db";
import type { TransportModeCode } from "@/lib/domain/geo";
import type { RouteProviderName, RouteResult } from "./types";

/**
 * 카카오 응답을 자체 DB에 저장·재사용해도 되는지 공식 약관 조항으로 확정하지 못했다(2026-08-06 재확인
 * — policy.kakaomobility.com 약관 뷰어는 자동 조회로 조항 본문을 확인할 수 없었다). 오히려 카카오 측
 * 안내(기술 제휴 문의에 대한 커뮤니티 공개 답변)는 "해당 기능은 지원하지 않습니다. 운영 정책상 정보
 * 저장은 허용되지 않습니다"였다 — 이는 "여러 요청·여러 사용자에 걸쳐 같은 결과를 재사용하는 캐시"에
 * 대한 답변으로, RouteCache가 하는 일과 정확히 같은 성격이다(같은 POI쌍 요청을 다른 프로젝트·다른
 * 시점에 재사용). 이 근거가 확정 약관 조항은 아니지만 "허용된다"고 단정할 근거도 없으므로, 이번
 * 작업 지시(불명확하면 안전한 쪽으로 비활성화)에 따라 **RouteCache 읽기·쓰기를 기능 플래그로
 * 비활성화한다.** 테이블/migration은 그대로 남겨두되(되돌리기 쉬운 최소 변경) 실제 호출은 항상
 * 캐시를 건너뛴다 — 공식 확인 후 `ROUTE_CACHE_ENABLED`만 true로 되돌리면 즉시 재사용할 수 있다.
 *
 * SelectedPlan.course에 사용자 자신의 실행안 결과로 거리·시간을 저장하는 것은 이 캐시와는 다른
 * 성격(다른 사용자·다른 요청에 재사용하지 않고, 그 프로젝트 담당자가 요청한 자신의 코스 문서에만
 * 남는 값)이라고 판단해 그대로 유지했다 — 다만 이 구분도 카카오 측의 명시적 확인을 받은 것은 아니므로,
 * Production 정식 운영 전 반드시 별도로 확인해야 한다(`docs/route-api-status.md` BLOCKED 항목 참고).
 */
export const ROUTE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24시간(플래그가 다시 켜질 경우에만 의미가 있음)
export const ROUTE_CACHE_ENABLED = false;

export async function getCachedRoute(
  fromKey: string,
  toKey: string,
  transport: TransportModeCode,
  provider: RouteProviderName,
  routeVersion: string,
): Promise<RouteResult | null> {
  if (!ROUTE_CACHE_ENABLED) return null;

  const row = await prisma.routeCache.findUnique({
    where: {
      fromKey_toKey_transport_provider_routeVersion: { fromKey, toKey, transport, provider, routeVersion },
    },
  });
  if (!row) return null;
  const ageMs = Date.now() - row.fetchedAt.getTime();
  if (ageMs > ROUTE_CACHE_TTL_MS) return null; // 만료 — 삭제하지 않고 무시만 한다(다음 저장 시 덮어씀).

  return {
    distanceKm: row.distanceKm,
    minutes: row.minutes,
    source: "CACHED_API",
    provider: row.provider as RouteProviderName,
    calculatedAt: row.fetchedAt.toISOString(),
  };
}

export async function saveCachedRoute(
  fromKey: string,
  toKey: string,
  transport: TransportModeCode,
  provider: RouteProviderName,
  routeVersion: string,
  distanceKm: number,
  minutes: number,
): Promise<void> {
  if (!ROUTE_CACHE_ENABLED) return;

  await prisma.routeCache.upsert({
    where: {
      fromKey_toKey_transport_provider_routeVersion: { fromKey, toKey, transport, provider, routeVersion },
    },
    create: { fromKey, toKey, transport, provider, routeVersion, distanceKm, minutes },
    update: { distanceKm, minutes, fetchedAt: new Date() },
  });
}
