import { describe, expect, it } from "vitest";
import { dedupeBySameCoordinates } from "@/lib/domain/poiDedup";

interface TestPoi {
  id: string;
  name: string;
  lat?: number;
  lng?: number;
}

function poi(id: string, name: string, lat?: number, lng?: number): TestPoi {
  return { id, name, lat, lng };
}

describe("dedupeBySameCoordinates", () => {
  it("완전히 동일한 좌표를 가진 후보들을 대표 1건으로 좁힌다", () => {
    const a = poi("a", "갤럭시 매장", 35.1, 129.0);
    const b = poi("b", "골든듀 매장", 35.1, 129.0);
    const c = poi("c", "다른 매장", 35.1, 129.0);
    const result = dedupeBySameCoordinates([a, b, c], (group) => group[0]);
    expect(result).toEqual([a]);
  });

  it("좌표가 서로 다르면 모두 유지된다", () => {
    const a = poi("a", "매장A", 35.1, 129.0);
    const b = poi("b", "매장B", 35.2, 129.1);
    const result = dedupeBySameCoordinates([a, b], (group) => group[0]);
    expect(result).toEqual([a, b]);
  });

  it("좌표가 없는 후보는 그룹핑 대상에서 제외되고 그대로 유지된다", () => {
    const withCoords1 = poi("a", "매장A", 35.1, 129.0);
    const withCoords2 = poi("b", "매장B", 35.1, 129.0);
    const noCoords = poi("c", "좌표없음");
    const result = dedupeBySameCoordinates([withCoords1, withCoords2, noCoords], (group) => group[0]);
    expect(result).toContainEqual(withCoords1);
    expect(result).toContainEqual(noCoords);
    expect(result).not.toContainEqual(withCoords2);
    expect(result.length).toBe(2);
  });

  it("각 그룹에 대해 pickRepresentative가 정확히 그 그룹만 받는다(대표 선택 로직 위임)", () => {
    const a = poi("a", "매장A", 35.1, 129.0);
    const b = poi("b", "매장B", 35.1, 129.0);
    const c = poi("c", "매장C", 36.0, 130.0);
    const result = dedupeBySameCoordinates([a, b, c], (group) => {
      // 그룹 크기가 1이면(c) 그대로, 2 이상이면(a,b) 이름이 가장 늦은 것을 고른다(테스트용 임의 규칙).
      if (group.length === 1) return group[0];
      return [...group].sort((x, y) => y.name.localeCompare(x.name, "ko"))[0];
    });
    expect(result).toContainEqual(b);
    expect(result).toContainEqual(c);
    expect(result).not.toContainEqual(a);
  });

  it("동일 좌표 그룹이 없으면(전부 유일 좌표) 원본과 동일하게 동작한다(회귀 없음)", () => {
    const a = poi("a", "매장A", 35.1, 129.0);
    const b = poi("b", "매장B", 35.2, 129.1);
    const c = poi("c", "매장C", 35.3, 129.2);
    const result = dedupeBySameCoordinates([a, b, c], (group) => group[0]);
    expect(result).toEqual([a, b, c]);
  });
});
