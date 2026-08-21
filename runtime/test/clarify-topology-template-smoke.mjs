import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const template = fs.readFileSync(path.join(root, 'skills', 'harness', 'assets', 'requirements.md.tmpl'), 'utf-8');
for (const token of [
  '组件拓扑',
  'component × unresolved dimension',
  'Frontier',
  '条件分支',
  'API/Data',
  '一次一个',
  'ResearchPacket',
  '分数（0-5）',
  'Gap / unresolved decision',
  'Gap type',
  'Owner / status',
  'Options / recommendation',
  '上轮分数',
  '本轮分数',
  '用户确认 / 修正',
  'Evidence ledger',
  'Predicate coverage',
  'Evidence refs',
  'Authentication decision surfaces',
  'identity-source',
  'session-lifecycle',
  'failure-abuse',
]) assert.ok(template.includes(token), `requirements template must include ${token}`);
assert.equal(template.includes('## P 路由'), false, 'v6 requirements template must not prescribe route as a lifecycle artifact');
assert.equal(template.includes('七维歧义评分'), false, 'v6 requirements template must not prescribe fixed seven-dimension scoring');
console.log(`PASS clarify-topology-template ${mode}`);
