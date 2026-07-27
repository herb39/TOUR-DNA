const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export function haversineDistanceKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 같은 구역으로 볼 거리 임계값(이 미만이면 이동시간을 최소치로 고정) — planBuilder.ts의
 * estimateTravel과 strategy.ts의 거리 기반 POI 선택이 공유하는 단일 기준. */
const SAME_BLOCK_DISTANCE_KM = 0.3;
const MIN_TRAVEL_MINUTES = 5;

/** 직선거리(km)와 평균 속도(km/h)로 예상 이동시간(분)을 계산한다(도로/대중교통 경로 미반영, 추정치).
 * planBuilder.ts(좌표 있는 두 지점의 실제 이동시간 표시)와 strategy.ts(POI 선택 단계의 거리 적합도
 * 판단)가 이 계산을 중복 구현하지 않고 공유한다 — 두 곳의 "몇 분짜리 이동인가" 기준이 어긋나지 않는다. */
export function estimateTravelMinutesForDistance(distanceKm: number, speedKmh: number): number {
  if (distanceKm < SAME_BLOCK_DISTANCE_KM) return MIN_TRAVEL_MINUTES;
  return Math.max(MIN_TRAVEL_MINUTES, Math.round((distanceKm / speedKmh) * 60));
}

export type TransportModeCode = "WALK" | "PUBLIC_TRANSPORT" | "PRIVATE_VEHICLE" | "MIXED";

/** 교통수단별 평균 속도(km/h) — planBuilder.ts(일정 표시용 실제 이동시간)와 strategy.ts(POI 선택
 * 단계의 거리 적합도 판단)가 동일한 기준으로 "몇 분짜리 이동인가"를 계산하도록 여기 하나에서만 관리한다. */
export const AVERAGE_SPEED_KMH: Record<TransportModeCode, number> = {
  WALK: 4,
  PUBLIC_TRANSPORT: 18,
  PRIVATE_VEHICLE: 28,
  MIXED: 15,
};

/** 두 좌표 사이의 예상 이동시간(분)을 교통수단 평균 속도 기준으로 계산한다. 좌표가 아예 없는 경우의
 * 처리(호출부마다 정책이 다를 수 있음 — 예: null 반환 후 UI 라벨 분기)는 이 함수의 책임이 아니다. */
export function estimateTravelMinutes(a: GeoPoint, b: GeoPoint, transport: TransportModeCode): number {
  return estimateTravelMinutesForDistance(haversineDistanceKm(a, b), AVERAGE_SPEED_KMH[transport]);
}

/**
 * 이동 구간 등급 — 정상(NORMAL) / 주의(CAUTION, 섬·산간·광역 등 지역 특성상 있을 수 있는 장거리) /
 * 비정상(EXCESSIVE, 원칙적으로 같은 날짜 안에서는 제외하거나 다음 날로 넘길 구간). 60분·90분 기준은
 * 논의된 초안 값을 그대로 채택했다 — 대중교통/도보처럼 느린 수단은 같은 물리적 거리에서도 더 쉽게
 * CAUTION/EXCESSIVE로 분류되므로, 지역 규모가 아니라 실제 소요 시간(교통수단 반영)으로 판정한다.
 * 60분 초과라고 후보를 무조건 제거하지는 않는다 — strategy.ts(선택 단계)는 이 등급을 "더 가까운
 * 대체가 있으면 그것을 우선"하는 선호도로만 쓰고, planBuilder.ts(일정 단계)만 EXCESSIVE에 한해
 * 교체·다음날 배정·제외를 판단한다(정책은 한 곳에서만 관리).
 */
export type TravelSegmentTier = "NORMAL" | "CAUTION" | "EXCESSIVE";
export const CAUTION_TRAVEL_MINUTES = 60;
export const EXCESSIVE_TRAVEL_MINUTES = 90;

export function classifyTravelMinutes(minutes: number | null): TravelSegmentTier {
  if (minutes === null) return "NORMAL"; // 좌표 없어 판단 불가 — 배제하지 않는다(안전한 기본값).
  if (minutes >= EXCESSIVE_TRAVEL_MINUTES) return "EXCESSIVE";
  if (minutes >= CAUTION_TRAVEL_MINUTES) return "CAUTION";
  return "NORMAL";
}

/**
 * 그리디 최근접 이웃 방식으로 지점을 방문 순서로 정렬한다(외판원 문제의 근사해).
 * 첫 지점을 시작점으로 고정하고, 매번 남은 지점 중 가장 가까운 곳을 다음 방문지로 선택한다.
 */
export function orderByNearestNeighbor<T extends GeoPoint>(points: T[]): T[] {
  if (points.length <= 1) return [...points];

  const remaining = [...points];
  const ordered: T[] = [remaining.shift() as T];

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineDistanceKm(last, remaining[i]);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }
    ordered.push(remaining.splice(nearestIdx, 1)[0]);
  }

  return ordered;
}
