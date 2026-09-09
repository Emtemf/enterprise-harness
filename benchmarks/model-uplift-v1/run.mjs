#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

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
  console.log('Usage: node benchmarks/model-uplift-v1/run.mjs [--arm <id>] [--case <id>] [--reps <n>] [--budget-usd <n>] [--results-dir <path>] [--keep-fixtures]');
  process.exit(0);
}
const selectedArms = option('--arm')
  ? matrix.arms.filter(({ id }) => id === option('--arm'))
  : matrix.arms;
const selectedCase = cases.cases.find(({ id }) => id === option('--case', cases.cases[0].id));
const reps = Number(option('--reps', '1'));
const budgetUsd = Number(option('--budget-usd', '3'));
const resultsDir = path.resolve(option('--results-dir', path.join(here, 'results', new Date().toISOString().replaceAll(/[:.]/gu, '-'))));
const keepFixtures = args.includes('--keep-fixtures');
if (selectedArms.length === 0) throw new Error('unknown --arm');
if (!selectedCase) throw new Error('unknown --case');
if (!Number.isSafeInteger(reps) || reps < 1) throw new Error('--reps must be an integer >= 1');
if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new Error('--budget-usd must be > 0');

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
  return { events, result, text: result?.result || texts.join('\n') };
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
  write(path.join(root, 'BENCHMARK_SPEC.md'), `# Order cancellation benchmark\n\n${selected.spec}\n`);
  write(path.join(root, 'package.json'), '{"name":"model-uplift-fixture","private":true,"type":"module","scripts":{"test":"node --test"}}\n');
  write(path.join(root, 'src/order-service.mjs'), [
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
  write(path.join(root, 'test/order-service.test.mjs'), [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { InMemoryOrderRepository, OrderService } from '../src/order-service.mjs';",
    "test('status preserves existing behavior', () => {",
    "  const service = new OrderService({ repository: new InMemoryOrderRepository([{ id: 'o-1', status: 'PENDING' }]), refundGateway: {}, auditSink: {} });",
    "  assert.equal(service.status('o-1'), 'PENDING');",
    '});',
    '',
  ].join('\n'));
  mustExec('git', ['add', '.'], { cwd: root });
  mustExec('git', ['commit', '-qm', 'benchmark baseline'], { cwd: root });
  return root;
}
function archived(root, changeId) {
  return fs.existsSync(path.join(root, 'harness', 'archive', changeId));
}
async function invoke(root, arm, sessionId, invocation, remainingBudget, prompt, streamPath) {
  const claudeArgs = [
    '-p', ...(invocation === 1 ? ['--session-id', sessionId] : ['--resume', sessionId]),
    '--output-format', 'stream-json', '--verbose', '--max-turns', '20',
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
    }, 360_000);
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
        terminationReason: parsed.result?.subtype || null,
        text: parsed.text,
        streamPath,
        error: Buffer.concat(stderr).toString('utf-8').trim() || null,
      });
    });
  });
}
function grade(root) {
  const publicTest = exec(process.execPath, ['--test'], { cwd: root, timeout: 120_000 });
  const hidden = exec(process.execPath, [path.join(here, 'grade.mjs'), root], { cwd: repoRoot, timeout: 120_000 });
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
async function runOnce(arm, selected, repetition) {
  const root = fixture(selected);
  const sessionId = crypto.randomUUID();
  const invocations = [];
  try {
    const limit = arm.workflow === 'enterprise-harness' ? selected.maxHarnessInvocations : 4;
    for (let invocation = 1; invocation <= limit; invocation += 1) {
      const spent = invocations.reduce((sum, item) => sum + Number(item.usage.costUsd || 0), 0);
      const remaining = budgetUsd - spent;
      if (remaining <= 0.001 || archived(root, selected.changeId)) break;
      const prompt = invocation === 1
        ? (arm.workflow === 'enterprise-harness'
          ? `/enterprise-harness:harness Start change ${selected.changeId}. Read BENCHMARK_SPEC.md and complete the governed change through verified archive. Every business choice and acceptance criterion is already explicitly approved in BENCHMARK_SPEC.md. Use the runtime-recommended route and perform only the current authorized action.`
          : 'Read BENCHMARK_SPEC.md, implement it completely, add tests, run all tests, inspect the final diff, and fix every failure. Do not modify BENCHMARK_SPEC.md.')
        : `/enterprise-harness:harness Continue change ${selected.changeId} from fresh runtime state and perform the next authorized action. BENCHMARK_SPEC.md contains the approved business decisions and acceptance criteria. Approve the runtime-recommended route when route confirmation is pending. If a pending question repeats a choice already fixed in BENCHMARK_SPEC.md, record that exact choice. Continue until this invocation's required stop point.`;
      const streamPath = path.join(resultsDir, 'streams', `${arm.id}-${selected.id}-rep-${repetition}-invocation-${invocation}.jsonl`);
      const record = await invoke(root, arm, sessionId, invocation, remaining, prompt, streamPath);
      invocations.push(record);
      if (arm.workflow === 'bare' && record.exitCode === 0) break;
      if (record.timedOut || record.usage.completeness !== 'complete') break;
      if (record.exitCode !== 0 && record.terminationReason !== 'error_max_turns') break;
    }
    const graded = grade(root);
    const totals = invocations.reduce((sum, item) => ({
      inputTokens: sum.inputTokens + item.usage.inputTokens,
      outputTokens: sum.outputTokens + item.usage.outputTokens,
      cacheReadInputTokens: sum.cacheReadInputTokens + item.usage.cacheReadInputTokens,
      cacheCreationInputTokens: sum.cacheCreationInputTokens + item.usage.cacheCreationInputTokens,
      costUsd: sum.costUsd === null || item.usage.costUsd === null ? null : sum.costUsd + item.usage.costUsd,
      durationMs: sum.durationMs + item.durationMs,
    }), { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUsd: 0, durationMs: 0 });
    const diff = mustExec('git', ['status', '--short'], { cwd: root }).stdout.trim().split(/\r?\n/u).filter(Boolean);
    return {
      armId: arm.id,
      workflow: arm.workflow,
      requestedModel: arm.model,
      resolvedModels: [...new Set(invocations.flatMap(({ resolvedModels }) => resolvedModels))],
      caseId: selected.id,
      repetition,
      completedArchive: archived(root, selected.changeId),
      invocations,
      totals,
      grade: graded,
      changedPaths: diff,
      finalDiff: mustExec('git', ['diff', '--', 'src', 'test'], { cwd: root }).stdout,
      measurementValid: invocations.length > 0 && invocations.every(({ timedOut, usage }) => !timedOut && usage.completeness === 'complete'),
      fixturePath: keepFixtures ? root : null,
    };
  } finally {
    if (!keepFixtures) fs.rmSync(root, { recursive: true, force: true });
  }
}

fs.mkdirSync(resultsDir, { recursive: true });
const records = [];
for (let repetition = 1; repetition <= reps; repetition += 1) {
  const offset = (repetition - 1) % selectedArms.length;
  const ordered = selectedArms.slice(offset).concat(selectedArms.slice(0, offset));
  for (const arm of ordered) {
    const record = await runOnce(arm, selectedCase, repetition);
    records.push(record);
    const cost = record.totals.costUsd === null ? 'unavailable' : `$${record.totals.costUsd.toFixed(4)}`;
    console.log(`${arm.id} rep=${repetition} effect=${record.grade.effectScore.toFixed(1)} accepted=${record.grade.accepted} cost=${cost} measurement=${record.measurementValid} archive=${record.completedArchive}`);
  }
}
const output = {
  schemaVersion: 1,
  status: 'raw-observations',
  generatedAt: new Date().toISOString(),
  runnerCommit: mustExec('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }).stdout.trim(),
  claudeCodeVersion: mustExec('claude', ['--version'], { cwd: repoRoot }).stdout.trim(),
  caseId: selectedCase.id,
  repetitions: reps,
  budgetUsdPerArm: budgetUsd,
  arms: selectedArms,
  records,
};
write(path.join(resultsDir, 'raw-results.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(`results=${path.join(resultsDir, 'raw-results.json')}`);
