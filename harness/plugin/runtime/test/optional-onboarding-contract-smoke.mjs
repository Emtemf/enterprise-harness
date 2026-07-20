import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const harnessPath = path.join(repoRoot, '.claude', 'skills', 'harness', 'SKILL.md');
const installGuidePath = path.join(repoRoot, 'docs', 'zh-cn', 'installation-guide.md');

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
  console.error('Usage: node harness/plugin/runtime/test/optional-onboarding-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const harness = readText(harnessPath);
const installGuide = readText(installGuidePath);
const ok = harness.includes('不得因为缺少 `.harness/`')
  && harness.includes('不能当作必须先完成的前置条件')
  && installGuide.includes('普通用户不需要先初始化 `.harness/`')
  && installGuide.includes('也不应阻止继续通过 `/harness` 澄清需求');

if (mode === 'red') {
  if (!ok) {
    fail('Expected onboarding contract to keep bootstrap/.harness optional for regular users');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected onboarding contract to keep bootstrap/.harness optional for regular users');
}

pass(mode === 'green' ? 'Green optional onboarding contract smoke passed.' : 'Optional onboarding contract verify smoke passed.');
