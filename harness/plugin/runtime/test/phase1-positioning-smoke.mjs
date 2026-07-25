import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const phase1Path = path.join(repoRoot, 'harness', 'specs', 'claude-code-only-phase1.md');
const blueprintPath = path.join(repoRoot, 'harness', 'specs', 'claude-code-only-phase1-blueprint.md');
const upstreamPath = path.join(repoRoot, 'harness', 'specs', 'upstream-mapping.md');
const boundaryPath = path.join(repoRoot, 'harness', 'specs', 'agent-skill-boundary.md');
const claudePath = path.join(repoRoot, 'CLAUDE.md');
const readmePath = path.join(repoRoot, 'README.md');

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
  console.error('Usage: node harness/plugin/runtime/test/phase1-positioning-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const phase1 = readText(phase1Path);
const blueprint = readText(blueprintPath);
const upstream = readText(upstreamPath);
const boundary = readText(boundaryPath);
const claude = readText(claudePath);
const readme = readText(readmePath);
const ok = phase1.includes('Claude Code-only 不等于删除 `harness/`')
  && phase1.includes('CodeGraph-first')
  && phase1.includes('Context7-first')
  && blueprint.includes('repo truth / durable assets 层（保留在 `harness/`）')
  && blueprint.includes('探索能力层（CodeGraph / Context7）')
  && upstream.includes('CodeGraph')
  && upstream.includes('Context7')
  && boundary.includes('CodeGraph / Context7 探索能力层')
  && claude.includes('Claude Code-only 不等于删除 `harness/` 目录')
  && readme.includes('Claude Code-only phase 1')
  && readme.includes('CodeGraph / Context7：phase 1 的双探索亮点');

if (mode === 'red') {
  if (!ok) {
    fail('Expected phase1 positioning docs to preserve harness repo truth layer and highlight CodeGraph/Context7 lanes');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected phase1 positioning docs to preserve harness repo truth layer and highlight CodeGraph/Context7 lanes');
}

pass(mode === 'green' ? 'Green phase1 positioning smoke passed.' : 'Phase1 positioning smoke passed.');
