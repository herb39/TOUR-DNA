-- CreateEnum
CREATE TYPE "PoiCurationStatus" AS ENUM ('UNREVIEWED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PoiRepresentation" AS ENUM ('UNKNOWN', 'DESTINATION', 'SUPPORT', 'CONSUMPTION', 'LODGING');

-- CreateTable
CREATE TABLE "PoiCuration" (
    "id" TEXT NOT NULL,
    "poiId" TEXT NOT NULL,
    "status" "PoiCurationStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "representation" "PoiRepresentation" NOT NULL DEFAULT 'UNKNOWN',
    "representativeness" INTEGER,
    "reason" TEXT,
    "sourceLabel" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PoiCuration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PoiCuration_poiId_key" ON "PoiCuration"("poiId");

-- CreateIndex
CREATE INDEX "PoiCuration_status_representation_idx" ON "PoiCuration"("status", "representation");

-- AddForeignKey
ALTER TABLE "PoiCuration" ADD CONSTRAINT "PoiCuration_poiId_fkey" FOREIGN KEY ("poiId") REFERENCES "Poi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
