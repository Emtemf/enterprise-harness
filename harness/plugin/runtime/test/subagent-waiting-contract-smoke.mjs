import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const harnessSkillPath = path.join(repoRoot, '.claude', 'skills', 'harness', 'SKILL.md');
const workflowRulePath = path.join(repoRoot, '.claude', 'rules', '00-workflow.md');
const claudeMdPath = path.join(repoRoot, 'CLAUDE.md');

function readText(file) {
  return fs.readFileSync(file, 'utf-8');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/subagent-waiting-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const harnessSkill = readText(harnessSkillPath);
const workflowRule = readText(workflowRulePath);
const claudeMd = readText(claudeMdPath);

const harnessOk = harnessSkill.includes('等待 subagent / 后台任务时禁止轮询刷屏')
  && harnessSkill.includes('不得再用 `sleep`、倒计时、循环“继续等待”')
  && harnessSkill.includes('等待 Claude Code 的完成通知或用户下一条真实消息')
  && harnessSkill.includes('不得在已启动可通知任务后通过 `sleep`、倒计时、循环“继续等待”或反复状态播报来刷屏');

const workflowOk = workflowRule.includes('等待已启动的可通知任务时，主 orchestrator 禁止轮询刷屏')
  && workflowRule.includes('不得再通过 `sleep`、倒计时、循环“继续等待”或重复状态播报来占用对话');

const claudeOk = claudeMd.includes('等待 subagent / 后台任务时禁止轮询刷屏')
  && claudeMd.includes('主 orchestrator 不得通过 `sleep`、倒计时、循环“继续等待”');

const ok = harnessOk && workflowOk && claudeOk;

if (mode === 'red') {
  if (!ok) {
    fail('Expected subagent waiting contract to forbid polling loops and rely on Claude Code notifications');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected subagent waiting contract to forbid polling loops and rely on Claude Code notifications');
}

pass(mode === 'green'
  ? 'Green subagent-waiting contract smoke passed.'
  : 'Subagent-waiting contract verify smoke passed.');
