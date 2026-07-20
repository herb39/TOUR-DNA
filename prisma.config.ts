import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --env-file=.env.local prisma/seed.ts",
  },
  datasource: {
    // Neon 등에서 마이그레이션 전용 direct(non-pooled) 연결이 필요하면 DIRECT_URL을 사용하되,
    // Prisma 7 config의 datasource.url에는 하나의 연결만 지정 가능하므로 풀링 URL을 기본으로 둔다.
    url: process.env["DATABASE_URL"],
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
  },
});
