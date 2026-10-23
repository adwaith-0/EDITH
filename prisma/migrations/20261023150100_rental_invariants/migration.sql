-- Existing legacy data is preserved. Only new quoted rental reservations are covered
-- by this exclusion; service conflict checks include every active reservation.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Booking" ADD CONSTRAINT "rental_reservations_do_not_overlap"
  EXCLUDE USING gist (
    "connectorId" WITH =,
    tsrange("slotStart", "slotEnd", '[)') WITH &&
  ) WHERE ("status" IN ('CONFIRMED', 'IN_PROGRESS') AND "quoteSnapshot" IS NOT NULL);
ALTER TABLE "Booking" ADD CONSTRAINT "rental_positive_interval"
  CHECK ("quoteSnapshot" IS NULL OR ("slotEnd" > "slotStart" AND "amountCents" > 0));
ALTER TABLE "AvailabilityWindow" ADD CONSTRAINT "availability_positive_interval"
  CHECK ("endsAt" > "startsAt");
ALTER TABLE "Station" ADD CONSTRAINT "private_rental_requires_owner_and_rate"
  CHECK ("kind" != 'PRIVATE_RENTAL' OR ("ownerId" IS NOT NULL AND "hourlyRatePaise" > 0));
ALTER TABLE "Station" ALTER COLUMN "updatedAt" DROP DEFAULT;
