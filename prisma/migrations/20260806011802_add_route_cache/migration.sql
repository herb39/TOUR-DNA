-- CreateTable
CREATE TABLE "RouteCache" (
    "id" TEXT NOT NULL,
    "fromKey" TEXT NOT NULL,
    "toKey" TEXT NOT NULL,
    "transport" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "routeVersion" TEXT NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "minutes" INTEGER NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouteCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RouteCache_fetchedAt_idx" ON "RouteCache"("fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RouteCache_fromKey_toKey_transport_provider_routeVersion_key" ON "RouteCache"("fromKey", "toKey", "transport", "provider", "routeVersion");
