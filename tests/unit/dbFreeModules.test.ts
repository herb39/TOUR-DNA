// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * verify:visitor-api는 DATABASE_URL 없이도 실행돼야 한다(2026-07-29 요구사항). 실행 여부를 흉내내지
 * 않고, 이 스크립트와 그 핵심 로직 모듈이 `@/lib/db`(prisma)를 소스 수준에서 아예 참조하지 않는지
 * 정적으로 확인한다 — 어떤 실행 환경에서도 성립하는 결정적 검증이다.
 */
function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf-8");
}

describe("verify:visitor-api는 DB 모듈을 로드하지 않는다", () => {
  it("scripts/verify-visitor-api.ts가 @/lib/db(prisma)를 import하지 않는다", () => {
    const source = readSource("scripts/verify-visitor-api.ts");
    expect(source).not.toMatch(/@\/lib\/db/);
    expect(source).not.toMatch(/\.\.\/src\/lib\/db/);
    expect(source.toLowerCase()).not.toContain("prisma");
  });

  it("src/lib/services/visitorApiVerification.ts가 @/lib/db(prisma)를 import하지 않는다", () => {
    const source = readSource("src/lib/services/visitorApiVerification.ts");
    expect(source).not.toMatch(/@\/lib\/db/);
    expect(source.toLowerCase()).not.toContain("prisma");
  });
});
