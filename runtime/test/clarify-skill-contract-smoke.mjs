import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const skill = fs.readFileSync(path.join(root, 'skills/harness/SKILL.md'), 'utf-8');
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

for (const token of [
  'assets/research-brief.md.tmpl',
  'assets/question-candidate.json.tmpl',
  'assets/debt-assessment.json.tmpl',
  'assets/project-contract-assessment.json.tmpl',
  'references/output-contract.md',
  'references/clarify-few-shots.md',
  'clarify prepare-question',
  'clarify validate-debt',
  'clarify validate-project-contract',
  'finalize-clarify-result.mjs',
]) assert.match(skill, new RegExp(escapeRegExp(token), 'u'), `Harness must reference ${token}`);

const dispatch = skill.indexOf('dispatch all required lanes');
const ask = skill.indexOf('AskUserQuestion', dispatch);
assert.ok(dispatch >= 0 && ask > dispatch,
  'Harness must dispatch all required lanes before AskUserQuestion');
assert.match(skill, /(?:一次只|exactly)\s*(?:生成|询问|调用)?\s*(?:one|一个)(?:\s*question|问题)/iu,
  'Harness must authorize exactly one question at a time');
assert.match(skill, /(?:不得|禁止|do not)\s*(?:创建、修改或)?(?:写入|修改|write)\s*`?CLAUDE\.md`?/iu,
  'Harness must forbid writing CLAUDE.md in this slice');

console.log(`PASS clarify-skill-contract ${mode}`);
