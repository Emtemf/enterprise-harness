import process from 'node:process';
import { spawnSync } from 'node:child_process';

const [, , action, ...args] = process.argv;
if (!action || action === '--help' || action === '-h') {
  console.log('Usage: node harness/plugin/runtime/context7.mjs <library|docs> ...');
  process.exit(0);
}

const childArgs = ['-y', 'ctx7', action, ...args];
const quoteWindowsArgument = (value) => {
  const text = String(value);
  if (!/[\s"&|<>^()]/u.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
};
const child = process.platform === 'win32'
  ? spawnSync(
    process.env.ComSpec || 'cmd.exe',
    ['/d', '/s', '/c', `npx ${childArgs.map(quoteWindowsArgument).join(' ')}`],
    {
      cwd: process.cwd(),
      encoding: 'utf-8',
      shell: false,
    },
  )
  : spawnSync('npx', childArgs, {
  cwd: process.cwd(),
  encoding: 'utf-8',
  shell: false,
  });
process.stdout.write(String(child.stdout ?? ''));
process.stderr.write(String(child.stderr ?? child.error?.message ?? ''));
process.exit(child.status ?? 1);
