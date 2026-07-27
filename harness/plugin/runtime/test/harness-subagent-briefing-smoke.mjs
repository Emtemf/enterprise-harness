import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const harnessSkillPath = path.join(repoRoot, '.claude', 'skills', 'harness', 'SKILL.md');

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
  console.error('Usage: node harness/plugin/runtime/test/harness-subagent-briefing-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const text = readText(harnessSkillPath);
const ok = text.includes('高噪声步骤必须先做任务摘要')
  && text.includes('task brief / exploration brief')
  && text.includes('再派 subagent')
  && text.includes('主对话只消费压缩结论')
  && text.includes('不堆积实现/探索过程原文');

if (mode === 'red') {
  if (!ok) {
    fail('Expected /harness to require a brief-before-subagent pattern for high-noise steps');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected /harness to require a brief-before-subagent pattern for high-noise steps');
}

pass(mode === 'green' ? 'Green harness subagent briefing smoke passed.' : 'Harness subagent briefing verify smoke passed.');
