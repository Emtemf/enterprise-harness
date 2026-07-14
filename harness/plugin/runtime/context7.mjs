import process from 'node:process';
import { spawnSync } from 'node:child_process';

const [, , action, ...args] = process.argv;
if (!action || action === '--help' || action === '-h') {
  console.log('Usage: node harness/plugin/runtime/context7.mjs <library|docs> ...');
  process.exit(0);
}

const childArgs = ['-y', 'ctx7', action, ...args];
const child = spawnSync('npx', childArgs, { cwd: process.cwd(), encoding: 'utf-8' });
process.stdout.write(child.stdout || '');
process.stderr.write(child.stderr || '');
process.exit(child.status ?? 1);
