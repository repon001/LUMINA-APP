-- CreateEnum
CREATE TYPE "ItineraryItemKind" AS ENUM ('PLACE', 'TRANSPORT', 'MEAL', 'ACCOMMODATION', 'ACTIVITY', 'NOTE');

-- CreateTable
CREATE TABLE "TripDay" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "date" DATE,
    "title" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItineraryItem" (
    "id" TEXT NOT NULL,
    "tripDayId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "ItineraryItemKind" NOT NULL DEFAULT 'PLACE',
    "title" TEXT NOT NULL,
    "placeId" TEXT,
    "startTime" VARCHAR(5),
    "endTime" VARCHAR(5),
    "cost" DECIMAL(10,2),
    "currencyCode" CHAR(3),
    "transportMode" "TransportMode",
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItineraryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripDay_tripId_idx" ON "TripDay"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "TripDay_tripId_dayNumber_key" ON "TripDay"("tripId", "dayNumber");

-- CreateIndex
CREATE INDEX "ItineraryItem_tripDayId_idx" ON "ItineraryItem"("tripDayId");

-- CreateIndex
CREATE INDEX "ItineraryItem_placeId_idx" ON "ItineraryItem"("placeId");

-- CreateIndex
CREATE UNIQUE INDEX "ItineraryItem_tripDayId_position_key" ON "ItineraryItem"("tripDayId", "position");

-- AddForeignKey
ALTER TABLE "TripDay" ADD CONSTRAINT "TripDay_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItineraryItem" ADD CONSTRAINT "ItineraryItem_tripDayId_fkey" FOREIGN KEY ("tripDayId") REFERENCES "TripDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItineraryItem" ADD CONSTRAINT "ItineraryItem_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

