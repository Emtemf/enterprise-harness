import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertSafeId } from './lib/safe-paths.mjs';
import { bindSession, readSession, sessionIdFromEnv } from './lib/sessions.mjs';
import { bindLatestPromptReceipt } from './lib/prompt-receipts.mjs';

const repoRoot = process.cwd();
// 兄弟 runtime 脚本相对本文件自身目录定位，不依赖调用方 cwd。
const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
const [, , changeId, owner = 'harness-governance', tier = 'L1', topic = 'minimum-discovery'] = process.argv;

if (!changeId || changeId === '--help' || changeId === '-h') {
  console.log('Enterprise Harness Start Change');
  console.log('Usage: node runtime/start-change.mjs <change-id> [owner] [tier] [topic]');
  console.log('Creates the minimum change scaffold, prepares one exploration artifact, and sets the active change.');
  process.exit(changeId ? 0 : 1);
}

try {
  assertSafeId(changeId, 'changeId');
} catch (error) {
  console.error(`BLOCK [EH-PATH-001] ${error.message}`);
  process.exit(2);
}

function run(args) {
  const child = spawnSync('node', [path.join(runtimeDir, 'lifecycle.mjs'), ...args], {
    cwd: repoRoot,
    encoding: 'utf-8',
  });
  process.stdout.write(child.stdout || '');
  process.stderr.write(child.stderr || '');
  if (child.status !== 0) {
    process.exit(child.status ?? 1);
  }
}

function assertSessionCanBind() {
  const sessionId = sessionIdFromEnv();
  if (!sessionId) return;
  const existing = readSession(repoRoot, sessionId);
  if (existing && (existing.changeId !== changeId || existing.worktreePath !== repoRoot)) {
    throw new Error(`EH-SESSION-CONFLICT-001: ${sessionId} is already bound to ${existing.changeId}`);
  }
}

function bindCurrentSession() {
  const sessionId = sessionIdFromEnv();
  if (!sessionId) return;
  const binding = bindSession(repoRoot, {
    sessionId,
    changeId,
    worktreePath: process.env.ENTERPRISE_HARNESS_WORKTREE_PATH || repoRoot,
    subjectRoot: repoRoot,
    controllerRevision: process.env.ENTERPRISE_HARNESS_CONTROLLER_REVISION || 'released-controller',
  });
  console.log(`Session bound: ${binding.sessionId} -> ${binding.changeId}`);
}

console.log('Enterprise Harness Start Change');
console.log(`Repo: ${repoRoot}`);
console.log(`changeId=${changeId} owner=${owner} tier=${tier}`);

assertSessionCanBind();
bindCurrentSession();
run(['scaffold', changeId, owner, tier, topic]);
const currentSessionId = sessionIdFromEnv();
if (currentSessionId) {
  const promptBinding = bindLatestPromptReceipt(repoRoot, changeId, currentSessionId);
  if (!promptBinding) {
    console.error('WARN [EH-PROMPT-RECEIPT-154] 当前 session 没有 UserPromptSubmit receipt；Clarify 在绑定真实用户请求前不会放行。');
  }
}
if (topic && topic !== '-' && topic !== 'none') {
  run(['exploration', changeId, topic]);
}
run(['active', changeId]);

console.log('Next Steps:');
console.log('- 在 Claude Code 会话中，从 /harness 继续推进 clarify。');
console.log('- 当前 change 处于 v6 stage=clarify，完成需求澄清和分类后推进到 design。');
console.log('- classification 是内部 durable action，不是用户可见 stage。');
