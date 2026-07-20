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
const ok = designSkill.includes('消息/事件/MQ 设计')
  && designSkill.includes('Messaging / Event / MQ design')
  && designTemplate.includes('## Messaging / Event / MQ Design')
  && designTemplate.includes('Broker / topic / queue:')
  && designTemplate.includes('Producer / consumer responsibility:')
  && designTemplate.includes('Retry / DLQ / replay / timeout:');

if (mode === 'red') {
  if (!ok) {
    fail('Expected design contract to require messaging/event/MQ design');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected design contract to require messaging/event/MQ design');
}

pass(mode === 'green' ? 'Green design messaging contract smoke passed.' : 'Design messaging contract verify smoke passed.');
