import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const tddSkillPath = path.join(repoRoot, '.claude', 'skills', 'harness-tdd', 'SKILL.md');

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
  console.error('Usage: node harness/plugin/runtime/test/tdd-subagent-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const text = readText(tddSkillPath);
const ok = text.includes('默认应下沉给专职 worker / subagent 执行 RED/GREEN/REFACTOR')
  && text.includes('必须使用 worker / subagent 执行这些真实构建命令')
  && text.includes('主上下文只保留结果摘要')
  && text.includes('Java / Maven 项目必须执行 `mvn test` / `mvn verify`')
  && text.includes('worktree')
  && text.includes('禁止在主对话中直接')
  && text.includes('禁止只写测试文件而不运行构建命令');

if (mode === 'red') {
  if (!ok) {
    fail('Expected TDD contract to prefer worker/subagent execution with project-native build commands');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected TDD contract to prefer worker/subagent execution with project-native build commands');
}

pass(mode === 'green' ? 'Green TDD subagent contract smoke passed.' : 'TDD subagent contract verify smoke passed.');
