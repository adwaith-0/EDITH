const { createHash } = require('crypto');

class RentalError extends Error {
  constructor(message, status = 400, code = 'VALIDATION_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const fail = (message, status = 400, code) => { throw new RentalError(message, status, code); };
const ACTIVE = ['CONFIRMED', 'IN_PROGRESS'];
const CONNECTOR_TYPES = ['Type 2', 'CCS2', 'CHAdeMO', 'Bharat AC001', 'Bharat DC001', 'IEC 60309'];
const PAYMENT_LABEL = 'Demo payment — no money collected.';
const CANCELLATION = 'Driver or host may cancel before the reserved start. Host cancellation requires a reason. No money is collected.';

function normaliseConnector(value) {
  const key = String(value || '').toLowerCase().replace(/[\s_-]/g, '');
  const aliases = { type2: 'Type 2', ccs: 'CCS2', ccs2: 'CCS2', chademo: 'CHAdeMO', bharatac001: 'Bharat AC001', bharatdc001: 'Bharat DC001', iec60309: 'IEC 60309' };
  return aliases[key] || null;
}
function text(value, field, required = false, limit = 2000) {
  if (typeof value !== 'string') {
    if (required) fail(`${field} is required.`);
    return null;
  }
  const clean = value.trim();
  if (required && !clean) fail(`${field} is required.`);
  if (clean.length > limit) fail(`${field} must be at most ${limit} characters.`);
  return clean || null;
}
function date(value, field) {
  if (!(value instanceof Date) && (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/i.test(value))) fail(`${field} must be an ISO timestamp with timezone.`);
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) fail(`${field} is invalid.`);
  return result;
}
function interval(slotStart, durationMinutes, requireFuture = true, now = new Date()) {
  const start = date(slotStart, 'Rental start');
  const duration = Number(durationMinutes);
  if (!Number.isInteger(duration) || duration <= 0 || duration > 1440) fail('Duration must be a whole number from 1 to 1440 minutes.');
  if (requireFuture && start <= now) fail('Choose a future rental start.', 409, 'START_IN_PAST');
  return { start, end: new Date(start.getTime() + duration * 60000), duration };
}
function price(hourlyRatePaise, durationMinutes) {
  if (!Number.isInteger(hourlyRatePaise) || hourlyRatePaise <= 0 || hourlyRatePaise > 10000000) fail('Hourly price is invalid.');
  return Math.ceil(hourlyRatePaise * durationMinutes / 60);
}
function contains(windows, start, end) {
  let coveredUntil = start.getTime();
  for (const window of [...windows].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))) {
    const from = new Date(window.startsAt).getTime();
    const to = new Date(window.endsAt).getTime();
    if (from > coveredUntil) break;
    if (to > coveredUntil) coveredUntil = to;
    if (coveredUntil >= end.getTime()) return true;
  }
  return false;
}
function fingerprint(body) {
  return createHash('sha256').update(JSON.stringify([body.stationId, body.vehicleId, new Date(body.slotStart).toISOString(), Number(body.durationMinutes),...(body.bookingMode==='CONCIERGE'?[body.bookingMode,body.conciergeToken]:body.bookingMode==='DEMO_AUTOPILOT'?[body.bookingMode]:[])])).digest('hex');
}
function apiError(res, error) {
  if (error.code === 'P2002') return res.status(409).json({ error: 'A duplicate record was submitted. Refresh and try again.', code: 'DUPLICATE' });
  if (error.code === 'P2003') return res.status(400).json({ error: 'A referenced record no longer exists.', code: 'INVALID_REFERENCE' });
  if (!error.status) console.error('[Rental API]', error);
  return res.status(error.status || 500).json({ error: error.status ? error.message : 'The rental service could not complete this action. Please try again.', code: error.code || 'INTERNAL_ERROR' });
}
module.exports = { RentalError, fail, ACTIVE, CONNECTOR_TYPES, PAYMENT_LABEL, CANCELLATION, normaliseConnector, text, date, interval, price, contains, fingerprint, apiError };
