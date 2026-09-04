import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHandoffV2 } from '../core/handoff-v2.mjs';
import { appendAgentEvent } from '../lib/agent-evidence.mjs';
import { bindSession } from '../lib/sessions.mjs';

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

function runPreExplore(tempRoot, toolName, input, agentId = undefined, eventOverrides = {}) {
  return spawnSync('node', [preExplorePath], {
    cwd: tempRoot,
    encoding: 'utf-8',
    input: JSON.stringify({ tool_name: toolName, tool_input: input, agent_id: agentId, ...eventOverrides }),
  });
}

function bindActiveImplementer(tempRoot, changeId, agentId = 'active-implementer', sessionId = 'implement-session') {
  bindSession(tempRoot, {
    sessionId,
    changeId,
    worktreePath: tempRoot,
    subjectRoot: tempRoot,
    controllerRevision: 'pre-explore-test',
  });
  appendAgentEvent(tempRoot, changeId, {
    kind: 'dispatch',
    runId: 'run-implement',
    sessionId,
    requestedAgentType: 'enterprise-harness:implementer',
    preloadedSkill: 'implement',
  });
  appendAgentEvent(tempRoot, changeId, {
    kind: 'start',
    sessionId,
    agentId,
    observedAgentType: 'enterprise-harness:implementer',
  });
  return { agentId, sessionId };
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

check('S: an active implementer may Read a frozen writeScope path without a second CodeGraph exploration', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState({
      schemaVersion: 6,
      stage: 'implement',
      lifecycle: 'active',
      currentTask: 'fixture-task',
    }));
    writeJson(path.join(tempRoot, 'harness/changes/fixture-change/task-commands.json'), {
      schemaVersion: 4,
      tasks: {
        'fixture-task': {
          executionStrategy: 'tdd',
          writeScope: {
            allowed: ['src/main/java/com/example/TemplateService.java'],
            forbidden: [],
          },
          commands: [
            { phase: 'RED', argv: ['true'] },
            { phase: 'GREEN', argv: ['true'] },
            { phase: 'REFACTOR', argv: ['true'] },
          ],
        },
      },
    });
    const binding = bindActiveImplementer(tempRoot, 'fixture-change');
    const result = runPreExplore(tempRoot, 'Read', {
      file_path: 'src/main/java/com/example/TemplateService.java',
    }, binding.agentId, { session_id: binding.sessionId, cwd: tempRoot });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr=${result.stderr}`);
  });
});

check('T: an active implementer still cannot explore business code outside frozen writeScope', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState({
      schemaVersion: 6,
      stage: 'implement',
      lifecycle: 'active',
      currentTask: 'fixture-task',
    }));
    writeJson(path.join(tempRoot, 'harness/changes/fixture-change/task-commands.json'), {
      schemaVersion: 4,
      tasks: {
        'fixture-task': {
          executionStrategy: 'direct',
          strategyRationale: 'fixture',
          writeScope: { allowed: ['src/main/java/com/example/Allowed.java'], forbidden: [] },
          commands: [{ phase: 'VERIFY', argv: ['true'] }],
        },
      },
    });
    const binding = bindActiveImplementer(tempRoot, 'fixture-change');
    const result = runPreExplore(tempRoot, 'Read', {
      file_path: 'src/main/java/com/example/Outside.java',
    }, binding.agentId, { session_id: binding.sessionId, cwd: tempRoot });
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /code-explore subagent/u);
  });
});

check('U: an active task reviewer may Read only receipt-declared changed paths in the implementer worktree', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState({
      schemaVersion: 6,
      stage: 'implement',
      lifecycle: 'active',
      currentTask: 'fixture-task',
    }));
    const worker = path.join(tempRoot, '.worker');
    const reviewedRef = 'src/main/java/com/example/Reviewed.java';
    const outsideRef = 'src/main/java/com/example/Outside.java';
    writeText(path.join(worker, reviewedRef), 'final class Reviewed {}\n');
    writeText(path.join(worker, outsideRef), 'final class Outside {}\n');
    writeJson(path.join(tempRoot, 'harness/changes/fixture-change/task-commands.json'), {
      schemaVersion: 4,
      tasks: {
        'fixture-task': {
          executionStrategy: 'direct',
          strategyRationale: 'review fixture',
          writeScope: { allowed: [reviewedRef], forbidden: [] },
          commands: [{ phase: 'VERIFY', argv: ['true'] }],
        },
      },
    });
    const receiptRef = 'harness/changes/fixture-change/evidence/tasks/fixture-task.json';
    writeJson(path.join(tempRoot, receiptRef), {
      receiptVersion: 2,
      provenance: 'runtime-runner',
      changeId: 'fixture-change',
      taskId: 'fixture-task',
      executionStrategy: 'direct',
      strategyRationale: 'review fixture',
      agent: { id: 'fixture-implementer', type: 'enterprise-harness:implementer' },
      worktree: {
        path: worker,
        gitCommonDir: path.join(tempRoot, '.git'),
        headBefore: '1'.repeat(40),
        headAfter: '1'.repeat(40),
        treeDigestBefore: 'a'.repeat(64),
        treeDigestAfter: 'b'.repeat(64),
      },
      changedPaths: [reviewedRef],
      inputDigests: { 'harness/changes/fixture-change/tasks.md': 'c'.repeat(64) },
      executions: [{
        phase: 'VERIFY', argv: ['true'], outcome: 'exit', exitCode: 0,
        signal: null, spawnError: null,
        startedAt: '2026-09-04T00:00:00.000Z',
        finishedAt: '2026-09-04T00:00:01.000Z',
        stdoutDigest: 'd'.repeat(64), stderrDigest: 'e'.repeat(64),
      }],
      completedAt: '2026-09-04T00:00:01.000Z',
    });
    const review = createHandoffV2(tempRoot, {
      changeId: 'fixture-change',
      stage: 'implement',
      behavior: 'implement.review-task',
      role: 'check',
      parentRunId: 'run_11111111-1111-4111-8111-111111111111',
      agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
      inputRefs: [receiptRef],
      rubricIds: ['task'],
      tecpc: {
        target: 'review exact changed paths',
        evidence: [receiptRef],
        context: [receiptRef],
        path: `${receiptRef} -> review`,
        correction: null,
      },
    });
    const sessionId = 'review-session';
    const agentId = 'active-reviewer';
    bindSession(tempRoot, {
      sessionId,
      changeId: 'fixture-change',
      worktreePath: tempRoot,
      subjectRoot: tempRoot,
      controllerRevision: 'pre-explore-test',
    });
    appendAgentEvent(tempRoot, 'fixture-change', {
      kind: 'dispatch', runId: review.runId, sessionId,
      requestedAgentType: 'enterprise-harness:reviewer', preloadedSkill: 'review',
    });
    appendAgentEvent(tempRoot, 'fixture-change', {
      kind: 'start', sessionId, agentId,
      observedAgentType: 'enterprise-harness:reviewer',
    });
    const allowed = runPreExplore(tempRoot, 'Read', {
      file_path: path.join(worker, reviewedRef),
    }, agentId, { session_id: sessionId, cwd: tempRoot });
    assert.equal(allowed.status, 0, `expected reviewed path to pass; stderr=${allowed.stderr}`);
    const blocked = runPreExplore(tempRoot, 'Read', {
      file_path: path.join(worker, outsideRef),
    }, agentId, { session_id: sessionId, cwd: tempRoot });
    assert.equal(blocked.status, 2, `expected undeclared path to block; stderr=${blocked.stderr}`);
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
