import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const root = path.resolve(process.env.EH_NATIVE_PLUGIN_ROOT || sourceRoot);
const sourcePackageVersion = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json'), 'utf-8')).version;
const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

if (mode === 'red') {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-native-plugin-red-'));
  try {
    for (const entry of ['.claude-plugin', 'package.json', 'skills', 'agents', 'hooks']) {
      fs.cpSync(path.join(sourceRoot, entry), path.join(fixture, entry), { recursive: true });
    }
    const packagePath = path.join(fixture, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    packageJson.version = '0.5.11';
    fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'verify'], {
      cwd: sourceRoot,
      encoding: 'utf-8',
      env: { ...process.env, EH_NATIVE_PLUGIN_ROOT: fixture },
      shell: false,
    });
    assert.notEqual(result.status, 0, 'version drift must fail native plugin validation');
    assert.match(`${result.stdout}\n${result.stderr}`, /0\.5\.12|version/u);
    console.log('PASS native-plugin-layout red negative-mutation (version drift rejected)');
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
  process.exit(0);
}
const plugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf-8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));

for (const component of ['skills', 'agents', 'hooks']) {
  assert.ok(fs.existsSync(path.join(root, component)), `native plugin ${component}/ directory must exist`);
}
assert.ok(fs.existsSync(path.join(root, 'hooks', 'hooks.json')), 'native hooks/hooks.json must exist');
assert.ok(fs.existsSync(path.join(root, 'hooks', 'scripts')), 'native hooks/scripts directory must exist');
assert.ok((plugin.skills || []).every((entry) => entry.startsWith('./skills/')), 'plugin skills must use root-native paths');
assert.ok((plugin.agents || []).every((entry) => entry.startsWith('./agents/')), 'plugin agents must use root-native paths');
assert.equal(packageJson.version, sourcePackageVersion, 'native package must declare the source release version');
assert.equal(plugin.version, packageJson.version, 'native plugin projection must match package version');
assert.ok(plugin.skills.includes('./skills/test-design/'), 'native plugin must expose test-design for installation discovery');
assert.ok(plugin.agents.includes('./agents/test-design-worker.md'), 'native plugin must expose test-design-worker for installation discovery');
assert.equal(fs.existsSync(path.join(root, '.claude', 'skills')), false, 'candidate repo must not auto-load controller skills');
assert.equal(fs.existsSync(path.join(root, '.claude', 'agents')), false, 'candidate repo must not auto-load controller agents');
assert.equal(fs.existsSync(path.join(root, '.claude', 'rules')), false, 'candidate repo must not auto-load controller rules');

console.log(`PASS native-plugin-layout ${mode}`);
