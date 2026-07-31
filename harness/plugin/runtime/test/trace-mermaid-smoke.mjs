import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const tracePath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'trace.mjs');
const changeId = 'trace-mermaid-probe';

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-mermaid-'));
  fs.mkdirSync(path.join(root, 'harness/changes', changeId), { recursive: true });
  fs.writeFileSync(path.join(root, 'harness/ACTIVE_CHANGE'), `${changeId}\n`);
  fs.writeFileSync(path.join(root, 'harness/changes', changeId, 'state.json'), `${JSON.stringify({ changeId })}\n`);
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.writeFileSync(path.join(root, '.git/HEAD'), 'ref: refs/heads/main');
  return root;
}

function writeEvent(root, event) {
  const spool = path.join(root, '.git', 'enterprise-harness', 'receipts', changeId, 'agent-events.jsonl');
  fs.mkdirSync(path.dirname(spool), { recursive: true });
  fs.appendFileSync(spool, `${JSON.stringify({ issuedAt: new Date().toISOString(), ...event })}\n`);
}

function traceMermaid(root) {
  return spawnSync(process.execPath, [tracePath, '--change', changeId, '--mermaid'], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
  });
}

const failures = [];
function check(desc, fn) {
  try {
    fn();
  } catch (error) {
    failures.push(`${desc}: ${error.message}`);
  }
}

check('A: no events produces a Mermaid diagram with a note', () => {
  const root = makeRoot();
  try {
    const result = traceMermaid(root);
    assert.equal(result.status, 0, `exit=${result.status} stderr=${result.stderr}`);
    assert.match(result.stdout, /sequenceDiagram/u);
    assert.match(result.stdout, /No events recorded/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

check('B: a dispatch and stop produce a complete sequence', () => {
  const root = makeRoot();
  try {
    writeEvent(root, { kind: 'dispatch', agentId: 'code-explore', behavior: 'clarify.explore-code', runId: 'run-aaa' });
    writeEvent(root, { kind: 'start', agentId: 'code-explore', runId: 'run-aaa' });
    writeEvent(root, { kind: 'stop', agentId: 'code-explore', verdict: 'pass', runId: 'run-aaa' });
    const result = traceMermaid(root);
    assert.equal(result.status, 0, `exit=${result.status} stderr=${result.stderr}`);
    assert.match(result.stdout, /participant Orchestrator/u);
    assert.match(result.stdout, /participant code-explore/u);
    assert.match(result.stdout, /Orchestrator->>code-explore: dispatch/u);
    assert.match(result.stdout, /code-explore->>Orchestrator: stop \(pass\)/u);
    assert.match(result.stdout, /group run run-aaa/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

check('C: missing --change flag and no active change produces a usage error', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-mermaid-nochange-'));
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.writeFileSync(path.join(root, '.git/HEAD'), 'ref: refs/heads/main');
  try {
    const result = spawnSync(process.execPath, [tracePath, '--mermaid'], {
      cwd: root,
      encoding: 'utf-8',
      shell: false,
    });
    assert.equal(result.status, 1, `exit=${result.status} stderr=${result.stderr}`);
    assert.match(result.stderr, /--change/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

check('D: failure event produces a FAIL arrow', () => {
  const root = makeRoot();
  try {
    writeEvent(root, { kind: 'dispatch', agentId: 'tdd-executor', behavior: 'tdd.run', runId: 'run-bbb' });
    writeEvent(root, { kind: 'failure', agentId: 'tdd-executor', errorCode: 'EH-TDD-001', runId: 'run-bbb' });
    const result = traceMermaid(root);
    assert.equal(result.status, 0, `exit=${result.status} stderr=${result.stderr}`);
    assert.match(result.stdout, /tdd-executor--xOrchestrator: FAIL EH-TDD-001/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

if (failures.length > 0) {
  console.error('trace-mermaid-smoke failed.');
  for (const item of failures) console.error(`  - ${item}`);
  process.exit(1);
}
console.log(`PASS trace-mermaid ${mode}`);
