import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requiredPaths } from '../../runtime/lib/checks.mjs';

const mode = process.argv[2] || 'verify';
const root = fileURLToPath(new URL('../../', import.meta.url));

// Skills declared in requiredPaths() dirs
const { dirs } = requiredPaths();
const declaredSkills = dirs
  .filter((d) => d.startsWith('skills/harness'))
  .map((d) => path.basename(d))
  .sort();

// Skills that actually exist on disk
const skillsDir = path.join(root, 'skills');
const actualSkills = fs.readdirSync(skillsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name.startsWith('harness'))
  .map((e) => e.name)
  .sort();

// Declared in requiredPaths() but missing from disk — causes false validation failures
const phantom = declaredSkills.filter((s) => !actualSkills.includes(s));
assert.deepEqual(
  phantom,
  [],
  `requiredPaths() declares skill dirs that don't exist on disk — remove them from checks.mjs:\n  ${phantom.join(', ')}`,
);

// Exist on disk but missing from requiredPaths() — validation silently skips them
const unguarded = actualSkills.filter((s) => !declaredSkills.includes(s));
assert.deepEqual(
  unguarded,
  [],
  `Skill dirs on disk are not guarded by requiredPaths() — add them to checks.mjs:\n  ${unguarded.join(', ')}`,
);

console.log(`PASS required-paths-skills-sync ${mode} (${actualSkills.length} harness skills in sync)`);
