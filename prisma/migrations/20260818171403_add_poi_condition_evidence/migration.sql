-- CreateEnum
CREATE TYPE "PoiConditionType" AS ENUM ('PET', 'ACCESSIBILITY');

-- CreateEnum
CREATE TYPE "PoiConditionEvidenceStatus" AS ENUM ('SUCCESS', 'EMPTY', 'ERROR');

-- CreateEnum
CREATE TYPE "PoiConditionAvailability" AS ENUM ('CONFIRMED', 'CONDITIONAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PoiConditionScope" AS ENUM ('ALL', 'PARTIAL', 'UNKNOWN');

-- CreateTable
CREATE TABLE "PoiConditionEvidence" (
    "id" TEXT NOT NULL,
    "poiId" TEXT NOT NULL,
    "conditionType" "PoiConditionType" NOT NULL,
    "contentId" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "apiVersion" TEXT,
    "status" "PoiConditionEvidenceStatus" NOT NULL,
    "availability" "PoiConditionAvailability" NOT NULL,
    "scope" "PoiConditionScope" NOT NULL,
    "requirements" JSONB NOT NULL DEFAULT '[]',
    "capacityNote" TEXT,
    "riskNote" TEXT,
    "facilityNote" TEXT,
    "sourceModifiedTime" TEXT,
    "sourceShowFlag" TEXT,
    "rawPayload" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PoiConditionEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PoiConditionEvidence_poiId_conditionType_idx" ON "PoiConditionEvidence"("poiId", "conditionType");

-- CreateIndex
CREATE INDEX "PoiConditionEvidence_conditionType_status_sourceModifiedTim_idx" ON "PoiConditionEvidence"("conditionType", "status", "sourceModifiedTime");

-- CreateIndex
CREATE UNIQUE INDEX "PoiConditionEvidence_conditionType_contentId_key" ON "PoiConditionEvidence"("conditionType", "contentId");

-- AddForeignKey
ALTER TABLE "PoiConditionEvidence" ADD CONSTRAINT "PoiConditionEvidence_poiId_fkey" FOREIGN KEY ("poiId") REFERENCES "Poi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
