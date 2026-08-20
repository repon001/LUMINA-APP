-- CreateTable
CREATE TABLE "CatalogueImage" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT,
    "destinationId" TEXT,
    "placeId" TEXT,
    "uploadedById" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogueImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogueImage_destinationId_position_idx" ON "CatalogueImage"("destinationId", "position");

-- CreateIndex
CREATE INDEX "CatalogueImage_placeId_position_idx" ON "CatalogueImage"("placeId", "position");

-- AddForeignKey
ALTER TABLE "CatalogueImage" ADD CONSTRAINT "CatalogueImage_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogueImage" ADD CONSTRAINT "CatalogueImage_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogueImage" ADD CONSTRAINT "CatalogueImage_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
