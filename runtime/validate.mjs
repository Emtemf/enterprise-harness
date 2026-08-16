import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { projectRoot } from './lib/checks.mjs';
import { loadActiveChange } from './lib/gates.mjs';
import {
  computeStageGateDigest,
  loadStageGateMarker,
  stageGateMarkerPath,
  validateStageChain,
} from './lib/execution-prerequisites.mjs';

// `enterprise-harness validate <change-id> [--stage <stage>]`
// 在阶段边界验证 v6 classification + StageResult + independent ReviewResult，或验证 v5
// compatibility 证据；通过后落 evidence/stage-gate.json。pre-write 之后只检查 marker freshness。

const root = projectRoot();
const [argChangeId] = process.argv.slice(2);
const stageArg = process.argv.includes('--stage')
  ? process.argv[process.argv.indexOf('--stage') + 1]
  : null;

let changeId = String(argChangeId || '').trim();
if (!changeId) {
  const active = loadActiveChange(root);
  if (!active.ok) {
    console.error('BLOCK: validate 需要 change-id 或 active change。');
    console.error('用法: enterprise-harness validate <change-id> [--stage <stage>]');
    process.exit(2);
  }
  changeId = active.changeId;
}

const statePath = path.join(root, 'harness', 'changes', changeId, 'state.json');
if (!fs.existsSync(statePath)) {
  console.error(`BLOCK: change ${changeId} 没有 state.json。`);
  process.exit(2);
}
const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
const problems = validateStageChain(root, changeId, state);

if (problems.length > 0) {
  console.error(`BLOCK: change ${changeId} 的静态阶段链未通过。`);
  for (const problem of problems) console.error(`- ${problem}`);
  console.error('恢复: 完成缺失阶段证据后重跑本命令。');
  process.exit(2);
}

const stage = stageArg || state?.stage || state?.workflow?.stage || 'current';
const marker = {
  schemaVersion: 1,
  changeId,
  stage,
  ok: true,
  validatedAt: new Date().toISOString(),
  changeDigest: computeStageGateDigest(root, changeId),
};
const markerPath = stageGateMarkerPath(root, changeId);
fs.mkdirSync(path.dirname(markerPath), { recursive: true });
fs.writeFileSync(markerPath, `${JSON.stringify(marker, null, 2)}\n`, 'utf-8');

console.log(`PASS: change ${changeId} 静态阶段链已验证（stage=${stage}）。`);
console.log(`marker: ${markerPath.replace(path.join(root, path.sep), '')}`);
process.exit(0);
