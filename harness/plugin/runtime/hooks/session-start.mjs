import { projectRoot, exists } from '../lib/checks.mjs';

const root = projectRoot();
const parts = [
  `.claude/rules=${exists(root, '.claude/rules') ? '存在' : '缺失'}`,
  `.claude/agents=${exists(root, '.claude/agents') ? '存在' : '缺失'}`,
  `.claude/skills=${exists(root, '.claude/skills') ? '存在' : '缺失'}`,
  `templates=${exists(root, 'harness/templates') ? '存在' : '缺失'}`,
  `changes=${exists(root, 'harness/changes') ? '存在' : '缺失'}`,
  `specs=${exists(root, 'harness/specs') ? '存在' : '缺失'}`,
];
console.log(`[Harness 启动检查] ${parts.join(' | ')}`);
