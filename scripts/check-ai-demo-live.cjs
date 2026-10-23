// Live provider rehearsal using only labelled synthetic inputs and seeded demo accounts.
require('dotenv').config({ path: '.env.local', quiet: true });
const assert = require('node:assert/strict');
const fs = require('node:fs');
const prisma = require('../server/lib/prisma');
const root = 'http://localhost:3001/api';

async function request(route, body, token) {
  const response = await fetch(root + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(65000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`EDITH request ${route} returned ${response.status}: ${data.error || 'unavailable'}`);
  return data;
}

(async () => {
  try {
    const before = { bookings: await prisma.booking.count(), stations: await prisma.station.count() };
    const auth = await request('/auth/login', { email: 'host@edith.demo', password: 'EdithDemo123!' });
    const token = auth.token;
    const status = await request('/ai/status', undefined, token);
    const blocked = await fetch(root + '/ai/listing-draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: 'test' }) });
    assert.equal(blocked.status, 401);
    console.log('Checking live text listing extraction...');
    const textDraft = await request('/ai/listing-draft', {
      notes: 'Synthetic demo: Garden House Charger at Demo Lane, Fort Kochi. Type 2 connector, AC, 7.4 kW. INR 140 per hour. One covered car parking bay is included. Meet the host at the front gate. Please leave the bay clean.',
    }, token);
    assert.equal(textDraft.mode, 'AI');
    assert.equal(textDraft.draft.powerKw, 7.4);
    assert.equal(textDraft.draft.hourlyRatePaise, 14000);
    console.log('Checking live synthetic label extraction...');
    const imageDraft = await request('/ai/listing-draft', {
      notes: 'Read only this synthetic demo label. Other listing details are not supplied.',
      labelImage: { base64: fs.readFileSync('public/demo/charger-label.png').toString('base64'), mimeType: 'image/png' },
    }, token);
    assert.equal(imageDraft.mode, 'AI');
    assert.equal(imageDraft.draft.powerKw, 7.4);
    assert.equal(imageDraft.draft.currentType, 'AC');
    console.log('Checking live charger comparison...');
    const comparison = await request('/ai/guide', { question: 'Compare the listed private chargers by hourly price and connector. What information must I still check before requesting?', language: 'en' }, token);
    assert.equal(comparison.mode, 'AI');
    assert.ok(comparison.sources.some(source => source.kind === 'LISTING'), 'Comparison must show its actual listing source records');
    assert.doesNotMatch(comparison.answer, /paise/i, 'Displayed comparison prices must use human-readable INR per hour');
    assert.ok(comparison.caveats.some(caveat => /synthetic/i.test(caveat)), 'Synthetic records need an explicit source caveat');
    console.log('Checking live Malayalam guidance...');
    const malayalam = await request('/ai/guide', { question: 'Does a pending private rental request reserve the charger? Explain host approval and demo payment.', language: 'ml' }, token);
    assert.equal(malayalam.mode, 'AI');
    assert.match(malayalam.answer, /[\u0D00-\u0D7F]/);
    console.log('Checking live owner-only host insights...');
    const insights = await request('/ai/host-insights', {}, token);
    assert.equal(insights.mode, 'AI');
    assert.ok(insights.metrics.ownedListings >= 0);
    const offline = await request('/ai/guide', { question: 'How does host acceptance work?', language: 'en', useDemoFallback: true }, token);
    assert.equal(offline.mode, 'DEMO_FALLBACK');
    const after = { bookings: await prisma.booking.count(), stations: await prisma.station.count() };
    assert.deepEqual(after, before, 'AI tools must not create or alter booking/listing counts');
    const result = { checkedAt: new Date().toISOString(), status, unauthorizedStatus: blocked.status, textDraft, imageDraft, comparison, malayalam, insights, offline, before, after, inputs: 'Synthetic label/notes and seeded demo account only; no real photograph uploaded.' };
    fs.mkdirSync('test-results', { recursive: true });
    fs.writeFileSync('test-results/ai-studio-live.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ passed: true, textMode: textDraft.mode, imageMode: imageDraft.mode, imagePowerKw: imageDraft.draft.powerKw, comparisonSources: comparison.sources.length, malayalam: true, hostMetrics: insights.metrics, offlineMode: offline.mode, databaseCountsUnchanged: true, artifact: 'test-results/ai-studio-live.json' }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Live AI demo check failed.');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
