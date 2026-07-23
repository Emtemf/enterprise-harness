import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];

const files = {
  harnessSkill: path.join(repoRoot, '.claude', 'skills', 'harness', 'SKILL.md'),
  intakeSkill: path.join(repoRoot, '.claude', 'skills', 'harness-intake', 'SKILL.md'),
  codeExploreAgent: path.join(repoRoot, '.claude', 'agents', 'code-explore.md'),
  impactExploreAgent: path.join(repoRoot, '.claude', 'agents', 'impact-explore.md'),
  expectedBehavior: path.join(repoRoot, 'docs', 'zh-cn', 'expected-behavior-checklist.md'),
  lifecycleTruth: path.join(repoRoot, 'docs', 'zh-cn', 'full-lifecycle-truth.md'),
};

const expected = {
  harnessSkill: [
    'Agent 标题必须指向当前目标项目和具体探索主题，禁止写成 `Explore enterprise-harness`',
    '必须等待 subagent 返回结论，并把结论作为后续阶段的事实来源',
    '不得无视结论并重新发起相同的探索',
    '必须使用 `subagent_type: code-explore`',
    '不得使用 `general-purpose` 做代码探索',
    '代码探索必须委托 subagent',
  ],
  intakeSkill: [
    'Agent 标题必须指向当前目标项目和具体探索主题，禁止写成 `Explore enterprise-harness codebase`',
    '必须等 subagent 返回结论后再推进；主 orchestrator 不得无视 subagent 结果并重复发起相同探索',
    '不得无视结论并重新探索同一问题',
    '必须使用 `subagent_type: code-explore`',
    '不得使用 `general-purpose` 做代码探索',
    '代码探索必须委托 subagent',
  ],
  codeExploreAgent: ['不要把探索对象笼统写成 `enterprise-harness`、`this repo`、`this codebase`'],
  impactExploreAgent: ['禁止笼统写成 `Explore enterprise-harness` / `Explore this repo`'],
  expectedBehavior: [
    'subagent 的任务标题应该指向**当前用户项目**或具体探索主题，而不是写成 `Explore enterprise-harness codebase`',
    'subagent 完成后，主 agent 应基于 subagent 结论继续，而不是忽略它并重新探索相同问题',
    '主 agent 忽略 subagent 结果又自己探索',
  ],
  lifecycleTruth: [
    'subagent 的任务标题必须指向当前用户项目与具体探索主题，不得写成 `Explore enterprise-harness`',
    'subagent 返回结论后，主 orchestrator 应消费结论并基于事实继续推进，不得忽略结论后重新发起相同探索',
    'subagent 已返回结论但主 agent 忽略结论并重新探索',
  ],
};

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
  console.error('Usage: node harness/plugin/runtime/test/subagent-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const ok = Object.entries(files).every(([key, file]) => expected[key].every((token) => readText(file).includes(token)));

if (mode === 'red') {
  if (!ok) {
    fail('Expected subagent orchestration contract to forbid hardcoded harness titles and redundant re-exploration');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected subagent orchestration contract to forbid hardcoded harness titles and redundant re-exploration');
}

pass(mode === 'green' ? 'Green subagent-contract smoke passed.' : 'Subagent-contract verify smoke passed.');
