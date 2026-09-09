#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const [fixtureRoot] = process.argv.slice(2);
if (!fixtureRoot) {
  console.error('Usage: node grade.mjs <fixture-root>');
  process.exit(2);
}

const moduleUrl = `${pathToFileURL(path.join(path.resolve(fixtureRoot), 'src/order-service.mjs')).href}?grade=${Date.now()}`;
const { InMemoryOrderRepository, OrderService } = await import(moduleUrl);

const results = [];
async function check(id, run) {
  try {
    await run();
    results.push({ id, pass: true });
  } catch (error) {
    results.push({ id, pass: false, message: error?.stack || String(error) });
  }
}
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected=${expected} actual=${actual}`);
}
async function rejectsCode(run, code) {
  try {
    await run();
  } catch (error) {
    equal(error?.code, code, 'error code');
    return;
  }
  throw new Error(`expected rejection ${code}`);
}
function setup(status = 'PENDING', refund = async () => ({ refundId: 're-1' })) {
  const repository = new InMemoryOrderRepository([{ id: 'order-1', status }]);
  const refunds = [];
  const audits = [];
  const service = new OrderService({
    repository,
    refundGateway: { refund: async (input) => { refunds.push(input); return refund(input); } },
    auditSink: { append: async (event) => { audits.push(event); } },
  });
  return { repository, refunds, audits, service };
}

await check('unknown-order', async () => {
  const { service, refunds, audits } = setup();
  await rejectsCode(() => service.cancel({ orderId: 'missing', requestId: 'req-1' }), 'ORDER_NOT_FOUND');
  equal(refunds.length, 0, 'unknown order refunds');
  equal(audits.length, 0, 'unknown order audits');
});

await check('non-pending', async () => {
  const { service, refunds, audits } = setup('PAID');
  await rejectsCode(() => service.cancel({ orderId: 'order-1', requestId: 'req-1' }), 'ORDER_NOT_PENDING');
  equal(refunds.length, 0, 'non-pending refunds');
  equal(audits.length, 0, 'non-pending audits');
});

await check('refund-success', async () => {
  const { service, repository, refunds, audits } = setup();
  const result = await service.cancel({ orderId: 'order-1', requestId: 'req-1' });
  equal(result.status, 'CANCELLED', 'result status');
  equal(result.orderId, 'order-1', 'result order');
  equal(result.requestId, 'req-1', 'result request');
  equal(result.refundId, 're-1', 'result refund');
  equal(service.status('order-1'), 'CANCELLED', 'service status');
  equal(repository.get('order-1').status, 'CANCELLED', 'repository status');
  equal(refunds.length, 1, 'refund count');
  equal(refunds[0].orderId, 'order-1', 'refund order');
  equal(refunds[0].requestId, 'req-1', 'refund request');
  equal(audits.length, 1, 'audit count');
  equal(audits[0].type, 'ORDER_CANCELLED', 'audit type');
  equal(audits[0].orderId, 'order-1', 'audit order');
  equal(audits[0].requestId, 'req-1', 'audit request');
});

await check('refund-failure-atomicity', async () => {
  const { service, repository, audits } = setup('PENDING', async () => { throw new Error('gateway down'); });
  await rejectsCode(() => service.cancel({ orderId: 'order-1', requestId: 'req-fail' }), 'REFUND_FAILED');
  equal(repository.get('order-1').status, 'PENDING', 'status after refund failure');
  equal(audits.length, 0, 'audit after refund failure');
});

await check('sequential-idempotency', async () => {
  const { service, refunds, audits } = setup();
  const first = await service.cancel({ orderId: 'order-1', requestId: 'req-same' });
  const second = await service.cancel({ orderId: 'order-1', requestId: 'req-same' });
  equal(JSON.stringify(second), JSON.stringify(first), 'idempotent result');
  equal(refunds.length, 1, 'sequential refund count');
  equal(audits.length, 1, 'sequential audit count');
});

await check('concurrent-idempotency', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const { service, refunds, audits } = setup('PENDING', async () => { await pending; return { refundId: 're-concurrent' }; });
  setImmediate(() => release?.());
  const [left, right] = await Promise.all([
    service.cancel({ orderId: 'order-1', requestId: 'req-concurrent' }),
    service.cancel({ orderId: 'order-1', requestId: 'req-concurrent' }),
  ]);
  equal(JSON.stringify(right), JSON.stringify(left), 'concurrent result');
  equal(refunds.length, 1, 'concurrent refund count');
  equal(audits.length, 1, 'concurrent audit count');
});

await check('different-request-after-cancel', async () => {
  const { service, refunds, audits } = setup();
  await service.cancel({ orderId: 'order-1', requestId: 'req-first' });
  await rejectsCode(() => service.cancel({ orderId: 'order-1', requestId: 'req-second' }), 'ORDER_NOT_PENDING');
  equal(refunds.length, 1, 'different request refund count');
  equal(audits.length, 1, 'different request audit count');
});

const passed = results.filter(({ pass }) => pass).length;
console.log(JSON.stringify({ passed, total: results.length, scorePercent: passed / results.length * 100, results }));
process.exit(passed === results.length ? 0 : 1);
