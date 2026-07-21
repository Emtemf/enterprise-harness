import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const [, , subcommand, ...rest] = process.argv;
const repoRoot = process.cwd();

const commands = {
  bootstrap: ['harness/plugin/runtime/bootstrap.mjs'],
  doctor: ['harness/plugin/runtime/doctor.mjs'],
  sync: ['harness/plugin/runtime/sync.mjs'],
  install: ['harness/plugin/runtime/install.mjs'],
  verify: ['harness/plugin/runtime/verify.mjs'],
  'setup-local-adapter': ['harness/plugin/runtime/setup-local-adapter.mjs'],
  'start-change': ['harness/plugin/runtime/start-change.mjs'],
  'release-local': ['harness/plugin/runtime/release-local.mjs'],
  status: ['harness/plugin/runtime/status.mjs'],
  update: ['harness/plugin/runtime/update.mjs'],
  upgrade: ['harness/plugin/runtime/upgrade.mjs'],
  migrate: ['harness/plugin/runtime/migrate.mjs'],
  'upstream-check': ['harness/plugin/runtime/upstream-check.mjs'],
  lifecycle: ['harness/plugin/runtime/lifecycle.mjs'],
  workflow: ['harness/plugin/runtime/workflow.mjs'],
  context7: ['harness/plugin/runtime/context7.mjs'],
};

if (!subcommand || subcommand === '--help' || subcommand === '-h') {
  console.log('Enterprise Harness Runtime CLI');
  console.log('Usage: node harness/plugin/runtime/cli.mjs <command> [args]');
  console.log('Commands:');
  for (const key of Object.keys(commands)) {
    console.log(`- ${key}`);
  }
  process.exit(0);
}

if (!commands[subcommand]) {
  console.error(`Unknown command: ${subcommand}`);
  process.exit(1);
}

const targetScript = path.join(repoRoot, ...commands[subcommand][0].split('/'));
const child = spawnSync('node', [targetScript, ...rest], {
  cwd: repoRoot,
  encoding: 'utf-8',
});
process.stdout.write(child.stdout || '');
process.stderr.write(child.stderr || '');
process.exit(child.status ?? 1);
