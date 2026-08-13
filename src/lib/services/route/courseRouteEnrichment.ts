import type { CourseDay, CourseItem, TransportCode } from "@/lib/domain/planBuilder";
import { getRoute } from "./routeService";
import type { RouteResult } from "./types";

/** 카카오 실제 경로/캐시 결과의 표시 문구 — 거리·시간만 담고("18.3km · 약 29분"), 실제/캐시/추정
 * 구분은 travelSource 필드를 보고 화면이 별도 배지로 표시한다(travelSourceLabel, format.ts). 문구 안에
 * "실제 도로 기준"을 다시 넣지 않는 것은 배지와 중복 표시를 피하기 위함이다. ESTIMATED는 카카오 호출이
 * 아예 시도되지 않았거나 실패해 haversine으로 대체된 경우이며, 기존 estimateTravel 라벨 문구 스타일
 * (차량 기준)을 그대로 따른다 — 기존 haversine 산식·문구 자체를 바꾸지 않는다. */
function formatEnrichedTravelLabel(result: RouteResult): string {
  const distanceText = `${result.distanceKm.toFixed(1)}km`;
  if (result.source === "LIVE_API" || result.source === "CACHED_API") {
    return `${distanceText} · 약 ${result.minutes}분`;
  }
  return `이동 약 ${result.minutes}분(약 ${distanceText}, 차량 기준)`;
}

function applyRouteResult(item: CourseItem, result: RouteResult): CourseItem {
  return {
    ...item,
    travel: formatEnrichedTravelLabel(result),
    travelDistanceKm: result.distanceKm,
    travelMinutes: result.minutes,
    travelSource: result.source,
    travelProvider: result.provider,
    travelCalculatedAt: result.calculatedAt,
  };
}

function edgeKey(fromPoiId: string, toPoiId: string): string {
  return `${fromPoiId}::${toPoiId}`;
}

/** 이전에 저장된 날짜의 인접 구간(순서 i-1→i, 마지막 항목→숙박) 중 이미 실제/캐시 결과가 있던 것만
 * key로 모은다 — 추정치(ESTIMATED)였던 구간은 여기 담지 않는다(그래야 아직 실제 호출을 못 받아본
 * 구간이 나중에 순서가 같아지더라도 실제 값을 가져올 기회를 잃지 않는다). */
function collectPreviousResolvedEdges(day: CourseDay | undefined): Map<string, CourseItem> {
  const map = new Map<string, CourseItem>();
  if (!day) return map;
  for (let i = 1; i < day.items.length; i++) {
    const prev = day.items[i - 1];
    const cur = day.items[i];
    if (cur.travelSource === "LIVE_API" || cur.travelSource === "CACHED_API") {
      map.set(edgeKey(prev.poiId, cur.poiId), cur);
    }
  }
  if (day.lodging && day.items.length > 0) {
    const last = day.items[day.items.length - 1];
    if (day.lodging.travelSource === "LIVE_API" || day.lodging.travelSource === "CACHED_API") {
      map.set(edgeKey(last.poiId, day.lodging.poiId), day.lodging);
    }
  }
  return map;
}

/**
 * PRIVATE_VEHICLE 실행안의 인접 구간 이동 결과를 카카오 실제 도로 경로(또는 실패 시 haversine
 * fallback)로 채운다. 이 함수를 부르기 전에 이미 recomputeDayItems/buildDraftCourse가 haversine 기반
 * travel 라벨과 순서(order)를 전부 확정해 둔 상태여야 한다 — 여기서는 그 산식이나 순서를 다시
 * 계산하지 않고, 이미 확정된 인접 POI 쌍에 대해서만 실제 경로 결과로 travel/구조화 필드를 덮어쓴다.
 *
 * previousDays가 주어지면(실행안 편집 저장 시) 같은 dayIndex의 이전 결과와 비교해, 순서·POI 쌍이
 * 그대로인 구간은 재호출하지 않고 이전 실제/캐시 결과를 그대로 이어받는다(시간·체류시간만 바뀐 경우도
 * 여기 해당한다 — 그 변경은 인접 POI 쌍 자체를 바꾸지 않으므로 재호출이 일어나지 않는다). 새로
 * 생긴 인접 쌍(순서 변경·추가·삭제로 실제 바뀐 구간)만 routeService를 새로 호출한다. transport가
 * PRIVATE_VEHICLE이 아니면 아무 것도 하지 않고 입력을 그대로 반환한다(호출 자체를 하지 않음).
 */
export async function enrichCourseDaysWithRealRoutes(
  days: CourseDay[],
  transport: TransportCode,
  previousDays: CourseDay[] | null,
): Promise<CourseDay[]> {
  if (transport !== "PRIVATE_VEHICLE") return days;

  const previousByDayIndex = new Map((previousDays ?? []).map((d) => [d.dayIndex, d]));

  // 2026-08-13(로딩 성능 개선): 구간(변)마다 카카오 경로 API를 순차 await로 기다리면 하루 코스의
  // 구간 수만큼 왕복 지연이 그대로 합산돼 실행안 최초 생성/전략 재선택 직후 페이지가 오래 멈춰
  // 있었다. 각 구간은 서로 다른 POI 쌍을 조회할 뿐 서로 의존하지 않으므로(이전 구간의 결과가 다음
  // 구간의 입력이 되지 않음), 재사용 가능한 구간(이미 실제/캐시 결과가 있는 것)을 먼저 걸러내고
  // 나머지 요청만 Promise.all로 한 번에 보낸다 — 산식/순서/재사용 판정 로직 자체는 그대로다.
  const result = await Promise.all(
    days.map(async (day) => {
      const previousResolved = collectPreviousResolvedEdges(previousByDayIndex.get(day.dayIndex));
      const items = [...day.items];
      let lodging = day.lodging;

      type PendingEdge = { kind: "item"; index: number } | { kind: "lodging" };
      const pending: PendingEdge[] = [];
      const requests: Promise<RouteResult>[] = [];

      for (let i = 1; i < items.length; i++) {
        const prev = items[i - 1];
        const cur = items[i];
        const reused = previousResolved.get(edgeKey(prev.poiId, cur.poiId));
        if (reused) {
          items[i] = { ...cur, ...pickRouteFields(reused) };
        } else {
          pending.push({ kind: "item", index: i });
          requests.push(getRoute(prev, cur, transport));
        }
      }

      if (lodging && items.length > 0) {
        const last = items[items.length - 1];
        const reused = previousResolved.get(edgeKey(last.poiId, lodging.poiId));
        if (reused) {
          lodging = { ...lodging, ...pickRouteFields(reused) };
        } else {
          pending.push({ kind: "lodging" });
          requests.push(getRoute(last, lodging, transport));
        }
      }

      const resolved = await Promise.all(requests);
      resolved.forEach((routeResult, k) => {
        const target = pending[k];
        if (target.kind === "item") {
          items[target.index] = applyRouteResult(items[target.index], routeResult);
        } else {
          lodging = applyRouteResult(lodging!, routeResult);
        }
      });

      return { ...day, items, lodging };
    }),
  );
  return result;
}

function pickRouteFields(source: CourseItem): Pick<CourseItem, "travel" | "travelDistanceKm" | "travelMinutes" | "travelSource" | "travelProvider" | "travelCalculatedAt"> {
  return {
    travel: source.travel,
    travelDistanceKm: source.travelDistanceKm,
    travelMinutes: source.travelMinutes,
    travelSource: source.travelSource,
    travelProvider: source.travelProvider,
    travelCalculatedAt: source.travelCalculatedAt,
  };
}
