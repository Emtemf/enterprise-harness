#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const pins = {
  'enterprise-harness': { version: '0.5.30' },
  superpowers: { version: '6.3.0', commit: 'b36e0829c6d0140e93cfef2ca599b1b07d4a7797' },
  openspec: { version: '1.12.0', commit: 'e062b9572be933564ba3899d059377dfa1393e32' },
};
const definition = JSON.parse(fs.readFileSync(path.join(here, 'cases.json'), 'utf-8'));
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const superpowersRoot = path.resolve(option('--superpowers-root') || '');
const resultsDir = path.resolve(option('--results-dir', path.join(here, 'results', new Date().toISOString().replaceAll(/[:.]/gu, '-'))));
const model = option('--model', 'sonnet');
const reps = Number(option('--reps', '1'));
const turnBudgetUsd = Number(option('--turn-budget-usd', '1'));
const onlySystem = option('--system');
const systems = onlySystem ? [onlySystem] : ['enterprise-harness', 'superpowers', 'openspec'];
if (!Number.isSafeInteger(reps) || reps < 1) throw new Error('--reps must be an integer >= 1');
if (!Number.isFinite(turnBudgetUsd) || turnBudgetUsd <= 0) throw new Error('--turn-budget-usd must be > 0');
if (systems.some((value) => !['enterprise-harness', 'superpowers', 'openspec'].includes(value))) throw new Error('--system is invalid');
if (systems.includes('superpowers') && !fs.existsSync(path.join(superpowersRoot, '.claude-plugin', 'plugin.json'))) {
  throw new Error('--superpowers-root must point to the pinned Superpowers checkout');
}

function exec(command, argv, options = {}) {
  const result = spawnSync(command, argv, { encoding: 'utf-8', shell: false, ...options });
  if (result.status !== 0 || result.error) {
    throw new Error(`${command} ${argv.join(' ')} failed: ${result.error?.message || result.stderr || result.stdout}`);
  }
  return result;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function write(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf-8');
}

function packageVersion(root, relative = 'package.json') {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf-8')).version;
}

function verifyPins() {
  const actualHarnessVersion = packageVersion(repoRoot);
  if (actualHarnessVersion !== pins['enterprise-harness'].version) {
    throw new Error(`Enterprise Harness version mismatch: expected ${pins['enterprise-harness'].version}, got ${actualHarnessVersion}`);
  }
  if (!systems.includes('superpowers')) return;
  const actualVersion = packageVersion(superpowersRoot, path.join('.claude-plugin', 'plugin.json'));
  const actualCommit = exec('git', ['rev-parse', 'HEAD'], { cwd: superpowersRoot }).stdout.trim();
  if (actualVersion !== pins.superpowers.version || actualCommit !== pins.superpowers.commit) {
    throw new Error(`Superpowers pin mismatch: expected ${pins.superpowers.version}/${pins.superpowers.commit}, got ${actualVersion}/${actualCommit}`);
  }
}

function fixture(system) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `eh-competitive-${system}-`));
  exec('git', ['init', '-q'], { cwd: root });
  exec('git', ['config', 'user.email', 'benchmark@example.test'], { cwd: root });
  exec('git', ['config', 'user.name', 'Competitive Benchmark'], { cwd: root });
  write(path.join(root, 'AGENTS.md'), '# Benchmark contract\n\n- 不修改产品代码，直到需求或规格获得明确批准。\n');
  write(path.join(root, 'pom.xml'), [
    '<project xmlns="http://maven.apache.org/POM/4.0.0">',
    '  <modelVersion>4.0.0</modelVersion>',
    '  <groupId>com.acme</groupId><artifactId>orders</artifactId><version>1.0.0</version>',
    '  <dependencies><dependency><groupId>com.stripe</groupId><artifactId>stripe-java</artifactId><version>24.0.0</version></dependency></dependencies>',
    '</project>',
    '',
  ].join('\n'));
  write(path.join(root, 'src/main/java/com/acme/OrderStatus.java'), 'package com.acme;\npublic enum OrderStatus { PENDING, PAID, CANCELLED }\n');
  write(path.join(root, 'src/main/java/com/acme/OrderService.java'), [
    'package com.acme;',
    'public final class OrderService {',
    '  public OrderStatus status(String id) { return OrderStatus.PENDING; }',
    '}',
    '',
  ].join('\n'));
  if (system === 'openspec') {
    exec('npx', ['-y', '@fission-ai/openspec@1.12.0', 'init', root, '--tools', 'claude', '--profile', 'core', '--no-animation'], {
      cwd: root,
      env: { ...process.env, OPENSPEC_TELEMETRY: '0', DO_NOT_TRACK: '1' },
    });
    const actualVersion = exec('npx', ['-y', '@fission-ai/openspec@1.12.0', '--version'], {
      cwd: root,
      env: { ...process.env, OPENSPEC_TELEMETRY: '0', DO_NOT_TRACK: '1' },
    }).stdout.trim();
    if (!actualVersion.includes(pins.openspec.version)) {
      throw new Error(`OpenSpec version mismatch: expected ${pins.openspec.version}, got ${actualVersion}`);
    }
  }
  exec('git', ['add', '.'], { cwd: root });
  exec('git', ['commit', '-qm', 'benchmark baseline'], { cwd: root });
  return root;
}

function parseStream(raw) {
  const events = String(raw).split(/\r?\n/u).filter(Boolean).flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
  const result = [...events].reverse().find((event) => event.type === 'result');
  const texts = events.flatMap((event) => event.type === 'assistant'
    ? (event.message?.content || []).filter((block) => block.type === 'text').map((block) => block.text || '')
    : []);
  const tools = events.flatMap((event) => event.type === 'assistant'
    ? (event.message?.content || []).filter((block) => block.type === 'tool_use').map((block) => block.name)
    : []);
  return { result, text: result?.result || texts.join('\n'), tools };
}

function usageOf(result) {
  const entries = Object.values(result?.modelUsage || {});
  return entries.reduce((sum, item) => ({
    inputTokens: sum.inputTokens + Number(item.inputTokens || 0),
    outputTokens: sum.outputTokens + Number(item.outputTokens || 0),
    cacheReadInputTokens: sum.cacheReadInputTokens + Number(item.cacheReadInputTokens || 0),
    cacheCreationInputTokens: sum.cacheCreationInputTokens + Number(item.cacheCreationInputTokens || 0),
    costUsd: sum.costUsd + Number(item.costUSD || 0),
  }), { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUsd: 0 });
}

function entryPrompt(system, prompt) {
  if (system === 'enterprise-harness') return `/enterprise-harness:harness ${prompt}`;
  if (system === 'superpowers') return `/superpowers:brainstorming ${prompt}`;
  return `/opsx:propose ${prompt}`;
}

function continuationPrompt(system) {
  if (system === 'enterprise-harness') return '/enterprise-harness:harness';
  if (system === 'superpowers') return '继续按已加载的 Superpowers 工作流推进；若需要业务决定，只问一个问题。';
  return '/opsx:propose 继续当前 change；若需要业务决定，只问一个问题。';
}

function reachedCheckpoint(system, root, parsed) {
  if (parsed.tools.some((name) => /AskUserQuestion/iu.test(name))) return true;
  if (/[？?]\s*$/u.test(parsed.text.trim())) return true;
  if (system === 'openspec') {
    const changes = path.join(root, 'openspec', 'changes');
    return fs.existsSync(changes) && fs.readdirSync(changes).some((entry) => entry !== 'archive');
  }
  return false;
}

function artifacts(root) {
  const allowed = ['harness', 'openspec', 'docs/superpowers'];
  return allowed.flatMap((relative) => {
    const target = path.join(root, relative);
    if (!fs.existsSync(target)) return [];
    return fs.readdirSync(target, { recursive: true, encoding: 'utf-8' })
      .filter((entry) => fs.statSync(path.join(target, entry)).isFile())
      .map((entry) => {
        const absolute = path.join(target, entry);
        const stat = fs.statSync(absolute);
        const artifactPath = path.join(relative, entry).split(path.sep).join('/');
        return stat.size <= 200_000
          ? { path: artifactPath, size: stat.size, sha256: sha256(fs.readFileSync(absolute)), content: fs.readFileSync(absolute, 'utf-8') }
          : { path: artifactPath, size: stat.size, sha256: sha256(fs.readFileSync(absolute)), content: null };
      });
  }).sort((left, right) => left.path.localeCompare(right.path));
}

function runOnce(system, selected, repetition) {
  const root = fixture(system);
  const sessionId = crypto.randomUUID();
  const turnRecords = [];
  try {
    for (let turn = 1; turn <= selected.maxWorkflowTurns; turn += 1) {
      const claudeArgs = [
        '-p', ...(turn === 1 ? ['--session-id', sessionId] : ['--resume', sessionId]),
        '--output-format', 'stream-json', '--verbose',
        '--max-turns', '20', '--max-budget-usd', String(turnBudgetUsd), '--model', model,
        '--permission-mode', 'bypassPermissions', '--setting-sources', system === 'openspec' ? 'project' : '',
      ];
      if (system === 'enterprise-harness') claudeArgs.push('--plugin-dir', repoRoot);
      if (system === 'superpowers') claudeArgs.push('--plugin-dir', superpowersRoot);
      claudeArgs.push(turn === 1 ? entryPrompt(system, selected.prompt) : continuationPrompt(system));
      const startedAt = Date.now();
      const child = spawnSync('claude', claudeArgs, { cwd: root, encoding: 'utf-8', shell: false, timeout: 900_000 });
      const raw = `${child.stdout || ''}`;
      const parsed = parseStream(raw);
      if (/Unknown command:/u.test(parsed.text)) {
        throw new Error(`${system} entrypoint was not loaded: ${parsed.text.trim()}`);
      }
      turnRecords.push({
        turn,
        exitCode: child.status,
        durationMs: Date.now() - startedAt,
        usage: usageOf(parsed.result),
        toolNames: parsed.tools,
        text: parsed.text,
        rawDigest: sha256(raw),
        error: String(child.stderr || '').trim() || null,
      });
      if (child.status !== 0 || reachedCheckpoint(system, root, parsed)) break;
    }
    const diff = exec('git', ['status', '--short'], { cwd: root }).stdout.trim().split(/\r?\n/u).filter(Boolean);
    return {
      system,
      caseId: selected.id,
      repetition,
      model,
      claudeVersion: exec('claude', ['--version'], { cwd: root }).stdout.trim(),
      turns: turnRecords,
      totals: turnRecords.reduce((totals, turn) => ({
        inputTokens: totals.inputTokens + turn.usage.inputTokens,
        outputTokens: totals.outputTokens + turn.usage.outputTokens,
        cacheReadInputTokens: totals.cacheReadInputTokens + turn.usage.cacheReadInputTokens,
        cacheCreationInputTokens: totals.cacheCreationInputTokens + turn.usage.cacheCreationInputTokens,
        costUsd: totals.costUsd + turn.usage.costUsd,
        durationMs: totals.durationMs + turn.durationMs,
      }), { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUsd: 0, durationMs: 0 }),
      artifacts: artifacts(root),
      gitStatus: diff,
      productCodeChanged: diff.some((line) => /src\/(?:main|test)\//u.test(line)),
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

fs.mkdirSync(resultsDir, { recursive: true });
verifyPins();
const selected = definition.cases[0];
const records = [];
for (let repetition = 1; repetition <= reps; repetition += 1) {
  for (const system of systems.slice((repetition - 1) % systems.length).concat(systems.slice(0, (repetition - 1) % systems.length))) {
    const record = runOnce(system, selected, repetition);
    records.push(record);
    console.log(`${system} rep=${repetition} turns=${record.turns.length} tokens=${record.totals.inputTokens + record.totals.outputTokens} cost=${record.totals.costUsd.toFixed(4)}`);
  }
}
const output = {
  benchmarkVersion: 1,
  generatedAt: new Date().toISOString(),
  caseId: selected.id,
  model,
  repetitions: reps,
  turnBudgetUsd,
  systems,
  pins,
  runnerCommit: exec('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }).stdout.trim(),
  records,
};
write(path.join(resultsDir, 'raw-results.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(`results=${path.join(resultsDir, 'raw-results.json')}`);
