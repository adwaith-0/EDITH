// Real PostgreSQL integration tests. Isolated accounts/listings are removed afterward;
// existing users, seeded fixtures and user-created rentals are never modified.
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });
process.env.DEMO_MODE='false'; // Strict mode remains supported independently of the local demo.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const express = require('express');
const prisma = require('../lib/prisma');
const rental = require('../services/rentalService');
const { generateToken } = require('../middleware/auth');

test('persistent rental lifecycle, authorization and concurrency (real PostgreSQL)', async t => {
  const prefix = `rental-test-${randomUUID()}`;
  let server;
  const userIds = [];
  const bookingIds = [];
  let host, driver, other, stranger, listing, vehicle, otherVehicle;
  const base = Date.now();
  const at = minutes => new Date(base + minutes * 60000).toISOString();
  const createUser = async label => {
    const user = await prisma.user.create({ data: { name: `${prefix}-${label}`, email: `${prefix}-${label}@example.invalid`, passwordHash: 'test-fixture-hash-not-a-login' } });
    userIds.push(user.id);
    return { ...user, token: generateToken(user) };
  };
  const app = express();
  app.use(express.json());
  app.use('/api/rentals', require('../routes/rentals'));
  app.use('/api/vehicles', require('../routes/vehicles'));
  app.use('/api/bookings', require('../routes/bookings')());
  server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const api = async (path, user, body, method = body ? 'POST' : 'GET') => {
    const res = await fetch(`${origin}/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${user.token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, body: await res.json() };
  };
  const proposed = (station = listing, savedVehicle = vehicle, start = at(60), durationMinutes = 90) => ({ stationId: station.id, vehicleId: savedVehicle.id, slotStart: start, durationMinutes });
  const makeRequest = async (user, input, idempotencyKey = randomUUID()) => {
    const q = await api('/bookings/quote', user, input);
    assert.equal(q.status, 200, JSON.stringify(q.body));
    const result = await api('/bookings/request', user, { ...input, idempotencyKey, expectedTotalPaise: q.body.quote.totalPaise, expectedHourlyRatePaise: q.body.quote.hourlyRatePaise });
    if (result.body.booking) bookingIds.push(result.body.booking.id);
    return result;
  };
  try {
    await t.test('host publishes and driver gets own saved verified vehicle', async () => {
      host = await createUser('host'); driver = await createUser('driver'); other = await createUser('other-driver'); stranger = await createUser('stranger');
      const result = await api('/rentals', host, { name: `${prefix} charger`, address: 'Synthetic test address, Kochi', lat: 9.9656, lng: 76.2429, connectorType: 'Type 2', currentType: 'AC', powerKw: 7.4, hourlyRatePaise: 12000, published: true, parking: 'Test bay', accessInstructions: 'Meet host', restrictedAccessInstructions: 'PRIVATE-TEST-CODE', terms: 'Test rental', availabilityWindows: [{ startsAt: at(-10), endsAt: at(3000) }] });
      assert.equal(result.status, 201, JSON.stringify(result.body));
      listing = result.body.rental;
      const saved = await api('/vehicles', driver, { model: 'Test EV', vehicleType: 'CAR', connectorTypes: ['Type 2'] });
      assert.equal(saved.status, 201); vehicle = saved.body.vehicle;
      const second = await api('/vehicles', other, { model: 'Other EV', vehicleType: 'CAR', connectorTypes: ['Type 2'] });
      otherVehicle = second.body.vehicle;
      const found = await api(`/rentals?location=${encodeURIComponent(prefix)}&lat=9.96&lng=76.24&start=${encodeURIComponent(at(60))}&durationMinutes=90`);
      assert.equal(found.status, 200); assert.equal(found.body.rentals[0].id, listing.id);
      assert.equal(found.body.rentals[0].isOpenForRequest, true);
      assert.equal(found.body.rentals[0].distanceSource, 'STRAIGHT_LINE_ESTIMATE');
      assert.equal(found.body.rentals[0].restrictedAccessInstructions, undefined);
      const mine = await api('/vehicles', driver);
      assert.deepEqual(mine.body.vehicles.map(v => v.id), [vehicle.id]);
    });
    await t.test('server quote is INR 120/hour × 90 minutes = INR 180; no travel added', async () => {
      const result = await api('/bookings/quote', driver, { ...proposed(), travelTimeMinutes: 75 });
      assert.equal(result.status, 200); const q = result.body.quote;
      assert.equal(q.totalPaise, 18000); assert.equal(q.hourlyRatePaise, 12000); assert.equal(q.feePaise, 0);
      assert.equal(q.slotStart, at(60)); assert.equal(new Date(q.slotEnd) - new Date(q.slotStart), 90 * 60000);
    });
    await t.test('auth, vehicle ownership, compatibility, windows and public bookability are enforced', async () => {
      assert.equal((await api('/bookings/quote', null, proposed())).status, 401);
      assert.equal((await api('/bookings/quote', other, proposed())).status, 403);
      assert.equal((await api('/rentals/' + listing.id, stranger, { published: false }, 'PATCH')).status, 403);
      assert.equal((await api('/bookings/quote', driver, proposed(listing, vehicle, at(2990), 60))).status, 409);
      assert.equal((await api('/bookings/quote', driver, proposed(listing, vehicle, at(-1), 60))).status, 409);
      assert.equal((await api('/bookings/quote', driver, proposed(listing, vehicle, at(60), 0))).status, 400);
      const incompatible = await api('/vehicles', driver, { model: 'Incompatible EV', connectorTypes: ['CHAdeMO'] });
      assert.equal((await api('/bookings/quote', driver, proposed(listing, incompatible.body.vehicle))).body.code, 'INCOMPATIBLE_CONNECTOR');
      assert.equal((await api('/bookings/quote', driver, { ...proposed(), stationId: 'external-google-place-not-owned' })).body.code, 'NOT_BOOKABLE');
      assert.equal(await prisma.station.count({ where: { id: 'external-google-place-not-owned' } }), 0);
    });
    let first, second, winner, loser;
    await t.test('overlapping pending requests are allowed; repeated submission is one booking', async () => {
      const key = randomUUID(); const input = proposed();
      const submitted = await Promise.all([makeRequest(driver, input, key), makeRequest(driver, input, key)]);
      assert.equal(submitted[0].status, 201); assert.equal(submitted[1].status, 201);
      assert.equal(submitted[0].body.booking.id, submitted[1].body.booking.id);
      first = submitted[0].body.booking;
      assert.equal(first.status, 'REQUESTED'); assert.equal(first.station.restrictedAccessInstructions, undefined);
      assert.equal(first.energyKwh, null); assert.equal(first.paymentState, 'DEMO_NO_MONEY_COLLECTED');
      const replay = await makeRequest(driver, input, key);
      assert.equal(replay.body.booking.id, first.id);
      assert.equal(await prisma.booking.count({ where: { userId: driver.id, idempotencyKey: key } }), 1);
      const changed = await api('/bookings/request', driver, { ...input, durationMinutes: 60, idempotencyKey: key, expectedTotalPaise: 12000, expectedHourlyRatePaise: 12000 });
      assert.equal(changed.status, 409); assert.equal(changed.body.code, 'IDEMPOTENCY_CONFLICT');
      second = (await makeRequest(other, proposed(listing, otherVehicle))).body.booking;
      assert.equal(second.status, 'REQUESTED');
      assert.equal((await api('/bookings/' + first.id, stranger)).status, 403);
      assert.equal((await api('/bookings/' + first.id + '/action', stranger, { action: 'accept' })).status, 403);
      assert.equal((await api('/bookings/' + first.id + '/action', driver, { action: 'accept' })).status, 403);
    });
    await t.test('concurrent conflicting host accepts cannot both succeed; repeat accept is safe', async () => {
      const results = await Promise.all([api(`/bookings/${first.id}/action`, host, { action: 'accept' }), api(`/bookings/${second.id}/action`, host, { action: 'accept' })]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      winner = results.find(r => r.status === 200).body.booking;
      loser = winner.id === first.id ? second : first;
      const accepted = await prisma.booking.count({ where: { id: { in: [first.id, second.id] }, status: 'CONFIRMED' } });
      assert.equal(accepted, 1);
      assert.equal((await api(`/bookings/${winner.id}/action`, host, { action: 'accept' })).status, 200);
      const owningDriver = winner.userId === driver.id ? driver : other;
      const detail = await api('/bookings/' + winner.id, owningDriver);
      assert.equal(detail.body.booking.station.restrictedAccessInstructions, 'PRIVATE-TEST-CODE');
      assert.equal((await api('/bookings/' + loser.id, loser.userId === driver.id ? driver : other)).body.booking.station.restrictedAccessInstructions, undefined);
      const hostView = await api('/bookings/host', host);
      assert.equal(hostView.body.summary.upcomingBookings, 1);
      assert.equal((await api(`/bookings/${winner.id}/action`, host, { action: 'start' })).body.code, 'SESSION_NOT_IN_WINDOW');
    });
    await t.test('quote availability explains conflicts, suggests a full free slot, and preserves existing bookings', async () => {
      const path=`/rentals/${listing.id}/availability?start=${encodeURIComponent(winner.slotStart)}&durationMinutes=240`;
      const result=await api(path);
      assert.equal(result.status,200);assert.equal(result.body.availability.available,false);
      assert.equal(result.body.availability.code,'BOOKING_CONFLICT');
      const next=result.body.availability.nextAvailable;
      assert.ok(Date.parse(next.slotStart)>=Date.parse(winner.slotEnd));
      assert.equal(Date.parse(next.slotEnd)-Date.parse(next.slotStart),240*60000);
      const reviewed=await api('/bookings/quote',driver,proposed(listing,vehicle,next.slotStart,240));
      assert.equal(reviewed.status,200);assert.equal(reviewed.body.quote.totalPaise,48000);
      assert.equal((await api('/bookings/'+winner.id,winner.userId===driver.id?driver:other)).body.booking.slotStart,winner.slotStart);
      assert.equal(JSON.stringify(result.body).includes('PRIVATE-TEST-CODE'),false);
      assert.equal((await api(`/rentals/${listing.id}/availability?start=${encodeURIComponent(winner.slotStart)}&durationMinutes=0`)).status,400);
    });
    await t.test('database exclusion rejects bypassed overlapping confirmed inserts', async () => {
      let rejected = false;
      try {
        await prisma.booking.create({ data: { userId: driver.id, stationId: listing.id, connectorId: winner.connectorId, vehicleId: vehicle.id, status: 'CONFIRMED', slotStart: new Date(winner.slotStart), slotEnd: new Date(winner.slotEnd), expiresAt: new Date(winner.expiresAt), amountCents: 18000, energyKwh: null, quoteSnapshot: { syntheticTest: true } } });
      } catch { rejected = true; }
      assert.equal(rejected, true);
      assert.equal(await prisma.booking.count({ where: { stationId: listing.id, status: 'CONFIRMED' } }), 1);
    });
    await t.test('adjacent bookings work and quote snapshots survive later host rate changes', async () => {
      const next = (await makeRequest(driver, proposed(listing, vehicle, winner.slotEnd, 60))).body.booking;
      assert.equal((await api(`/bookings/${next.id}/action`, host, { action: 'accept' })).status, 200);
      const patch = await api('/rentals/' + listing.id, host, { hourlyRatePaise: 15000 }, 'PATCH');
      assert.equal(patch.status, 200);
      const existing = await api('/bookings/' + winner.id, winner.userId === driver.id ? driver : other);
      assert.equal(existing.body.booking.amountPaise, 18000); assert.equal(existing.body.booking.quoteSnapshot.hourlyRatePaise, 12000);
      const invalidate = await api('/rentals/' + listing.id, host, { availabilityWindows: [{ startsAt: at(500), endsAt: at(3000) }] }, 'PATCH');
      assert.equal(invalidate.status, 409);
      const frozenPending = await api(`/bookings/${loser.id}/action`, host, { action: 'decline', reason: 'Concurrent slot accepted by another driver.' });
      assert.equal(frozenPending.body.booking.amountPaise, 18000);
    });
    await t.test('stale reviewed quotes require a new review; paused listings reject requests', async () => {
      const input = proposed(listing, vehicle, at(400), 30);
      const oldQuote = await api('/bookings/quote', driver, input);
      assert.equal(oldQuote.body.quote.totalPaise, 7500);
      await api('/rentals/' + listing.id, host, { hourlyRatePaise: 12000 }, 'PATCH');
      const stale = await api('/bookings/request', driver, { ...input, idempotencyKey: randomUUID(), expectedTotalPaise: 7500, expectedHourlyRatePaise: 15000 });
      assert.equal(stale.status, 409); assert.equal(stale.body.code, 'QUOTE_CHANGED');
      const paused = await api('/rentals/' + listing.id, host, { published: false }, 'PATCH');
      assert.equal(paused.status, 200);
      assert.equal((await api('/bookings/quote', driver, input)).body.code, 'LISTING_PAUSED');
      assert.equal((await api('/bookings/' + winner.id, winner.userId === driver.id ? driver : other)).body.booking.status, 'CONFIRMED');
      await api('/rentals/' + listing.id, host, { published: true }, 'PATCH');
    });
    await t.test('expiry, decline, cancellation and restricted access persist', async () => {
      const expired = (await makeRequest(driver, proposed(listing, vehicle, at(500), 30))).body.booking;
      await prisma.booking.update({ where: { id: expired.id }, data: { expiresAt: new Date(base - 1000) } });
      assert.equal((await api('/bookings/' + expired.id, driver)).body.booking.status, 'EXPIRED');
      const expiredReplay = await api('/bookings/request', driver, { ...proposed(listing, vehicle, at(500), 30), idempotencyKey: expired.idempotencyKey, expectedTotalPaise: 0, expectedHourlyRatePaise: 0 });
      assert.equal(expiredReplay.body.booking.id, expired.id); assert.equal(expiredReplay.body.booking.status, 'EXPIRED');
      assert.equal((await api(`/bookings/${expired.id}/action`, host, { action: 'accept' })).status, 409);
      const declined = (await makeRequest(driver, proposed(listing, vehicle, at(550), 30))).body.booking;
      const decline = await api(`/bookings/${declined.id}/action`, host, { action: 'decline', reason: 'Not available.' });
      assert.equal(decline.body.booking.status, 'DECLINED'); assert.equal(decline.body.booking.hostResponse, 'Not available.');
      const cancel = (await makeRequest(driver, proposed(listing, vehicle, at(600), 30))).body.booking;
      await api(`/bookings/${cancel.id}/action`, host, { action: 'accept' });
      assert.equal((await api(`/bookings/${cancel.id}/action`, host, { action: 'cancel' })).status, 400);
      const cancelled = await api(`/bookings/${cancel.id}/action`, driver, { action: 'cancel' });
      assert.equal(cancelled.body.booking.status, 'CANCELLED'); assert.equal(cancelled.body.booking.station.restrictedAccessInstructions, undefined);
      assert.equal((await api(`/bookings/${cancel.id}/action`, host, { action: 'start' })).status, 409);
    });
    await t.test('server-timed manual start and completion persist a demo receipt, no payment', async () => {
      const session = (await makeRequest(driver, proposed(listing, vehicle, at(900), 30))).body.booking;
      await api(`/bookings/${session.id}/action`, host, { action: 'accept' });
      // Move this isolated accepted test fixture into the current interval to exercise
      // timing without sleeping. No production booking or synthetic seed is changed.
      await prisma.booking.update({ where: { id: session.id }, data: { slotStart: new Date(Date.now() - 30000), slotEnd: new Date(Date.now() + 30 * 60000) } });
      assert.equal((await api(`/bookings/${session.id}/action`, driver, { action: 'start' })).status, 403);
      const started = await api(`/bookings/${session.id}/action`, host, { action: 'start' });
      assert.equal(started.body.booking.status, 'IN_PROGRESS'); assert.ok(started.body.booking.sessionStartedAt);
      const completed = await api(`/bookings/${session.id}/action`, host, { action: 'complete' });
      assert.equal(completed.body.booking.status, 'COMPLETED'); assert.ok(completed.body.booking.sessionCompletedAt);
      assert.equal(completed.body.booking.receipt.measuredEnergyKwh, null);
      assert.match(completed.body.booking.receipt.paymentLabel, /no money collected/);
      assert.equal(await prisma.payment.count({ where: { bookingId: session.id } }), 0);
      const persisted = await prisma.booking.findUnique({ where: { id: session.id } });
      assert.equal(persisted.status, 'COMPLETED'); assert.ok(persisted.sessionStartedAt); assert.ok(persisted.sessionCompletedAt);
      const relogin = { ...driver, token: generateToken(driver) };
      assert.equal((await api('/bookings/' + session.id, relogin)).body.booking.status, 'COMPLETED');
    });
    await t.test('expiry during connector-lock contention is committed; pending quote stays frozen on acceptance', async () => {
      const input = proposed(listing, vehicle, at(1200), 90);
      const pending = (await makeRequest(driver, input)).body.booking;
      await api('/rentals/' + listing.id, host, { hourlyRatePaise: 16000 }, 'PATCH');
      const accepted = await api(`/bookings/${pending.id}/action`, host, { action: 'accept' });
      assert.equal(accepted.body.booking.amountPaise, 18000);
      assert.equal(accepted.body.booking.quoteSnapshot.hourlyRatePaise, 12000);
      const replay = await api('/bookings/request', driver, { ...input, idempotencyKey: pending.idempotencyKey, expectedTotalPaise: 24000, expectedHourlyRatePaise: 16000 });
      assert.equal(replay.body.booking.id, pending.id); assert.equal(replay.body.booking.amountPaise, 18000);
      await api('/rentals/' + listing.id, host, { hourlyRatePaise: 12000 }, 'PATCH');
      const expiring = (await makeRequest(driver, proposed(listing, vehicle, at(1400), 30))).body.booking;
      let releaseLock;
      let lockReady;
      const ready = new Promise(resolve => { lockReady = resolve; });
      const release = new Promise(resolve => { releaseLock = resolve; });
      const hold = prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "Connector" WHERE "id" = ${expiring.connectorId} FOR UPDATE`;
        lockReady();
        await release;
      });
      await ready;
      await prisma.booking.update({ where: { id: expiring.id }, data: { expiresAt: new Date(Date.now() + 150) } });
      const attempt = api(`/bookings/${expiring.id}/action`, host, { action: 'accept' });
      await new Promise(resolve => setTimeout(resolve, 220));
      releaseLock(); await hold;
      const refused = await attempt;
      assert.equal(refused.status, 409);
      assert.equal((await prisma.booking.findUnique({ where: { id: expiring.id } })).status, 'EXPIRED');
    });
  } finally {
    if (userIds.length) {
      const stations = await prisma.station.findMany({ where: { ownerId: { in: userIds } }, select: { id: true } });
      const ids = stations.map(s => s.id);
      const bookings = await prisma.booking.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
      await prisma.audit.deleteMany({ where: { entityType: 'Booking', entityId: { in: bookings.map(b => b.id) } } });
      await prisma.booking.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.station.deleteMany({ where: { id: { in: ids } } });
      await prisma.vehicle.deleteMany({ where: { ownerId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await new Promise(resolve => server.close(resolve));
    await prisma.$disconnect();
  }
});
