// Exercise a deployed EDITH demo through its public HTTP and WebSocket interfaces.
// This script never reads dotenv/database credentials and only changes its own QA fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { io } = require('socket.io-client');

function baseUrl(value, label) {
  if (!value) throw new Error(`${label} is required.`);
  const url = new URL(value);
  assert.ok(['http:', 'https:'].includes(url.protocol), `${label} must use HTTP or HTTPS.`);
  assert.ok(!url.username && !url.password && !url.search && !url.hash, `${label} must not contain credentials, a query or fragment.`);
  return url.href.replace(/\/+$/, '');
}

const web = baseUrl(process.env.EDITH_DEPLOYMENT_URL, 'EDITH_DEPLOYMENT_URL');
const api = baseUrl(process.env.EDITH_API_URL || web, 'EDITH_API_URL');
const run = `QA verification ${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 6)}`;
const flags = new Set(process.argv.slice(2));
const allowedFlags = new Set(['--skip-ai', '--skip-realtime', '--skip-maps']);
for (const flag of flags) assert.ok(allowedFlags.has(flag), `Unknown option: ${flag}`);
const report = { checkedAt: new Date().toISOString(), deployment: web, api, checks: [], fixtures: { scope: 'Only named synthetic QA listing, saved vehicle and booking records created by this run.' } };
const secrets = [process.env.EDITH_ADMIN_PASSWORD].filter(Boolean);
let host, driver, qaDriver, listing, vehicle, socket, sessionBooking;
const bookings = [];
const autopilotBookings = [];
const completedBookings = new Set();
const updates = new Set();

function safeMessage(error) {
  let value = error instanceof Error ? error.message : 'Verification failed.';
  for (const secret of secrets) value = value.split(secret).join('[redacted]');
  return value.slice(0, 450);
}

async function check(label, task) {
  const started = Date.now();
  try {
    const value = await task();
    report.checks.push({ label, result: 'passed', durationMs: Date.now() - started });
    console.log(`PASS ${label}`);
    return value;
  } catch (error) {
    const message = safeMessage(error);
    report.checks.push({ label, result: 'failed', durationMs: Date.now() - started, error: message });
    console.error(`FAIL ${label}: ${message}`);
    return undefined;
  }
}

function skip(label, reason) {
  report.checks.push({ label, result: 'skipped', reason });
  console.log(`SKIP ${label}: ${reason}`);
}

async function request(route, { body, token, method, status = 200, timeout = 65000, binary = false } = {}) {
  const response = await fetch(api + route, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(timeout),
  });
  if (response.status !== status) {
    let code = '';
    try {
      const errorBody = await response.json();
      if (typeof errorBody.code === 'string' && /^[A-Z_0-9]{1,80}$/.test(errorBody.code)) code = ` (${errorBody.code})`;
    } catch { /* Do not include upstream response payloads or infrastructure HTML. */ }
    throw new Error(`${method || (body === undefined ? 'GET' : 'POST')} ${route} returned HTTP ${response.status}${code}, expected ${status}.`);
  }
  if (binary) return { bytes: Buffer.from(await response.arrayBuffer()), headers: response.headers };
  assert.match(response.headers.get('content-type') || '', /application\/json/i, `${route} must return JSON.`);
  return response.json();
}

async function login(email, password) {
  const result = await request('/api/auth/login', { body: { email, password } });
  assert.ok(result.token && result.user?.id, 'Login must return a token and user identity.');
  secrets.push(result.token);
  return result;
}

async function waitForUpdate(id, timeout = 12000) {
  if (updates.has(id)) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('booking.updated', listener); reject(new Error('The authenticated WebSocket did not receive its booking update.')); }, timeout);
    const listener = update => {
      if (update.id !== id) return;
      clearTimeout(timer);
      socket.off('booking.updated', listener);
      resolve();
    };
    socket.on('booking.updated', listener);
  });
}

async function main() {
  await check('Frontend renders EDITH HTML', async () => {
    const response = await fetch(web, { signal: AbortSignal.timeout(65000) });
    assert.equal(response.status, 200, 'The frontend must return HTTP 200.');
    assert.match(response.headers.get('content-type') || '', /text\/html/i);
    assert.match(await response.text(), /EDITH/i);
  });
  await check('API health and database readiness', async () => {
    const health = await request('/health');
    assert.equal(health.status, 'ok');
    assert.equal(health.database, 'ready', 'Health must verify database connectivity.');
  });
  await check('Public station snapshot and coverage disclosure', async () => {
    const data = await request('/api/external-stations?lat=9.9816&lng=76.2999&radius=100000&preferCache=true');
    assert.ok(data.stations?.length > 0, 'Kochi must have cached public discovery records.');
    assert.equal(data.meta?.cached, true);
    assert.equal(data.meta?.queryComplete, false);
    assert.match(data.meta?.warning || '', /partial|incomplete/i);
  });
  await check('Public vehicle catalogue and demo mode', async () => {
    const data = await request('/api/concierge/vehicles');
    assert.ok(data.vehicles?.length > 0);
    assert.equal(data.demoEnabled, true);
  });

  if (flags.has('--skip-maps')) skip('Live geocoder, road route and trip directory', 'Explicit --skip-maps option.');
  else {
    await check('Live place search', async () => {
      const data = await request('/api/maps/search?q=Kochi');
      assert.ok(data.results?.length > 0);
    });
    await check('Live road route', async () => {
      const data = await request('/api/maps/route', { body: { points: [{ lat: 9.9816, lng: 76.2999 }, { lat: 10.5276, lng: 76.2144 }] } });
      assert.ok(data.route?.distance > 1000 && data.route?.geometry);
      assert.equal(data.trafficAvailable, false);
    });
    await check('Trip charger corridor and cached source disclosure', async () => {
      const data = await request('/api/trips/chargers', { body: { points: [{ lat: 9.9816, lng: 76.2999 }, { lat: 10.5276, lng: 76.2144 }], corridorKm: 10, preferCache: true } });
      assert.ok(Array.isArray(data.stations) && Array.isArray(data.rentals));
      assert.ok(data.stations.length > 0);
      assert.equal(data.queryComplete, false);
      assert.match(data.warning || '', /cached|snapshot/i);
    });
  }

  host = await check('Demo host login', () => login('host@edith.demo', 'EdithDemo123!'));
  driver = await check('Demo driver login', () => login('driver@edith.demo', 'EdithDemo123!'));
  const qaEmail = `qa-${randomUUID()}@edith.invalid`;
  const qaPassword = randomUUID() + randomUUID();
  secrets.push(qaPassword);
  qaDriver = await check('New synthetic driver signs up', async () => {
    const data = await request('/api/auth/signup', { status: 201, body: { email: qaEmail, password: qaPassword, name: run } });
    assert.ok(data.token && data.user?.id);
    assert.equal(data.user.role, 'USER');
    secrets.push(data.token);
    return data;
  });
  if (qaDriver) {
    await check('New driver can log in and read its own identity', async () => {
      const signedIn = await login(qaEmail, qaPassword);
      assert.equal(signedIn.user.id, qaDriver.user.id);
      const data = await request('/api/auth/me', { token: signedIn.token });
      assert.equal(data.user?.id, qaDriver.user.id);
      assert.equal(data.user?.role, 'USER');
    });
    await check('New synthetic account has no preexisting bookings', async () => {
      const data = await request('/api/bookings/mine', { token: qaDriver.token });
      assert.deepEqual(data.bookings, []);
    });
  }
  await check('Unauthenticated rental creation is forbidden', () => request('/api/rentals', { body: {}, status: 401 }));
  await check('Unauthenticated AI access is forbidden', () => request('/api/ai/listing-draft', { body: { notes: 'Synthetic test' }, status: 401 }));

  if (host && driver) {
    await check('Driver cannot read another account booking history', () => request(`/api/bookings/user/${host.user.id}`, { token: driver.token, status: 403 }));
    await check('Driver cannot access admin dashboard', () => request('/api/admin/dashboard', { token: driver.token, status: 403 }));
    if (flags.has('--skip-realtime')) skip('Authenticated WebSocket connection and booking event', 'Explicit --skip-realtime option.');
    else {
      await check('Authenticated WebSocket connection', () => new Promise((resolve, reject) => {
        socket = io(api, { transports: ['websocket'], auth: { token: driver.token }, reconnection: false, timeout: 20000, forceNew: true });
        const timer = setTimeout(() => { socket.disconnect(); reject(new Error('WebSocket connection timed out.')); }, 25000);
        socket.on('booking.updated', event => updates.add(event.id));
        socket.once('connect', () => { clearTimeout(timer); resolve(true); });
        socket.once('connect_error', () => { clearTimeout(timer); socket.disconnect(); reject(new Error('The deployment rejected the Socket.IO WebSocket connection.')); });
      }));
    }

    const start = new Date(Date.now() + 2 * 86400000);
    start.setUTCHours(8, 0, 0, 0);
    const end = new Date(start.getTime() + 4 * 3600000);
    listing = await check('Host creates a synthetic dated rental listing', async () => {
      const data = await request('/api/rentals', { token: host.token, status: 201, body: {
        name: run, address: 'Synthetic QA fixture, Kochi - no real charger or payment', lat: 9.9816, lng: 76.2999,
        hourlyRatePaise: 12500, published: true, connectorType: 'Type 2', currentType: 'AC', powerKw: 7.4,
        parking: 'Synthetic QA parking bay.', accessInstructions: 'Synthetic public QA instructions.', restrictedAccessInstructions: 'SYNTHETIC-QA-RESTRICTED',
        terms: 'Synthetic verification only; no money collected.', availabilityWindows: [
          { startsAt: new Date(Date.now() - 60000).toISOString(), endsAt: new Date(Date.now() + 4 * 3600000).toISOString() },
          { startsAt: start.toISOString(), endsAt: end.toISOString() },
        ],
      } });
      assert.ok(data.rental?.id);
      return data.rental;
    });
    vehicle = await check('Driver saves a synthetic compatible vehicle', async () => {
      const data = await request('/api/vehicles', { token: driver.token, status: 201, body: { model: run, vehicleType: 'CAR', connectorTypes: ['Type 2'], batteryCapacityKwh: 30, rangeKm: 200 } });
      assert.ok(data.vehicle?.id);
      return data.vehicle;
    });
    if (vehicle) await check('Garage persists the saved vehicle under its owner', async () => {
      const own = await request('/api/vehicles', { token: driver.token });
      assert.ok(own.vehicles?.some(item => item.id === vehicle.id && item.model === run));
      const another = await request('/api/vehicles', { token: host.token });
      assert.ok(!another.vehicles?.some(item => item.id === vehicle.id));
    });
    if (listing) {
      await check('Public listing hides restricted access instructions', async () => {
        const data = await request(`/api/rentals/${listing.id}`);
        assert.ok(!Object.hasOwn(data.rental, 'restrictedAccessInstructions'));
      });
      await check('Driver cannot edit the host listing', () => request(`/api/rentals/${listing.id}`, { token: driver.token, method: 'PATCH', body: { published: false }, status: 403 }));
    }
    if (listing && vehicle) {
      const selection = { stationId: listing.id, vehicleId: vehicle.id, slotStart: start.toISOString(), durationMinutes: 60 };
      const quote = await check('Server quote computes hourly demo price', async () => {
        const data = await request('/api/bookings/quote', { token: driver.token, body: selection });
        assert.equal(data.quote?.totalPaise, 12500);
        assert.equal(data.quote?.currency, 'INR');
        assert.match(data.quote?.paymentLabel || '', /no money collected/i);
        return data.quote;
      });
      if (quote) {
        const payload = { ...selection, expectedTotalPaise: quote.totalPaise, expectedHourlyRatePaise: quote.hourlyRatePaise, idempotencyKey: randomUUID() };
        const first = await check('Driver request remains pending host approval', async () => {
          const data = await request('/api/bookings/request', { token: driver.token, status: 201, body: payload });
          assert.ok(data.booking?.id);
          bookings.push(data.booking.id);
          assert.equal(data.booking.status, 'REQUESTED');
          assert.ok(!Object.hasOwn(data.booking.station, 'restrictedAccessInstructions'));
          return data.booking;
        });
        if (first) {
          if (!flags.has('--skip-realtime')) {
            if (socket?.connected) await check('Authenticated WebSocket receives owned booking event', () => waitForUpdate(first.id));
            else skip('Authenticated WebSocket receives owned booking event', 'WebSocket connection failed.');
          }
          await check('Duplicate request key returns the same booking', async () => {
            const data = await request('/api/bookings/request', { token: driver.token, status: 201, body: payload });
            assert.equal(data.booking?.id, first.id);
          });
          await check('Driver cannot accept a rental request', () => request(`/api/bookings/${first.id}/action`, { token: driver.token, body: { action: 'accept' }, status: 403 }));
          const second = await check('Pending requests do not reserve capacity', async () => {
            const data = await request('/api/bookings/request', { token: driver.token, status: 201, body: { ...payload, idempotencyKey: randomUUID() } });
            assert.ok(data.booking?.id && data.booking.id !== first.id);
            bookings.push(data.booking.id);
            assert.equal(data.booking.status, 'REQUESTED');
            return data.booking;
          });
          const confirmed = await check('Host accepts and confirms the first request', async () => {
            const data = await request(`/api/bookings/${first.id}/action`, { token: host.token, body: { action: 'accept', reason: 'Synthetic QA verification.' } });
            assert.equal(data.booking?.status, 'CONFIRMED');
            return data.booking;
          });
          if (confirmed) {
            await check('Confirmed driver can read restricted arrival instructions', async () => {
              const data = await request(`/api/bookings/${first.id}`, { token: driver.token });
              assert.equal(data.booking?.station?.restrictedAccessInstructions, 'SYNTHETIC-QA-RESTRICTED');
            });
            await check('Reserved interval blocks a competing quote', async () => {
              const data = await request('/api/bookings/quote', { token: driver.token, body: selection, status: 409 });
              assert.equal(data.code, 'BOOKING_CONFLICT');
            });
            if (second) await check('Host cannot accept an overlapping pending request', async () => {
              const data = await request(`/api/bookings/${second.id}/action`, { token: host.token, body: { action: 'accept' }, status: 409 });
              assert.equal(data.code, 'BOOKING_CONFLICT');
            });
            await check('Driver cancels own confirmed demo booking', async () => {
              const data = await request(`/api/bookings/${first.id}/action`, { token: driver.token, body: { action: 'cancel' } });
              assert.equal(data.booking?.status, 'CANCELLED');
            });
          }
        }
      }
    } else skip('Booking quote, request, acceptance, conflict and cancellation', 'Synthetic listing or vehicle creation failed.');

    // Prepare this separate session before model calls; their runtime usually
    // covers the short wait until its server-defined reservation starts.
    if (listing && vehicle) await prepareSession();
    else skip('Actual session start, completion, receipt and outcome', 'Synthetic listing or vehicle creation failed.');
    if (flags.has('--skip-ai')) skip('Live text, vision, multilingual guide, host insights and neural audio', 'Explicit --skip-ai option.');
    else await verifyAI();
    if (sessionBooking) await completeSession();
  } else skip('Authenticated rental, AI and WebSocket journeys', 'Demo host or driver login failed.');

  if (process.env.EDITH_ADMIN_EMAIL && process.env.EDITH_ADMIN_PASSWORD) {
    const admin = await check('Private admin login', () => login(process.env.EDITH_ADMIN_EMAIL, process.env.EDITH_ADMIN_PASSWORD));
    if (admin) {
      await check('Admin dashboard', async () => {
        const data = await request('/api/admin/dashboard', { token: admin.token });
        assert.ok(Number.isInteger(data.activeBookingsCount));
        assert.ok(Array.isArray(data.recentBookings));
      });
      await check('Admin history, slots, payments and energy reports', async () => {
        for (const route of ['/api/admin/bookings?size=5', '/api/admin/available-slots', '/api/admin/payments?range=today', '/api/admin/electricity?range=today', '/api/admin/vehicles/usage?range=month']) {
          const data = await request(route, { token: admin.token });
          assert.ok(data && typeof data === 'object');
        }
      });
    }
  } else skip('Private admin login and reports', 'EDITH_ADMIN_EMAIL and EDITH_ADMIN_PASSWORD were not supplied.');
}

async function verifyAI() {
  await check('Live text and vision models are configured', async () => {
    const data = await request('/api/ai/status', { token: host.token });
    assert.equal(data.configured, true);
    assert.equal(data.visionConfigured, true);
  });
  await check('Live AI extracts a supported listing draft', async () => {
    const data = await request('/api/ai/listing-draft', { token: host.token, body: { notes: 'Synthetic demo: Garden House Charger at Demo Lane, Fort Kochi. Type 2 connector, AC, 7.4 kW. INR 140 per hour. One covered car parking bay is included. Meet the host at the front gate. Please leave the bay clean.' } });
    assert.equal(data.mode, 'AI');
    assert.equal(data.draft?.powerKw, 7.4);
    assert.equal(data.draft?.hourlyRatePaise, 14000);
  });
  await check('Live vision reads the synthetic charger label', async () => {
    const image = fs.readFileSync(path.resolve(__dirname, '../public/demo/charger-label.png'));
    const data = await request('/api/ai/listing-draft', { token: host.token, body: { notes: 'Read only this synthetic demo label. Other listing details are not supplied.', labelImage: { base64: image.toString('base64'), mimeType: 'image/png' } } });
    assert.equal(data.mode, 'AI');
    assert.equal(data.draft?.powerKw, 7.4);
    assert.equal(data.draft?.currentType, 'AC');
  });
  await check('Live English guide cites listing records', async () => {
    const data = await request('/api/ai/guide', { token: driver.token, body: { question: 'Compare the listed private chargers by hourly price and connector. What information must I still check before requesting?', language: 'en' } });
    assert.equal(data.mode, 'AI');
    assert.ok(data.sources?.some(source => source.kind === 'LISTING'));
    assert.doesNotMatch(data.answer || '', /paise/i);
    assert.ok(data.caveats?.some(caveat => /synthetic/i.test(caveat)));
  });
  await check('Live Malayalam guide explains host approval', async () => {
    const data = await request('/api/ai/guide', { token: driver.token, body: { question: 'Does a pending private rental request reserve the charger? Explain host approval and demo payment.', language: 'ml' } });
    assert.equal(data.mode, 'AI');
    assert.match(data.answer || '', /[\u0D00-\u0D7F]/);
  });
  await check('Live AI explains host-owned aggregate insights', async () => {
    const data = await request('/api/ai/host-insights', { token: host.token, body: {} });
    assert.equal(data.mode, 'AI');
    assert.ok(data.metrics?.ownedListings >= 1);
  });
  await check('Natural-language booking agent asks for missing details', async () => {
    const data = await request('/api/concierge/agent/turn', { token: driver.token, body: { message: 'Find me a charger near Kochi.', settings: { mvpQuickBook: false } } });
    assert.equal(data.stage, 'NEEDS');
    assert.match(data.needs?.area || '', /kochi|cochin/i);
    assert.ok(data.question && data.stateToken);
    assert.ok(!data.booking && !data.draft, 'An incomplete request must not create a booking or quote.');
    secrets.push(data.stateToken);
  });
  if (qaDriver) {
    const autopilot = await check('One-turn demo autopilot creates an actual confirmed simulation', async () => {
      const data = await request('/api/concierge/agent/turn', { token: qaDriver.token, timeout: 120000, body: { message: 'Book me a charger slot for my Tata Nexon EV.', settings: { mvpQuickBook: true, demoVehicleId: 'nexon-45' } } });
      assert.ok(data.booking?.id);
      assert.equal(data.booking.userId, qaDriver.user.id, 'Only this newly created QA account may own the simulation.');
      autopilotBookings.push(data.booking.id);
      if (data.stateToken) secrets.push(data.stateToken);
      assert.equal(data.booking.status, 'CONFIRMED');
      assert.equal(data.instantDemo, true);
      assert.equal(data.booking.station?.source, 'PUBLIC_DEMO');
      assert.equal(data.booking.quoteSnapshot?.bookingMode, 'DEMO_AUTOPILOT');
      assert.equal(data.booking.quoteSnapshot?.publicSimulation, true);
      assert.equal(data.booking.paymentState, 'DEMO_NO_MONEY_COLLECTED');
      assert.equal(data.vehicleLookup?.realVehicleVerified, false);
      assert.match(data.message || '', /simulation|demo/i);
      report.fixtures.manufacturerReference = data.vehicleLookup?.reference?.status || 'UNKNOWN';
      return data;
    });
    if (autopilot) {
      await check('Autopilot booking and demo preset persist in new driver account', async () => {
        const saved = await request(`/api/bookings/${autopilot.booking.id}`, { token: qaDriver.token });
        assert.equal(saved.booking?.status, 'CONFIRMED');
        const garage = await request('/api/vehicles', { token: qaDriver.token });
        assert.ok(garage.vehicles?.some(item => item.id === saved.booking.vehicleId && item.metadata?.synthetic === true));
        report.fixtures.newAccountVehicleCount = garage.vehicles.length;
        const status = await request('/api/concierge/agent/turn', { token: qaDriver.token, body: { message: 'booking status', stateToken: autopilot.stateToken } });
        assert.equal(status.booking?.id, autopilot.booking.id);
      });
      await check('QA driver cancels only its newly created autopilot simulation', async () => {
        const data = await request(`/api/bookings/${autopilot.booking.id}/action`, { token: qaDriver.token, body: { action: 'cancel' } });
        assert.equal(data.booking?.status, 'CANCELLED');
      });
    }
  } else skip('One-turn demo autopilot creation and persistence', 'New synthetic account signup failed; existing user bookings are never reused.');
  await check('Labelled offline AI fallback remains usable', async () => {
    const data = await request('/api/ai/guide', { token: driver.token, body: { question: 'How does host acceptance work?', language: 'en', useDemoFallback: true } });
    assert.equal(data.mode, 'DEMO_FALLBACK');
  });
  await check('Kokoro generates nonempty PCM WAV neural audio', async () => {
    const data = await request('/api/concierge/speech', { token: driver.token, body: { text: 'Welcome to Edith. Your host approves private rental requests.' }, timeout: 300000, binary: true });
    assert.match(data.headers.get('content-type') || '', /audio\/wav/i);
    assert.equal(data.headers.get('x-voice-engine'), 'Kokoro-af_heart');
    assert.ok(data.bytes.length > 1000);
    assert.equal(data.bytes.subarray(0, 4).toString(), 'RIFF');
    assert.equal(data.bytes.subarray(8, 12).toString(), 'WAVE');
    assert.equal(data.bytes.readUInt16LE(20), 1);
    assert.equal(data.bytes.readUInt32LE(24), 24000);
    assert.ok(data.bytes.subarray(44).some(byte => byte !== 0), 'The waveform must contain audio samples.');
  });
}

async function prepareSession() {
  sessionBooking = await check('Separate QA session is quoted, requested and host-confirmed', async () => {
    const health = await request('/health');
    const serverNow = Date.parse(health.timestamp);
    assert.ok(Number.isFinite(serverNow), 'Server health must provide its current timestamp.');
    const selection = { stationId: listing.id, vehicleId: vehicle.id, slotStart: new Date(serverNow + 90000).toISOString(), durationMinutes: 30 };
    const quoted = await request('/api/bookings/quote', { token: driver.token, body: selection });
    const requested = await request('/api/bookings/request', { token: driver.token, status: 201, body: { ...selection, expectedTotalPaise: quoted.quote.totalPaise, expectedHourlyRatePaise: quoted.quote.hourlyRatePaise, idempotencyKey: randomUUID() } });
    assert.ok(requested.booking?.id);
    bookings.push(requested.booking.id);
    const accepted = await request(`/api/bookings/${requested.booking.id}/action`, { token: host.token, body: { action: 'accept', reason: 'Separate synthetic QA check-in and receipt verification.' } });
    assert.equal(accepted.booking?.status, 'CONFIRMED');
    return accepted.booking;
  });
}

async function completeSession() {
  const inWindow = await check('Session reaches its real reserved interval using server time', async () => {
    const deadline = Date.now() + 125000;
    let announced = false;
    while (true) {
      const health = await request('/health');
      const serverNow = Date.parse(health.timestamp);
      assert.ok(Number.isFinite(serverNow));
      const wait = Date.parse(sessionBooking.slotStart) - serverNow;
      assert.ok(serverNow < Date.parse(sessionBooking.slotEnd), 'The reserved QA interval ended before check-in.');
      if (wait <= 0) return true;
      assert.ok(Date.now() < deadline, 'Server time did not reach the QA interval within the bounded wait.');
      if (!announced) { console.log(`Waiting approximately ${Math.ceil(wait / 1000)} seconds for the QA reservation window.`); announced = true; }
      await new Promise(resolve => setTimeout(resolve, Math.min(wait + 250, 25000)));
    }
  });
  if (!inWindow) { skip('Session start, completion, receipt and outcome', 'The server-defined reservation window was not reached.'); return; }
  await check('Driver cannot perform host check-in', () => request(`/api/bookings/${sessionBooking.id}/action`, { token: driver.token, body: { action: 'start' }, status: 403 }));
  const started = await check('Host starts the confirmed session within its reserved interval', async () => {
    const data = await request(`/api/bookings/${sessionBooking.id}/action`, { token: host.token, body: { action: 'start' } });
    assert.equal(data.booking?.status, 'IN_PROGRESS');
    assert.ok(data.booking.sessionStartedAt);
    return data.booking;
  });
  if (!started) { skip('Session completion, receipt and outcome', 'Host check-in failed.'); return; }
  const completed = await check('Host completes the session and produces a demo receipt', async () => {
    const data = await request(`/api/bookings/${sessionBooking.id}/action`, { token: host.token, body: { action: 'complete' } });
    assert.equal(data.booking?.status, 'COMPLETED');
    completedBookings.add(data.booking.id);
    assert.equal(data.booking.receipt?.amountPaise, 6250);
    assert.equal(data.booking.receipt?.currency, 'INR');
    assert.match(data.booking.receipt?.paymentLabel || '', /no money collected/i);
    assert.ok(data.booking.receipt?.sessionStartedAt && data.booking.receipt?.sessionCompletedAt);
    assert.equal(data.booking.receipt.measuredEnergyKwh, null, 'Synthetic sessions must not invent measured energy.');
    return data.booking;
  });
  if (!completed) { skip('Persisted receipt and successful session outcome', 'Host completion failed.'); return; }
  await check('Completed receipt persists in driver and host booking history', async () => {
    const own = await request('/api/bookings/mine', { token: driver.token });
    assert.ok(own.bookings?.some(item => item.id === completed.id && item.status === 'COMPLETED' && item.receipt?.amountPaise === 6250));
    const hosted = await request('/api/bookings/host', { token: host.token });
    assert.ok(hosted.bookings?.some(item => item.id === completed.id && item.status === 'COMPLETED'));
  });
  await check('Host cannot submit a driver outcome report', () => request(`/api/bookings/${completed.id}/report`, { token: host.token, status: 403, body: { kind: 'SESSION_SUCCESS', notes: 'Synthetic QA report access-control check.' } }));
  await check('Driver records and retrieves a synthetic successful session outcome', async () => {
    const data = await request(`/api/bookings/${completed.id}/report`, { token: driver.token, status: 201, body: { kind: 'SESSION_SUCCESS', notes: 'Synthetic QA outcome only. No physical charging or measured energy was verified.' } });
    assert.ok(data.report?.id);
    assert.equal(data.report.kind, 'SESSION_SUCCESS');
    const saved = await request(`/api/bookings/${completed.id}`, { token: driver.token });
    assert.ok(saved.booking?.reports?.some(item => item.id === data.report.id && item.kind === 'SESSION_SUCCESS'));
  });
}

async function cleanup() {
  socket?.disconnect();
  if (driver) {
    for (const id of bookings) {
      if (completedBookings.has(id)) continue;
      await check('QA cleanup: close only own unfinished booking fixture', async () => {
      const current = await request(`/api/bookings/${id}`, { token: driver.token });
      if (current.booking?.status === 'COMPLETED') { completedBookings.add(id); return; }
      if (current.booking?.status === 'IN_PROGRESS' || (current.booking?.status === 'CONFIRMED' && Date.parse(current.booking.slotStart) <= Date.now())) {
        if (current.booking.status === 'CONFIRMED') await request(`/api/bookings/${id}/action`, { token: host.token, body: { action: 'start' } });
        const closed = await request(`/api/bookings/${id}/action`, { token: host.token, body: { action: 'complete' } });
        assert.equal(closed.booking?.status, 'COMPLETED');
        completedBookings.add(id);
        return;
      }
      const data = await request(`/api/bookings/${id}/action`, { token: driver.token, body: { action: 'cancel' } });
      assert.equal(data.booking?.status, 'CANCELLED');
    });
    }
  }
  if (qaDriver) for (const id of autopilotBookings) await check('QA cleanup: cancel only new-account autopilot fixture', async () => {
    const data = await request(`/api/bookings/${id}/action`, { token: qaDriver.token, body: { action: 'cancel' } });
    assert.equal(data.booking?.status, 'CANCELLED');
  });
  if (host && listing) await check('QA cleanup: pause only the created listing', async () => {
    const data = await request(`/api/rentals/${listing.id}`, { token: host.token, method: 'PATCH', body: { published: false } });
    assert.equal(data.rental?.published, false);
  });
  report.fixtures.createdListings = listing ? 1 : 0;
  report.fixtures.createdVehicles = (vehicle ? 1 : 0) + (report.fixtures.newAccountVehicleCount || 0);
  report.fixtures.createdAccounts = qaDriver ? 1 : 0;
  report.fixtures.createdBookings = bookings.length + autopilotBookings.length;
  report.fixtures.createdAutopilotBookings = autopilotBookings.length;
  report.fixtures.completedSessions = completedBookings.size;
  report.fixtures.retained = 'Named synthetic QA account, vehicle, report and booking records remain for audit. Created private listing is paused; created bookings are cancelled or completed when cleanup passes. No preexisting user booking is altered.';
}

(async () => {
  try { await main(); }
  catch (error) { report.checks.push({ label: 'Verifier execution', result: 'failed', error: safeMessage(error) }); console.error(safeMessage(error)); }
  finally {
    await cleanup();
    report.completedAt = new Date().toISOString();
    report.summary = { passed: report.checks.filter(item => item.result === 'passed').length, failed: report.checks.filter(item => item.result === 'failed').length, skipped: report.checks.filter(item => item.result === 'skipped').length };
    report.passed = report.summary.failed === 0;
    report.allChecksRun = report.summary.skipped === 0;
    fs.mkdirSync(path.resolve(__dirname, '../test-results'), { recursive: true });
    const artifact = process.env.EDITH_VERIFICATION_REPORT ? path.resolve(process.env.EDITH_VERIFICATION_REPORT) : path.resolve(__dirname, '../test-results/deployment-verification.json');
    fs.mkdirSync(path.dirname(artifact), { recursive: true });
    fs.writeFileSync(artifact, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ checksPassed: report.summary.passed, checksFailed: report.summary.failed, checksSkipped: report.summary.skipped, passed: report.passed, allChecksRun: report.allChecksRun, artifact }, null, 2));
    if (!report.passed) process.exitCode = 1;
  }
})();
