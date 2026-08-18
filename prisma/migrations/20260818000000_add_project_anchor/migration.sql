-- 축제·이벤트 Anchor를 프로젝트 단위로 명시 확정하기 위한 독립 저장 구조.
-- Production Neon에는 이 migration을 자동 적용하지 않는다.

CREATE TYPE "ProjectAnchorStatus" AS ENUM ('CONFIRMED');

CREATE TYPE "ProjectAnchorTimeStatus" AS ENUM ('UNCONFIRMED', 'USER_CONFIRMED');

CREATE TYPE "ProjectAnchorTimeSlot" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING', 'CUSTOM');

CREATE TABLE "ProjectAnchor" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "ProjectAnchorStatus" NOT NULL DEFAULT 'CONFIRMED',
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "contentTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventStartDate" TEXT NOT NULL,
    "eventEndDate" TEXT NOT NULL,
    "plannedDate" TEXT NOT NULL,
    "plannedDayIndex" INTEGER NOT NULL,
    "timeStatus" "ProjectAnchorTimeStatus" NOT NULL DEFAULT 'UNCONFIRMED',
    "timeSlot" "ProjectAnchorTimeSlot",
    "timeStart" TEXT,
    "timeEnd" TEXT,
    "regionCode" TEXT NOT NULL,
    "address" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "sourceSnapshot" JSONB NOT NULL,
    "provenance" JSONB NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectAnchor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectAnchor_projectId_key" ON "ProjectAnchor"("projectId");
CREATE INDEX "ProjectAnchor_source_sourceId_idx" ON "ProjectAnchor"("source", "sourceId");
CREATE INDEX "ProjectAnchor_regionCode_plannedDate_idx" ON "ProjectAnchor"("regionCode", "plannedDate");

ALTER TABLE "ProjectAnchor"
  ADD CONSTRAINT "ProjectAnchor_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
