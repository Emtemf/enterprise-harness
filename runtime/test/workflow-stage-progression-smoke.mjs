// 锁定 clarify → archive 的每一步都存在可执行的推进命令。
//
// 回归背景：plan/tdd/verify 曾完全没有 pendingDecision，且没有任何命令能把
// clarifyReady / planReady 置为 true，导致链路在 clarify 和 plan 两处死锁——
// 而全部 smoke 仍然通过，因为没有测试走完整条流水线。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const cliPath = path.join(repoRoot, 'runtime', 'cli.mjs');
const mode = process.argv[2];

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node runtime/test/workflow-stage-progression-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-stage-progression-'));
const changeId = 'progression-smoke';

function run(args) {
  return spawnSync('node', [cliPath, ...args], { cwd: tempRoot, encoding: 'utf-8' });
}

function status() {
  const result = run(['workflow', 'status', changeId, '--json']);
  try { return JSON.parse(result.stdout); } catch { return null; }
}

function fail(message) {
  console.error(message);
  fs.rmSync(tempRoot, { recursive: true, force: true });
  process.exit(1);
}

try {
  spawnSync('git', ['init', '-q', '.'], { cwd: tempRoot });
  fs.mkdirSync(path.join(tempRoot, 'harness', 'changes'), { recursive: true });
  for (const dir of ['templates', 'specs']) {
    fs.cpSync(path.join(repoRoot, 'harness', dir), path.join(tempRoot, 'harness', dir), { recursive: true });
  }

  run(['lifecycle', 'scaffold', changeId, 'dev', 'L1', 'progression probe']);
  run(['lifecycle', 'active', changeId]);
  const changeDir = path.join(tempRoot, 'harness', 'changes', changeId);
  // 本 fixture 只锁定 decision primitive 的可达性，不构造 executor/checker evidence graph。
  // 标成 historical schema，避免 strict audit 正确地把这种无证据推进拦下。
  const primitiveStatePath = path.join(changeDir, 'state.json');
  const primitiveState = JSON.parse(fs.readFileSync(primitiveStatePath, 'utf-8'));
  primitiveState.schemaVersion = 3;
  fs.writeFileSync(primitiveStatePath, JSON.stringify(primitiveState, null, 2), 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'requirements.md'), '# Requirements\n', 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'design.md'), '# Design\n', 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'tasks.md'), '# Tasks\n\n- task-1\n', 'utf-8');

  // 每一步：断言该 stage 确实给出 pendingDecision，然后执行它并确认 stage 前进。
  const steps = [
    { decision: 'confirm-clarity', from: 'clarify', to: 'clarify' },
    { decision: 'confirm-scope', from: 'clarify', to: 'route' },
    { decision: 'confirm-route', from: 'route', to: 'design' },
    { decision: 'approve', from: 'design', to: 'plan' },
    { decision: 'freeze-plan', from: 'plan', to: 'tdd' },
  ];

  for (const step of steps) {
    const before = status();
    if (before?.stage !== step.from) {
      fail(`Expected stage ${step.from} before ${step.decision}, got ${before?.stage}`);
    }
    if (!before?.pendingDecision?.options?.includes(step.decision)) {
      fail(`Stage ${step.from} offers no "${step.decision}" decision; options=${JSON.stringify(before?.pendingDecision?.options ?? null)}`);
    }
    const result = run(['workflow', 'decide', changeId, step.decision]);
    if (result.status !== 0) {
      fail(`workflow decide ${step.decision} failed at stage ${step.from}: ${result.stderr.trim()}`);
    }
    const after = status();
    if (after?.stage !== step.to) {
      fail(`Expected stage ${step.to} after ${step.decision}, got ${after?.stage}`);
    }
  }

  // planReady 必须真的落盘为 true，否则 pre-write 的执行前置永远不满足。
  const planned = JSON.parse(fs.readFileSync(path.join(changeDir, 'state.json'), 'utf-8'));
  if (planned.workflow?.planReady !== true) {
    fail('freeze-plan did not set workflow.planReady=true');
  }

  // tdd 完成后进入 verify。tddStatus 由真实 receipt 驱动，这里只模拟其终态。
  const state = JSON.parse(fs.readFileSync(path.join(changeDir, 'state.json'), 'utf-8'));
  state.workflow.tddStatus = 'refactor-verified';
  fs.writeFileSync(path.join(changeDir, 'state.json'), JSON.stringify(state, null, 2), 'utf-8');

  if (run(['workflow', 'decide', changeId, 'enter-verify']).status !== 0) {
    fail('enter-verify decision failed at tdd stage');
  }
  if (status()?.stage !== 'verify') fail('enter-verify did not advance to verify');

  // verify 出口要求 validation 已 fresh。
  if (run(['lifecycle', 'validated', changeId]).status !== 0) {
    fail('lifecycle validated failed');
  }
  if (run(['workflow', 'decide', changeId, 'enter-archive']).status !== 0) {
    fail('enter-archive decision failed at verify stage');
  }
  const final = status();
  if (final?.stage !== 'archive') fail(`Expected archive stage, got ${final?.stage}`);
  if (final?.status !== 'complete') fail(`Expected complete status, got ${final?.status}`);

  console.log('Workflow stage progression smoke passed (clarify → archive).');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
