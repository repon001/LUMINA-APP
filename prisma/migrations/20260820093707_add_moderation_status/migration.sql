-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Destination" ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "status" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "submittedById" TEXT;

-- AlterTable
ALTER TABLE "Place" ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "status" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "submittedById" TEXT;

-- Everything that already existed was put there by an admin, so it is already
-- approved. Without this the default of PENDING hides the entire catalogue and
-- the app opens onto an empty home page.
UPDATE "Destination" SET "status" = 'APPROVED';
UPDATE "Place" SET "status" = 'APPROVED';

-- CreateIndex
CREATE INDEX "Destination_status_createdAt_idx" ON "Destination"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Destination_submittedById_idx" ON "Destination"("submittedById");

-- CreateIndex
CREATE INDEX "Place_status_createdAt_idx" ON "Place"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Place_submittedById_idx" ON "Place"("submittedById");

-- AddForeignKey
ALTER TABLE "Destination" ADD CONSTRAINT "Destination_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Destination" ADD CONSTRAINT "Destination_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Place" ADD CONSTRAINT "Place_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Place" ADD CONSTRAINT "Place_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
