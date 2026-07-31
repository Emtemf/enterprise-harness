import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = process.cwd();
const preAgent = path.join(sourceRoot, 'harness/plugin/runtime/hooks/pre-agent.mjs');
const changeId = 'bare-agent-probe';

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-bare-agent-'));
  fs.mkdirSync(path.join(root, 'harness/changes', changeId), { recursive: true });
  fs.writeFileSync(path.join(root, 'harness/ACTIVE_CHANGE'), `${changeId}\n`);
  fs.writeFileSync(path.join(root, 'harness/changes', changeId, 'state.json'), `${JSON.stringify({ changeId })}\n`);
  spawnSync('git', ['init', '-q'], { cwd: root });
  return root;
}

function run(root, subagentType, prompt = 'do the thing') {
  return spawnSync('node', [preAgent], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
    input: JSON.stringify({
      tool_name: 'Agent',
      tool_input: { subagent_type: subagentType, prompt },
    }),
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

// 开发通道（hook 从仓库工作目录运行）下，Claude Code 的 agent registry 只有裸名，
// 派 `enterprise-harness:code-explore` 会 agent-not-found。此时 hook 不得因缺少
// 前缀而 BLOCK，否则任何受治理 subagent 都派不出去。
check('A: bare harness agent type must not be rejected for lacking the plugin prefix', () => {
  const root = makeRoot();
  try {
    const result = run(root, 'code-explore');
    assert.doesNotMatch(
      String(result.stderr || ''),
      /must be scoped/u,
      'bare agent type must not be blocked purely for missing the enterprise-harness: prefix',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// 治理不放松：裸名仍必须携带 HANDOFF_INPUT，和 scoped 名字一视同仁。
check('B: bare harness agent type still requires HANDOFF_INPUT', () => {
  const root = makeRoot();
  try {
    const result = run(root, 'code-explore');
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /HANDOFF_INPUT/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

check('C: scoped harness agent type still requires HANDOFF_INPUT', () => {
  const root = makeRoot();
  try {
    const result = run(root, 'enterprise-harness:code-explore');
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /HANDOFF_INPUT/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

check('D: non-harness agent types stay untouched', () => {
  const root = makeRoot();
  try {
    const result = run(root, 'general-purpose');
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr=${result.stderr}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

if (failures.length > 0) {
  console.error('bare-agent-dispatch-smoke failed.');
  for (const item of failures) console.error(`  - ${item}`);
  process.exit(1);
}
console.log(`PASS bare-agent-dispatch ${mode}`);
