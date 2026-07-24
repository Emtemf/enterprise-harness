import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const harnessPath = path.join(repoRoot, '.claude', 'skills', 'harness', 'SKILL.md');
const stageSkillPaths = [
  path.join(repoRoot, '.claude', 'skills', 'harness-design', 'SKILL.md'),
  path.join(repoRoot, '.claude', 'skills', 'harness-plan', 'SKILL.md'),
  path.join(repoRoot, '.claude', 'skills', 'harness-tdd', 'SKILL.md'),
  path.join(repoRoot, '.claude', 'skills', 'harness-verify', 'SKILL.md'),
];
const harnessTokens = [
  '统一流程入口与阶段编排器',
  'clarify / route / design / plan / tdd / verify / archive',
  '先进入 `clarify`',
  '恢复入口',
  'code-explore',
  'doc-research',
  '优先补事实再问用户',
  '`requirements.md` 缺失',
  '`state.json.state` 仍在 `DRAFT` / `DISCOVERED`',
  '`state.json.state` 为 `TASKED` / `EXECUTING`',
  '当前为何还不能进入下一阶段',
];

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
  console.error('Usage: node harness/plugin/runtime/test/harness-stage-router-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const harnessText = readText(harnessPath);
const harnessOk = harnessTokens.every((token) => harnessText.includes(token));
const stageSkillsOk = stageSkillPaths.every((file) => fs.existsSync(file) && readText(file).includes('## 目标'));

if (mode === 'red') {
  if (!harnessOk || !stageSkillsOk) {
    fail('Expected /harness to act as a clarify-first stage router with stage skill mappings');
  }
  pass('Red precondition no longer holds.');
}

if (!harnessOk) {
  fail('Expected /harness to act as a clarify-first stage router with stage skill mappings');
}
if (!stageSkillsOk) {
  fail('Expected design/plan/tdd/verify stage skill skeletons to exist');
}

pass(mode === 'green' ? 'Green harness-stage-router smoke passed.' : 'Harness-stage-router verify smoke passed.');
