import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const tddSkillPath = path.join(repoRoot, '.claude', 'skills', 'harness-tdd', 'SKILL.md');
const tasksTemplatePath = path.join(repoRoot, 'harness', 'templates', 'tasks.md');

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
  console.error('Usage: node harness/plugin/runtime/test/tdd-build-command-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const tddText = readText(tddSkillPath);
const tasksText = readText(tasksTemplatePath);
const ok = tddText.includes('已读取当前项目的 `CLAUDE.md` / 项目根事实')
  && tddText.includes('目标项目真实构建/测试命令')
  && tddText.includes('Java / Maven 项目默认应优先调用 `mvn test` / `mvn verify`')
  && tasksText.includes('**Project-native Build/Test Command**')
  && tasksText.includes('Why this command is authoritative for the target project');

if (mode === 'red') {
  if (!ok) {
    fail('Expected TDD contract to require project-native build/test commands and CLAUDE.md awareness');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected TDD contract to require project-native build/test commands and CLAUDE.md awareness');
}

pass(mode === 'green' ? 'Green TDD build command contract smoke passed.' : 'TDD build command contract verify smoke passed.');
