import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendAgentEvent } from '../lib/agent-evidence.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const preExplorePath = path.join(repoRoot, 'hooks', 'scripts', 'pre-explore.mjs');
const mode = process.argv[2];

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node runtime/test/pre-explore-smoke.mjs <red|green|verify>');
  process.exit(1);
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf-8');
}

function createChangeFixture(tempRoot, changeId, state) {
  // The agent event spool lives under the git common dir, so evidence-carrying
  // fixtures need a real repository or appendAgentEvent writes somewhere the
  // hook will not read back.
  spawnSync('git', ['init', '-q'], { cwd: tempRoot, encoding: 'utf-8' });
  fs.mkdirSync(path.join(tempRoot, 'harness'), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`, 'utf-8');
  writeJson(path.join(tempRoot, 'harness', 'changes', changeId, 'state.json'), state);
}

function baseState(overrides = {}) {
  return {
    schemaVersion: 3, changeId: 'fixture-change', tier: 'L2', state: 'EXECUTING',
    tooling: { codegraph: { status: 'unknown', queries: [], fallbackReason: null }, documentation: { status: 'not-needed', libraries: [] } },
    impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no' },
    decisions: [], blockers: [], approvals: {},
    currentTask: 'fixture-task',
    gates: { designApproved: true, redVerified: false, redTask: null, redEvidenceRef: null },
    validation: { status: 'missing', digest: null, validatedAt: null },
    workflow: { stage: 'design', clarifyReady: true, userConfirmedScope: true, planReady: true, tddStatus: 'not-started', nextEntry: '/harness' },
    ...overrides,
  };
}

function runPreExplore(tempRoot, toolName, input, agentId = undefined) {
  return spawnSync('node', [preExplorePath], {
    cwd: tempRoot,
    encoding: 'utf-8',
    input: JSON.stringify({ tool_name: toolName, tool_input: input, agent_id: agentId }),
  });
}

function withTempRoot(run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-explore-smoke-'));
  try {
    run(tempRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

const failures = [];

function check(desc, fn) {
  try {
    fn();
  } catch (error) {
    failures.push(`${desc}: ${error.message}`);
  }
}

// ── RED ──
if (mode === 'red') {
  // pre-explore.mjs 不存在或无 codegraph 检查时应该 fail
  if (!fs.existsSync(preExplorePath)) {
    pass('Red precondition holds: pre-explore.mjs not yet implemented.');
  }
  // 如果存在，检查它是否有 codegraph 检查逻辑
  const content = fs.readFileSync(preExplorePath, 'utf-8');
  if (!content.includes('codegraph')) {
    console.log('Red precondition holds: pre-explore.mjs has no codegraph check.');
    process.exit(0);
  }
}

// ── GREEN / VERIFY ──

check('A: Grep on business code without codegraph evidence must BLOCK', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    const result = runPreExplore(tempRoot, 'Grep', { pattern: 'Template', path: 'src/main/java/com/example/Template.java' });
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /BLOCK/);
    assert.match(result.stderr, /code-explore subagent/);
  });
});

check('B: Read on business code without codegraph evidence must BLOCK', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    const result = runPreExplore(tempRoot, 'Read', { file_path: 'src/main/java/com/example/TemplateService.java' });
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /BLOCK/);
  });
});

check('C: forged state codegraph evidence must not unlock main-thread exploration', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState({
      tooling: { codegraph: { status: 'available', queries: ['find-template-module'], fallbackReason: null }, documentation: { status: 'not-needed', libraries: [] } },
    }));
    const result = runPreExplore(tempRoot, 'Grep', { pattern: 'Template', path: 'src/main/java/com/example/' });
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
  });
});

check('D: Read on harness/ internal files must PASS (exempt)', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    const result = runPreExplore(tempRoot, 'Read', { file_path: 'harness/changes/fixture-change/design.md' });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr=${result.stderr}`);
  });
});

check('E: Read on CLAUDE.md must PASS (exempt)', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    const result = runPreExplore(tempRoot, 'Read', { file_path: 'CLAUDE.md' });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr=${result.stderr}`);
  });
});

check('F: no active change but has change tracking — exploring business code must still BLOCK', () => {
  withTempRoot((tempRoot) => {
    fs.mkdirSync(path.join(tempRoot, 'harness', 'changes'), { recursive: true });
    // no ACTIVE_CHANGE, but project uses harness (has harness/changes/)
    const result = runPreExplore(tempRoot, 'Grep', { pattern: 'foo', path: 'src/main/java/Foo.java' });
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /BLOCK/);
  });
});

check('G: Bash grep on business code without codegraph evidence must BLOCK', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    const result = runPreExplore(tempRoot, 'Bash', { command: 'grep -R "Template" src/main/java' });
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /BLOCK/);
  });
});

check('H: non-exploration Bash must PASS', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    const result = runPreExplore(tempRoot, 'Bash', { command: 'ls' });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr=${result.stderr}`);
  });
});

check('I: an exempt README token must not exempt business-code exploration in the same Bash command', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    const result = runPreExplore(tempRoot, 'Bash', {
      command: 'rg "Template" README.md src/main/java',
    });
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /BLOCK/u);
  });
});

check('J: exploration Bash without any path target must PASS', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    const result = runPreExplore(tempRoot, 'Bash', { command: 'find . -name "*.mjs"' });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr=${result.stderr}`);
  });
});

check('K: a redirect to /dev/null must not defeat exemption of non-governed targets', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    const result = runPreExplore(tempRoot, 'Bash', {
      command: 'grep -rn "x" runtime/lib/gates.mjs 2>/dev/null',
    });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr=${result.stderr}`);
  });
});

check('L: a regex literal containing a slash must not be treated as a governed path', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    const result = runPreExplore(tempRoot, 'Bash', {
      command: 'grep -rn "a\\|b" runtime/lib/gates.mjs',
    });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr=${result.stderr}`);
  });
});

check('M: Read on a path outside the repo root must PASS', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    const outside = path.join(os.tmpdir(), 'eh-outside-probe.md');
    const result = runPreExplore(tempRoot, 'Read', { file_path: outside });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr=${result.stderr}`);
  });
});

check('N: governed exploration must still BLOCK when mixed with an outside-root target', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    const result = runPreExplore(tempRoot, 'Bash', {
      command: 'grep -rn "Template" src/main/java 2>/dev/null',
    });
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /BLOCK/u);
  });
});

// An in-flight code-explore subagent only has `dispatch` + `start` on the spool.
// `dispatch-binding` is written by PostToolUse:Agent, which fires after the
// subagent has already exited, so gating on it made the subagent unable to pass
// its own gate — every fallback Read/Grep was blocked and exploration could
// never happen. Observed ordering: dispatch → start → stop → dispatch-binding.
check('O: an in-flight code-explore subagent must PASS codegraph exploration', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    appendAgentEvent(tempRoot, 'fixture-change', {
      kind: 'dispatch',
      requestedAgentType: 'enterprise-harness:code-explore',
      toolUseId: 'tool-inflight',
    });
    appendAgentEvent(tempRoot, 'fixture-change', {
      kind: 'start',
      agentId: 'inflight-explorer',
      observedAgentType: 'enterprise-harness:code-explore',
    });
    const result = runPreExplore(tempRoot, 'mcp__codegraph__codegraph_search', {
      query: 'Template',
    }, 'inflight-explorer');
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr=${result.stderr}`);
  });
});

check('O2: after a CodeGraph attempt the same in-flight subagent may fall back to Grep', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    appendAgentEvent(tempRoot, 'fixture-change', {
      kind: 'start',
      agentId: 'inflight-explorer',
      observedAgentType: 'enterprise-harness:code-explore',
    });
    const codegraph = runPreExplore(tempRoot, 'mcp__codegraph__codegraph_search', {
      query: 'Template',
    }, 'inflight-explorer');
    assert.equal(codegraph.status, 0, `codegraph attempt should pass; stderr=${codegraph.stderr}`);
    const result = runPreExplore(tempRoot, 'Grep', {
      pattern: 'Template',
      path: 'src/main/java/com/example/Template.java',
    }, 'inflight-explorer');
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr=${result.stderr}`);
  });
});

check('P: a code-explore subagent that already stopped must BLOCK', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    appendAgentEvent(tempRoot, 'fixture-change', {
      kind: 'start',
      agentId: 'finished-explorer',
      observedAgentType: 'enterprise-harness:code-explore',
    });
    appendAgentEvent(tempRoot, 'fixture-change', {
      kind: 'stop',
      agentId: 'finished-explorer',
      observedAgentType: 'enterprise-harness:code-explore',
    });
    const result = runPreExplore(tempRoot, 'Grep', {
      pattern: 'Template',
      path: 'src/main/java/com/example/Template.java',
    }, 'finished-explorer');
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /BLOCK/u);
  });
});

check('Q: a non-code-explore subagent must not pass the exploration gate', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    appendAgentEvent(tempRoot, 'fixture-change', {
      kind: 'start',
      agentId: 'wrong-type',
      observedAgentType: 'enterprise-harness:design-executor',
    });
    const result = runPreExplore(tempRoot, 'Grep', {
      pattern: 'Template',
      path: 'src/main/java/com/example/Template.java',
    }, 'wrong-type');
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /BLOCK/u);
  });
});

// Forcing every codegraph-mentioning event past the path exemption made an
// ordinary shell command that merely names the word — a commit message, a doc
// edit — get gated as business-code exploration.
check('R: a Bash command mentioning codegraph but touching no governed path must PASS', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    const result = runPreExplore(tempRoot, 'Bash', {
      command: 'git commit -m "fix: record the codegraph attempt before fallback"',
    });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr=${result.stderr}`);
  });
});

function fail(message) {
  console.error(message);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (failures.length > 0) {
  fail('pre-explore-smoke failed.');
}

pass(mode === 'green' ? 'Green pre-explore-smoke passed.' : 'pre-explore-smoke verify passed.');
