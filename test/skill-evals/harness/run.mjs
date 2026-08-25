#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const definition = JSON.parse(fs.readFileSync(path.join(here, 'evals.json'), 'utf-8'));
const args = process.argv.slice(2);
const valueAfter = (flag) => args[args.indexOf(flag) + 1];
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node test/skill-evals/harness/run.mjs --case <id> [--model <model>] [--dry-run]');
  process.exit(0);
}
const caseId = valueAfter('--case');
const selected = definition.cases.find(({ id }) => id === caseId);
if (!selected) {
  console.error(`Unknown or missing --case. Available: ${definition.cases.map(({ id }) => id).join(', ')}`);
  process.exit(2);
}
const prompt = `/enterprise-harness:harness\n\n${selected.prompt}`;
const argv = [
  '-p', '--plugin-dir', repoRoot, '--tools', '', '--permission-mode', 'plan',
  '--no-session-persistence', '--model', valueAfter('--model') || 'sonnet',
  '--max-budget-usd', '0.50', prompt,
];
if (args.includes('--dry-run')) {
  console.log(JSON.stringify({ case: selected, command: 'claude', argv }, null, 2));
  process.exit(0);
}
const result = spawnSync('claude', argv, { cwd: repoRoot, encoding: 'utf-8', shell: false });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
console.error(`\nManual rubric assertions: ${JSON.stringify(selected.assertions)}`);
console.error(`Manual rubric forbidden: ${JSON.stringify(selected.forbidden)}`);
process.exit(result.status ?? 1);
