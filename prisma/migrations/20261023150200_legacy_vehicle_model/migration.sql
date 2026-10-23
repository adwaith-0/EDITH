-- The original schema included vehicleModel, but the original migration omitted it.
-- IF NOT EXISTS also supports repositories previously brought up with db push.
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "vehicleModel" TEXT;
