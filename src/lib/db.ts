import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL이 설정되지 않았습니다. .env.local을 확인해주세요.");
  }
  // 2026-08-13(임시 진단, Production 최초 Document ~6초 병목 조사): 이 클라이언트가 실제로 매 요청마다
  // 새로 생성되는지(=매번 새 커넥션 풀을 맺는지) Vercel 런타임 로그로 확인하기 위한 일회성 계측이다.
  // 값 자체는 출력하지 않는다. 원인 확인 후 제거 예정.
  console.log(`[perf] prisma-client-created at=${new Date().toISOString()} env=${process.env.VERCEL_ENV ?? "local"}`);
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
