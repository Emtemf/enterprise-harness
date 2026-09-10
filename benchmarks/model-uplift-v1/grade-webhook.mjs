#!/usr/bin/env node
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const [fixtureRoot] = process.argv.slice(2);
if (!fixtureRoot) {
  console.error('Usage: node grade-webhook.mjs <fixture-root>');
  process.exit(2);
}
const moduleUrl = `${pathToFileURL(path.join(path.resolve(fixtureRoot), 'src/webhook-verifier.mjs')).href}?grade=${Date.now()}`;
const { WebhookVerifier } = await import(moduleUrl);
const results = [];
async function check(id, run) {
  try { await run(); results.push({ id, pass: true }); }
  catch (error) { results.push({ id, pass: false, message: error?.stack || String(error) }); }
}
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected=${expected} actual=${actual}`);
}
async function rejectsCode(run, code) {
  try { await run(); } catch (error) { equal(error?.code, code, 'error code'); return; }
  throw new Error(`expected rejection ${code}`);
}
const secret = 'benchmark-secret';
const body = JSON.stringify({ id: 'evt-1', type: 'order.paid', data: { orderId: 'o-1' } });
const sign = (rawBody, timestamp, key = secret) => crypto.createHmac('sha256', key).update(`${timestamp}.${rawBody}`).digest('hex');
function setup(claim = async () => true) {
  const claims = [];
  const verifier = new WebhookVerifier({ secret, replayStore: { claim: async (input) => { claims.push(input); return claim(input); } } });
  return { verifier, claims };
}

await check('valid-signature', async () => {
  const { verifier, claims } = setup();
  const result = await verifier.verify({ rawBody: body, signatureHeader: `t=1000,v1=${sign(body, 1000)}`, nowSeconds: 1000 });
  equal(result.eventId, 'evt-1', 'event id'); equal(result.type, 'order.paid', 'event type');
  equal(result.timestamp, 1000, 'timestamp'); equal(JSON.stringify(result.payload), body, 'payload');
  equal(JSON.stringify(claims), JSON.stringify([{ eventId: 'evt-1', timestamp: 1000 }]), 'claim input');
});
await check('header-order-and-rotated-signature', async () => {
  const { verifier } = setup();
  const valid = sign(body, 1000).toUpperCase();
  const result = await verifier.verify({ rawBody: body, signatureHeader: `x=ignored,v1=${'0'.repeat(64)},v1=${valid},t=1000`, nowSeconds: 1001 });
  equal(result.eventId, 'evt-1', 'rotated signature result');
});
await check('malformed-header', async () => {
  for (const header of ['', 't=1000', `t=1000,t=1001,v1=${sign(body, 1000)}`, 't=abc,v1=bad']) {
    const { verifier, claims } = setup();
    await rejectsCode(() => verifier.verify({ rawBody: body, signatureHeader: header, nowSeconds: 1000 }), 'SIGNATURE_MALFORMED');
    equal(claims.length, 0, 'malformed claim count');
  }
});
await check('timestamp-boundary', async () => {
  const atBoundary = setup();
  await atBoundary.verifier.verify({ rawBody: body, signatureHeader: `t=1000,v1=${sign(body, 1000)}`, nowSeconds: 1300 });
  const outside = setup();
  await rejectsCode(() => outside.verifier.verify({ rawBody: body, signatureHeader: `t=1000,v1=${sign(body, 1000)}`, nowSeconds: 1301 }), 'WEBHOOK_TIMESTAMP_OUT_OF_RANGE');
  equal(outside.claims.length, 0, 'outside timestamp claim count');
});
await check('invalid-signature-no-side-effect', async () => {
  const { verifier, claims } = setup();
  await rejectsCode(() => verifier.verify({ rawBody: body, signatureHeader: `t=1000,v1=${sign(body, 1000, 'wrong')}`, nowSeconds: 1000 }), 'WEBHOOK_SIGNATURE_INVALID');
  equal(claims.length, 0, 'invalid signature claim count');
});
await check('invalid-payload-no-replay-claim', async () => {
  for (const invalidBody of ['{', JSON.stringify({ id: '', type: 'event' }), JSON.stringify({ id: 'evt' })]) {
    const { verifier, claims } = setup();
    await rejectsCode(() => verifier.verify({ rawBody: invalidBody, signatureHeader: `t=1000,v1=${sign(invalidBody, 1000)}`, nowSeconds: 1000 }), 'WEBHOOK_PAYLOAD_INVALID');
    equal(claims.length, 0, 'invalid payload claim count');
  }
});
await check('replay-rejected', async () => {
  const { verifier, claims } = setup(async () => false);
  await rejectsCode(() => verifier.verify({ rawBody: body, signatureHeader: `t=1000,v1=${sign(body, 1000)}`, nowSeconds: 1000 }), 'WEBHOOK_REPLAY');
  equal(claims.length, 1, 'replay claim count');
});

const passed = results.filter(({ pass }) => pass).length;
console.log(JSON.stringify({ passed, total: results.length, scorePercent: passed / results.length * 100, results }));
process.exit(passed === results.length ? 0 : 1);
