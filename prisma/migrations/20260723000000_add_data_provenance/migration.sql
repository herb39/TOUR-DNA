-- Phase 1-A (2026-07-23): 데이터 출처(provenance) 메타데이터 추가.
-- 기존 레코드는 이 값을 판정할 근거가 없으므로 컬럼을 nullable로 추가하고 채우지 않는다(NULL = 미분류).
-- Phase 1-B/1-C에서 실제 동기화 경로에 DataSnapshot 연결이 붙은 뒤에 신뢰성 있게 채운다.

-- CreateEnum
CREATE TYPE "DataProvenance" AS ENUM ('LIVE_API', 'CACHED_API', 'CURATED', 'ESTIMATED', 'MISSING');

-- AlterTable
ALTER TABLE "NormalizedMetric" ADD COLUMN     "provenance" "DataProvenance";

-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "provenance" "DataProvenance";
