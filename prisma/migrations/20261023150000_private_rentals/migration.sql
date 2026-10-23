-- CreateEnum
CREATE TYPE "StationKind" AS ENUM ('PUBLIC', 'PRIVATE_RENTAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.







-- AlterEnum


-- AlterTable
ALTER TABLE "Station" ADD COLUMN     "accessInstructions" TEXT,
ADD COLUMN     "hourlyRatePaise" INTEGER,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "kind" "StationKind" NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "parking" TEXT,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "restrictedAccessInstructions" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'LEGACY',
ADD COLUMN     "terms" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Connector" ADD COLUMN     "currentType" TEXT,
ALTER COLUMN "powerKw" DROP NOT NULL,
ALTER COLUMN "slotCount" SET DEFAULT 1;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "batteryCapacityKwh" DOUBLE PRECISION,
ADD COLUMN     "connectorTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "rangeKm" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "cancelledBy" TEXT,
ADD COLUMN     "hostResponse" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "paymentState" "PaymentStatus" NOT NULL DEFAULT 'DEMO_NO_MONEY_COLLECTED',
ADD COLUMN     "quoteSnapshot" JSONB,
ADD COLUMN     "requestFingerprint" TEXT,
ADD COLUMN     "respondedAt" TIMESTAMP(3),
ADD COLUMN     "sessionCompletedAt" TIMESTAMP(3),
ADD COLUMN     "sessionStartedAt" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'REQUESTED',
ALTER COLUMN "energyKwh" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AvailabilityWindow" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilityWindow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AvailabilityWindow_stationId_startsAt_idx" ON "AvailabilityWindow"("stationId", "startsAt");

-- CreateIndex
CREATE INDEX "Station_ownerId_idx" ON "Station"("ownerId");

-- CreateIndex
CREATE INDEX "Station_kind_published_idx" ON "Station"("kind", "published");

-- CreateIndex
CREATE INDEX "Vehicle_ownerId_idx" ON "Vehicle"("ownerId");

-- CreateIndex
CREATE INDEX "Booking_connectorId_status_slotStart_slotEnd_idx" ON "Booking"("connectorId", "status", "slotStart", "slotEnd");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_userId_idempotencyKey_key" ON "Booking"("userId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "Station" ADD CONSTRAINT "Station_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityWindow" ADD CONSTRAINT "AvailabilityWindow_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
