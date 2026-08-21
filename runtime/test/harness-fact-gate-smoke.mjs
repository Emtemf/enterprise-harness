import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const skill = fs.readFileSync(path.join(root, 'skills/harness/SKILL.md'), 'utf-8');

const facts = skill.indexOf('## Phase 1：完成事实探索');
const synthesize = skill.indexOf('## Phase 2：综合事实并建立 topology');
const interview = skill.indexOf('## Phase 3：只澄清 Decisions');
assert.ok(facts >= 0 && synthesize > facts && interview > synthesize,
  'Harness must order fact discovery before synthesis and decision clarification');

for (const contract of [
  'clarify.explore-code',
  'enterprise-harness:explore-code',
  'clarify.research-docs',
  'enterprise-harness:research-docs',
  '等待全部 required lanes',
  '不得调用 `AskUserQuestion`',
  'ResearchPacket',
  'handoff validate',
  'assets/requirements.md.tmpl',
  'scripts/finalize-clarify-result.mjs',
]) {
  assert.ok(skill.includes(contract), `Harness must make ${contract} executable`);
}

assert.equal(/Grill Me|Deep Interview|Superpowers Brainstorming/u.test(skill), false,
  'production Skill must not narrate development provenance');
assert.equal(skill.includes('evals/evals.json'), false,
  'production Skill must not load development eval definitions');

for (const reference of fs.readdirSync(path.join(root, 'skills/harness/references'))) {
  assert.ok(skill.includes(`references/${reference}`), `packaged reference must have a SKILL.md consumption point: ${reference}`);
}

console.log(`PASS harness-fact-gate ${mode}`);
