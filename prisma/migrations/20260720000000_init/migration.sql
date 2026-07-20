-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RegionLevel" AS ENUM ('SIDO', 'SIGUNGU');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('TRAVEL_AGENCY', 'LOCAL_GOV');

-- CreateEnum
CREATE TYPE "Nationality" AS ENUM ('DOMESTIC', 'FOREIGN');

-- CreateEnum
CREATE TYPE "TripDuration" AS ENUM ('DAY_TRIP', 'ONE_NIGHT_TWO_DAYS', 'TWO_NIGHTS_THREE_DAYS');

-- CreateEnum
CREATE TYPE "BudgetLevel" AS ENUM ('LOW', 'MID', 'PREMIUM');

-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('WALK', 'PUBLIC_TRANSPORT', 'PRIVATE_VEHICLE', 'MIXED');

-- CreateEnum
CREATE TYPE "GroupType" AS ENUM ('FIT', 'SMALL_10_20', 'MEDIUM_21_40');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'ANALYZED', 'PLANNED');

-- CreateEnum
CREATE TYPE "DataMode" AS ENUM ('LIVE', 'HYBRID', 'SNAPSHOT');

-- CreateEnum
CREATE TYPE "AxisStatus" AS ENUM ('LIVE', 'SNAPSHOT', 'MISSING');

-- CreateEnum
CREATE TYPE "SnapshotStatus" AS ENUM ('SUCCESS', 'EMPTY', 'ERROR');

-- CreateEnum
CREATE TYPE "SyncTrigger" AS ENUM ('CRON', 'ADMIN', 'CLI');

-- CreateEnum
CREATE TYPE "SyncOverallStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "PoiCategory" AS ENUM ('ATTRACTION', 'FOOD', 'LODGING', 'EXPERIENCE', 'FESTIVAL', 'SHOPPING');

-- CreateEnum
CREATE TYPE "PoiSourceType" AS ENUM ('API', 'FIXTURE');

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" "RegionLevel" NOT NULL,
    "apiAreaCode" TEXT,
    "apiSigunguCode" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSnapshot" (
    "id" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "baseYm" TEXT NOT NULL,
    "status" "SnapshotStatus" NOT NULL,
    "resultCode" TEXT,
    "resultMsg" TEXT,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "rawPayload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NormalizedMetric" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "baseYm" TEXT NOT NULL,
    "metricCode" TEXT NOT NULL,
    "rawValue" DOUBLE PRECISION NOT NULL,
    "normalizedValue" DOUBLE PRECISION,
    "unit" TEXT NOT NULL,
    "adminLevel" "RegionLevel" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NormalizedMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Poi" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "regionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "PoiCategory" NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "operatingHours" TEXT,
    "closedDays" TEXT,
    "sourceType" "PoiSourceType" NOT NULL,
    "sourceId" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Poi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoiRelation" (
    "id" TEXT NOT NULL,
    "centerPoiId" TEXT NOT NULL,
    "relatedPoiId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "distanceM" DOUBLE PRECISION,
    "sourceId" TEXT NOT NULL,

    CONSTRAINT "PoiRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "baseYm" TEXT NOT NULL,
    "triggeredBy" "SyncTrigger" NOT NULL,
    "overallStatus" "SyncOverallStatus" NOT NULL,
    "results" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "regionId" TEXT NOT NULL,
    "sidoCode" TEXT NOT NULL,
    "sigunguCode" TEXT NOT NULL,
    "travelYear" INTEGER NOT NULL,
    "travelMonth" INTEGER NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "selectedStrategyResultId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectInput" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "nationality" "Nationality" NOT NULL,
    "ageGroups" JSONB NOT NULL DEFAULT '[]',
    "companionType" TEXT NOT NULL,
    "primaryGoal" TEXT NOT NULL,
    "secondaryGoal" TEXT,
    "duration" "TripDuration" NOT NULL,
    "budgetLevel" "BudgetLevel" NOT NULL,
    "transport" "TransportMode" NOT NULL,
    "groupType" "GroupType" NOT NULL,
    "preferredThemes" JSONB NOT NULL DEFAULT '[]',
    "excludedThemes" JSONB NOT NULL DEFAULT '[]',
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisResult" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "demandScore" DOUBLE PRECISION,
    "demandStatus" "AxisStatus" NOT NULL,
    "stayScore" DOUBLE PRECISION,
    "stayStatus" "AxisStatus" NOT NULL,
    "spendScore" DOUBLE PRECISION,
    "spendStatus" "AxisStatus" NOT NULL,
    "diversityScore" DOUBLE PRECISION,
    "diversityStatus" "AxisStatus" NOT NULL,
    "networkScore" DOUBLE PRECISION,
    "networkStatus" "AxisStatus" NOT NULL,
    "overallDataMode" "DataMode" NOT NULL,
    "liveAxisCount" INTEGER NOT NULL,
    "strengths" JSONB NOT NULL,
    "opportunities" JSONB NOT NULL,
    "cautions" JSONB NOT NULL,
    "analysisKey" TEXT NOT NULL,
    "dataVersion" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyResult" (
    "id" TEXT NOT NULL,
    "analysisResultId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "scoreBreakdown" JSONB NOT NULL,
    "reasons" JSONB NOT NULL,
    "targetDescription" TEXT NOT NULL,
    "poiIds" JSONB NOT NULL,
    "consumptionTouchpoints" JSONB NOT NULL,
    "risks" JSONB NOT NULL,
    "evidenceIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "analysisResultId" TEXT,
    "strategyResultId" TEXT,
    "axis" TEXT,
    "metricCode" TEXT NOT NULL,
    "rawValue" DOUBLE PRECISION NOT NULL,
    "normalizedValue" DOUBLE PRECISION,
    "unit" TEXT NOT NULL,
    "adminLevel" "RegionLevel" NOT NULL,
    "regionCode" TEXT NOT NULL,
    "baseYm" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "appliedRule" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SelectedPlan" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "strategyResultId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "conceptText" TEXT NOT NULL,
    "background" TEXT NOT NULL,
    "targetSummary" TEXT NOT NULL,
    "sellingPoints" JSONB NOT NULL,
    "course" JSONB NOT NULL,
    "operationChecklist" JSONB NOT NULL,
    "risks" JSONB NOT NULL,
    "kpis" JSONB NOT NULL,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SelectedPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Region_code_key" ON "Region"("code");

-- CreateIndex
CREATE INDEX "Region_level_idx" ON "Region"("level");

-- CreateIndex
CREATE UNIQUE INDEX "DataSource_code_key" ON "DataSource"("code");

-- CreateIndex
CREATE INDEX "DataSnapshot_regionId_baseYm_idx" ON "DataSnapshot"("regionId", "baseYm");

-- CreateIndex
CREATE UNIQUE INDEX "DataSnapshot_dataSourceId_regionId_baseYm_key" ON "DataSnapshot"("dataSourceId", "regionId", "baseYm");

-- CreateIndex
CREATE INDEX "NormalizedMetric_metricCode_baseYm_adminLevel_idx" ON "NormalizedMetric"("metricCode", "baseYm", "adminLevel");

-- CreateIndex
CREATE UNIQUE INDEX "NormalizedMetric_regionId_baseYm_metricCode_key" ON "NormalizedMetric"("regionId", "baseYm", "metricCode");

-- CreateIndex
CREATE INDEX "Poi_regionId_category_idx" ON "Poi"("regionId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Poi_regionId_name_key" ON "Poi"("regionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PoiRelation_centerPoiId_relatedPoiId_key" ON "PoiRelation"("centerPoiId", "relatedPoiId");

-- CreateIndex
CREATE INDEX "SyncLog_baseYm_idx" ON "SyncLog"("baseYm");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_regionId_idx" ON "Project"("regionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectInput_projectId_key" ON "ProjectInput"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisResult_projectId_key" ON "AnalysisResult"("projectId");

-- CreateIndex
CREATE INDEX "AnalysisResult_analysisKey_idx" ON "AnalysisResult"("analysisKey");

-- CreateIndex
CREATE INDEX "StrategyResult_analysisResultId_rank_idx" ON "StrategyResult"("analysisResultId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyResult_analysisResultId_templateId_key" ON "StrategyResult"("analysisResultId", "templateId");

-- CreateIndex
CREATE INDEX "Evidence_analysisResultId_idx" ON "Evidence"("analysisResultId");

-- CreateIndex
CREATE INDEX "Evidence_strategyResultId_idx" ON "Evidence"("strategyResultId");

-- CreateIndex
CREATE UNIQUE INDEX "SelectedPlan_projectId_key" ON "SelectedPlan"("projectId");

-- AddForeignKey
ALTER TABLE "Region" ADD CONSTRAINT "Region_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSnapshot" ADD CONSTRAINT "DataSnapshot_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSnapshot" ADD CONSTRAINT "DataSnapshot_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormalizedMetric" ADD CONSTRAINT "NormalizedMetric_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormalizedMetric" ADD CONSTRAINT "NormalizedMetric_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poi" ADD CONSTRAINT "Poi_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poi" ADD CONSTRAINT "Poi_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoiRelation" ADD CONSTRAINT "PoiRelation_centerPoiId_fkey" FOREIGN KEY ("centerPoiId") REFERENCES "Poi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoiRelation" ADD CONSTRAINT "PoiRelation_relatedPoiId_fkey" FOREIGN KEY ("relatedPoiId") REFERENCES "Poi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoiRelation" ADD CONSTRAINT "PoiRelation_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInput" ADD CONSTRAINT "ProjectInput_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisResult" ADD CONSTRAINT "AnalysisResult_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyResult" ADD CONSTRAINT "StrategyResult_analysisResultId_fkey" FOREIGN KEY ("analysisResultId") REFERENCES "AnalysisResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_analysisResultId_fkey" FOREIGN KEY ("analysisResultId") REFERENCES "AnalysisResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_strategyResultId_fkey" FOREIGN KEY ("strategyResultId") REFERENCES "StrategyResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelectedPlan" ADD CONSTRAINT "SelectedPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

