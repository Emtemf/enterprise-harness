import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const specPath = path.join(repoRoot, 'harness', 'specs', 'tdd-execution.md');
const skillPath = path.join(repoRoot, '.claude', 'skills', 'harness-tdd', 'SKILL.md');

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
  console.error('Usage: node harness/plugin/runtime/test/tdd-execution-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const spec = readText(specPath);
const skill = readText(skillPath);
const ok = spec.includes('TDD Execution Contract')
  && spec.includes('tdd-executor')
  && (spec.includes('isolation: "worktree"') || spec.includes('`isolation: "worktree"`') || spec.includes('必须使用 worktree'))
  && spec.includes('mvn test')
  && spec.includes('主 orchestrator 不堆积整段构建输出')
  && spec.includes('Executor 输出 contract')
  && skill.includes('必须使用 subagent 执行 TDD')
  && (skill.includes('Java / Maven 项目：必须执行 `mvn test` / `mvn verify` / `mvn compile`')
    || skill.includes('Java/Maven 项目：必须执行 `mvn test` / `mvn verify` / `mvn compile`'));

if (mode === 'red') {
  if (!ok) {
    fail('Expected TDD execution contract to define executor role, worktree isolation, and mvn-backed evidence');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected TDD execution contract to define executor role, worktree isolation, and mvn-backed evidence');
}

pass(mode === 'green' ? 'Green TDD execution contract smoke passed.' : 'TDD execution contract verify smoke passed.');
