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
