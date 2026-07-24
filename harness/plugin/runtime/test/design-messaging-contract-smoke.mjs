import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const designSkillPath = path.join(repoRoot, '.claude', 'skills', 'harness-design', 'SKILL.md');
const designTemplatePath = path.join(repoRoot, 'harness', 'templates', 'design.md');

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
  console.error('Usage: node harness/plugin/runtime/test/design-messaging-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const designSkill = readText(designSkillPath);
const designTemplate = readText(designTemplatePath);

// TECPC-driven design checks
const ok = designSkill.includes('闭环五检')
  && designSkill.includes('T 目标')
  && designSkill.includes('C 上下文')
  && designSkill.includes('E 证据')
  && designSkill.includes('P 路径')
  && designTemplate.includes('## T 目标')
  && designTemplate.includes('## C 上下文')
  && designTemplate.includes('## E 证据')
  && designTemplate.includes('## P 路径')
  && designTemplate.includes('### P 纠正预案')
  && designTemplate.includes('Design Self-Review');

if (mode === 'red') {
  if (!ok) {
    fail('Expected TECPC-driven design contract');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected TECPC-driven design contract');
}

pass(mode === 'green' ? 'Green design TECPC contract smoke passed.' : 'Design TECPC contract verify smoke passed.');
