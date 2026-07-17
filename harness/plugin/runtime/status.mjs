import process from 'node:process';
import { projectRoot } from './lib/checks.mjs';
import { buildStatusSummary, renderStatusSummary } from './lib/status-summary.mjs';

const root = projectRoot();
const summary = buildStatusSummary(root);

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  process.exit(0);
}

console.log('普通用户下一步：直接从 /harness 开始');
console.log(renderStatusSummary(summary));
