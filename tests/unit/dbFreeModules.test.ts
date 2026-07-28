// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * verify:visitor-api는 DATABASE_URL 없이도 실행돼야 한다(2026-07-29 요구사항). 실행 여부를 흉내내지
 * 않고, 이 스크립트와 그 핵심 로직 모듈이 `@/lib/db`(prisma)를 실제로 import하지 않는지 정적으로
 * 확인한다.
 *
 * 2026-07-29 2차 수정: 처음에는 "@/lib/db"라는 부분 문자열을 파일 전체에서 찾았는데, 이 검사 방식이
 * "이 파일은 `@/lib/db`를 import하지 않는다"처럼 그 사실을 설명하는 주석 자체까지 위반으로 오인해
 * 테스트가 실패했다. import 선언(정확히는 `from` 뒤 따옴표로 감싼 모듈 경로)만 검사하도록 고쳤다 —
 * 주석·일반 문자열은 이 패턴에 절대 매칭되지 않는다.
 */
function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf-8");
}

/** `from "무언가/db"` 형태의 실제 import 선언만 찾는다(주석 속 백틱 언급은 매칭되지 않는다). */
function importsDbModule(source: string): boolean {
  return /from\s+["'][^"']*\/db["']/.test(source);
}

/** prisma 관련 실제 import 선언만 찾는다 — `import { prisma } from ...` 또는 `@prisma/*` 패키지 import. */
function importsPrisma(source: string): boolean {
  return /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from/.test(source) || /from\s+["']@prisma\//.test(source);
}

describe("verify:visitor-api는 DB 모듈을 로드하지 않는다", () => {
  it("scripts/verify-visitor-api.ts가 @/lib/db(prisma)를 import하지 않는다", () => {
    const source = readSource("scripts/verify-visitor-api.ts");
    expect(importsDbModule(source)).toBe(false);
    expect(importsPrisma(source)).toBe(false);
  });

  it("src/lib/services/visitorApiVerification.ts가 @/lib/db(prisma)를 import하지 않는다", () => {
    const source = readSource("src/lib/services/visitorApiVerification.ts");
    expect(importsDbModule(source)).toBe(false);
    expect(importsPrisma(source)).toBe(false);
  });

  it("src/lib/services/visitorBaseYmFinder.ts가 @/lib/db(prisma)를 import하지 않는다", () => {
    const source = readSource("src/lib/services/visitorBaseYmFinder.ts");
    expect(importsDbModule(source)).toBe(false);
    expect(importsPrisma(source)).toBe(false);
  });

  it("DATABASE_URL을 제거한 상태에서 visitorBaseYmFinder.ts를 동적 import해도 성공한다", async () => {
    // 이 테스트 파일은 visitorBaseYmFinder를 정적으로 import하지 않으므로(위 테스트들은 텍스트만 읽는다),
    // 아래 동적 import가 이 파일의 격리된 모듈 그레지스트리에서 처음 실행되는 로드다 — 만약 이 모듈이
    // @/lib/db를 실제로 import한다면 DATABASE_URL이 없을 때 db.ts가 즉시 throw해 이 import 자체가
    // reject된다.
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const mod = await import("@/lib/services/visitorBaseYmFinder");
      expect(typeof mod.findLatestCompleteVisitorBaseYm).toBe("function");
      expect(typeof mod.currentBaseYm).toBe("function");
    } finally {
      if (original !== undefined) process.env.DATABASE_URL = original;
    }
  });
});
