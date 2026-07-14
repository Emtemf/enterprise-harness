import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from '../lib/checks.mjs';

const root = projectRoot();
const changesDir = path.join(root, 'harness', 'changes');
if (!fs.existsSync(changesDir)) process.exit(0);
let warned = false;
for (const entry of fs.readdirSync(changesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const changeDir = path.join(changesDir, entry.name);
  const statePath = path.join(changeDir, 'state.json');
  const validationPath = path.join(changeDir, 'validation.md');
  if (!fs.existsSync(statePath)) continue;
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  if (!fs.existsSync(validationPath)) {
    console.error(`BLOCK: ${changeDir} 缺少 validation.md，不能作为完成状态结束。`);
    process.exit(2);
  }
  if ((state.state === 'VALIDATED' || state.state === 'REVIEWED') && state.validation?.status !== 'fresh') {
    console.error(`BLOCK: ${changeDir} 的 validation.status=${state.validation?.status}，请先刷新验证证据。`);
    process.exit(2);
  }
  if (state.state === 'EXECUTING') {
    warned = true;
  }
}
if (warned) {
  console.error('Stop gate 提醒：仍有 change 处于 EXECUTING，请确认是否要结束在当前中间状态。');
}
process.exit(0);
