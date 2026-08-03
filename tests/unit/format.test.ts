import { describe, expect, it } from "vitest";
import {
  DATA_PROVENANCE_LABEL_KO,
  DISPLAY_TIME_ZONE,
  PROVENANCE_UNKNOWN_LABEL_KO,
  formatDateTime,
  provenanceLabel,
} from "@/lib/format";

describe("provenanceLabel — MISSING과 null/undefined를 서로 다른 문구로 구분한다(2026-08-01 보완)", () => {
  it("MISSING은 '근거 없음'이다(근거를 확인했으나 사용할 근거가 없는 경우)", () => {
    expect(provenanceLabel("MISSING")).toBe("근거 없음");
  });

  it("null은 '판정 정보 없음'이다(레거시 데이터·출처 판정 정보 자체가 없는 경우)", () => {
    expect(provenanceLabel(null)).toBe(PROVENANCE_UNKNOWN_LABEL_KO);
  });

  it("undefined도 '판정 정보 없음'이다", () => {
    expect(provenanceLabel(undefined)).toBe(PROVENANCE_UNKNOWN_LABEL_KO);
  });

  it("null과 MISSING은 서로 다른 문구를 반환한다", () => {
    expect(provenanceLabel(null)).not.toBe(provenanceLabel("MISSING"));
  });

  it("나머지 provenance 값은 각각 고유한 한글 라벨을 반환한다(LIVE_API/CACHED_API/CURATED/ESTIMATED)", () => {
    expect(provenanceLabel("LIVE_API")).toBe(DATA_PROVENANCE_LABEL_KO.LIVE_API);
    expect(provenanceLabel("CACHED_API")).toBe(DATA_PROVENANCE_LABEL_KO.CACHED_API);
    expect(provenanceLabel("CURATED")).toBe(DATA_PROVENANCE_LABEL_KO.CURATED);
    expect(provenanceLabel("ESTIMATED")).toBe(DATA_PROVENANCE_LABEL_KO.ESTIMATED);

    const labels = [
      provenanceLabel("LIVE_API"),
      provenanceLabel("CACHED_API"),
      provenanceLabel("CURATED"),
      provenanceLabel("ESTIMATED"),
      provenanceLabel("MISSING"),
      provenanceLabel(null),
    ];
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("내부 enum 이름을 화면 문구에 그대로 노출하지 않는다", () => {
    for (const value of ["LIVE_API", "CACHED_API", "CURATED", "ESTIMATED", "MISSING"] as const) {
      expect(provenanceLabel(value)).not.toBe(value);
    }
  });
});

/**
 * 2026-08-04: 프로젝트 생성일·수정일 등 사용자 표시 날짜가 서버 실행 환경(Vercel은 기본 UTC)이나
 * 브라우저 로컬 시간대에 좌우되지 않고 항상 한국 시간(Asia/Seoul, UTC+9)으로 표시되는지 검증한다.
 * DB에는 항상 UTC로 저장된 값을 그대로 쓰고, 표시할 때만 시간대를 명시적으로 변환한다 — 저장 값
 * 자체를 9시간 더하거나 KST 문자열로 바꿔 저장하지 않는다는 원칙을 코드가 지키는지 함께 확인한다.
 */
describe("formatDateTime — Asia/Seoul 표시(2026-08-04)", () => {
  it("DISPLAY_TIME_ZONE은 Asia/Seoul이다", () => {
    expect(DISPLAY_TIME_ZONE).toBe("Asia/Seoul");
  });

  it("UTC와 한국 날짜가 달라지는 대표 사례: 2026-08-03T17:20:00Z → 한국 시간 2026-08-04 02:20(24시간제)", () => {
    expect(formatDateTime("2026-08-03T17:20:00.000Z")).toBe("2026. 08. 04. 02:20");
  });

  it("UTC 자정 이전(같은 한국 날짜)과 자정 직후(다음 한국 날짜) 경계를 24시간제로 정확히 구분한다(AM/PM 혼동 없음)", () => {
    // UTC 14:59 → KST(UTC+9) 23:59, 같은 날.
    expect(formatDateTime("2026-08-03T14:59:00.000Z")).toBe("2026. 08. 03. 23:59");
    // UTC 15:00 → KST 00:00, 다음 날로 넘어감.
    expect(formatDateTime("2026-08-03T15:00:00.000Z")).toBe("2026. 08. 04. 00:00");
  });

  it("월말 경계에서도 한국 시간 기준으로 다음 달로 정확히 넘어간다(24시간제)", () => {
    // UTC 1월 31일 15:30 → KST 2월 1일 00:30.
    expect(formatDateTime("2026-01-31T15:30:00.000Z")).toBe("2026. 02. 01. 00:30");
  });

  it("연말 경계에서도 한국 시간 기준으로 다음 해로 정확히 넘어간다(24시간제)", () => {
    // UTC 12월 31일 15:15 → KST 다음 해 1월 1일 00:15.
    expect(formatDateTime("2026-12-31T15:15:00.000Z")).toBe("2027. 01. 01. 00:15");
  });

  it("Date 객체를 넘겨도 문자열을 넘긴 것과 동일한 한국 시간 결과를 낸다", () => {
    const iso = "2026-08-03T17:20:00.000Z";
    expect(formatDateTime(new Date(iso))).toBe(formatDateTime(iso));
  });

  it("timeZone을 명시하므로 process.env.TZ가 UTC여도 결과가 바뀌지 않는다(서버 환경 의존 없음)", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "UTC";
      expect(formatDateTime("2026-08-03T17:20:00.000Z")).toBe("2026. 08. 04. 02:20");
    } finally {
      process.env.TZ = original;
    }
  });

  it("24시간제이므로 결과 문자열에 오전/오후/AM/PM이 전혀 포함되지 않는다", () => {
    const samples = [
      "2026-08-03T17:20:00.000Z",
      "2026-08-03T14:59:00.000Z",
      "2026-08-03T15:00:00.000Z",
      "2026-01-31T15:30:00.000Z",
    ];
    for (const iso of samples) {
      const formatted = formatDateTime(iso);
      expect(formatted).not.toMatch(/오전|오후|AM|PM/);
    }
  });

  it("null/undefined는 '-'로 안전하게 표시한다(값을 지어내지 않음)", () => {
    expect(formatDateTime(null)).toBe("-");
    expect(formatDateTime(undefined)).toBe("-");
  });
});
