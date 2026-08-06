import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { appendAgentEvent } from '../lib/agent-evidence.mjs';
import {
  readAndValidateTddReceipt,
  tddReceiptSpoolPath,
} from '../lib/tdd-receipts.mjs';

const mode = process.argv[2] || 'verify';
const testDir = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(testDir, '../..');
const changeId = 'test-v2-command-change';
const taskId = 'task-v2-sequence';
const agentId = 'agent-v2-sequencer';
const baselineMetadata = [
  `harness/changes/${changeId}/state.json`,
  `harness/changes/${changeId}/validation.md`,
  `harness/changes/${changeId}/reviews/design-reviewer.json`,
  `harness/changes/${changeId}/runs/run-preexisting/input.json`,
];

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-task-command-v2-'));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf-8', shell: false });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };

  git('init', '-q');
  git('config', 'user.email', 'harness@example.invalid');
  git('config', 'user.name', 'Harness Smoke');

  fs.mkdirSync(path.join(root, 'harness', 'changes', changeId), { recursive: true });
  fs.mkdirSync(path.join(root, 'runtime', 'test'), { recursive: true });
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`);
  fs.writeFileSync(path.join(root, 'harness', 'command-policy.json'), `${JSON.stringify({
    schemaVersion: 1,
    build: { type: 'command', executables: ['node'] },
  })}\n`);

  const logRel = 'runtime/test/v2-sequence.log';
  const metadataRel = `harness/changes/${changeId}/validation.md`;
  const childRel = 'runtime/test/task-command-v2-child.mjs';
  const sequence = [
    { id: 'cycle-1-red', phase: 'RED', argv: ['node', childRel, 'red-1', logRel, metadataRel] },
    { id: 'cycle-1-green', phase: 'GREEN', argv: ['node', childRel, 'green-1', logRel, metadataRel] },
    { id: 'cycle-1-refactor', phase: 'REFACTOR', argv: ['node', childRel, 'refactor-1', logRel, metadataRel] },
    { id: 'cycle-2-red', phase: 'RED', argv: ['node', childRel, 'red-2', logRel, metadataRel] },
    { id: 'cycle-2-green', phase: 'GREEN', argv: ['node', childRel, 'green-2', logRel, metadataRel] },
    { id: 'cycle-2-refactor', phase: 'REFACTOR', argv: ['node', childRel, 'refactor-2', logRel, metadataRel] },
    { id: 'cycle-2-verify', phase: 'VERIFY', argv: ['node', childRel, 'verify', logRel, metadataRel] },
  ];
  fs.writeFileSync(
    path.join(root, 'harness', 'changes', changeId, 'task-commands.json'),
    `${JSON.stringify({
      schemaVersion: 2,
      tasks: {
        [taskId]: {
          commands: sequence,
        },
        'task-legacy-triplet': {
          redCommand: ['node', childRel, 'legacy-red', logRel],
          greenCommand: ['node', childRel, 'legacy-green', logRel],
          refactorCommand: ['node', childRel, 'legacy-refactor', logRel],
        },
      },
    })}\n`,
  );
  fs.writeFileSync(
    path.join(root, childRel),
    [
      "import fs from 'node:fs';",
      "const [, , label, logPath, metadataPath] = process.argv;",
      'fs.appendFileSync(logPath, `${label}\\n`);',
      'fs.appendFileSync(metadataPath, `${label} metadata\\n`);',
      "if (label.startsWith('red')) {",
      "  console.error(`intentional ${label}`);",
      '  process.exit(1);',
      '}',
      'console.log(`ok ${label}`);',
    ].join('\n'),
  );
  git('add', '.');
  git('commit', '-qm', 'baseline');

  fs.mkdirSync(path.join(root, `harness/changes/${changeId}/reviews`), { recursive: true });
  fs.mkdirSync(path.join(root, `harness/changes/${changeId}/runs/run-preexisting`), { recursive: true });
  fs.writeFileSync(path.join(root, `harness/changes/${changeId}/state.json`), '{"status":"PLANNED"}\n');
  fs.writeFileSync(path.join(root, `harness/changes/${changeId}/validation.md`), '# stale validation\n');
  fs.writeFileSync(path.join(root, `harness/changes/${changeId}/reviews/design-reviewer.json`), '{"legacy":true}\n');
  fs.writeFileSync(path.join(root, `harness/changes/${changeId}/runs/run-preexisting/input.json`), '{"legacy":true}\n');

  appendAgentEvent(root, changeId, {
    kind: 'start',
    sessionId: 'session-v2',
    agentId,
    observedAgentType: 'enterprise-harness:tdd-executor',
    cwd: root,
  });
  return {
    root,
    sequence,
    logPath: path.join(root, logRel),
    git,
  };
}

function runTdd(root, phase, argv) {
  return spawnSync(
    'node',
    [
      path.join(sourceRoot, 'runtime/tdd-run.mjs'),
      changeId,
      taskId,
      phase,
      '--',
      ...argv,
    ],
    {
      cwd: root,
      encoding: 'utf-8',
      shell: false,
      env: {
        ...process.env,
        CLAUDE_AGENT_ID: agentId,
      },
    },
  );
}

function assertLog(logPath, expected) {
  const actual = fs.readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
  assert.deepEqual(actual, expected);
}

function assertBaselineFiltering(receipt) {
  assert.deepEqual(receipt.changedPaths, ['runtime/test/v2-sequence.log']);
  assert.deepEqual(
    receipt.worktree.statusBaseline.paths.map((entry) => entry.path).sort(),
    baselineMetadata.slice().sort(),
  );
}

const fixtures = [];

try {
  if (mode === 'red') {
    const fixture = createFixture();
    fixtures.push(fixture.root);
    const result = runTdd(fixture.root, 'red', fixture.sequence[0].argv);
    assert.equal(result.status, 1, `first RED must run the frozen child and preserve its nonzero exit: ${result.stderr}`);
    const receiptPath = tddReceiptSpoolPath(fixture.root, changeId, taskId);
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf-8'));
    assert.equal(receipt.executions.length, 1);
    assert.equal(receipt.executions[0].phase, 'RED');
    assertBaselineFiltering(receipt);
    console.log(`PASS task-command-v2-sequencing ${mode}`);
  } else if (mode === 'green') {
    const fixture = createFixture();
    fixtures.push(fixture.root);
    const phases = ['red', 'green', 'refactor', 'red', 'green', 'refactor'];
    const expectedStatuses = [1, 0, 0, 1, 0, 0];
    for (let index = 0; index < phases.length; index += 1) {
      const result = runTdd(fixture.root, phases[index], fixture.sequence[index].argv);
      assert.equal(result.status, expectedStatuses[index], `${phases[index]} #${index + 1} status mismatch: ${result.stderr}`);
    }
    const receiptPath = tddReceiptSpoolPath(fixture.root, changeId, taskId);
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf-8'));
    assert.deepEqual(
      receipt.executions.map((execution) => execution.phase),
      ['RED', 'GREEN', 'REFACTOR', 'RED', 'GREEN', 'REFACTOR'],
    );
    assertBaselineFiltering(receipt);
    const validation = readAndValidateTddReceipt(receiptPath, {
      root: fixture.root,
      changeId,
      taskId,
      requireComplete: false,
    });
    assert.equal(validation.ok, true, validation.problems.join('; '));
    assertLog(fixture.logPath, ['red-1', 'green-1', 'refactor-1', 'red-2', 'green-2', 'refactor-2']);
    console.log(`PASS task-command-v2-sequencing ${mode}`);
  } else if (mode === 'verify') {
    const orderFixture = createFixture();
    fixtures.push(orderFixture.root);
    const outOfOrder = runTdd(orderFixture.root, 'green', orderFixture.sequence[1].argv);
    assert.equal(outOfOrder.status, 2, 'out-of-order GREEN must be blocked before the child command runs');
    assert.match(`${outOfOrder.stderr}${outOfOrder.stdout}`, /phase order violation/i);

    const fixture = createFixture();
    fixtures.push(fixture.root);
    const phases = ['red', 'green', 'refactor', 'red', 'green', 'refactor', 'verify'];
    const expectedStatuses = [1, 0, 0, 1, 0, 0, 0];
    for (let index = 0; index < phases.length; index += 1) {
      const result = runTdd(fixture.root, phases[index], fixture.sequence[index].argv);
      assert.equal(result.status, expectedStatuses[index], `${phases[index]} #${index + 1} status mismatch: ${result.stderr}`);
    }
    const receiptPath = tddReceiptSpoolPath(fixture.root, changeId, taskId);
    const validation = readAndValidateTddReceipt(receiptPath, {
      root: fixture.root,
      changeId,
      taskId,
      requireComplete: true,
    });
    assert.equal(validation.ok, true, validation.problems.join('; '));
    assert.deepEqual(
      validation.receipt.executions.map((execution) => execution.phase),
      ['RED', 'GREEN', 'REFACTOR', 'RED', 'GREEN', 'REFACTOR', 'VERIFY'],
    );
    assertBaselineFiltering(validation.receipt);
    assertLog(fixture.logPath, ['red-1', 'green-1', 'refactor-1', 'red-2', 'green-2', 'refactor-2', 'verify']);
    console.log(`PASS task-command-v2-sequencing ${mode}`);
  } else {
    throw new Error(`unsupported mode: ${mode}`);
  }
} finally {
  for (const root of fixtures) {
    if (fs.existsSync(root)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
}
