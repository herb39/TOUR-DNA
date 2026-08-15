/**
 * 동일 시설(같은 좌표) 내 여러 입점매장이 자동 추천에서 별도 관광지처럼 반복되는 문제를 완화하는
 * 순수 domain helper(2026-08-16). 전국 POI 좌표 분포 조사 결과, SHOPPING 카테고리만 동일 좌표 그룹의
 * 최대 크기(205)·평균 크기(12.3)·10개 이상 그룹 수(120)가 다른 카테고리(전부 최대 9 이하, 평균 2.1~2.3)
 * 와 뚜렷이 달라, 백화점/아울렛 내부의 여러 브랜드 매장이 각각 별도 SHOPPING POI로 등록된 패턴임을
 * 확인했다 — 이 모듈은 그 경험적 분포 차이에 근거해 호출부가 좁혀 쓰도록 범용으로 작성한다(특정 상호명
 * 판정 없음). 반대로 ATTRACTION/FOOD/EXPERIENCE/FESTIVAL/LODGING의 동일 좌표 그룹은 실제로 서로 다른
 * 콘텐츠(다른 날짜의 축제, 같은 리조트의 다른 동 등)인 사례가 많아 이 모듈로 일괄 처리하지 않는다 —
 * 호출부가 대상 배열을 직접 선택해서 넘긴다(카테고리 필터링 책임은 호출부에 있음).
 *
 * DB의 POI 원본 데이터는 전혀 바꾸지 않는다 — 추천 후보 배열만 그룹당 대표 1건으로 좁힌다.
 */
export function dedupeBySameCoordinates<T extends { lat?: number; lng?: number }>(
  candidates: T[],
  pickRepresentative: (group: T[]) => T,
): T[] {
  const groups = new Map<string, T[]>();
  const groupOrder: string[] = [];
  const withoutCoords: T[] = [];

  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng)) {
      withoutCoords.push(candidate);
      continue;
    }
    const key = `${candidate.lat}|${candidate.lng}`;
    const group = groups.get(key);
    if (group) {
      group.push(candidate);
    } else {
      groups.set(key, [candidate]);
      groupOrder.push(key);
    }
  }

  const deduped = groupOrder.map((key) => pickRepresentative(groups.get(key)!));
  return [...deduped, ...withoutCoords];
}
