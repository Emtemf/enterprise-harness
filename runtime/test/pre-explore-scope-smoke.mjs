// 锁定 pre-explore 的作用域判定。
//
// 回归背景：extractExplorationTargets 只读 file_path/path/notebook_path，
// 因此 Grep(pattern:"class X") 与 Glob(pattern:"src/main/java/**") 都解析不出目标，
// `[].every()` 恒为 true，主 orchestrator 可以绕过 code-explore 直接探索业务代码。
import process from 'node:process';
import {
  extractExplorationTargets,
  isExplorationTargetExempt,
  hasUnboundedExplorationScope,
} from '../lib/hook-targets.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node runtime/test/pre-explore-scope-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const root = '/repo';

// gated = 必须进入 code-explore/CodeGraph 证据检查；exempt = 与治理无关，直接放行。
const cases = [
  ['Grep 无 path 的正则搜索（全仓作用域）', { tool_name: 'Grep', tool_input: { pattern: 'class OrderService' } }, 'gated'],
  ['Glob 直接指向受治理目录', { tool_name: 'Glob', tool_input: { pattern: 'src/main/java/**/*.java' } }, 'gated'],
  ['Grep 用 glob 限定受治理目录', { tool_name: 'Grep', tool_input: { pattern: 'foo', glob: 'src/main/java/**' } }, 'gated'],
  ['Grep path 指向受治理目录', { tool_name: 'Grep', tool_input: { pattern: 'foo', path: 'src/main/java' } }, 'gated'],
  ['Read 受治理源文件', { tool_name: 'Read', tool_input: { file_path: 'src/main/java/A.java' } }, 'gated'],
  ['Grep path 限定在 docs', { tool_name: 'Grep', tool_input: { pattern: 'foo', path: 'docs' } }, 'exempt'],
  ['Glob 限定在 docs', { tool_name: 'Glob', tool_input: { pattern: 'docs/**/*.md' } }, 'exempt'],
  ['Read 文档文件', { tool_name: 'Read', tool_input: { file_path: 'docs/a.md' } }, 'exempt'],
];

const failures = [];
for (const [name, event, expected] of cases) {
  const targets = extractExplorationTargets(root, event);
  const unbounded = hasUnboundedExplorationScope(root, event);
  const bypasses = !unbounded && targets.every((target) => isExplorationTargetExempt(root, target));
  const actual = bypasses ? 'exempt' : 'gated';
  if (actual !== expected) failures.push(`${name}: expected ${expected}, got ${actual}`);
}

if (failures.length) {
  for (const failure of failures) console.error(failure);
  console.error('pre-explore scope smoke failed');
  process.exit(1);
}

console.log('Pre-explore scope smoke passed (8 cases).');
