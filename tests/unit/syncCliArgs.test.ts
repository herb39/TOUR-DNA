import { describe, expect, it } from "vitest";
import { parseSyncCliArgs } from "@/lib/services/syncCliArgs";

describe("parseSyncCliArgs — CLI 기준월 입력 검증(2026-08-08)", () => {
  it("--base-ym=202606 형식을 정확히 파싱한다", () => {
    expect(parseSyncCliArgs(["--base-ym=202606"])).toEqual({ ok: true, baseYm: "202606", regionCode: null });
  });

  it("--base-ym 202606 형식(공백 구분)을 정확히 파싱한다", () => {
    expect(parseSyncCliArgs(["--base-ym", "202606"])).toEqual({ ok: true, baseYm: "202606", regionCode: null });
  });

  it("인자가 없으면 명시적 CLI 지정 없음으로 처리한다(환경변수/자동탐색으로 넘어감)", () => {
    expect(parseSyncCliArgs([])).toEqual({ ok: true, baseYm: null, regionCode: null });
  });

  it("구 위치 인자 형식(202606)은 더 이상 지원하지 않고 거부한다", () => {
    const result = parseSyncCliArgs(["202606"]);
    expect(result.ok).toBe(false);
  });

  it("알 수 없는 옵션은 즉시 거부한다", () => {
    const result = parseSyncCliArgs(["--unknown-flag"]);
    expect(result.ok).toBe(false);
  });

  it("--base-ym= 빈 값은 거부한다", () => {
    const result = parseSyncCliArgs(["--base-ym="]);
    expect(result.ok).toBe(false);
  });

  it("월이 13인 값은 거부한다", () => {
    const result = parseSyncCliArgs(["--base-ym=202613"]);
    expect(result.ok).toBe(false);
  });

  it("월이 00인 값은 거부한다", () => {
    const result = parseSyncCliArgs(["--base-ym=202600"]);
    expect(result.ok).toBe(false);
  });

  it("하이픈 포함 형식(2026-06)은 거부한다", () => {
    const result = parseSyncCliArgs(["--base-ym=2026-06"]);
    expect(result.ok).toBe(false);
  });

  it("옵션 문자열이 중첩되어 그대로 값으로 들어가는 경우(--base-ym=--base-ym=202606)를 거부한다", () => {
    const result = parseSyncCliArgs(["--base-ym=--base-ym=202606"]);
    expect(result.ok).toBe(false);
  });

  it("지나치게 먼 미래 연도는 거부한다", () => {
    const result = parseSyncCliArgs(["--base-ym=209912"]);
    expect(result.ok).toBe(false);
  });

  it("지나치게 오래된 과거 연도는 거부한다", () => {
    const result = parseSyncCliArgs(["--base-ym=199912"]);
    expect(result.ok).toBe(false);
  });

  it("--base-ym 뒤에 값이 없으면 거부한다", () => {
    const result = parseSyncCliArgs(["--base-ym"]);
    expect(result.ok).toBe(false);
  });

  it("--base-ym 뒤에 값이 2개 이상이면 거부한다", () => {
    const result = parseSyncCliArgs(["--base-ym", "202606", "202607"]);
    expect(result.ok).toBe(false);
  });

  it("잘못된 입력이어도 오류 메시지에 사용 예시(--base-ym=YYYYMM)를 포함한다", () => {
    const result = parseSyncCliArgs(["--unknown"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("--base-ym=YYYYMM");
    }
  });
});

describe("parseSyncCliArgs — --region-code 지역 필터 옵션(2026-08-08 도입)", () => {
  it("--region-code=SGG_JECHEON만 단독으로 지정하면 baseYm 없이 regionCode만 채워진다", () => {
    expect(parseSyncCliArgs(["--region-code=SGG_JECHEON"])).toEqual({
      ok: true,
      baseYm: null,
      regionCode: "SGG_JECHEON",
    });
  });

  it("--base-ym=202606 --region-code=SGG_JECHEON 조합을 순서와 무관하게 파싱한다", () => {
    expect(parseSyncCliArgs(["--base-ym=202606", "--region-code=SGG_JECHEON"])).toEqual({
      ok: true,
      baseYm: "202606",
      regionCode: "SGG_JECHEON",
    });
    expect(parseSyncCliArgs(["--region-code=SGG_JECHEON", "--base-ym=202606"])).toEqual({
      ok: true,
      baseYm: "202606",
      regionCode: "SGG_JECHEON",
    });
  });

  it("--region-code와 공백 구분 --base-ym을 함께 써도 정상 파싱한다", () => {
    expect(parseSyncCliArgs(["--base-ym", "202606", "--region-code=SGG_JECHEON"])).toEqual({
      ok: true,
      baseYm: "202606",
      regionCode: "SGG_JECHEON",
    });
  });

  it("--region-code= 빈 값은 거부한다", () => {
    const result = parseSyncCliArgs(["--region-code="]);
    expect(result.ok).toBe(false);
  });

  it("--region-code를 두 번 지정하면 거부한다", () => {
    const result = parseSyncCliArgs(["--region-code=SGG_JECHEON", "--region-code=SGG_YANGYANG"]);
    expect(result.ok).toBe(false);
  });

  it("--base-ym을 두 번 지정하면 거부한다(--region-code와 섞여 있어도 동일)", () => {
    const result = parseSyncCliArgs(["--base-ym=202606", "--region-code=SGG_JECHEON", "--base-ym=202607"]);
    expect(result.ok).toBe(false);
  });
});
