import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const skill = fs.readFileSync(path.join(root, 'skills/harness/SKILL.md'), 'utf-8');
const research = fs.readFileSync(path.join(root, 'skills/harness/references/clarify-research.md'), 'utf-8');
const decisions = fs.readFileSync(path.join(root, 'skills/harness/references/clarify-decisions.md'), 'utf-8');
const completion = fs.readFileSync(path.join(root, 'skills/harness/references/clarify-completion.md'), 'utf-8');

const facts = skill.indexOf('references/clarify-research.md');
const synthesize = skill.indexOf('references/clarify-decisions.md');
const complete = skill.indexOf('references/clarify-completion.md');
assert.ok(facts >= 0 && synthesize > facts && complete > synthesize,
  'Harness must order fact discovery before synthesis and decision clarification');

const corpus = [skill, research, decisions, completion].join('\n');
for (const contract of [
  'clarify.explore-code',
  'enterprise-harness:explore-code',
  'clarify.research-docs',
  'enterprise-harness:research-docs',
  '等待全部 required lanes',
  '不得产生任何 user question',
  'ResearchPacket',
  'handoff validate',
  'assets/requirements.md.tmpl',
  'scripts/finalize-clarify-result.mjs',
]) {
  assert.ok(corpus.includes(contract), `Harness must make ${contract} executable`);
}

assert.equal(/Grill Me|Deep Interview|Superpowers Brainstorming/u.test(skill), false,
  'production Skill must not narrate development provenance');
assert.equal(skill.includes('evals/evals.json'), false,
  'production Skill must not load development eval definitions');

for (const reference of fs.readdirSync(path.join(root, 'skills/harness/references'))) {
  assert.ok(skill.includes(`references/${reference}`), `packaged reference must have a SKILL.md consumption point: ${reference}`);
}

console.log(`PASS harness-fact-gate ${mode}`);
