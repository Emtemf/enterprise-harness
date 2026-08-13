import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const skillsRoot = path.join(root, 'skills');
const referenceRoot = path.join(skillsRoot, 'harness', 'reference');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf-8');
const references = fs.readdirSync(referenceRoot, { recursive: true })
  .filter((entry) => entry.endsWith('.md'))
  .map((entry) => `skills/harness/reference/${entry.replaceAll(path.sep, '/')}`)
  .sort();
const canonicalSkills = ['harness', 'explore-code', 'research-docs', 'design', 'plan', 'implement', 'review', 'verify', 'archive'];
const corpus = canonicalSkills.map((skill) => read(`skills/${skill}/SKILL.md`)).join('\n');

assert.ok(references.length > 0, 'reference directory must contain markdown contracts');
for (const reference of ['behavior-map.md', 'stage-decisions.md', 'protocol/checker-verdict-contract.md', 'protocol/checker-verdicts.md', 'protocol/executor-minimal.md', 'protocol/executor-result-contract.md']) {
  assert.ok(references.includes(`skills/harness/reference/${reference}`), `missing ${reference}`);
}
assert.match(read('skills/harness/SKILL.md'), /six-stage|clarify.*design.*plan.*implement.*verify.*archive/us);
assert.match(read('skills/review/SKILL.md'), /TECPC/u);
assert.match(read('skills/implement/SKILL.md'), /RED/u);
assert.match(read('skills/verify/SKILL.md'), /fresh/u);
assert.match(read('agents/reviewer.md'), /unsupported/u);
assert.match(read('agents/implementer.md'), /receipt/u);

console.log(`PASS reference-wiring-contract verify (${references.length} references)`);
