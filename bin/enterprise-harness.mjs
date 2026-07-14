#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const args = process.argv.slice(2);
const child = spawnSync('node', ['harness/plugin/runtime/cli.mjs', ...args], {
  cwd: process.cwd(),
  encoding: 'utf-8',
});
process.stdout.write(child.stdout || '');
process.stderr.write(child.stderr || '');
process.exit(child.status ?? 1);
