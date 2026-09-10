#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const [fixtureRoot] = process.argv.slice(2);
if (!fixtureRoot) {
  console.error('Usage: node grade-subscription.mjs <fixture-root>');
  process.exit(2);
}
const root = path.resolve(fixtureRoot);
const moduleUrl = `${pathToFileURL(path.join(root, 'src/subscription-service.mjs')).href}?grade=${Date.now()}`;
const { InMemorySubscriptionRepository, SubscriptionService } = await import(moduleUrl);
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
function setup({ billing = async () => undefined } = {}) {
  const repository = new InMemorySubscriptionRepository([{ id: 'sub-1', plan: 'BASIC', version: 4 }]);
  const billings = [];
  const audits = [];
  const service = new SubscriptionService({
    repository,
    billingGateway: { changePlan: async (input) => { billings.push(input); return billing(input); } },
    auditSink: { append: async (input) => { audits.push(input); } },
  });
  return { repository, billings, audits, service };
}
const input = { subscriptionId: 'sub-1', requestId: 'req-1', targetPlan: 'PRO', expectedVersion: 4 };

await check('migration-forward-safe', async () => {
  const sql = fs.readFileSync(path.join(root, 'migrations/002_plan_change_requests.sql'), 'utf-8');
  if (!/CREATE\s+TABLE\s+plan_change_requests/iu.test(sql)) throw new Error('missing plan_change_requests table');
  for (const column of [
    /request_id\s+TEXT\s+PRIMARY\s+KEY/iu,
    /subscription_id\s+TEXT\s+NOT\s+NULL/iu,
    /target_plan\s+TEXT\s+NOT\s+NULL/iu,
    /result_json\s+TEXT\s+NOT\s+NULL/iu,
    /created_at\s+TEXT\s+NOT\s+NULL/iu,
  ]) if (!column.test(sql)) throw new Error(`missing migration contract: ${column}`);
  if (!/CREATE\s+INDEX[\s\S]*subscription_id/iu.test(sql)) throw new Error('missing subscription_id index');
  if (/\b(?:DROP|DELETE|TRUNCATE)\b/iu.test(sql)) throw new Error('forward migration is destructive');
});
await check('migration-rollback-scoped', async () => {
  const sql = fs.readFileSync(path.join(root, 'migrations/002_plan_change_requests.down.sql'), 'utf-8').trim();
  if (!/^DROP\s+TABLE\s+IF\s+EXISTS\s+plan_change_requests\s*;?$/iu.test(sql)) throw new Error('rollback must only drop the new table');
});
await check('validation-and-version', async () => {
  for (const [candidate, code] of [
    [{ ...input, targetPlan: 'ULTIMATE' }, 'PLAN_INVALID'],
    [{ ...input, subscriptionId: 'missing' }, 'SUBSCRIPTION_NOT_FOUND'],
    [{ ...input, expectedVersion: 3 }, 'VERSION_CONFLICT'],
  ]) {
    const { service, billings, audits } = setup();
    await rejectsCode(() => service.changePlan(candidate), code);
    equal(billings.length, 0, `${code} billing count`); equal(audits.length, 0, `${code} audit count`);
  }
});
await check('successful-change', async () => {
  const { service, repository, billings, audits } = setup();
  const result = await service.changePlan(input);
  equal(JSON.stringify(result), JSON.stringify({ subscriptionId: 'sub-1', requestId: 'req-1', plan: 'PRO', version: 5 }), 'result');
  equal(JSON.stringify(billings), JSON.stringify([{ subscriptionId: 'sub-1', targetPlan: 'PRO', requestId: 'req-1' }]), 'billing');
  equal(JSON.stringify(audits), JSON.stringify([{ subscriptionId: 'sub-1', requestId: 'req-1', type: 'SUBSCRIPTION_PLAN_CHANGED', fromPlan: 'BASIC', toPlan: 'PRO', version: 5 }]), 'audit');
  equal(JSON.stringify(repository.get('sub-1')), JSON.stringify({ id: 'sub-1', plan: 'PRO', version: 5 }), 'saved row');
});
await check('billing-failure-atomicity', async () => {
  const { service, repository, audits } = setup({ billing: async () => { throw new Error('down'); } });
  await rejectsCode(() => service.changePlan(input), 'BILLING_UPDATE_FAILED');
  equal(JSON.stringify(repository.get('sub-1')), JSON.stringify({ id: 'sub-1', plan: 'BASIC', version: 4 }), 'row after failure');
  equal(repository.saveCount, 0, 'save count after failure'); equal(audits.length, 0, 'audit after failure');
});
await check('sequential-idempotency-and-conflict', async () => {
  const { service, repository, billings, audits } = setup();
  const first = await service.changePlan(input);
  const second = await service.changePlan(input);
  equal(JSON.stringify(second), JSON.stringify(first), 'sequential result');
  await rejectsCode(() => service.changePlan({ ...input, targetPlan: 'ENTERPRISE' }), 'IDEMPOTENCY_CONFLICT');
  equal(billings.length, 1, 'billing count'); equal(repository.saveCount, 1, 'save count'); equal(audits.length, 1, 'audit count');
});
await check('concurrent-idempotency', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { service, repository, billings, audits } = setup({ billing: async () => { await gate; } });
  const left = service.changePlan(input);
  const right = service.changePlan(input);
  setImmediate(() => release());
  const resultsPair = await Promise.all([left, right]);
  equal(JSON.stringify(resultsPair[0]), JSON.stringify(resultsPair[1]), 'concurrent result');
  equal(billings.length, 1, 'concurrent billing count'); equal(repository.saveCount, 1, 'concurrent save count'); equal(audits.length, 1, 'concurrent audit count');
});

const passed = results.filter(({ pass }) => pass).length;
console.log(JSON.stringify({ passed, total: results.length, scorePercent: passed / results.length * 100, results }));
process.exit(passed === results.length ? 0 : 1);
