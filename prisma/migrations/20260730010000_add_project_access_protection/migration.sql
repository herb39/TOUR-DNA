-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "passwordHash" TEXT;

-- CreateTable
CREATE TABLE "ProjectAccessAttempt" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectAccessAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAccessAttempt_projectId_key" ON "ProjectAccessAttempt"("projectId");

-- AddForeignKey
ALTER TABLE "ProjectAccessAttempt" ADD CONSTRAINT "ProjectAccessAttempt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
