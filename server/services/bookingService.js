const prisma = require('../lib/prisma');
const { fail, text, interval, price, contains, fingerprint, ACTIVE, PAYMENT_LABEL, CANCELLATION, normaliseConnector } = require('./rentalShared');
const { publicRental } = require('./rentalService');
const demo = require('./demoMode');
const listingEvidence=require('./listingEvidence');

const include = {
  station: { include: { owner: { select: { id: true, name: true } } } },
  connector: true,
  vehicle: true,
  reports:{select:{id:true,kind:true,notes:true,createdAt:true,resolvedAt:true}},
  user: { select: { id: true, name: true } },
};

function present(booking, viewerId) {
  if (!booking) return booking;
  const isOwner = booking.station.ownerId === viewerId;
  const driverHasAccess = booking.userId === viewerId && ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(booking.status);
  return {
    ...booking,
    quoteSnapshot:viewerId!==booking.userId&&booking.quoteSnapshot?.conciergeContext?{...booking.quoteSnapshot,conciergeContext:{planning:booking.quoteSnapshot.conciergeContext.planning,evidence:booking.quoteSnapshot.conciergeContext.evidence}}:booking.quoteSnapshot,
    status: booking.status === 'PENDING' ? 'REQUESTED' : booking.status,
    amountPaise: booking.amountCents,
    paymentLabel: PAYMENT_LABEL,
    energyKwh: booking.quoteSnapshot ? booking.energyKwh : null,
    station: publicRental(booking.station, isOwner || driverHasAccess),
    receipt: booking.status === 'COMPLETED' ? { amountPaise: booking.amountCents, currency: 'INR', paymentLabel: PAYMENT_LABEL, sessionStartedAt: booking.sessionStartedAt, sessionCompletedAt: booking.sessionCompletedAt, measuredEnergyKwh: booking.energyKwh } : null,
  };
}

async function expirePending() {
  return prisma.booking.updateMany({ where: { status: { in: ['REQUESTED', 'PENDING'] }, expiresAt: { lte: new Date() } }, data: { status: 'EXPIRED', hostResponse: 'The host response deadline elapsed before acceptance.' } });
}

async function rawQuote(db, userId, body) {
  const selection = interval(body.slotStart, body.durationMinutes);
  const strict=body.bookingMode==='CONCIERGE'||!!body.conciergeToken;
  const proposal=strict?require('./conciergeTokens').read(body.conciergeToken,userId,body):null;
  if (typeof body.stationId !== 'string' || typeof body.vehicleId !== 'string') fail('Choose a private rental and your saved vehicle.');
  const station = await db.station.findUnique({ where: { id: body.stationId }, include: { connectors: true, availabilityWindows: true } });
  if (!station || (station.kind !== 'PRIVATE_RENTAL' && !(demo.enabled() && demo.publicDemo(station))) || !station.ownerId) fail('This station does not support rental requests.', 404, 'NOT_BOOKABLE');
  if (!station.published) fail('This listing is paused and cannot receive new requests.', 409, 'LISTING_PAUSED');
  if (station.ownerId === userId) fail('You cannot request your own charger.', 400, 'OWN_LISTING');
  const vehicle = await db.vehicle.findUnique({ where: { id: body.vehicleId } });
  if (!vehicle || vehicle.ownerId !== userId) fail('Choose a saved vehicle belonging to your account.', 403, 'VEHICLE_OWNERSHIP');
  const instant=body.bookingMode==='DEMO_AUTOPILOT';
  if(instant&&(!demo.enabled()||!demo.publicDemo(station)||!station.id.startsWith('agent-demo-')||vehicle.metadata?.synthetic!==true||!vehicle.metadata?.demoCatalogueId||!vehicle.connectorTypes.map(normaliseConnector).includes(normaliseConnector(station.connectors[0]?.connectorType))))fail('Instant booking is restricted to compatible synthetic agent demo records.',403,'DEMO_AUTOPILOT_ONLY');
  if(strict){
    if(!vehicle.specificationsVerifiedAt)fail('Confirm the vehicle connector in the concierge before requesting.',409,'UNKNOWN_COMPATIBILITY');
    const reason=listingEvidence.eligible(station,proposal.allowDemo===true&&demo.enabled());if(reason)fail(reason+' Refresh the concierge options.',409,'EVIDENCE_REQUIRED');
    listingEvidence.checkSnapshot(station,proposal.context?.listingSnapshot);
  }
  const connector = station.connectors[0];
  if (!connector || ((strict||!demo.enabled()) && !vehicle.connectorTypes.map(normaliseConnector).includes(normaliseConnector(connector.connectorType)))) fail('Your verified vehicle connectors are incompatible with this charger.', 409, 'INCOMPATIBLE_CONNECTOR');
  if (!contains(station.availabilityWindows, selection.start, selection.end)) fail('The entire rental interval must fit inside one open dated window.', 409, 'OUTSIDE_AVAILABILITY');
  const conflict = await db.booking.findFirst({ where: { connectorId: connector.id, status: { in: ACTIVE }, slotStart: { lt: selection.end }, slotEnd: { gt: selection.start } } });
  if (conflict) fail('The requested period is already reserved. Choose another time.', 409, 'BOOKING_CONFLICT');
  const totalPaise = price(station.hourlyRatePaise, selection.duration);
  if(strict&&totalPaise>proposal.budgetPaise)fail('The current price exceeds your concierge budget. Replan or change the budget.',409,'BUDGET_EXCEEDED');
  return {
    station,
    vehicle,
    connector,
    quote: { ...(instant?{bookingMode:'DEMO_AUTOPILOT',vehicleReference:vehicle.metadata,publicSimulation:true}:{}),...(strict?{bookingMode:'CONCIERGE',conciergeToken:body.conciergeToken,conciergeContext:proposal.context,allowDemo:proposal.allowDemo,paymentPreview:{mode:'DEMO_NO_MONEY_COLLECTED',amountPaise:totalPaise,currency:'INR',requiresDriverConfirmation:true}}:{}), stationId: station.id, vehicleId: vehicle.id, stationName: station.name, vehicleModel: vehicle.model, connectorType: connector.connectorType, slotStart: selection.start.toISOString(), slotEnd: selection.end.toISOString(), durationMinutes: selection.duration, hourlyRatePaise: station.hourlyRatePaise, subtotalPaise: totalPaise, feePaise: 0, totalPaise, currency:'INR',rounding:'Reserved whole minutes × hourly rate / 60, rounded upward once to the next paise.',cancellationSummary:CANCELLATION,paymentLabel:PAYMENT_LABEL,quotedAt:new Date().toISOString() },
  };
}

async function quote(userId, body) {
  if (!body.vehicleId && body.vehicleModel) body = {...body,vehicleId:(await demo.vehicleForName(userId,body.vehicleModel)).id};
  return (await rawQuote(prisma, userId, body)).quote;
}

async function request(userId, body) {
  if (typeof body.stationId !== 'string' || !body.stationId || typeof body.vehicleId !== 'string' || !body.vehicleId) fail('Choose a private rental and your saved vehicle.');
  const key = text(body.idempotencyKey, 'Idempotency key', true, 120);
  // Validate syntax before hashing; existing requests may be replayed after start/deadline.
  interval(body.slotStart, body.durationMinutes, false);
  const requestFingerprint = fingerprint(body);
  const existing = await prisma.booking.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: key } }, include });
  if (existing) {
    if (existing.requestFingerprint !== requestFingerprint) fail('This request key was already used for a different rental.', 409, 'IDEMPOTENCY_CONFLICT');
    await expirePending();
    return getBooking(existing.id, userId);
  }
  if (!Number.isInteger(body.expectedTotalPaise) || !Number.isInteger(body.expectedHourlyRatePaise)) fail('Review a server quote before submitting your request.', 400, 'QUOTE_REQUIRED');
  try {
    return await prisma.$transaction(async tx => {
      // Host edit and acceptance share this connector lock. Pending requests do not reserve it.
      await tx.$queryRaw`SELECT "id" FROM "Connector" WHERE "stationId" = ${body.stationId} ORDER BY "id" FOR UPDATE`;
      const raced = await tx.booking.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: key } }, include });
      if (raced) {
        if (raced.requestFingerprint !== requestFingerprint) fail('This request key was already used for a different rental.', 409, 'IDEMPOTENCY_CONFLICT');
        return present(raced, userId);
      }
      const { station, connector, vehicle, quote: snapshot } = await rawQuote(tx, userId, body);
      if (snapshot.totalPaise !== body.expectedTotalPaise || snapshot.hourlyRatePaise !== body.expectedHourlyRatePaise) fail('The host changed the rate. Review an updated quote before requesting.', 409, 'QUOTE_CHANGED');
      const configured = Number(process.env.BOOKING_RESPONSE_MINUTES || 120);
      const responseMinutes = Number.isFinite(configured) && configured > 0 ? configured : 120;
      const expiresAt = new Date(Math.min(Date.now() + responseMinutes * 60000, new Date(snapshot.slotStart).getTime()));
      const simulated = demo.enabled() && demo.publicDemo(station);
      const {conciergeToken,...storedSnapshot}=snapshot;
      const booking = await tx.booking.create({ data: { userId, stationId: station.id, connectorId: connector.id, vehicleId: vehicle.id, vehicleModel: vehicle.model, slotStart: new Date(snapshot.slotStart), slotEnd: new Date(snapshot.slotEnd), expiresAt, amountCents: snapshot.totalPaise, energyKwh: null, quoteSnapshot: {...storedSnapshot,compatibilityMode:snapshot.bookingMode==='CONCIERGE'?'VERIFIED':snapshot.bookingMode==='DEMO_AUTOPILOT'?'DEMO_CATALOGUE_MATCH':demo.enabled()?'DEMO_SKIPPED':'VERIFIED',publicSimulation:simulated}, idempotencyKey: key, requestFingerprint, status: simulated?'CONFIRMED':'REQUESTED', hostResponse:simulated?'Demo reservation only. Not sent to the real station operator.':null, paymentState: 'DEMO_NO_MONEY_COLLECTED' }, include });
      await tx.audit.create({ data: { entityType: 'Booking', entityId: booking.id, action: 'REQUESTED', data: { actorId: userId, quote: storedSnapshot } } });
      return present(booking, userId);
    });
  } catch (error) {
    if (error.code === 'P2002') {
      const duplicate = await prisma.booking.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: key } }, include });
      if (duplicate?.requestFingerprint === requestFingerprint) return present(duplicate, userId);
    }
    throw error;
  }
}

async function getBooking(id, userId) {
  await expirePending();
  const booking = await prisma.booking.findUnique({ where: { id }, include });
  if (!booking) fail('Booking not found.', 404, 'NOT_FOUND');
  if (booking.userId !== userId && booking.station.ownerId !== userId) fail('This booking belongs to another account.', 403, 'FORBIDDEN');
  return present(booking, userId);
}

async function getUserBookings(userId) {
  await expirePending();
  return (await prisma.booking.findMany({ where: { userId }, include, orderBy: { createdAt: 'desc' } })).map(b => present(b, userId));
}

async function getHostBookings(ownerId) {
  await expirePending();
  const [bookings, ownedListings] = await Promise.all([
    prisma.booking.findMany({ where: { station: { ownerId } }, include, orderBy: { createdAt: 'desc' } }),
    prisma.station.count({ where: { ownerId, kind: 'PRIVATE_RENTAL' } }),
  ]);
  return {
    bookings: bookings.map(b => present(b, ownerId)),
    summary: { pendingRequests: bookings.filter(b => b.status === 'REQUESTED').length, upcomingBookings: bookings.filter(b => b.status === 'CONFIRMED' && b.slotEnd > new Date()).length, activeSessions: bookings.filter(b => b.status === 'IN_PROGRESS').length, ownedListings, demoBookingValuePaise: bookings.filter(b => ACTIVE.includes(b.status) || b.status === 'COMPLETED').reduce((sum, b) => sum + b.amountCents, 0) },
  };
}

async function action(id, userId, body) {
  if (typeof id !== 'string' || !id) fail('A booking ID is required.');
  if (!['accept', 'decline', 'cancel', 'start', 'complete'].includes(body.action)) fail('Unknown booking action.');
  await expirePending();
  const hint = await prisma.booking.findUnique({ where: { id }, select: { connectorId: true } });
  if (!hint) fail('Booking not found.', 404, 'NOT_FOUND');
  try {
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Connector" WHERE "id" = ${hint.connectorId} FOR UPDATE`;
      const booking = await tx.booking.findUnique({ where: { id }, include });
      const isOwner = booking.station.ownerId === userId;
      const isDriver = booking.userId === userId;
      if (!isOwner && !isDriver) fail('This booking belongs to another account.', 403, 'FORBIDDEN');
      if (body.action !== 'cancel' && !isOwner) fail('Only the listing owner may perform this action.', 403, 'FORBIDDEN');
      const now = new Date();
      // A request can expire while waiting for another acceptance's connector lock.
      // Commit that expiry before reporting failure so a rejected action persists it.
      if (booking.status === 'REQUESTED' && booking.expiresAt <= now) {
        await tx.booking.update({ where: { id }, data: { status: 'EXPIRED', hostResponse: 'The host response deadline elapsed before acceptance.' } });
        return { expiredWhileWaiting: true };
      }
      const target = { accept: 'CONFIRMED', decline: 'DECLINED', cancel: 'CANCELLED', start: 'IN_PROGRESS', complete: 'COMPLETED' }[body.action];
      // Exactly repeated actions are safe. An old accept after later transitions is also harmless.
      if (booking.status === target || (body.action === 'accept' && ['IN_PROGRESS', 'COMPLETED'].includes(booking.status))) return present(booking, userId);
      const data = { status: target };
      if (body.action === 'accept') {
        if (booking.status !== 'REQUESTED') fail('Only a pending request can be accepted.', 409, 'INVALID_TRANSITION');
        if (booking.expiresAt <= now || booking.slotStart <= now) fail('This request has expired.', 409, 'REQUEST_EXPIRED');
        const station = await tx.station.findUnique({ where: { id: booking.stationId }, include: { availabilityWindows: true, connectors:true } });
        if (!station.published) fail('Publish the listing before accepting new requests.', 409, 'LISTING_PAUSED');
        if (!contains(station.availabilityWindows, booking.slotStart, booking.slotEnd)) fail('The requested period is no longer in an open window.', 409, 'OUTSIDE_AVAILABILITY');
        const strict=booking.quoteSnapshot?.bookingMode==='CONCIERGE';
        if(strict){const reason=listingEvidence.eligible(station,booking.quoteSnapshot.allowDemo===true&&demo.enabled());if(reason)fail(reason,409,'EVIDENCE_REQUIRED');listingEvidence.checkSnapshot(station,booking.quoteSnapshot.conciergeContext?.listingSnapshot);}
        const vehicle = await tx.vehicle.findUnique({ where: { id: booking.vehicleId } });
        if (!vehicle || vehicle.ownerId !== booking.userId || ((strict||!demo.enabled()) && !vehicle.connectorTypes.map(normaliseConnector).includes(normaliseConnector(booking.connector.connectorType)))) fail('Vehicle compatibility must still be valid.', 409, 'INCOMPATIBLE_CONNECTOR');
        const conflicting = await tx.booking.findFirst({ where: { id: { not: id }, connectorId: booking.connectorId, status: { in: ACTIVE }, slotStart: { lt: booking.slotEnd }, slotEnd: { gt: booking.slotStart } } });
        if (conflicting) fail('Another booking now reserves this period. Choose another request.', 409, 'BOOKING_CONFLICT');
        data.respondedAt = now;
        data.hostResponse = text(body.reason, 'Host response') || 'Your host accepted this request.';
      } else if (body.action === 'decline') {
        if (booking.status !== 'REQUESTED' || booking.expiresAt <= now) fail('Only an unexpired request can be declined.', 409, 'INVALID_TRANSITION');
        data.respondedAt = now;
        data.hostResponse = text(body.reason, 'Host response') || 'The host declined this request.';
      } else if (body.action === 'cancel') {
        if (!['REQUESTED', 'CONFIRMED'].includes(booking.status) || booking.slotStart <= now) fail('Cancellation is allowed only before session start for requested or confirmed bookings.', 409, 'INVALID_TRANSITION');
        const reason = text(body.reason, 'Cancellation reason', isOwner);
        data.cancelledBy = userId;
        data.respondedAt = now;
        data.hostResponse = reason || 'Cancelled by the driver before the reserved start.';
      } else if (body.action === 'start') {
        if (booking.status !== 'CONFIRMED') fail('Only a confirmed booking can start.', 409, 'INVALID_TRANSITION');
        if (now < booking.slotStart || now >= booking.slotEnd) fail('Check-in is allowed only during the reserved interval.', 409, 'SESSION_NOT_IN_WINDOW');
        data.sessionStartedAt = now;
      } else if (body.action === 'complete') {
        if (booking.status !== 'IN_PROGRESS') fail('Only an in-progress session can complete.', 409, 'INVALID_TRANSITION');
        data.sessionCompletedAt = now;
      }
      const updated = await tx.booking.update({ where: { id }, data, include });
      await tx.audit.create({ data: { entityType: 'Booking', entityId: id, action: target, data: { actorId: userId, previousStatus: booking.status, reason: data.hostResponse || null } } });
      return present(updated, userId);
    });
    if (result.expiredWhileWaiting) fail('This request has expired.', 409, 'REQUEST_EXPIRED');
    return result;
  } catch (error) {
    // PostgreSQL exclusion is a second layer behind the transaction's connector row lock.
    if (error.code === 'P2004' || error.code === '23P01' || error.meta?.database_error?.includes('rental_reservations_do_not_overlap')) fail('Another booking already reserves this period.', 409, 'BOOKING_CONFLICT');
    throw error;
  }
}

module.exports = { quote, request, action, getBooking, getUserBookings, getHostBookings, expirePending, present };
