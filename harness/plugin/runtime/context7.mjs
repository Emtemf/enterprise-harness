import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const [, , action, ...args] = process.argv;
if (!action || action === '--help' || action === '-h') {
  console.log('Usage: node harness/plugin/runtime/context7.mjs <library|docs> ...');
  process.exit(0);
}

const childArgs = ['-y', 'ctx7', action, ...args];
const npxCliCandidates = [
  process.env.npm_execpath?.replace(/[\\/]npm-cli\.js$/u, `${path.sep}npx-cli.js`),
  path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js'),
].filter(Boolean);
const npxCli = npxCliCandidates.find((candidate) => fs.existsSync(candidate));
const quoteWindowsArgument = (value) => {
  const text = String(value);
  if (!/[\s"&|<>^()]/u.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
};
const child = process.platform === 'win32' && npxCli
  ? spawnSync(process.execPath, [npxCli, ...childArgs], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    shell: false,
  })
  : process.platform === 'win32'
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
