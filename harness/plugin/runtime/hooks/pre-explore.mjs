import { projectRoot, hasChangeTracking } from '../lib/checks.mjs';
import { loadActiveChange } from '../lib/gates.mjs';

// pre-explore hook: 拦截主 orchestrator 直接用 Grep/Read/Glob 探索代码。
// codegraph-first 要求代码探索必须委托 code-explore subagent。
// 如果 active change 存在但 tooling.codegraph 还没标记为已用，直接 BLOCK。
//
// 例外：非受治理路径（harness/ 自身、文档、配置）放行，不强制 codegraph。

const root = projectRoot();
const trackingChanges = hasChangeTracking(root);

// 没有 change tracking 的项目不强制
if (!trackingChanges) {
  process.exit(0);
}

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = (Buffer.concat(chunks).toString('utf-8')).trim();
if (!raw) process.exit(0);

let event;
try { event = JSON.parse(raw); } catch { process.exit(0); }

const toolName = event.tool_name || '';
const toolInput = event.tool_input || {};

// 只拦截探索性工具
if (!['Grep', 'Read', 'Glob'].includes(toolName)) {
  process.exit(0);
}

// 读取工具参数
const target = toolInput.file_path || toolInput.path || toolInput.pattern || '';

// 例外路径：harness/ 自身、.claude/、docs/、*.md、配置文件 → 放行
const exemptPatterns = [
  'harness/',
  '.claude/',
  'docs/',
  'CLAUDE.md',
  'AGENTS.md',
  'PROGRESS.md',
  'README.md',
  'package.json',
  '.claude-plugin/',
];
const isExempt = exemptPatterns.some((p) => String(target).includes(p));
if (isExempt) {
  process.exit(0);
}

// 只在有 active change 时检查
const active = loadActiveChange(root);
if (!active.ok) {
  process.exit(0);
}

// 检查 codegraph 是否已标记为已用
const codegraphStatus = active.data?.tooling?.codegraph?.status;
const codegraphQueries = active.data?.tooling?.codegraph?.queries;
const codegraphUsed = codegraphStatus && codegraphStatus !== 'unknown'
  && Array.isArray(codegraphQueries) && codegraphQueries.length > 0;

if (codegraphUsed) {
  // 已委托 subagent 探索过，主 orchestrator 可以读取已探索的内容
  process.exit(0);
}

// 未委托 subagent，主 orchestrator 直接探索代码 → BLOCK
console.error('BLOCK: 主 orchestrator 不得直接用 Grep/Read/Glob 探索代码。代码探索必须委托 code-explore subagent（通过 Agent 工具，subagent_type: code-explore），由 subagent 使用 codegraph_explore/codegraph_search 完成探索。这是 codegraph-first 硬约束。');
console.error('');
console.error('如果你是在读取 subagent 已探索的结论文件（在 harness/changes/ 下），这是允许的。');
console.error('如果是在探索业务代码，请改用 Agent 工具派遣 code-explore subagent。');
process.exit(2);
