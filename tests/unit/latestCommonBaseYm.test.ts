import { describe, expect, it, vi } from "vitest";
import { findLatestCommonBaseYm, type CoreSourceProbeResult } from "@/lib/services/latestCommonBaseYm";

function ok(hasData: boolean): CoreSourceProbeResult {
  return { ok: true, hasData, isRateLimited: false };
}
function rateLimited(): CoreSourceProbeResult {
  return { ok: false, hasData: false, isRateLimited: true, errorMessage: "HTTP 429" };
}
function failed(): CoreSourceProbeResult {
  return { ok: false, hasData: false, isRateLimited: false, errorMessage: "HTTP 500" };
}

const NOW = new Date("2026-08-08T00:00:00Z");

describe("findLatestCommonBaseYm — 최신 공통월 자동 탐색(2026-08-08 도입)", () => {
  it("가장 최근 달(직전 달)에 두 소스 모두 데이터가 있으면 그 달을 즉시 선택한다", async () => {
    const probeTarSvcDem = vi.fn().mockResolvedValue(ok(true));
    const probeTouResDem = vi.fn().mockResolvedValue(ok(true));

    const result = await findLatestCommonBaseYm({ now: NOW, probeTarSvcDem, probeTouResDem });

    expect(result.state).toBe("FOUND");
    if (result.state === "FOUND") expect(result.baseYm).toBe("202607");
    expect(probeTarSvcDem).toHaveBeenCalledTimes(1);
    expect(probeTouResDem).toHaveBeenCalledTimes(1);
  });

  it("이번 달(현재 진행 중인 달)은 절대 확인하지 않는다", async () => {
    const probeTarSvcDem = vi.fn().mockResolvedValue(ok(true));
    const probeTouResDem = vi.fn().mockResolvedValue(ok(true));

    await findLatestCommonBaseYm({ now: NOW, probeTarSvcDem, probeTouResDem });

    expect(probeTarSvcDem).not.toHaveBeenCalledWith("202608");
  });

  it("가장 최근 달이 EMPTY면 더 과거 달로 계속 내려가 공통월을 찾는다", async () => {
    const probeTarSvcDem = vi.fn().mockResolvedValueOnce(ok(false)).mockResolvedValueOnce(ok(true));
    const probeTouResDem = vi.fn().mockResolvedValueOnce(ok(true)).mockResolvedValueOnce(ok(true));

    const result = await findLatestCommonBaseYm({ now: NOW, probeTarSvcDem, probeTouResDem });

    expect(result.state).toBe("FOUND");
    if (result.state === "FOUND") expect(result.baseYm).toBe("202606");
  });

  it("한 소스라도 데이터가 없는 달(소스별 최신월 불일치)은 공통월로 채택하지 않는다", async () => {
    const probeTarSvcDem = vi.fn().mockResolvedValue(ok(false)); // 계속 EMPTY
    const probeTouResDem = vi.fn().mockResolvedValue(ok(true)); // 계속 있음

    const result = await findLatestCommonBaseYm({ now: NOW, maxLookback: 3, probeTarSvcDem, probeTouResDem });

    expect(result.state).toBe("NONE_FOUND");
    if (result.state === "NONE_FOUND") {
      expect(result.checked.every((c) => !c.bothHaveData)).toBe(true);
    }
  });

  it("maxLookback을 모두 소진해도 공통월을 찾지 못하면 NONE_FOUND를 반환하고 임의 값을 대신 쓰지 않는다", async () => {
    const probeTarSvcDem = vi.fn().mockResolvedValue(ok(false));
    const probeTouResDem = vi.fn().mockResolvedValue(ok(false));

    const result = await findLatestCommonBaseYm({ now: NOW, maxLookback: 2, probeTarSvcDem, probeTouResDem });

    expect(result.state).toBe("NONE_FOUND");
    if (result.state === "NONE_FOUND") expect(result.checked).toHaveLength(2);
    expect(probeTarSvcDem).toHaveBeenCalledTimes(2);
  });

  it("429(rate limit)가 감지되면 즉시 탐색을 중단하고 더 과거 달은 호출하지 않는다", async () => {
    const probeTarSvcDem = vi.fn().mockResolvedValue(rateLimited());
    const probeTouResDem = vi.fn().mockResolvedValue(ok(true));

    const result = await findLatestCommonBaseYm({ now: NOW, maxLookback: 4, probeTarSvcDem, probeTouResDem });

    expect(result.state).toBe("RATE_LIMITED");
    expect(probeTarSvcDem).toHaveBeenCalledTimes(1);
    expect(probeTouResDem).toHaveBeenCalledTimes(1);
  });

  it("일반 오류(429가 아님)는 탐색을 중단하지 않고 그 달을 EMPTY 취급해 더 과거로 계속 내려간다", async () => {
    const probeTarSvcDem = vi.fn().mockResolvedValueOnce(failed()).mockResolvedValueOnce(ok(true));
    const probeTouResDem = vi.fn().mockResolvedValue(ok(true));

    const result = await findLatestCommonBaseYm({ now: NOW, probeTarSvcDem, probeTouResDem });

    expect(result.state).toBe("FOUND");
    expect(probeTarSvcDem).toHaveBeenCalledTimes(2);
  });
});
