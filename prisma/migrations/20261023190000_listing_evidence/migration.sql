ALTER TABLE "Station" ADD COLUMN "specificationsVerifiedAt" TIMESTAMP(3), ADD COLUMN "specificationEvidence" TEXT, ADD COLUMN "parkingIncluded" BOOLEAN, ADD COLUMN "equipmentStatus" TEXT NOT NULL DEFAULT 'UNKNOWN', ADD COLUMN "statusReportedAt" TIMESTAMP(3);
ALTER TABLE "Vehicle" ADD COLUMN "specificationsVerifiedAt" TIMESTAMP(3);
CREATE TABLE "ChargerReport" (
  "id" TEXT NOT NULL, "stationId" TEXT NOT NULL, "bookingId" TEXT, "reporterId" TEXT NOT NULL,
  "kind" TEXT NOT NULL, "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "ChargerReport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChargerReport_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChargerReport_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ChargerReport_stationId_createdAt_idx" ON "ChargerReport"("stationId","createdAt");
CREATE INDEX "ChargerReport_bookingId_idx" ON "ChargerReport"("bookingId");
