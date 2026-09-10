#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { modelIdentityValid } from './lib/model-identity.mjs';
import { environmentFingerprint } from './lib/environment-fingerprint.mjs';
import { validatePreflightReceipt } from './lib/preflight-receipt.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const matrix = JSON.parse(fs.readFileSync(path.join(here, 'matrix.json'), 'utf-8'));
const cases = JSON.parse(fs.readFileSync(path.join(here, 'cases.json'), 'utf-8'));
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
if (args.includes('--help')) {
  console.log('Usage: node benchmarks/model-uplift-v1/run.mjs [--arm <id>] [--case <id|all>] [--reps <n>] [--budget-usd <n>] [--max-agent-turns <n>] [--invocation-timeout-ms <n>] [--preflight-receipt <path>] [--results-dir <path>] [--keep-fixtures]');
  process.exit(0);
}
const selectedArms = option('--arm')
  ? matrix.arms.filter(({ id }) => id === option('--arm'))
  : matrix.arms;
const caseOption = option('--case', cases.cases[0].id);
const selectedCases = caseOption === 'all' ? cases.cases : cases.cases.filter(({ id }) => id === caseOption);
const reps = Number(option('--reps', '1'));
const budgetUsd = Number(option('--budget-usd', '3'));
const maxAgentTurns = Number(option('--max-agent-turns', '60'));
const invocationTimeoutMs = Number(option('--invocation-timeout-ms', '900000'));
const preflightReceiptPath = option('--preflight-receipt');
const resultsDir = path.resolve(option('--results-dir', path.join(here, 'results', new Date().toISOString().replaceAll(/[:.]/gu, '-'))));
const keepFixtures = args.includes('--keep-fixtures');
let interrupted = false;
process.on('SIGINT', () => { interrupted = true; });
if (selectedArms.length === 0) throw new Error('unknown --arm');
if (selectedCases.length === 0) throw new Error('unknown --case');
if (!Number.isSafeInteger(reps) || reps < 1) throw new Error('--reps must be an integer >= 1');
if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new Error('--budget-usd must be > 0');
if (!Number.isSafeInteger(maxAgentTurns) || maxAgentTurns < 1) throw new Error('--max-agent-turns must be an integer >= 1');
if (!Number.isSafeInteger(invocationTimeoutMs) || invocationTimeoutMs < 60_000) throw new Error('--invocation-timeout-ms must be an integer >= 60000');

function validatePreflight(receiptPath) {
  if (!receiptPath) throw new Error('--case all requires --preflight-receipt from preflight.mjs');
  const receipt = JSON.parse(fs.readFileSync(path.resolve(receiptPath), 'utf-8'));
  const version = mustExec('claude', ['--version'], { cwd: repoRoot }).stdout.trim();
  const expectedModels = new Set(selectedArms.flatMap((arm) => [arm.controllerRoute, ...(arm.workerRoutes || [])]));
  validatePreflightReceipt(receipt, {
    expectedModels,
    environmentFingerprint: environmentFingerprint(process.env, version),
    claudeCodeVersion: version,
  });
  if (receipt.routingProfile !== matrix.routingProfile) throw new Error('preflight receipt routing profile does not match the benchmark matrix');
  return receipt;
}
const preflightReceipt = caseOption === 'all' ? validatePreflight(preflightReceiptPath) : null;

function write(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf-8');
}
function exec(command, argv, options = {}) {
  return spawnSync(command, argv, { encoding: 'utf-8', shell: false, ...options });
}
function mustExec(command, argv, options = {}) {
  const result = exec(command, argv, options);
  if (result.status !== 0 || result.error) throw new Error(`${command} ${argv.join(' ')} failed: ${result.error?.message || result.stderr || result.stdout}`);
  return result;
}
function parseStream(raw) {
  const events = String(raw).split(/\r?\n/u).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  const result = [...events].reverse().find((event) => event.type === 'result');
  const texts = events.flatMap((event) => event.type === 'assistant'
    ? (event.message?.content || []).filter((block) => block.type === 'text').map((block) => block.text || '')
    : []);
  const assistantEvents = events.filter((event) => event.type === 'assistant' && event.message?.model);
  const controllerMessageModels = [...new Set(assistantEvents.filter((event) => !event.subagent_type).map((event) => event.message.model))];
  const workerMessageModels = [...new Set(assistantEvents.filter((event) => event.subagent_type).map((event) => event.message.model))];
  return { events, result, controllerMessageModels, workerMessageModels, text: result?.result || texts.join('\n') };
}
function usageOf(parsed) {
  if (parsed.result?.modelUsage) return {
    ...Object.values(parsed.result.modelUsage).reduce((sum, item) => ({
    inputTokens: sum.inputTokens + Number(item.inputTokens || 0),
    outputTokens: sum.outputTokens + Number(item.outputTokens || 0),
    cacheReadInputTokens: sum.cacheReadInputTokens + Number(item.cacheReadInputTokens || 0),
    cacheCreationInputTokens: sum.cacheCreationInputTokens + Number(item.cacheCreationInputTokens || 0),
    costUsd: sum.costUsd + Number(item.costUSD || 0),
    }), { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUsd: 0 }),
    completeness: 'complete',
  };
  const messages = new Map();
  for (const event of parsed.events) {
    if (event.type !== 'assistant' || !event.message?.usage) continue;
    messages.set(event.message.id || crypto.randomUUID(), event.message.usage);
  }
  const partial = [...messages.values()].reduce((sum, item) => ({
    inputTokens: sum.inputTokens + Number(item.input_tokens || 0),
    outputTokens: sum.outputTokens + Number(item.output_tokens || 0),
    cacheReadInputTokens: sum.cacheReadInputTokens + Number(item.cache_read_input_tokens || 0),
    cacheCreationInputTokens: sum.cacheCreationInputTokens + Number(item.cache_creation_input_tokens || 0),
  }), { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 });
  return { ...partial, costUsd: null, completeness: 'partial-no-billing-result' };
}
function fixture(selected) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-model-uplift-'));
  mustExec('git', ['init', '-q'], { cwd: root });
  mustExec('git', ['config', 'user.email', 'model-uplift@example.test'], { cwd: root });
  mustExec('git', ['config', 'user.name', 'Model Uplift Benchmark'], { cwd: root });
  write(path.join(root, 'AGENTS.md'), '# Benchmark contract\n\n- `BENCHMARK_SPEC.md` is authoritative and immutable.\n- Implement and test the requested behavior; do not weaken existing tests.\n');
  write(path.join(root, 'BENCHMARK_SPEC.md'), `# Model uplift benchmark: ${selected.id}\n\n${selected.spec}\n`);
  write(path.join(root, 'package.json'), '{"name":"model-uplift-fixture","private":true,"type":"module","scripts":{"test":"node --test"}}\n');
  if (selected.fixture === 'order-service') write(path.join(root, 'src/order-service.mjs'), [
    'export class DomainError extends Error {',
    '  constructor(code, cause) { super(code, cause ? { cause } : undefined); this.code = code; }',
    '}',
    '',
    'export class InMemoryOrderRepository {',
    '  constructor(orders = []) { this.orders = new Map(orders.map((order) => [order.id, { ...order }])); }',
    '  get(id) { const order = this.orders.get(id); return order ? { ...order } : null; }',
    '  save(order) { this.orders.set(order.id, { ...order }); return { ...order }; }',
    '}',
    '',
    'export class OrderService {',
    '  constructor({ repository, refundGateway, auditSink }) {',
    '    this.repository = repository;',
    '    this.refundGateway = refundGateway;',
    '    this.auditSink = auditSink;',
    '  }',
    '  status(orderId) { return this.repository.get(orderId)?.status ?? null; }',
    '  async cancel({ orderId, requestId }) {',
    "    throw new DomainError('NOT_IMPLEMENTED');",
    '  }',
    '}',
    '',
  ].join('\n'));
  if (selected.fixture === 'order-service') write(path.join(root, 'test/order-service.test.mjs'), [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { InMemoryOrderRepository, OrderService } from '../src/order-service.mjs';",
    "test('status preserves existing behavior', () => {",
    "  const service = new OrderService({ repository: new InMemoryOrderRepository([{ id: 'o-1', status: 'PENDING' }]), refundGateway: {}, auditSink: {} });",
    "  assert.equal(service.status('o-1'), 'PENDING');",
    '});',
    '',
  ].join('\n'));
  if (selected.fixture === 'webhook-verifier') write(path.join(root, 'src/webhook-verifier.mjs'), [
    "export class WebhookError extends Error {",
    "  constructor(code, cause) { super(code, cause ? { cause } : undefined); this.code = code; }",
    "}",
    "",
    "export class WebhookVerifier {",
    "  constructor({ secret, replayStore }) { this.secret = secret; this.replayStore = replayStore; }",
    "  async verify({ rawBody, signatureHeader, nowSeconds }) {",
    "    throw new WebhookError('NOT_IMPLEMENTED');",
    "  }",
    "}",
    "",
  ].join('\n'));
  if (selected.fixture === 'webhook-verifier') write(path.join(root, 'test/webhook-verifier.test.mjs'), [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { WebhookVerifier } from '../src/webhook-verifier.mjs';",
    "test('constructor preserves injected contract', () => {",
    "  const replayStore = { claim: async () => true };",
    "  const verifier = new WebhookVerifier({ secret: 'secret', replayStore });",
    "  assert.equal(verifier.replayStore, replayStore);",
    "});",
    "",
  ].join('\n'));
  if (selected.fixture === 'subscription-service') write(path.join(root, 'migrations/001_subscriptions.sql'), [
    'CREATE TABLE subscriptions (',
    '  id TEXT PRIMARY KEY,',
    '  plan TEXT NOT NULL,',
    '  version INTEGER NOT NULL',
    ');',
    '',
  ].join('\n'));
  if (selected.fixture === 'subscription-service') write(path.join(root, 'src/subscription-service.mjs'), [
    "export class DomainError extends Error {",
    "  constructor(code, cause) { super(code, cause ? { cause } : undefined); this.code = code; }",
    "}",
    "",
    "export class InMemorySubscriptionRepository {",
    "  constructor(rows = []) { this.rows = new Map(rows.map((row) => [row.id, { ...row }])); this.saveCount = 0; }",
    "  get(id) { const row = this.rows.get(id); return row ? { ...row } : null; }",
    "  save(row) { this.saveCount += 1; this.rows.set(row.id, { ...row }); return { ...row }; }",
    "}",
    "",
    "export class SubscriptionService {",
    "  constructor({ repository, billingGateway, auditSink }) { this.repository = repository; this.billingGateway = billingGateway; this.auditSink = auditSink; }",
    "  getPlan(subscriptionId) { return this.repository.get(subscriptionId)?.plan ?? null; }",
    "  async changePlan(input) { throw new DomainError('NOT_IMPLEMENTED'); }",
    "}",
    "",
  ].join('\n'));
  if (selected.fixture === 'subscription-service') write(path.join(root, 'test/subscription-service.test.mjs'), [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { InMemorySubscriptionRepository, SubscriptionService } from '../src/subscription-service.mjs';",
    "test('getPlan preserves existing behavior', () => {",
    "  const repository = new InMemorySubscriptionRepository([{ id: 'sub-1', plan: 'BASIC', version: 1 }]);",
    "  const service = new SubscriptionService({ repository, billingGateway: {}, auditSink: {} });",
    "  assert.equal(service.getPlan('sub-1'), 'BASIC');",
    "});",
    "",
  ].join('\n'));
  if (!['order-service', 'webhook-verifier', 'subscription-service'].includes(selected.fixture)) throw new Error(`unsupported fixture: ${selected.fixture}`);
  mustExec('git', ['add', '.'], { cwd: root });
  mustExec('git', ['commit', '-qm', 'benchmark baseline'], { cwd: root });
  return root;
}
function archived(root, changeId) {
  return fs.existsSync(path.join(root, 'harness', 'archive', changeId));
}
function workflowStatus(root, changeId) {
  const result = exec(process.execPath, [path.join(repoRoot, 'runtime/cli.mjs'), 'workflow', 'status', changeId, '--json'], { cwd: root, timeout: 120_000 });
  if (result.status !== 0) return { unavailable: true, error: String(result.stderr || result.stdout || '').trim() };
  try { return JSON.parse(result.stdout); } catch { return { unavailable: true, error: 'workflow status returned invalid JSON' }; }
}
function workflowFingerprint(status) {
  if (!status || status.unavailable) return null;
  return JSON.stringify({
    revision: status.revision,
    stage: status.stage,
    status: status.status,
    nextAction: status.nextAction,
    pendingDecision: status.pendingDecision,
    currentGap: status.currentGap,
  });
}
function harnessPrompt(selected, invocation, status) {
  if (invocation === 1 || status?.unavailable) {
    return `/enterprise-harness:harness Start change ${selected.changeId}. The following text is the user's complete authoritative business request and must be persisted verbatim as the raw request; BENCHMARK_SPEC.md contains the same immutable text:\n\n${selected.spec}\n\nComplete this governed change through verified archive. Use the runtime-recommended route and perform only the current authorized action.`;
  }
  const pending = status.pendingDecision ? ` Runtime pendingDecision is ${JSON.stringify(status.pendingDecision)}; treat BENCHMARK_SPEC.md as the user's exact answer and record only the matching choice.` : '';
  return `/enterprise-harness:harness Resume change ${selected.changeId} from durable state. Fresh workflow status reports stage=${status.stage}, status=${status.status}, nextAction=${status.nextAction}.${pending} Perform only that exact authorized action and stop at the next required user or stage boundary.`;
}
async function invoke(root, arm, sessionId, resume, invocation, remainingBudget, prompt, streamPath) {
  const claudeArgs = [
    '-p', ...(resume ? ['--resume', sessionId] : ['--session-id', sessionId]),
    '--output-format', 'stream-json', '--verbose', '--max-turns', String(maxAgentTurns),
    '--max-budget-usd', remainingBudget.toFixed(6), '--model', arm.model,
    '--permission-mode', 'bypassPermissions', '--setting-sources', '',
  ];
  if (arm.workflow === 'enterprise-harness') claudeArgs.push('--plugin-dir', repoRoot);
  claudeArgs.push(prompt);
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    fs.mkdirSync(path.dirname(streamPath), { recursive: true });
    const stream = fs.createWriteStream(streamPath, { flags: 'a' });
    const child = spawn('claude', claudeArgs, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      env: { ...process.env, CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: '3' },
    });
    child.stdout.on('data', (chunk) => { stdout.push(chunk); stream.write(chunk); });
    child.stderr.on('data', (chunk) => { stderr.push(chunk); });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5_000).unref();
    }, invocationTimeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      stream.end();
      const parsed = parseStream(Buffer.concat(stdout).toString('utf-8'));
      const usage = usageOf(parsed);
      resolve({
        invocation,
        exitCode: code,
        signal,
        timedOut,
        durationMs: Date.now() - startedAt,
        usage,
        resolvedModels: Object.keys(parsed.result?.modelUsage || {}),
        controllerMessageModels: parsed.controllerMessageModels,
        workerMessageModels: parsed.workerMessageModels,
        terminationReason: parsed.result?.subtype || null,
        text: parsed.text,
        streamPath,
        error: Buffer.concat(stderr).toString('utf-8').trim() || null,
      });
    });
  });
}
function grade(root, selected) {
  const publicTest = exec(process.execPath, ['--test'], { cwd: root, timeout: 120_000 });
  const hidden = exec(process.execPath, [path.join(here, selected.grader), root], { cwd: repoRoot, timeout: 120_000 });
  let hiddenResult = null;
  try { hiddenResult = JSON.parse(String(hidden.stdout || '').trim().split(/\r?\n/u).at(-1)); } catch { /* retained below */ }
  const specChanged = mustExec('git', ['diff', '--name-only', 'HEAD'], { cwd: root }).stdout.split(/\r?\n/u).includes('BENCHMARK_SPEC.md');
  const effectScore = hiddenResult ? hiddenResult.scorePercent : 0;
  return {
    effectScore,
    accepted: hidden.status === 0 && publicTest.status === 0 && !specChanged,
    hidden: hiddenResult,
    hiddenExitCode: hidden.status,
    hiddenError: hiddenResult ? null : `${hidden.stdout || ''}\n${hidden.stderr || ''}`.trim(),
    publicTestsPassed: publicTest.status === 0,
    publicTestOutput: `${publicTest.stdout || ''}\n${publicTest.stderr || ''}`.trim(),
    specChanged,
  };
}
function rawRequestBound(root, selected, arm) {
  if (arm.workflow !== 'enterprise-harness') return true;
  const requirementsPath = path.join(root, 'harness', 'changes', selected.changeId, 'requirements.md');
  return fs.existsSync(requirementsPath) && fs.readFileSync(requirementsPath, 'utf-8').includes(selected.spec);
}
async function runOnce(arm, selected, repetition) {
  const root = fixture(selected);
  let sessionId = crypto.randomUUID();
  let resume = false;
  const invocations = [];
  let unchangedInvocations = 0;
  try {
    const limit = arm.workflow === 'enterprise-harness' ? selected.maxHarnessInvocations : 4;
    for (let invocation = 1; invocation <= limit; invocation += 1) {
      if (interrupted) break;
      const spent = invocations.reduce((sum, item) => sum + Number(item.usage.costUsd || 0), 0);
      const remaining = budgetUsd - spent;
      if (remaining <= 0.001 || archived(root, selected.changeId)) break;
      const beforeStatus = arm.workflow === 'enterprise-harness' && invocation > 1
        ? workflowStatus(root, selected.changeId)
        : null;
      const prompt = arm.workflow === 'enterprise-harness'
        ? harnessPrompt(selected, invocation, beforeStatus)
        : 'Read BENCHMARK_SPEC.md, implement it completely, add tests, run all tests, inspect the final diff, and fix every failure. Do not modify BENCHMARK_SPEC.md.';
      const streamPath = path.join(resultsDir, 'streams', `${arm.id}-${selected.id}-rep-${repetition}-invocation-${invocation}.jsonl`);
      const record = await invoke(root, arm, sessionId, resume, invocation, remaining, prompt, streamPath);
      const afterStatus = arm.workflow === 'enterprise-harness' ? workflowStatus(root, selected.changeId) : null;
      record.beforeStatus = beforeStatus;
      record.afterStatus = afterStatus;
      invocations.push(record);
      if (arm.workflow === 'bare' && record.exitCode === 0) break;
      if (record.timedOut || record.usage.completeness !== 'complete') break;
      if (record.exitCode !== 0 && record.terminationReason !== 'error_max_turns') break;
      if (workflowFingerprint(beforeStatus) === workflowFingerprint(afterStatus)) unchangedInvocations += 1;
      else unchangedInvocations = 0;
      if (unchangedInvocations >= 2) break;
      const stageBefore = beforeStatus?.stage || (invocation === 1 ? 'clarify' : null);
      if (stageBefore && afterStatus?.stage && stageBefore !== afterStatus.stage) {
        sessionId = crypto.randomUUID();
        resume = false;
      } else {
        resume = true;
      }
    }
    const graded = grade(root, selected);
    const totals = invocations.reduce((sum, item) => ({
      inputTokens: sum.inputTokens + item.usage.inputTokens,
      outputTokens: sum.outputTokens + item.usage.outputTokens,
      cacheReadInputTokens: sum.cacheReadInputTokens + item.usage.cacheReadInputTokens,
      cacheCreationInputTokens: sum.cacheCreationInputTokens + item.usage.cacheCreationInputTokens,
      costUsd: sum.costUsd === null || item.usage.costUsd === null ? null : sum.costUsd + item.usage.costUsd,
      durationMs: sum.durationMs + item.durationMs,
    }), { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUsd: 0, durationMs: 0 });
    const diff = mustExec('git', ['status', '--short'], { cwd: root }).stdout.trim().split(/\r?\n/u).filter(Boolean);
    const billingModels = [...new Set(invocations.flatMap(({ resolvedModels }) => resolvedModels))];
    const controllerMessageModels = [...new Set(invocations.flatMap((item) => item.controllerMessageModels || []))];
    const workerMessageModels = [...new Set(invocations.flatMap((item) => item.workerMessageModels || []))];
    const billingMeasurementValid = invocations.length > 0 && invocations.every(({ timedOut, usage }) => !timedOut && usage.completeness === 'complete');
    const identityValid = modelIdentityValid(arm, matrix.modelRoutes, billingModels, controllerMessageModels, workerMessageModels);
    const requestBound = rawRequestBound(root, selected, arm);
    return {
      armId: arm.id,
      workflow: arm.workflow,
      requestedModel: arm.model,
      actualControllerModel: matrix.modelRoutes[arm.controllerRoute]?.actualModel || null,
      actualWorkerModels: (arm.workerRoutes || []).map((route) => matrix.modelRoutes[route]?.actualModel).filter(Boolean),
      resolvedModels: billingModels,
      controllerMessageModels,
      workerMessageModels,
      caseId: selected.id,
      repetition,
      completedArchive: archived(root, selected.changeId),
      invocations,
      totals,
      costAuthority: 'claude-code-alias-estimate',
      providerCostUsd: null,
      grade: graded,
      changedPaths: diff,
      finalDiff: mustExec('git', ['diff', '--', 'src', 'test', 'migrations'], { cwd: root }).stdout,
      billingMeasurementValid,
      modelIdentityValid: identityValid,
      rawRequestBound: requestBound,
      measurementValid: billingMeasurementValid && identityValid && requestBound,
      fixturePath: keepFixtures ? root : null,
    };
  } finally {
    if (!keepFixtures) fs.rmSync(root, { recursive: true, force: true });
  }
}

fs.mkdirSync(resultsDir, { recursive: true });
const records = [];
for (const [caseIndex, selectedCase] of selectedCases.entries()) {
  for (let repetition = 1; repetition <= reps; repetition += 1) {
    const offset = (caseIndex + repetition - 1) % selectedArms.length;
    const ordered = selectedArms.slice(offset).concat(selectedArms.slice(0, offset));
    for (const arm of ordered) {
      if (interrupted) break;
      const record = await runOnce(arm, selectedCase, repetition);
      records.push(record);
      const cost = record.totals.costUsd === null ? 'unavailable' : `$${record.totals.costUsd.toFixed(4)}`;
      console.log(`${arm.id} case=${selectedCase.id} rep=${repetition} effect=${record.grade.effectScore.toFixed(1)} accepted=${record.grade.accepted} cost=${cost} measurement=${record.measurementValid} archive=${record.completedArchive}`);
    }
    if (interrupted) break;
  }
  if (interrupted) break;
}
const output = {
  schemaVersion: 1,
  status: interrupted ? 'interrupted-partial-observations' : 'raw-observations',
  generatedAt: new Date().toISOString(),
  runnerCommit: mustExec('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }).stdout.trim(),
  claudeCodeVersion: mustExec('claude', ['--version'], { cwd: repoRoot }).stdout.trim(),
  caseIds: selectedCases.map(({ id }) => id),
  repetitionsPerCase: reps,
  budgetUsdPerArm: budgetUsd,
  maxAgentTurns,
  invocationTimeoutMs,
  preflight: preflightReceipt ? {
    path: path.resolve(preflightReceiptPath),
    generatedAt: preflightReceipt.generatedAt,
    environmentFingerprint: preflightReceipt.environmentFingerprint,
  } : null,
  arms: selectedArms,
  routingProfile: matrix.routingProfile,
  comparison: matrix.comparison,
  records,
};
write(path.join(resultsDir, 'raw-results.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(`results=${path.join(resultsDir, 'raw-results.json')}`);
if (interrupted) process.exitCode = 130;
