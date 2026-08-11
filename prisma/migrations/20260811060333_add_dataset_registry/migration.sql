-- CreateEnum
CREATE TYPE "DatasetStatus" AS ENUM ('STAGING', 'ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Dataset" (
    "id" TEXT NOT NULL,
    "baseYm" TEXT NOT NULL,
    "status" "DatasetStatus" NOT NULL DEFAULT 'STAGING',
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dataset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dataset_baseYm_key" ON "Dataset"("baseYm");

-- CreateIndex
CREATE INDEX "Dataset_status_idx" ON "Dataset"("status");
