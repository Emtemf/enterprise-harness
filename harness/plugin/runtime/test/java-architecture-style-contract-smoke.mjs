import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const javaStylePath = path.join(repoRoot, '.claude', 'rules', '40-java-style.md');
const javaArchPath = path.join(repoRoot, '.claude', 'rules', '30-java-architecture.md');

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
  console.error('Usage: node harness/plugin/runtime/test/java-architecture-style-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const style = readText(javaStylePath);
const arch = readText(javaArchPath);
const ok = style.includes('复杂业务方法默认采用步骤性注释')
  && style.includes('// 1.')
  && arch.includes('SQL 访问与 persistence mapper 只允许停留在 infrastructure')
  && arch.includes('领域模型默认优先采用充血模型');

if (mode === 'red') {
  if (!ok) {
    fail('Expected Java style/architecture contract to cover stepwise comments, infrastructure-only SQL, and rich domain models');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected Java style/architecture contract to cover stepwise comments, infrastructure-only SQL, and rich domain models');
}

pass(mode === 'green' ? 'Green java architecture/style contract smoke passed.' : 'Java architecture/style contract verify smoke passed.');
