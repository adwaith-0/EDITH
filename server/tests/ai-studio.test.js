const test = require('node:test');
const assert = require('node:assert/strict');
const { createAIStudio, validateDraft, validateImage, publicText } = require('../services/aiStudio');

const env = { OLLAMA_API_KEY: 'test-secret-never-return', OLLAMA_MODEL: 'text-model', OLLAMA_VISION_MODEL: 'vision-model' };
const notes = 'Name: Garden EV Point\nAddress: 12 Garden Road, Bengaluru\nConnector: Type 2\nCurrent: AC\nPower: 7.4 kW\nRate: INR 120 per hour\nParking: One bay included\nPublic access: Meet host at front gate\nTerms: Arrive on time';
const response = (name, args) => ({ data: { message: { tool_calls: [{ function: { name, arguments: args } }] } } });
function mockHTTP(fn) { return { post: async (...args) => fn(...args) }; }

test('AI status distinguishes configured text and optional vision without returning secrets', () => {
  assert.deepEqual(createAIStudio({ env: {} }).configuration(), { configured: false, provider: 'Ollama Cloud', model: 'gpt-oss:20b', visionConfigured: false });
  const status = createAIStudio({ env }).configuration();
  assert.equal(status.visionConfigured, true);
  assert.equal(status.visionModel, 'vision-model');
  assert.ok(!JSON.stringify(status).includes(env.OLLAMA_API_KEY));
});

test('explicit offline listing draft extracts facts and leaves coordinates and calendar manual', async () => {
  const service = createAIStudio({ env, http: mockHTTP(() => { throw new Error('must not call provider'); }) });
  const result = await service.listingDraft({ notes, useDemoFallback: true });
  assert.equal(result.mode, 'DEMO_FALLBACK');
  assert.equal(result.draft.name, 'Garden EV Point');
  assert.equal(result.draft.connectorType, 'Type 2');
  assert.equal(result.draft.currentType, 'AC');
  assert.equal(result.draft.powerKw, 7.4);
  assert.equal(result.draft.hourlyRatePaise, 12000);
  assert.equal(result.draft.parking, 'One bay included');
  assert.ok(result.missingFields.includes('lat') && result.missingFields.includes('availabilityWindows'));
  assert.ok(!('lat' in result.draft) && !('published' in result.draft));
});

test('draft does not infer connector, power, price or current type from a generic description', async () => {
  const result = await createAIStudio({ env: {} }).listingDraft({ notes: 'A useful charger near my house.', useDemoFallback: true });
  assert.deepEqual(result.draft, {});
  assert.ok(result.missingFields.includes('currentType'));
});

test('offline extraction leaves negated, negative and ambiguous equipment facts unknown', async () => {
  const service = createAIStudio({ env: {} });
  for (const value of ['Connector: not Type 2; actual connector is unknown', 'Power: -7.4 kW', 'This charger is not AC.', 'Current: maybe AC', 'Rate: not INR 120 per hour']) {
    const result = await service.listingDraft({ notes: value, useDemoFallback: true });
    assert.deepEqual(result.draft, {}, value);
  }
  assert.throws(() => validateDraft({ draft: { powerKw: 7.4 }, evidence: { powerKw: '7.4 kW' }, labelText: null }, 'Power: -7.4 kW'), { code: 'INVALID_AI_OUTPUT' });
  assert.throws(() => validateDraft({ draft: { currentType: 'AC' }, evidence: { currentType: 'AC' }, labelText: null }, 'This charger is not AC.'), { code: 'INVALID_AI_OUTPUT' });
  assert.throws(() => validateDraft({ draft: { connectorType: 'Type 2' }, evidence: { connectorType: 'Type 2' }, labelText: null }, 'Connector: not Type 2'), { code: 'INVALID_AI_OUTPUT' });
});

test('draft removes private codes and email before sending notes to cloud AI', async () => {
  let sent;
  const http = mockHTTP((url, body, options) => {
    sent = JSON.stringify(body);
    assert.equal(url, 'https://ollama.com/api/chat');
    assert.ok(options.timeout > 0 && options.timeout <= 22000);
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers.Authorization, `Bearer ${env.OLLAMA_API_KEY}`);
    return response('extract_listing_draft', { draft: { name: 'Garden' }, evidence: { name: 'Name: Garden' }, labelText: null });
  });
  const result = await createAIStudio({ env, http }).listingDraft({ notes: 'Name: Garden\nGate code: 123456\nEmail: private@example.com' });
  assert.equal(result.mode, 'AI');
  assert.ok(!sent.includes('123456') && !sent.includes('private@example.com'));
  assert.ok(result.warnings.some(w => /removed/.test(w)));
});

test('draft validates ranges, schema, evidence and connector facts', () => {
  assert.throws(() => validateDraft({ draft: { lat: 12 }, evidence: {}, labelText: null }, notes), { code: 'INVALID_AI_OUTPUT' });
  assert.throws(() => validateDraft({ draft: { powerKw: 1001 }, evidence: { powerKw: '1001 kW' }, labelText: null }, '1001 kW'), { code: 'INVALID_AI_OUTPUT' });
  assert.throws(() => validateDraft({ draft: { hourlyRatePaise: -100 }, evidence: { hourlyRatePaise: 'INR -1 per hour' }, labelText: null }, 'INR -1 per hour'), { code: 'INVALID_AI_OUTPUT' });
  assert.throws(() => validateDraft({ draft: { connectorType: 'CCS2' }, evidence: { connectorType: 'Type 2' }, labelText: null }, notes), { code: 'INVALID_AI_OUTPUT' });
  assert.throws(() => validateDraft({ draft: { currentType: 'AC' }, evidence: { currentType: 'Type 2' }, labelText: null }, notes), { code: 'INVALID_AI_OUTPUT' });
  const unsupportedName = validateDraft({ draft: { name: 'Invented name' }, evidence: { name: 'Name: Garden' }, labelText: null }, notes);
  assert.equal(unsupportedName.draft.name, undefined);
  assert.equal(unsupportedName.warnings.length, 1);
});

test('image extraction may supply printed technical fields only, never location or price', () => {
  const extracted = validateDraft({ draft: { powerKw: 7.4, currentType: 'AC', connectorType: 'Type 2' }, evidence: { powerKw: '7.4 kW', currentType: 'AC', connectorType: 'TYPE 2' }, labelText: 'TYPE 2\n7.4 kW AC' }, '', true);
  assert.deepEqual(extracted.draft, { connectorType: 'Type 2', currentType: 'AC', powerKw: 7.4 });
  const unsupportedAddress = validateDraft({ draft: { address: 'Garden Road' }, evidence: { address: 'Garden Road' }, labelText: 'Garden Road' }, '', true);
  assert.equal(unsupportedAddress.draft.address, undefined);
  assert.equal(unsupportedAddress.warnings.length, 1);
  assert.throws(() => validateDraft({ draft: { hourlyRatePaise: 12000 }, evidence: { hourlyRatePaise: 'INR 120 per hour' }, labelText: 'INR 120 per hour' }, '', true), { code: 'INVALID_AI_OUTPUT' });
});

test('images are bounded, typed and require real configured vision', async () => {
  assert.throws(() => validateImage({ mimeType: 'image/png', base64: Buffer.from('not a PNG').toString('base64') }));
  assert.throws(() => validateImage({ mimeType: 'image/svg+xml', base64: 'AAAA' }));
  const image = { mimeType: 'image/png', base64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString('base64') };
  const service = createAIStudio({ env: { OLLAMA_API_KEY: 'key' } });
  await assert.rejects(service.listingDraft({ notes: '', labelImage: image }), { code: 'VISION_NOT_CONFIGURED' });
  await assert.rejects(service.listingDraft({ notes, labelImage: image, useDemoFallback: true }), { code: 'VISION_REQUIRES_AI' });
});

test('image metadata rejects corrupt and oversized dimensions before contacting the model', async () => {
  const sharp = require('sharp');
  let calls = 0;
  const http = mockHTTP((url, body) => {
    calls++;
    assert.equal(body.model, 'vision-model');
    assert.equal(body.messages[1].images.length, 1);
    return response('extract_listing_draft', { draft: {}, evidence: {}, labelText: 'Unreadable' });
  });
  const service = createAIStudio({ env, http });
  const corrupt = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  await assert.rejects(service.listingDraft({ labelImage: { mimeType: 'image/png', base64: corrupt.toString('base64') } }), { code: 'INVALID_IMAGE' });
  const oversized = await sharp({ create: { width: 4001, height: 4000, channels: 3, background: '#fff' } }).png().toBuffer();
  assert.ok(oversized.length < 1024 * 1024);
  await assert.rejects(service.listingDraft({ labelImage: { mimeType: 'image/png', base64: oversized.toString('base64') } }), { code: 'INVALID_IMAGE' });
  assert.equal(calls, 0);
  const valid = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } }).png().toBuffer();
  const result = await service.listingDraft({ labelImage: { mimeType: 'image/png', base64: valid.toString('base64') } });
  assert.equal(result.mode, 'AI');
  assert.equal(calls, 1);
});

test('provider failure is redacted and never silently becomes demo success', async () => {
  const http = mockHTTP(() => { const error = new Error(`secret provider text ${env.OLLAMA_API_KEY}`); error.response = { status: 401, data: { key: env.OLLAMA_API_KEY } }; throw error; });
  await assert.rejects(createAIStudio({ env, http }).listingDraft({ notes }), error => error.code === 'AI_UNAVAILABLE' && error.status === 503 && !error.message.includes(env.OLLAMA_API_KEY));
  await assert.rejects(createAIStudio({ env: {} }).listingDraft({ notes }), { code: 'AI_NOT_CONFIGURED' });
});

test('tool name, count and malformed JSON are rejected', async () => {
  for (const data of [ { message: { tool_calls: [] } }, { message: { tool_calls: [{ function: { name: 'publish_listing', arguments: {} } }] } }, { message: { tool_calls: [{ function: { name: 'extract_listing_draft', arguments: '{broken' } }] } } ]) {
    await assert.rejects(createAIStudio({ env, http: mockHTTP(() => ({ data })) }).listingDraft({ notes }), { code: 'INVALID_AI_OUTPUT' });
  }
});

test('missing tool call receives one bounded repair and returns only validated AI output', async () => {
  let count = 0;
  const http = mockHTTP((url, body, options) => {
    assert.ok(options.timeout <= 22000);
    count++;
    if (count === 1) return { data: { message: { content: 'I can help extract your notes.' } } };
    assert.match(body.messages[0].content, /previous response was rejected/);
    assert.match(body.messages[0].content, /extract_listing_draft exactly once/);
    assert.match(body.messages[0].content, /additionalProperties/);
    return response('extract_listing_draft', { draft: { powerKw: 7.4 }, evidence: { powerKw: '7.4 kW' }, labelText: null });
  });
  const result = await createAIStudio({ env, http }).listingDraft({ notes });
  assert.equal(count, 2);
  assert.equal(result.mode, 'AI');
  assert.equal(result.draft.powerKw, 7.4);
});

test('invalid generated fact is revalidated on repair rather than silently accepted', async () => {
  let count = 0;
  const http = mockHTTP((url, body) => {
    count++;
    if (count === 2) assert.match(body.messages[0].content, /unsupported power or pricing/);
    return response('extract_listing_draft', { draft: { powerKw: count === 1 ? 11 : 7.4 }, evidence: { powerKw: '7.4 kW' }, labelText: null });
  });
  const result = await createAIStudio({ env, http }).listingDraft({ notes });
  assert.equal(count, 2);
  assert.equal(result.draft.powerKw, 7.4);
});

test('malformed outputs exhaust exactly one repair without becoming demo success', async () => {
  let count = 0;
  const http = mockHTTP(() => { count++; return { data: { message: { content: '```json\n{broken\n```' } } }; });
  await assert.rejects(createAIStudio({ env, http }).listingDraft({ notes }), { code: 'INVALID_AI_OUTPUT' });
  assert.equal(count, 2);
});

test('JSON-only and fenced JSON responses pass the same fact and schema validators', async () => {
  const valid = { draft: { powerKw: 7.4 }, evidence: { powerKw: '7.4 kW' }, labelText: null };
  for (const content of [JSON.stringify(valid), `\u0060\u0060\u0060json\n${JSON.stringify(valid)}\n\u0060\u0060\u0060`]) {
    let count = 0;
    const http = mockHTTP(() => { count++; return { data: { message: { content } } }; });
    const result = await createAIStudio({ env, http }).listingDraft({ notes });
    assert.equal(count, 1);
    assert.equal(result.mode, 'AI');
    assert.equal(result.draft.powerKw, 7.4);
  }
  let rejected = 0;
  const http = mockHTTP(() => { rejected++; return { data: { message: { content: JSON.stringify({ draft: { powerKw: 99 }, evidence: { powerKw: '7.4 kW' }, labelText: null }) } } }; });
  await assert.rejects(createAIStudio({ env, http }).listingDraft({ notes }), { code: 'INVALID_AI_OUTPUT' });
  assert.equal(rejected, 2);
});

test('provider authentication failures are not repaired or retried', async () => {
  let count = 0;
  const http = mockHTTP(() => { count++; const error = new Error('private provider payload'); error.response = { status: 401 }; throw error; });
  await assert.rejects(createAIStudio({ env, http }).listingDraft({ notes }), { code: 'AI_UNAVAILABLE' });
  assert.equal(count, 1);
});

test('input lengths, language and explicit fallback types are bounded', async () => {
  const service = createAIStudio({ env: {} });
  await assert.rejects(service.listingDraft({ notes: 'x'.repeat(5001), useDemoFallback: true }));
  await assert.rejects(service.listingDraft({ notes, useDemoFallback: 'true' }));
  await assert.rejects(service.guide({ question: 'x'.repeat(1201), useDemoFallback: true }));
  await assert.rejects(service.guide({ question: 'How?', language: 'invalid', useDemoFallback: true }));
});

test('guide queries only four published private listings with a public field allowlist', async () => {
  let query, sent;
  const db = { station: { findMany: async q => { query = q; return [{ id: 'a', name: 'Garden', address: 'Main Road', hourlyRatePaise: 12000, parking: 'One bay', terms: 'Be on time', source: 'SYNTHETIC_DEMO', ownerId: 'secret-owner', restrictedAccessInstructions: 'secret-code', owner: { email: 'secret-email' }, connectors: [{ connectorType: 'Type 2', currentType: 'AC', powerKw: 7.4 }] }]; } } };
  const http = mockHTTP((url, body) => { sent = JSON.stringify(body); return response('answer_edith_guide', { answer: 'Host approval is required.', sourceIds: ['policy-booking', 'a'], caveats: ['This is a read-only draft answer.'] }); });
  const result = await createAIStudio({ env, db, http }).guide({ question: 'How do I request Garden?', listingIds: ['a'], language: 'en' });
  assert.equal(query.take, 4);
  assert.deepEqual(query.where, { kind: 'PRIVATE_RENTAL', published: true, id: { in: ['a'] } });
  assert.ok(!query.select.owner && !query.select.restrictedAccessInstructions && !query.select.accessInstructions);
  assert.ok(!sent.includes('secret-owner') && !sent.includes('secret-code') && !sent.includes('secret-email'));
  assert.deepEqual(result.sources[1], { id: 'a', title: 'Garden', kind: 'LISTING' });
});

test('guide supplies display rates and returns all four listing sources with mandatory demo and unknown-power caveats', async () => {
  const fixtures = Array.from({ length: 4 }, (_, index) => ({ id: `listing-${index}`, name: `Synthetic charger ${index}`, address: 'Demo Road', hourlyRatePaise: index === 1 ? 12050 : 12000, parking: 'Demo bay', terms: 'Demo only', source: index === 3 ? 'HOST_PROVIDED' : 'SYNTHETIC_DEMO', connectors: [{ connectorType: 'Type 2', currentType: 'AC', powerKw: index === 3 ? null : 7.4 }] }));
  const db = { station: { findMany: async () => fixtures } };
  const http = mockHTTP((url, body) => {
    const input = JSON.parse(body.messages[1].content);
    const records = input.sources.filter(s => s.kind === 'LISTING');
    assert.equal(records[0].rateLabel, 'INR 120/hour');
    assert.equal(records[1].rateLabel, 'INR 120.50/hour');
    assert.equal(records[0].connectors[0].ratedPowerLabel, '7.4 kW');
    assert.equal(records[3].connectors[0].ratedPowerLabel, 'Rated power unknown');
    assert.equal(records[0].dataMode, 'SYNTHETIC_DEMO');
    assert.equal(records[3].demo, true);
    assert.equal(records[3].dataMode, 'SYNTHETIC_DEMO');
    assert.ok(!body.messages[1].content.includes('hourlyRatePaise'));
    assert.ok(!body.messages[1].content.includes('12000'));
    assert.match(body.messages[0].content, /copy them EXACTLY/);
    return response('answer_edith_guide', { answer: 'These synthetic demo chargers list INR 120/hour or INR 120.50/hour.', sourceIds: ['policy-booking'], caveats: [] });
  });
  const result = await createAIStudio({ env, db, http }).guide({ question: 'Compare hourly rates.', language: 'en' });
  assert.equal(result.sources.filter(s => s.kind === 'LISTING').length, 4);
  assert.equal(result.sources.filter(s => s.kind === 'POLICY').length, 1);
  assert.ok(result.caveats.some(c => /synthetic EDITH demo listings/.test(c)));
  assert.ok(result.caveats.some(c => /Rated power is unknown.*Synthetic charger 3/.test(c)));
});

test('comparison with incorrect paise display is repaired without accepting the invalid unit', async () => {
  let calls = 0;
  const db = { station: { findMany: async () => [] } };
  const http = mockHTTP(() => {
    calls++;
    return response('answer_edith_guide', { answer: calls === 1 ? 'Price is 12000 paise/hour.' : 'The supplied records do not provide a listing price.', sourceIds: [], caveats: [] });
  });
  const result = await createAIStudio({ env, db, http }).guide({ question: 'Compare prices.', language: 'en' });
  assert.equal(calls, 2);
  assert.doesNotMatch(result.answer, /paise/i);
});

test('guide refuses invented source IDs from model output', async () => {
  const db = { station: { findMany: async () => [] } };
  const http = mockHTTP(() => response('answer_edith_guide', { answer: 'Invented response', sourceIds: ['https://unknown.example'], caveats: [] }));
  await assert.rejects(createAIStudio({ env, db, http }).guide({ question: 'How?', language: 'en' }), { code: 'INVALID_AI_OUTPUT' });
});

test('unsupported guide questions may return an honest answer without unrelated citations', async () => {
  const db = { station: { findMany: async () => [] } };
  const http = mockHTTP(() => response('answer_edith_guide', { answer: 'The supplied EDITH sources do not contain that information.', sourceIds: [], caveats: [] }));
  const result = await createAIStudio({ env, db, http }).guide({ question: 'What is the current price of gold?', language: 'en' });
  assert.deepEqual(result.sources, []);
  assert.match(result.answer, /do not contain/);
});

test('offline guide offers English, Hindi and Malayalam with honest fixed-guide caveat', async () => {
  const service = createAIStudio({ env: {}, db: { station: { findMany: async () => [] } } });
  for (const [language, script] of [['en', /pending request/], ['hi', /अनुरोध/], ['ml', /ചാർജറിന്റെ/]]) {
    const result = await service.guide({ question: 'How do I book?', language, useDemoFallback: true });
    assert.equal(result.mode, 'DEMO_FALLBACK');
    assert.match(result.answer, script);
    assert.equal(result.sources.length, 3);
    assert.equal(result.caveats.length, 1);
  }
});

test('host insights enforce owner scope and send aggregates only to the model', async () => {
  let stationQuery, bookingQuery, pendingQuery, sent;
  const db = { station: { findMany: async query => { stationQuery = query; return [{ id: 'owned-a', published: true }, { id: 'owned-b', published: false }]; } }, booking: { groupBy: async query => { bookingQuery = query; return [
    { status: 'REQUESTED', paymentState: 'DEMO_NO_MONEY_COLLECTED', _count: { _all: 2 }, _sum: { amountCents: 50000 } },
    { status: 'COMPLETED', paymentState: 'DEMO_NO_MONEY_COLLECTED', _count: { _all: 1 }, _sum: { amountCents: 12000 } },
    { status: 'CANCELLED', paymentState: 'DEMO_NO_MONEY_COLLECTED', _count: { _all: 1 }, _sum: { amountCents: 5000 } },
  ]; }, count: async query => { pendingQuery = query; return 2; } } };
  const http = mockHTTP((url, body) => { sent = JSON.stringify(body); return response('summarise_host_aggregates', { summary: 'You have two requests to review.', suggestions: [{ title: 'Review requests', detail: 'Open Host requests to review each request.' }] }); });
  const result = await createAIStudio({ env, db, http }).hostInsights('signed-in-host', {});
  assert.deepEqual(stationQuery.where, { ownerId: 'signed-in-host', kind: 'PRIVATE_RENTAL' });
  assert.deepEqual(stationQuery.select, { id: true, published: true });
  assert.equal(bookingQuery.where.station.ownerId, 'signed-in-host');
  assert.deepEqual(bookingQuery.where.stationId.in, ['owned-a', 'owned-b']);
  assert.equal(pendingQuery.where.station.ownerId, 'signed-in-host');
  assert.ok(pendingQuery.where.expiresAt.gt instanceof Date);
  assert.ok(pendingQuery.where.slotStart.gt instanceof Date);
  assert.ok(!sent.includes('signed-in-host') && !sent.includes('owned-a'));
  assert.deepEqual(result.metrics, { ownedListings: 2, publishedListings: 1, bookingCount: 4, pendingRequests: 2, completedSessions: 1, cancelledBookings: 1, demoBookingValuePaise: 12000 });
  assert.match(result.notice, /not revenue/);
});

test('elapsed host request deadlines are excluded read-only while total booking count remains intact', async () => {
  const snapshot = new Date('2026-10-24T12:00:00Z');
  let query;
  const db = { station: { findMany: async () => [{ id: 'owned', published: true }] }, booking: {
    groupBy: async () => [{ status: 'REQUESTED', paymentState: 'DEMO_NO_MONEY_COLLECTED', _count: { _all: 5 }, _sum: { amountCents: 5000 } }],
    count: async value => { query = value; return 1; },
  } };
  const result = await createAIStudio({ env: {}, db, now: () => snapshot }).hostInsights('host', { useDemoFallback: true });
  assert.equal(result.metrics.bookingCount, 5);
  assert.equal(result.metrics.pendingRequests, 1);
  assert.deepEqual(query.where.expiresAt, { gt: snapshot });
  assert.deepEqual(query.where.slotStart, { gt: snapshot });
  assert.match(result.summary, /1 request\(s\) await/);
});

test('host output rejects missing summary, string suggestions and model-supplied metrics', async () => {
  const db = { station: { findMany: async () => [] } };
  for (const result of [
    { suggestions: ['Review your listings'] },
    { summary: 'Review your listings.', suggestions: ['Review your listings'] },
    { summary: 'Review your listings.', suggestions: [], metrics: { ownedListings: 999 } },
  ]) {
    const http = mockHTTP(() => response('summarise_host_aggregates', result));
    await assert.rejects(createAIStudio({ env, db, http }).hostInsights('host', {}), { code: 'INVALID_AI_OUTPUT' });
  }
});

test('empty host receives onboarding without querying bookings or inventing revenue', async () => {
  const db = { station: { findMany: async () => [] }, booking: { groupBy: async () => { throw new Error('no bookings query expected'); } } };
  const result = await createAIStudio({ env: {}, db }).hostInsights('new-host', { useDemoFallback: true });
  assert.equal(result.metrics.bookingCount, 0);
  assert.equal(result.metrics.demoBookingValuePaise, 0);
  assert.ok(result.suggestions.some(s => /first listing/.test(s.title)));
  await assert.rejects(createAIStudio({ env: {}, db }).hostInsights(null, {}), { code: 'AUTH_REQUIRED' });
});

test('public sanitisation strips accidental private code lines and emails', () => {
  const result = publicText('Public: Front gate\nAccess code: 1234\nContact: person@example.com');
  assert.ok(result.includes('Front gate') && !result.includes('1234') && !result.includes('person@example.com'));
});

test('AI routes require authentication and host insights use authenticated identity', async t => {
  process.env.JWT_SECRET ||= 'unit-test-only-ai-studio-secret-at-least-32-characters';
  const express = require('express');
  const { createRouter } = require('../routes/aiStudio');
  const app = express();
  app.use(express.json());
  const seen = [];
  app.use('/api/ai', createRouter({ authenticate: (req, res, next) => {
    if (req.headers.authorization !== 'Bearer test') return res.status(401).json({ error: 'Sign in' });
    req.user = { id: 'authenticated-owner' }; next();
  }, service: { configuration: () => ({ configured: true }), hostInsights: async (id, body) => { seen.push(id); return { metrics: { ownedListings: 1 } }; } } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/ai`;
  assert.equal((await fetch(`${base}/status`)).status, 401);
  assert.equal((await fetch(`${base}/host-insights`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  const result = await fetch(`${base}/host-insights`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' }, body: JSON.stringify({ ownerId: 'attacker-chosen-owner', useDemoFallback: true }) });
  assert.equal(result.status, 200);
  assert.deepEqual(seen, ['authenticated-owner']);
  assert.equal(result.headers.get('cache-control'), 'no-store');
});

test('authenticated AI requests have a bounded rate limit', async t => {
  process.env.JWT_SECRET ||= 'unit-test-only-ai-studio-secret-at-least-32-characters';
  const express = require('express');
  const { createRouter } = require('../routes/aiStudio');
  const app = express();
  app.use('/api/ai', createRouter({ limit: 1, authenticate: (req, res, next) => { req.user = { id: 'host' }; next(); }, service: { configuration: () => ({ configured: true }) } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/api/ai/status`;
  assert.equal((await fetch(url)).status, 200);
  const limited = await fetch(url);
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).code, 'RATE_LIMITED');
});
