// 锁定 pre-explore 的作用域判定。
//
// 回归背景：extractExplorationTargets 只读 file_path/path/notebook_path，
// 因此 Grep(pattern:"class X") 与 Glob(pattern:"src/main/java/**") 都解析不出目标，
// `[].every()` 恒为 true，主 orchestrator 可以绕过 code-explore 直接探索业务代码。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import {
  extractExplorationTargets,
  isExplorationTargetExempt,
  hasUnboundedExplorationScope,
} from '../lib/hook-targets.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');

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

// Bash 分支：探索判定必须看命令动作，而不是命令文本里出现了什么路径字符串。
// 回归背景：早期用裸路径匹配，`git commit` 的 heredoc 消息里提到 src/test/java
// 就会被判成探索并 BLOCK——提交修复本身都会被自己的网关拦住。
const hookPath = path.join(repoRoot, 'runtime', 'hooks', 'pre-explore.mjs');
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-explore-bash-'));
try {
  spawnSync('git', ['init', '-q', '.'], { cwd: sandbox });
  fs.mkdirSync(path.join(sandbox, 'harness', 'changes'), { recursive: true });
  for (const dir of ['templates', 'specs']) {
    fs.cpSync(path.join(repoRoot, 'harness', dir), path.join(sandbox, 'harness', dir), { recursive: true });
  }

  const commitBody = 'fix: x\n\n3. src/test/java 写入需要 currentTask\n';
  const bashCases = [
    ['git commit heredoc 提到受治理路径', `git commit -q -F - <<'EOF'\n${commitBody}EOF`, 'pass'],
    ['git commit -m 提到受治理路径', 'git commit -m "fix src/main/java gate"', 'pass'],
    ['git status', 'git status --short', 'pass'],
    ['grep 文档目录', 'grep -rn TODO docs/', 'pass'],
    ['grep 受治理代码', 'grep -rn "class Order" src/main/java', 'block'],
    ['find 受治理代码', 'find src/main/java -name "*.java"', 'block'],
    ['rg 受治理代码', 'rg OrderService src/main/java', 'block'],
    ['管道后 grep 受治理代码', 'cat foo | grep bar src/main/java', 'block'],
  ];

  bashCases.forEach(([name, command, expected], index) => {
    const event = {
      tool_name: 'Bash',
      tool_input: { command },
      session_id: 'scope-smoke',
      tool_use_id: `scope-${index}`,
      cwd: sandbox,
    };
    const result = spawnSync('node', [hookPath], { input: JSON.stringify(event), encoding: 'utf-8' });
    const actual = result.status === 2 ? 'block' : 'pass';
    if (actual !== expected) {
      failures.push(`Bash: ${name}: expected ${expected}, got ${actual} (exit=${result.status})`);
    }
  });
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}

if (failures.length) {
  for (const failure of failures) console.error(failure);
  console.error('pre-explore scope smoke failed');
  process.exit(1);
}

console.log('Pre-explore scope smoke passed (8 tool cases + 8 bash cases).');
