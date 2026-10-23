const prisma = require('../lib/prisma');
const demo = require('./demoMode');
const { fail, text, date, interval, contains, normaliseConnector, ACTIVE } = require('./rentalShared');

const include = { connectors: true, availabilityWindows: { orderBy: { startsAt: 'asc' } }, owner: { select: { id: true, name: true } } };
function publicRental(station, allowRestricted = false) {
  const result = { ...station, evidence: require('./listingEvidence').describe(station), bookingCapability: demo.publicDemo(station) ? 'PUBLIC_SIMULATION' : 'HOST_APPROVAL_REQUIRED', availabilitySource: 'HOST_CALENDAR' };
  if (!allowRestricted) delete result.restrictedAccessInstructions;
  return result;
}
function validateWindows(windows) {
  if (!Array.isArray(windows) || windows.length > 100) fail('Provide up to 100 dated availability windows.');
  const parsed = windows.map(w => {
    const startsAt = date(w.startsAt, 'Window start');
    const endsAt = date(w.endsAt, 'Window end');
    if (endsAt <= startsAt) fail('Each availability end must follow its start.');
    return { startsAt, endsAt };
  }).sort((a, b) => a.startsAt - b.startsAt);
  for (let i = 1; i < parsed.length; i++) {
    if (parsed[i].startsAt < parsed[i - 1].endsAt) fail('Availability windows must not overlap.');
  }
  return parsed;
}
function listingData(body, current) {
  const combined = { ...current, ...body };
  const name = text(combined.name, 'Listing title', true, 120);
  const address = text(combined.address, 'Address', true, 500);
  const lat = Number(combined.lat);
  const lng = Number(combined.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) fail('Provide valid map coordinates.');
  const hourlyRatePaise = Number(combined.hourlyRatePaise);
  if (!Number.isInteger(hourlyRatePaise) || hourlyRatePaise <= 0 || hourlyRatePaise > 10000000) fail('Hourly rate must be positive integer paise, up to ₹100,000/hour.');
  if (typeof combined.published !== 'boolean') fail('Published must be true or false.');
  const connectorType = normaliseConnector(body.connectorType ?? current?.connectors?.[0]?.connectorType);
  if (!connectorType) fail('Choose a supported, verified connector type.');
  const currentType = body.currentType ?? current?.connectors?.[0]?.currentType;
  if (!['AC', 'DC'].includes(currentType)) fail('Choose AC or DC.');
  const rawPower = body.powerKw === undefined ? current?.connectors?.[0]?.powerKw : body.powerKw;
  const powerKw = rawPower === null || rawPower === '' || rawPower === undefined ? null : Number(rawPower);
  if (powerKw !== null && (!Number.isFinite(powerKw) || powerKw <= 0 || powerKw > 1000)) fail('Rated power must be positive, or left unknown.');
  const imageUrl = text(combined.imageUrl, 'Image URL', false, 2000);
  if (imageUrl) {
    let url;
    try { url = new URL(imageUrl); } catch { fail('Image URL must be a valid HTTPS URL.'); }
    if (url.protocol !== 'https:') fail('Image URL must use HTTPS.');
  }
  return {
    station: { name, address, lat, lng, hourlyRatePaise, published: combined.published, parking: text(combined.parking, 'Parking conditions'), accessInstructions: text(combined.accessInstructions, 'Public access instructions'), restrictedAccessInstructions: text(combined.restrictedAccessInstructions, 'Restricted access instructions'), terms: text(combined.terms, 'Rental terms'), imageUrl },
    connector: { connectorType, currentType, powerKw, slotCount: 1 },
    windows: body.availabilityWindows === undefined ? current?.availabilityWindows : validateWindows(body.availabilityWindows),
  };
}

async function search(query = {}) {
  const where = { kind: 'PRIVATE_RENTAL', published: true };
  if (query.location) where.OR = [{ name: { contains: String(query.location), mode: 'insensitive' } }, { address: { contains: String(query.location), mode: 'insensitive' } }];
  if (query.connectorType && !demo.enabled()) {
    const type = normaliseConnector(query.connectorType);
    if (!type) fail('Unknown connector type.');
    where.connectors = { some: { connectorType: type } };
  }
  if (query.maxRatePaise !== undefined) {
    const rate = Number(query.maxRatePaise);
    if (!Number.isInteger(rate) || rate < 0) fail('Maximum hourly rate must be integer paise.');
    where.hourlyRatePaise = { lte: rate };
  }
  let coordinates;
  if (query.lat !== undefined || query.lng !== undefined) {
    const lat = Number(query.lat);
    const lng = Number(query.lng);
    if (query.lat === undefined || query.lng === undefined || !Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) fail('Provide valid latitude and longitude together.');
    coordinates = { lat, lng };
  }
  let selection;
  if (query.start) selection = interval(query.start, query.durationMinutes || 60);
  const stations = await prisma.station.findMany({ where, include, orderBy: { createdAt: 'asc' }, take: 100 });
  const conflicts = selection ? await prisma.booking.findMany({ where: { stationId: { in: stations.map(s => s.id) }, status: { in: ACTIVE }, slotStart: { lt: selection.end }, slotEnd: { gt: selection.start } }, select: { stationId: true } }) : [];
  const conflictIds = new Set(conflicts.map(b => b.stationId));
  const results = stations.map(s => {
    const open = selection ? contains(s.availabilityWindows, selection.start, selection.end) && !conflictIds.has(s.id) : null;
    let approximateDistanceKm = null;
    if (coordinates) {
      const radians = degrees => degrees * Math.PI / 180;
      const a = Math.sin(radians(s.lat - coordinates.lat) / 2) ** 2 + Math.cos(radians(coordinates.lat)) * Math.cos(radians(s.lat)) * Math.sin(radians(s.lng - coordinates.lng) / 2) ** 2;
      approximateDistanceKm = Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
    }
    return { ...publicRental(s), approximateDistanceKm, distanceSource: coordinates ? 'STRAIGHT_LINE_ESTIMATE' : null, isOpenForRequest: open, availabilityReason: selection ? open ? 'Open for requests. Host approval required; pending requests do not reserve capacity.' : 'The full requested period is outside open windows or already reserved.' : 'Choose a time to check the host calendar. This is not live charger telemetry.' };
  });
  if (coordinates) results.sort((a, b) => a.approximateDistanceKm - b.approximateDistanceKm);
  return results;
}
async function get(id) {
  const station = await prisma.station.findFirst({ where: { id, published: true, OR: [{kind:'PRIVATE_RENTAL'}, ...(demo.enabled() ? [{kind:'PUBLIC',source:'PUBLIC_DEMO'}] : [])] }, include });
  if (!station) fail('Rental listing not found or paused.', 404, 'NOT_FOUND');
  return publicRental(station);
}
async function mine(ownerId) {
  return (await prisma.station.findMany({ where: { ownerId, kind: 'PRIVATE_RENTAL' }, include, orderBy: { createdAt: 'asc' } })).map(s => publicRental(s, true));
}
async function create(ownerId, body) {
  const { station, connector, windows } = listingData(body);
  if (!windows?.length && station.published) fail('Add an availability window before publishing.');
  return publicRental(await prisma.station.create({ data: { ...station, ownerId, kind: 'PRIVATE_RENTAL', source: 'HOST_PROVIDED', connectors: { create: connector }, availabilityWindows: { create: windows || [] } }, include }), true);
}
async function update(ownerId, id, body) {
  return prisma.$transaction(async tx => {
    const found = await tx.station.findUnique({ where: { id }, include });
    if (!found || found.kind !== 'PRIVATE_RENTAL') fail('Rental listing not found.', 404, 'NOT_FOUND');
    if (found.ownerId !== ownerId) fail('Only the listing owner may edit it.', 403, 'FORBIDDEN');
    // Consistent ordering with acceptance/admin: connector, then station.
    await tx.$queryRaw`SELECT "id" FROM "Connector" WHERE "stationId" = ${id} ORDER BY "id" FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Station" WHERE "id" = ${id} FOR UPDATE`;
    const current = await tx.station.findUnique({ where: { id }, include });
    const { station, connector, windows } = listingData(body, current);
    if (!windows?.length && station.published) fail('Add an availability window before publishing.');
    const accepted = await tx.booking.findMany({ where: { stationId: id, status: { in: ACTIVE }, slotEnd: { gt: new Date() } } });
    if (accepted.some(b => !contains(windows || [], b.slotStart, b.slotEnd))) fail('Availability must retain every upcoming confirmed or active reservation.', 409, 'RESERVATION_CONFLICT');
    const old = current.connectors[0];
    const specificationsChanged=connector.connectorType!==old.connectorType||connector.currentType!==old.currentType||connector.powerKw!==old.powerKw||station.lat!==current.lat||station.lng!==current.lng||station.address!==current.address;
    if(specificationsChanged)Object.assign(station,{specificationsVerifiedAt:null,specificationEvidence:null,equipmentStatus:'UNKNOWN',statusReportedAt:null});
    if(station.parking!==current.parking||station.terms!==current.terms)station.parkingIncluded=null;
    if (accepted.length && (connector.connectorType !== old.connectorType || connector.currentType !== old.currentType || connector.powerKw !== old.powerKw || station.lat !== current.lat || station.lng !== current.lng || station.address !== current.address)) fail('Charger specifications and location cannot change while confirmed sessions are upcoming or active.', 409, 'RESERVATION_CONFLICT');
    if (body.availabilityWindows !== undefined) {
      await tx.availabilityWindow.deleteMany({ where: { stationId: id } });
      if (windows.length) await tx.availabilityWindow.createMany({ data: windows.map(w => ({ stationId: id, startsAt: w.startsAt, endsAt: w.endsAt })) });
    }
    await tx.connector.update({ where: { id: old.id }, data: connector });
    return publicRental(await tx.station.update({ where: { id }, data: station, include }), true);
  });
}
async function vehicles(ownerId) {
  return prisma.vehicle.findMany({ where: { ownerId }, orderBy: { createdAt: 'asc' } });
}
async function createVehicle(ownerId, body) {
  const model = text(body.model, 'Vehicle model', true, 120);
  const vehicleType = body.vehicleType || 'CAR';
  if (!['CAR', 'SCOOTER', 'BIKE'].includes(vehicleType)) fail('Invalid vehicle type.');
  if (!Array.isArray(body.connectorTypes) || body.connectorTypes.length < 1 || body.connectorTypes.length > 6) fail('Verify at least one compatible connector from your vehicle specification.');
  const connectorTypes = [...new Set(body.connectorTypes.map(normaliseConnector))];
  if (connectorTypes.includes(null)) fail('Choose a supported connector type.');
  const optionalNumber = (value, field, limit) => {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0 || n > limit) fail(`${field} is invalid.`);
    return n;
  };
  return prisma.vehicle.create({ data: { ownerId, model, vehicleType, connectorTypes, batteryCapacityKwh: optionalNumber(body.batteryCapacityKwh, 'Battery capacity', 1000), rangeKm: optionalNumber(body.rangeKm, 'Range', 3000) } });
}
module.exports = { search, get, mine, create, update, vehicles, createVehicle, publicRental, include, validateWindows };
