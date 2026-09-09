import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendAgentEvent } from '../lib/agent-evidence.mjs';
import { bindSession } from '../lib/sessions.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const hook = path.join(repoRoot, 'hooks', 'scripts', 'pre-explore.mjs');

function fixture({ agentId = 'budget-agent', agentType = 'enterprise-harness:code-explore' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-explore-budget-'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  const changeId = 'budget-change';
  fs.mkdirSync(path.join(root, 'harness', 'changes', changeId), { recursive: true });
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`);
  fs.writeFileSync(path.join(root, 'harness', 'changes', changeId, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    changeId,
    stage: 'clarify',
    lifecycle: 'active',
    currentTask: null,
  })}\n`);
  bindSession(root, {
    sessionId: 'budget-session',
    changeId,
    worktreePath: root,
    subjectRoot: root,
    controllerRevision: 'budget-smoke',
  });
  appendAgentEvent(root, changeId, {
    kind: 'start',
    sessionId: 'budget-session',
    agentId,
    observedAgentType: agentType,
  });
  return root;
}

function invoke(root, toolName, toolInput, index, agentId = 'budget-agent') {
  return spawnSync(process.execPath, [hook], {
    cwd: root,
    encoding: 'utf8',
    input: JSON.stringify({
      tool_name: toolName,
      tool_input: toolInput,
      tool_use_id: `budget-${index}`,
      session_id: 'budget-session',
      agent_id: agentId,
      cwd: root,
    }),
  });
}

function establishAttempt(root) {
  const result = invoke(root, 'mcp__plugin_enterprise-harness_codegraph__codegraph_search', {
    query: 'OrderService',
    projectPath: root,
  }, 'codegraph');
  assert.equal(result.status, 0, result.stderr);
}

const failures = [];
function check(label, run) {
  const root = fixture();
  try { run(root); } catch (error) { failures.push(`${label}: ${error.message}`); } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

check('only two discovery Globs are allowed', (root) => {
  establishAttempt(root);
  assert.equal(invoke(root, 'Glob', { path: root, pattern: 'src/**/*Order*.java' }, 1).status, 0);
  assert.equal(invoke(root, 'Glob', { path: root, pattern: '**/{*Order*Test*,AGENTS.md,CLAUDE.md}' }, 2).status, 0);
  const third = invoke(root, 'Glob', { path: root, pattern: 'src/**/*.java' }, 3);
  assert.equal(third.status, 2, `third Glob must block; stderr=${third.stderr}`);
  assert.match(third.stderr, /fallback budget/iu);
});

check('only one CodeGraph query is allowed', (root) => {
  establishAttempt(root);
  const second = invoke(root, 'mcp__plugin_enterprise-harness_codegraph__codegraph_explore', {
    query: 'OrderStatus', projectPath: root,
  }, 'codegraph-second');
  assert.equal(second.status, 2, `second CodeGraph call must block; stderr=${second.stderr}`);
  assert.match(second.stderr, /CodeGraph.*上限 1/iu);
});

check('Context7 resolve and query budgets are bounded', () => {
  const root = fixture({ agentId: 'docs-agent', agentType: 'enterprise-harness:doc-research' });
  try {
    const firstResolve = invoke(root, 'mcp__plugin_enterprise-harness_context7__resolve-library-id', { libraryName: 'stripe-java' }, 1, 'docs-agent');
    assert.equal(firstResolve.status, 0, firstResolve.stderr);
    const secondResolve = invoke(root, 'mcp__plugin_enterprise-harness_context7__resolve-library-id', { libraryName: 'stripe' }, 2, 'docs-agent');
    assert.equal(secondResolve.status, 2, secondResolve.stderr);
    const firstQuery = invoke(root, 'mcp__plugin_enterprise-harness_context7__query-docs', { libraryId: '/stripe/stripe-java', query: 'refund idempotency' }, 3, 'docs-agent');
    assert.equal(firstQuery.status, 0, firstQuery.stderr);
    const secondQuery = invoke(root, 'mcp__plugin_enterprise-harness_context7__query-docs', { libraryId: '/stripe/stripe-java', query: 'same key retry' }, 4, 'docs-agent');
    assert.equal(secondQuery.status, 0, secondQuery.stderr);
    const third = invoke(root, 'mcp__plugin_enterprise-harness_context7__query-docs', { libraryId: '/stripe/stripe-java', query: 'extra API details' }, 5, 'docs-agent');
    assert.equal(third.status, 2, `third Context7 query must block; stderr=${third.stderr}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

check('only one focused Grep is allowed', (root) => {
  establishAttempt(root);
  assert.equal(invoke(root, 'Grep', { path: 'src/main/java', pattern: 'OrderService' }, 1).status, 0);
  const second = invoke(root, 'Grep', { path: 'src/main/java', pattern: 'OrderStatus' }, 2);
  assert.equal(second.status, 2, `second Grep must block; stderr=${second.stderr}`);
});

check('at most six focused Reads are allowed', (root) => {
  establishAttempt(root);
  for (let index = 1; index <= 6; index += 1) {
    assert.equal(invoke(root, 'Read', { file_path: `src/main/java/Order${index}.java` }, index).status, 0);
  }
  const seventh = invoke(root, 'Read', { file_path: 'src/main/java/Order7.java' }, 7);
  assert.equal(seventh.status, 2, `seventh Read must block; stderr=${seventh.stderr}`);
});

{
  const root = fixture();
  try {
    establishAttempt(root);
    const results = await Promise.all(Array.from({ length: 6 }, (_, index) => new Promise((resolve) => {
      const child = spawn(process.execPath, [hook], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('close', (status) => resolve({ status, stderr }));
      child.stdin.end(JSON.stringify({
        tool_name: 'Grep',
        tool_input: { path: 'src/main/java', pattern: `Order${index}` },
        tool_use_id: `parallel-${index}`,
        session_id: 'budget-session',
        agent_id: 'budget-agent',
        cwd: root,
      }));
    })));
    const admitted = results.filter(({ status }) => status === 0).length;
    if (admitted !== 1) failures.push(`parallel budget claim: expected exactly one admission, got ${admitted}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

if (mode === 'red') {
  assert.ok(failures.length > 0, 'fallback budget already enforced; choose a new RED target');
  console.log(`RED pre-explore-budget: ${failures.join('; ')}`);
} else {
  assert.deepEqual(failures, [], failures.join('\n'));
  console.log(`PASS pre-explore-budget ${mode}`);
}
