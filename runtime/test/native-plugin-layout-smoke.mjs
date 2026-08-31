import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const plugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf-8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));

for (const component of ['skills', 'agents', 'hooks']) {
  assert.ok(fs.existsSync(path.join(root, component)), `native plugin ${component}/ directory must exist`);
}
assert.ok(fs.existsSync(path.join(root, 'hooks', 'hooks.json')), 'native hooks/hooks.json must exist');
assert.ok(fs.existsSync(path.join(root, 'hooks', 'scripts')), 'native hooks/scripts directory must exist');
assert.ok((plugin.skills || []).every((entry) => entry.startsWith('./skills/')), 'plugin skills must use root-native paths');
assert.ok((plugin.agents || []).every((entry) => entry.startsWith('./agents/')), 'plugin agents must use root-native paths');
assert.equal(packageJson.version, '0.5.12', 'native package must be release version 0.5.12');
assert.equal(plugin.version, packageJson.version, 'native plugin projection must match package version');
assert.ok(plugin.skills.includes('./skills/test-design/'), 'native plugin must expose test-design for installation discovery');
assert.ok(plugin.agents.includes('./agents/test-design-worker.md'), 'native plugin must expose test-design-worker for installation discovery');
assert.equal(fs.existsSync(path.join(root, '.claude', 'skills')), false, 'candidate repo must not auto-load controller skills');
assert.equal(fs.existsSync(path.join(root, '.claude', 'agents')), false, 'candidate repo must not auto-load controller agents');
assert.equal(fs.existsSync(path.join(root, '.claude', 'rules')), false, 'candidate repo must not auto-load controller rules');

console.log(`PASS native-plugin-layout ${mode}`);
