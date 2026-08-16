import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const [, , subcommand, ...rest] = process.argv;
// 兄弟脚本相对 cli.mjs 自身目录定位；命令作用目标始终是调用方 cwd。
const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
const targetCwd = process.cwd();

const commands = {
  bootstrap: ['bootstrap.mjs'],
  doctor: ['doctor.mjs'],
  'doctor-hooks': ['doctor-hooks.mjs'],
  sync: ['sync.mjs'],
  install: ['install.mjs'],
  verify: ['verify.mjs'],
  validate: ['validate.mjs'],
  'setup-local-adapter': ['setup-local-adapter.mjs'],
  'start-change': ['start-change.mjs'],
  'release-local': ['release-local.mjs'],
  status: ['status.mjs'],
  update: ['update.mjs'],
  'update-local': ['update-local.mjs'],
  upgrade: ['upgrade.mjs'],
  migrate: ['migrate.mjs'],
  'migrate-v5': ['migrate-v5.mjs'],
  'upstream-check': ['upstream-check.mjs'],
  lifecycle: ['lifecycle.mjs'],
  workflow: ['workflow.mjs'],
  context7: ['context7.mjs'],
  'task-run': ['task-run.mjs'],
  'tdd-run': ['tdd-run.mjs'],
  'evidence-import': ['evidence-import.mjs'],
  handoff: ['handoff.mjs'],
  trace: ['trace.mjs'],
  sessions: ['sessions.mjs'],
  'migrate-evidence-policy': ['migrate-evidence-policy.mjs'],
};

if (!subcommand || subcommand === '--help' || subcommand === '-h') {
  console.log('Enterprise Harness Runtime CLI');
  console.log('Usage: node runtime/cli.mjs <command> [args]');
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

const targetScript = path.join(runtimeDir, commands[subcommand][0]);
const child = spawnSync(process.execPath, [targetScript, ...rest], {
  cwd: targetCwd,
  encoding: 'utf-8',
});
process.stdout.write(child.stdout || '');
process.stderr.write(child.stderr || '');
process.exitCode = child.status ?? 1;
