import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSkillPackaging } from '../validators/skill-packaging-validator.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

const result = validateSkillPackaging(path.resolve(root));
assert.ok(result.ok, `skill packaging violations:\n${result.problems.map((p) => `  - ${p}`).join('\n')}`);

console.log('PASS skill-packaging verify');
