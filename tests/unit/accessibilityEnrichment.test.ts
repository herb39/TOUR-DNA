import { describe, expect, it } from "vitest";
import { parseAccessibilityEnrichmentArgs } from "@/lib/domain/accessibilityEnrichment";

describe("accessibility enrichment CLI", () => {
  it("필수 인자와 선택 상한을 읽는다", () => {
    const result = parseAccessibilityEnrichmentArgs([
      "--region-code=SGG_GYEONGJU",
      "--max-items=8",
      "--max-list-pages=3",
      "--delay-ms=0",
      "--dry-run",
    ]);

    expect(result).toEqual({
      ok: true,
      value: { regionCode: "SGG_GYEONGJU", maxItems: 8, maxListPages: 3, delayMs: 0, dryRun: true },
    });
  });

  it("지역·상세 상한이 없거나 범위를 넘으면 거부한다", () => {
    expect(parseAccessibilityEnrichmentArgs(["--max-items=8"]).ok).toBe(false);
    expect(parseAccessibilityEnrichmentArgs(["--region-code=SGG_GYEONGJU"]).ok).toBe(false);
    expect(parseAccessibilityEnrichmentArgs(["--region-code=SGG_GYEONGJU", "--max-items=21"]).ok).toBe(false);
    expect(parseAccessibilityEnrichmentArgs(["--region-code=SGG_GYEONGJU", "--max-items=8", "--max-list-pages=21"]).ok).toBe(false);
  });
});
