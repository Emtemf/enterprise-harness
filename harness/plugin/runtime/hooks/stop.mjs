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
  if (!fs.existsSync(validationPath)) {
    console.error(`Stop gate 提醒：${changeDir} 缺少 validation.md，后续阶段应补齐统一验证证据。`);
    warned = true;
  }
}
if (warned) {
  console.error('Stop gate 当前仅提示，不阻断；后续阶段会升级为真正完成门禁。');
}
process.exit(0);
