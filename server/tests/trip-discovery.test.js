const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');

function loadTypeScript(relativePath, imports = {}, globals = {}) {
    const projectRoot = path.resolve(__dirname, '../..');
    const filename = path.resolve(projectRoot, relativePath);
    const requireFromFile = createRequire(filename);
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const module = { exports: {} };
    function resolveImport(name) {
        if (Object.hasOwn(imports, name)) return imports[name];
        const localPath = name.startsWith('@/') ? path.resolve(projectRoot, name.slice(2))
            : name.startsWith('.') ? path.resolve(path.dirname(filename), name) : null;
        if (localPath) {
            const source = [localPath, `${localPath}.ts`, `${localPath}.tsx`]
                .find(candidate => /\.tsx?$/.test(candidate) && fs.existsSync(candidate));
            if (source) return loadTypeScript(path.relative(projectRoot, source), imports, globals);
        }
        return requireFromFile(name);
    }
    vm.runInNewContext(compiled, { module, exports: module.exports, console,
        require: resolveImport, ...globals }, { filename });
    return module.exports;
}

test('public conversion retains unknown specifications and never infers live availability', () => {
    const { externalStationsService } = loadTypeScript('services/externalStationsService.ts', {}, { process });
    const station = externalStationsService.convertToInternalFormat({
        id: 'google-example', name: 'Public place', location: { lat: 9.98, lng: 76.3 }, address: 'Kochi', source: 'google', status: 'available', connectors: [],
    });
    assert.equal(station.status, 'unknown');
    assert.equal(station.discoveryOnly, true);
    assert.equal(station.connectors.length, 0);
    assert.equal(station.operatingHours, 'Hours unknown');
    assert.equal(station.speed, 'unknown');
    const connector = externalStationsService.convertToInternalFormat({
        id: 'ocm-example', name: 'Listed connector', location: { lat: 10, lng: 76 }, source: 'openchargemap', connectors: [{ type: 'Type 2 (Mennekes)' }],
    }).connectors[0];
    assert.equal(connector.type, 'Type2');
    assert.equal(connector.power, null);
    assert.equal(connector.price, null);
    assert.equal(connector.available, null);
});

test('battery-free route planning never fabricates capacity, charger power or EV feasibility', async () => {
    const route = { distanceMeters: 24000, durationSeconds: 1800, polyline: '', legs: [] };
    const { TripPlannerService } = loadTypeScript('services/tripPlannerService.ts', {
        './directionsService': { directionsService: { getRouteInfo: async () => route } },
    });
    const result = await new TripPlannerService().planEVTrip({ origin: 'Kochi', destination: 'Aluva' });
    assert.equal(result.success, true);
    assert.equal(result.tripPlan.totalDuration, 1800);
    assert.equal(result.tripPlan.feasible, false);
    assert.equal(result.tripPlan.chargingStops.length, 0);
    assert.ok(result.tripPlan.warnings.some(value => value.includes('unverified')));
});

const samplePlan = () => ({
    origin: 'A', destination: 'B', departureAt: '2026-11-01T09:00', waypoint: '', vehicleId: '', batteryPercent: '', rangeKm: '', updatedAt: '',
    stops: [{ id: 'stop-1', stationId: 'private-1', kind: 'private', durationMinutes: 60, bookingId: 'booking-1' }],
    route: { distanceMeters: 2000, durationSeconds: 1200, polyline: '', legs: [{ duration: 600 }, { duration: 600 }] },
});

test('itinerary includes prior driving, waiting and stop time without shifting a reservation', () => {
    const { buildItinerarySchedule } = loadTypeScript('services/tripItinerary.ts');
    const plan = samplePlan();
    const booking = { id: 'booking-1', status: 'CONFIRMED', slotStart: '2026-11-01T10:00:00+05:30', slotEnd: '2026-11-01T11:00:00+05:30' };
    const original = JSON.stringify(booking);
    const schedule = buildItinerarySchedule(plan, [booking]);
    assert.equal(schedule.waiting, 50);
    assert.equal(schedule.dwell, 60);
    assert.equal(schedule.arrival, new Date('2026-11-01T11:10:00+05:30').getTime());
    assert.equal(JSON.stringify(booking), original);
    plan.stops.push({ id: 'public-stop', kind: 'public', durationMinutes: 30 });
    plan.route.legs.push({ duration: 600 });
    const withPublicStop = buildItinerarySchedule(plan, [booking]);
    assert.equal(withPublicStop.stops[1].arrival, new Date('2026-11-01T11:10:00+05:30').getTime());
    assert.equal(withPublicStop.arrival, new Date('2026-11-01T11:50:00+05:30').getTime());
});

test('late driving arrival flags review and cannot extend the fixed rental end', () => {
    const { buildItinerarySchedule } = loadTypeScript('services/tripItinerary.ts');
    const booking = { id: 'booking-1', status: 'CONFIRMED', slotStart: '2026-11-01T08:30:00+05:30', slotEnd: '2026-11-01T09:30:00+05:30' };
    const schedule = buildItinerarySchedule(samplePlan(), [booking]);
    assert.equal(schedule.stops[0].late, true);
    assert.equal(schedule.stops[0].dwell, 20);
    assert.equal(schedule.arrival, new Date('2026-11-01T09:40:00+05:30').getTime());
    const manual = { ...samplePlan(), route: null };
    assert.equal(buildItinerarySchedule(manual, [booking]).arrival, null);
});

test('local itinerary persistence is isolated by authenticated user ID', () => {
    const values = new Map();
    const localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    const { useRouteStore } = loadTypeScript('store/routeStore.ts', {}, { window: {}, localStorage });
    useRouteStore.getState().loadItinerary('driver-A');
    useRouteStore.getState().saveItinerary(samplePlan());
    useRouteStore.getState().loadItinerary('driver-B');
    assert.equal(useRouteStore.getState().itinerary, null);
    useRouteStore.getState().saveItinerary({ ...samplePlan(), origin: 'Driver B location' });
    useRouteStore.getState().loadItinerary('driver-A');
    assert.equal(useRouteStore.getState().itinerary.origin, 'A');
    assert.equal(useRouteStore.getState().itinerary.stops[0].bookingId, 'booking-1');
    assert.equal(Object.hasOwn(useRouteStore.getState().itinerary.stops[0], 'status'), false);
});

test('synthetic public fixtures are deterministic and have unknown availability', () => {
    const stations = require('../services/stationService');
    assert.deepEqual(stations.getAllStations(), stations.getAllStations());
    assert.ok(stations.getAllStations().every(station => station.synthetic && station.discoveryOnly && station.status === 'unknown' && station.connectors.length === 0));
    assert.equal(stations.updateStationStatus(stations.getAllStations()[0].id, 'available'), null);
});
