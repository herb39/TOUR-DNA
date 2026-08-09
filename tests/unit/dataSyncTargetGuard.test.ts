import { describe, expect, it } from "vitest";
import { ALLOW_REMOTE_DATA_SYNC_ENV, checkDataSyncTarget } from "@/lib/services/dataSyncTargetGuard";

describe("checkDataSyncTarget — 대량 동기화 원격 DB 차단 가드(2026-08-08)", () => {
  it("localhost 대상은 허용한다", () => {
    const result = checkDataSyncTarget("postgresql://user:pass@localhost:5432/tour_dna_local", undefined);
    expect(result.allowed).toBe(true);
    expect(result.host).toBe("localhost");
    expect(result.database).toBe("tour_dna_local");
    expect(result.targetLabel).toContain("localhost");
    expect(result.targetLabel).toContain("tour_dna_local");
  });

  it("127.0.0.1 대상은 허용한다", () => {
    const result = checkDataSyncTarget("postgresql://user:pass@127.0.0.1:5432/tour_dna_local", undefined);
    expect(result.allowed).toBe(true);
    expect(result.host).toBe("127.0.0.1");
  });

  it("::1(IPv6 루프백) 대상은 허용한다", () => {
    const result = checkDataSyncTarget("postgresql://user:pass@[::1]:5432/tour_dna_local", undefined);
    expect(result.allowed).toBe(true);
  });

  it("Neon 등 원격 호스트는 기본적으로 차단하고, 사유에 실제 호스트명을 담는다", () => {
    const result = checkDataSyncTarget(
      "postgresql://user:pass@ep-dawn-sea-auqvg1i6.c-10.us-east-1.aws.neon.tech/neondb",
      undefined,
    );
    expect(result.allowed).toBe(false);
    expect(result.host).toBe("ep-dawn-sea-auqvg1i6.c-10.us-east-1.aws.neon.tech");
    expect(result.blockedReason).toContain("ep-dawn-sea-auqvg1i6.c-10.us-east-1.aws.neon.tech");
    expect(result.blockedReason).toContain(ALLOW_REMOTE_DATA_SYNC_ENV);
  });

  it("차단 사유·라벨 어디에도 비밀번호가 포함되지 않는다", () => {
    const result = checkDataSyncTarget(
      "postgresql://myuser:super-secret-password@some-remote-host.example.com/proddb",
      undefined,
    );
    expect(result.allowed).toBe(false);
    expect(result.targetLabel).not.toContain("super-secret-password");
    expect(result.blockedReason).not.toContain("super-secret-password");
    expect(result.targetLabel).not.toContain("myuser");
  });

  it("ALLOW_REMOTE_DATA_SYNC=true면 원격 호스트도 허용하고, 그 사실을 라벨에 남긴다", () => {
    const result = checkDataSyncTarget("postgresql://user:pass@some-remote-host.example.com/proddb", "true");
    expect(result.allowed).toBe(true);
    expect(result.targetLabel).toContain(ALLOW_REMOTE_DATA_SYNC_ENV);
  });

  it("ALLOW_REMOTE_DATA_SYNC가 'true' 외의 값이면 여전히 차단한다", () => {
    const result = checkDataSyncTarget("postgresql://user:pass@some-remote-host.example.com/proddb", "1");
    expect(result.allowed).toBe(false);
  });

  it("DATABASE_URL이 없으면 차단한다", () => {
    const result = checkDataSyncTarget(undefined, undefined);
    expect(result.allowed).toBe(false);
    expect(result.blockedReason).toContain("DATABASE_URL");
  });

  it("DATABASE_URL 형식이 잘못되면 차단한다(파싱 실패)", () => {
    const result = checkDataSyncTarget("이건-URL이-아님", undefined);
    expect(result.allowed).toBe(false);
  });

  it("로컬 대상이면 ALLOW_REMOTE_DATA_SYNC 값과 무관하게 항상 허용한다", () => {
    const result = checkDataSyncTarget("postgresql://user:pass@localhost:5432/tour_dna_local", "true");
    expect(result.allowed).toBe(true);
    // override 안내 문구가 불필요하게 붙지 않는다(이미 로컬이라 override가 적용된 게 아님).
    expect(result.targetLabel).not.toContain(ALLOW_REMOTE_DATA_SYNC_ENV);
  });
});
