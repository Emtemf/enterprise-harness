import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { resolveLocalAdapterPath } from './lib/local-adapter.mjs';

const repoRoot = process.cwd();
const summary = [
  'Enterprise Harness Bootstrap',
  `Repo: ${repoRoot}`,
  `Local adapter path: ${resolveLocalAdapterPath()}`,
  'This bootstrap is intentionally minimal in the current phase.',
  'Use `node harness/plugin/runtime/doctor.mjs` to verify runtime readiness.',
  'Project secrets must stay outside the repository.',
];

const markerPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', '.bootstrap-ran');
fs.writeFileSync(markerPath, new Date().toISOString() + '\n', 'utf-8');
console.log(summary.join('\n'));
