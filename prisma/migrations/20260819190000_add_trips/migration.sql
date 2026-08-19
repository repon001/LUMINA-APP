-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('DRAFT', 'PLANNED', 'ONGOING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TripVisibility" AS ENUM ('PRIVATE', 'UNLISTED', 'PUBLIC');

-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('FLIGHT', 'TRAIN', 'BUS', 'CAR', 'FERRY', 'WALK', 'OTHER');

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "coverImageUrl" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "status" "TripStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "TripVisibility" NOT NULL DEFAULT 'PRIVATE',
    "shareCode" TEXT,
    "budgetTotal" DECIMAL(12,2),
    "currencyCode" CHAR(3),
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripStop" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "arrivalDate" DATE,
    "departureDate" DATE,
    "transportToNext" "TransportMode",
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripStop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Trip_shareCode_key" ON "Trip"("shareCode");

-- CreateIndex
CREATE INDEX "Trip_ownerId_status_idx" ON "Trip"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Trip_visibility_updatedAt_idx" ON "Trip"("visibility", "updatedAt");

-- CreateIndex
CREATE INDEX "TripStop_tripId_idx" ON "TripStop"("tripId");

-- CreateIndex
CREATE INDEX "TripStop_destinationId_idx" ON "TripStop"("destinationId");

-- CreateIndex
CREATE UNIQUE INDEX "TripStop_tripId_position_key" ON "TripStop"("tripId", "position");

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripStop" ADD CONSTRAINT "TripStop_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripStop" ADD CONSTRAINT "TripStop_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

