import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] || 'verify';
const sourceRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const installer = path.join(sourceRoot, 'bin', 'install.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-installer-'));

function git(...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function install(...args) {
  return spawnSync(process.execPath, [installer, '--target', root, ...args], {
    cwd: sourceRoot,
    encoding: 'utf-8',
    shell: false,
  });
}

try {
  git('init', '-q');
  git('config', 'user.email', 'harness@example.invalid');
  git('config', 'user.name', 'Harness Smoke');
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# User contract\n');
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'settings.json'), `${JSON.stringify({
    permissions: { allow: ['Read'] },
    hooks: {
      Stop: [{ hooks: [{ type: 'command', command: 'node user-stop.mjs' }] }],
    },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(root, 'pom.xml'), '<project/>\n');
  git('add', '.');
  git('commit', '-qm', 'baseline');

  const dryRun = install('--dry-run', '--plan-json');
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.equal(fs.existsSync(path.join(root, '.claude', 'skills')), false);

  const conflictPath = path.join(root, '.claude', 'skills', 'harness', 'SKILL.md');
  fs.mkdirSync(path.dirname(conflictPath), { recursive: true });
  fs.writeFileSync(conflictPath, 'user-owned skill\n');
  const conflict = install();
  assert.equal(conflict.status, 2);
  assert.match(conflict.stderr, /EH-INSTALL-CONFLICT-003/u);
  assert.equal(fs.readFileSync(conflictPath, 'utf-8'), 'user-owned skill\n');
  fs.rmSync(path.join(root, '.claude', 'skills'), { recursive: true, force: true });

  const installed = install();
  assert.equal(installed.status, 0, installed.stderr);
  assert.equal(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8'), '# User contract\n');
  assert.equal(fs.existsSync(path.join(root, 'PROGRESS.md')), false);
  assert.equal(fs.existsSync(path.join(root, 'harness', 'changes')), false);
  assert.equal(fs.existsSync(path.join(root, 'harness', 'archive')), false);
  assert.equal(fs.existsSync(path.join(root, 'harness', 'plugin', 'runtime', 'test')), false);
  assert.equal(fs.existsSync(path.join(root, 'harness', 'evidence-policy.json')), true);
  const commandPolicy = JSON.parse(fs.readFileSync(path.join(root, 'harness', 'command-policy.json'), 'utf-8'));
  assert.equal(commandPolicy.build.type, 'maven');
  const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf-8'));
  assert.deepEqual(settings.permissions, { allow: ['Read'] });
  assert.ok(settings.hooks.Stop.some((group) => (
    group.hooks?.some((hook) => hook.command === 'node user-stop.mjs')
  )));
  assert.ok(settings.hooks.Stop.some((group) => (
    group.hooks?.some((hook) => String(hook.command).includes('harness/plugin/runtime/hooks/stop.mjs'))
  )));
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'harness', 'evidence-policy.json'), 'utf-8'));
  assert.equal(policy.legacyBaselineCommit, git('rev-parse', 'HEAD'));
  assert.deepEqual(policy.legacyChangeIds, []);

  const uninstall = install('--uninstall');
  assert.equal(uninstall.status, 0, uninstall.stderr);
  assert.equal(fs.existsSync(path.join(root, '.claude', 'settings.json')), true);
  assert.equal(fs.existsSync(path.join(root, '.claude', 'skills', 'harness', 'SKILL.md')), false);
  console.log(`PASS installer-transaction ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
