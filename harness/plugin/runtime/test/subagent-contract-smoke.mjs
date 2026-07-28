import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];

const files = {
  harnessSkill: path.join(repoRoot, '.claude', 'skills', 'harness', 'SKILL.md'),
  intakeSkill: path.join(repoRoot, '.claude', 'skills', 'harness-intake', 'SKILL.md'),
  codeAnalysisRule: path.join(repoRoot, '.claude', 'rules', '10-code-analysis.md'),
  codeExploreAgent: path.join(repoRoot, '.claude', 'agents', 'code-explore.md'),
};

const expected = {
  harnessSkill: [
    'Agent 标题必须指向当前目标项目和具体探索主题，禁止写成 `Explore enterprise-harness`',
    '必须等待 subagent 返回结论，并把结论作为后续阶段的事实来源',
    '不得无视结论并重新发起相同的探索',
    '必须使用 `subagent_type: enterprise-harness:code-explore`',
    '不得使用任何通用 fallback 做代码探索',
    '代码探索必须委托 subagent',
  ],
  intakeSkill: [
    'Agent 标题必须指向当前目标项目和具体探索主题，禁止写成 `Explore enterprise-harness codebase`',
    '必须等 subagent 返回结论后再推进；主 orchestrator 不得无视 subagent 结果并重复发起相同探索',
    '不得无视结论并重新探索同一问题',
    '必须通过 Agent 工具派遣 `subagent_type: enterprise-harness:code-explore` 代码探索',
    '不得使用任何通用 fallback 做代码探索',
    '代码探索必须委托 subagent',
  ],
  codeAnalysisRule: ['代码探索必须委托 subagent', 'subagent_type: enterprise-harness:code-explore'],
  codeExploreAgent: ['不要把探索对象笼统写成 `enterprise-harness`、`this repo`、`this codebase`'],
};

const forbidden = {
  harnessSkill: ['subagent_type: code-explore', 'general-purpose 做代码探索'],
  intakeSkill: ['subagent_type: code-explore', 'general-purpose 做代码探索'],
  codeAnalysisRule: ['subagent_type: code-explore'],
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

const failures = [];
for (const [key, file] of Object.entries(files)) {
  const text = readText(file);
  for (const token of expected[key]) {
    if (!text.includes(token)) {
      failures.push(`${path.relative(repoRoot, file)} must include ${token}`);
    }
  }
  for (const token of forbidden[key] || []) {
    if (text.includes(token)) {
      failures.push(`${path.relative(repoRoot, file)} still contains deprecated bare subagent wording: ${token}`);
    }
  }
}
const ok = failures.length === 0;

if (mode === 'red') {
  if (!ok) {
    fail(`Expected subagent orchestration contract to fail before scoped expectations are implemented:\n${failures.join('\n')}`);
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail(`Expected subagent orchestration contract to forbid hardcoded harness titles and redundant re-exploration:\n${failures.join('\n')}`);
}

pass(mode === 'green' ? 'Green subagent-contract smoke passed.' : 'Subagent-contract verify smoke passed.');
