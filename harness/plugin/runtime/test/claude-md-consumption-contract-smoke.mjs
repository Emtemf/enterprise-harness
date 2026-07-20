import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const intakePath = path.join(repoRoot, '.claude', 'skills', 'harness-intake', 'SKILL.md');
const designPath = path.join(repoRoot, '.claude', 'skills', 'harness-design', 'SKILL.md');
const planPath = path.join(repoRoot, '.claude', 'skills', 'harness-plan', 'SKILL.md');

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
  console.error('Usage: node harness/plugin/runtime/test/claude-md-consumption-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const intake = readText(intakePath);
const design = readText(designPath);
const plan = readText(planPath);
const ok = intake.includes('目标项目的 `CLAUDE.md` / 根目录事实')
  && intake.includes('不得在忽略目标项目 `CLAUDE.md` 的情况下')
  && design.includes('目标项目 `CLAUDE.md`')
  && plan.includes('目标项目 `CLAUDE.md` / 根事实');

if (mode === 'red') {
  if (!ok) {
    fail('Expected staged workflow skills to require consuming target-project CLAUDE.md context');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected staged workflow skills to require consuming target-project CLAUDE.md context');
}

pass(mode === 'green' ? 'Green CLAUDE.md consumption contract smoke passed.' : 'CLAUDE.md consumption contract verify smoke passed.');
