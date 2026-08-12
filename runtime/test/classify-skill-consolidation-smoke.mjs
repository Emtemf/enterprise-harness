import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const plugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/plugin.json'), 'utf-8'));
const checks = JSON.parse(fs.readFileSync(path.join(root, 'harness/behavior-checks.json'), 'utf-8'));
assert.equal(fs.existsSync(path.join(root, 'skills/harness-route')), false);
assert.equal(plugin.skills.some((entry) => entry.includes('/harness-route/')), false);
assert.equal(checks.behaviors['route.decide'].stage, 'classify');
assert.equal(checks.behaviors['route.explore-code'].stage, 'classify');
console.log('PASS classify-skill-consolidation verify');
