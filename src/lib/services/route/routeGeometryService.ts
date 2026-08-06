import type { CourseDay } from "@/lib/domain/planBuilder";
import { fetchKakaoRouteGeometry, KakaoGeometryError, type LatLng } from "./kakaoRouteGeometryProvider";

export interface RouteGeometrySegment {
  dayIndex: number;
  fromPoiId: string;
  toPoiId: string;
  /** 실제 도로 좌표(2개 이상). FALLBACK이면 항상 빈 배열 — 지도는 이 경우 기존 직선 연결선을 그린다. */
  path: LatLng[];
  source: "LIVE_ROUTE" | "FALLBACK";
}

interface PendingEdge {
  dayIndex: number;
  fromPoiId: string;
  toPoiId: string;
  from: LatLng;
  to: LatLng;
}

/** 실행안 화면 1회 렌더당 카카오에 실제로 요청할 수 있는 최대 구간 수(2026-08-06) — 현재 최대 일정
 * 규모(TWO_NIGHTS_THREE_DAYS 3일, 하루 최대 5개 장소+숙박)의 실제 구간 수(11개)에 사용자가 장소를
 * 자유롭게 추가하는 경우까지 넉넉히 감안한 상한이다. 초과분은 호출하지 않고 바로 FALLBACK 처리한다
 * (임의 대량 호출 방지 + Vercel 함수 timeout 안전장치, 아래 OVERALL_BUDGET_MS와 별개의 2차 방어선). */
const MAX_SEGMENTS = 24;
/** 동시에 진행할 카카오 호출 수 — 너무 높이면 순간 호출량이 튀어 429 위험이 커지고, 너무 낮으면 전체
 * 처리 시간이 늘어난다. */
const CONCURRENCY = 4;
/** 이 함수 전체가 쓸 수 있는 최대 시간(ms) — Vercel 서버리스 함수 기본 timeout(계정 등급에 따라
 * 10~15초)보다 충분히 낮게 잡아, 개별 호출이 전부 느려도 함수 자체가 timeout으로 죽기 전에 남은 구간을
 * FALLBACK으로 안전하게 반환할 수 있게 한다. */
const OVERALL_BUDGET_MS = 8000;

function collectEdges(days: CourseDay[]): PendingEdge[] {
  const edges: PendingEdge[] = [];
  for (const day of days) {
    for (let i = 1; i < day.items.length; i++) {
      const prev = day.items[i - 1];
      const cur = day.items[i];
      if (prev.lat == null || prev.lng == null || cur.lat == null || cur.lng == null) continue;
      edges.push({
        dayIndex: day.dayIndex,
        fromPoiId: prev.poiId,
        toPoiId: cur.poiId,
        from: { lat: prev.lat, lng: prev.lng },
        to: { lat: cur.lat, lng: cur.lng },
      });
    }
    if (day.lodging && day.items.length > 0) {
      const last = day.items[day.items.length - 1];
      const lodging = day.lodging;
      if (last.lat != null && last.lng != null && lodging.lat != null && lodging.lng != null) {
        edges.push({
          dayIndex: day.dayIndex,
          fromPoiId: last.poiId,
          toPoiId: lodging.poiId,
          from: { lat: last.lat, lng: last.lng },
          to: { lat: lodging.lat, lng: lodging.lng },
        });
      }
    }
  }
  return edges;
}

function toFallbackSegment(edge: PendingEdge): RouteGeometrySegment {
  return { dayIndex: edge.dayIndex, fromPoiId: edge.fromPoiId, toPoiId: edge.toPoiId, path: [], source: "FALLBACK" };
}

/**
 * PRIVATE_VEHICLE 실행안의 인접 구간 실제 도로 경로 좌표를 조회한다(2026-08-06). DB에는 전혀
 * 저장하지 않고, 호출한 화면 렌더링에만 쓰일 값을 그때그때 반환한다 — 새로고침·재접속하면 이 함수가
 * 처음부터 다시 호출된다. 일부 구간이 실패해도 나머지 구간은 계속 시도하며, 실패한 구간은 항상
 * source: "FALLBACK"(path: [])으로 채워 호출부가 예외 없이 직선 연결선으로 대체할 수 있게 한다.
 */
export async function fetchCourseRouteGeometry(days: CourseDay[]): Promise<RouteGeometrySegment[]> {
  const allEdges = collectEdges(days);
  const edges = allEdges.slice(0, MAX_SEGMENTS);
  const droppedCount = allEdges.length - edges.length;
  if (droppedCount > 0) {
    console.error(
      JSON.stringify({ level: "warn", source: "routeGeometryService", message: "segment cap exceeded, extra segments fallback", droppedCount }),
    );
  }

  const results: RouteGeometrySegment[] = new Array(edges.length);
  const startedAt = Date.now();
  let stopRequested = false; // 429 또는 시간 예산 초과 시 나머지 구간을 즉시 FALLBACK 처리한다.
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= edges.length) return;
      if (stopRequested || Date.now() - startedAt > OVERALL_BUDGET_MS) {
        results[i] = toFallbackSegment(edges[i]);
        continue;
      }
      const edge = edges[i];
      try {
        const path = await fetchKakaoRouteGeometry(edge.from, edge.to);
        results[i] = { dayIndex: edge.dayIndex, fromPoiId: edge.fromPoiId, toPoiId: edge.toPoiId, path, source: "LIVE_ROUTE" };
      } catch (e) {
        const reason = e instanceof KakaoGeometryError ? e.reason : "UNKNOWN_ERROR";
        console.error(
          JSON.stringify({ level: "warn", source: "routeGeometryService", message: "geometry fetch failed, fallback to straight line", reason }),
        );
        results[i] = toFallbackSegment(edge);
        if (reason === "RATE_LIMITED") stopRequested = true;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, edges.length) }, () => worker()));

  return [...results, ...allEdges.slice(edges.length).map(toFallbackSegment)];
}
