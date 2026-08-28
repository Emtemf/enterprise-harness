import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = path.resolve(import.meta.dirname, '../..');
const assertionPaths = [
  'skills/test-design/assert/artifact-shape.mjs',
  'skills/test-design/assert/coverage.mjs',
  'skills/test-design/assert/traceability.mjs',
];

for (const relativePath of assertionPaths) {
  assert.equal(fs.existsSync(path.join(root, relativePath)), true, `missing Task 3 assertion: ${relativePath}`);
}

const [{ assertArtifactShape }, { assertCoverage }, { assertTraceability }] = await Promise.all(
  assertionPaths.map((relativePath) => import(pathToFileURL(path.join(root, relativePath)))),
);

const requirements = [
  '# Requirements',
  '## 退款组件',
  '### 验收',
  '- R1：已认证用户提交合法退款后返回退款标识。',
].join('\n');

const designTemplate = fs.readFileSync(path.join(root, 'skills/design/assets/design.md.tmpl'), 'utf-8');
const decisionRow = '| D1 | E1 | 复用退款应用服务 | 保持事务边界 | accepted |';
const design = designTemplate
  .replace('| E1 | | |', '| E1 | requirements.md | 退款入口面向已认证用户 |')
  .replace('| A | | | |', '| A | 复用现有服务 | 需要补充失败契约 | 采用 |')
  .replace('| B | | | |', '| B | 新建退款服务 | 增加部署与一致性成本 | 拒绝 |')
  .replace('| D1 | E1 | | | accepted / needs-decision |', decisionRow)
  .replace(
    '| VO1 | R1 / D1 | | | 由 test-design 映射 TC* |',
    '| VO1 | R1 / D1 | 返回唯一退款标识 | 未返回退款标识或网关超时 | 由 test-design 映射 TC* |',
  );

const complete = [
  '# Test Cases',
  '## 输入与测试范围',
  '| Dimension | Applicability | Reason |',
  '|---|---|---|',
  '| E2E | applicable | 用户从退款入口提交请求并看到结果 |',
  '## Coverage Matrix',
  '| Source | Concern | Criticality | Applicability | Covered By | N/A Reason |',
  '|---|---|---|---|---|---|',
  '| R1 | 合法退款成功 | normal | applicable | TC1 | - |',
  '| VO1 | 网关超时失败信号 | critical | applicable | TC2 | - |',
  '| migration | 数据迁移 | normal | N/A | - | 本变更不修改数据结构 |',
  '## 测试用例',
  '| TCID | Traces | Level | Priority | Preconditions | Data | Actions | Observable assertions | Cleanup/Recovery | Status |',
  '|---|---|---|---|---|---|---|---|---|---|',
  '| TC1 | R1 / D1 / VO1 | integration | high | 用户已认证且退款服务可用 | 合法退款请求 refund-001 | 提交一次退款请求 | 响应包含非空退款标识且持久化记录与 refund-001 一致 | 删除 refund-001 的退款记录 | accepted |',
  '| TC2 | R1 / D1 / VO1 | contract | critical | 用户已认证且退款网关可注入超时 | 合法退款请求 refund-timeout | 提交请求并触发网关超时 | 响应为可重试错误且不存在退款记录 | 恢复网关并确认无残留记录 | accepted |',
  '## E2E 用户旅程',
  '| Journey ID | Traces | Preconditions | Steps | Observable outcome | Status |',
  '|---|---|---|---|---|---|',
  '| J1 | R1 / D1 / VO1 / TC1 | 用户已登录退款页面 | 输入 refund-001 并提交退款 | 页面显示非空退款标识且刷新后状态仍为已退款 | accepted |',
  '## 测试数据、隔离与清理',
  '- refund-001 与 refund-timeout 每次运行唯一；用例后删除退款记录并恢复网关故障注入。',
  '## 风险优先级与最小充分集合',
  '- TC2 覆盖 critical 失败信号；TC1 与 J1 覆盖最短成功路径，二者均不可删除。',
  '## Test Design Self-Check',
  '- verdict：pass',
  '- unresolved decisions：none',
  '- placeholders：none',
].join('\n');

const impact = { e2e: 'yes' };

assert.equal(assertArtifactShape(complete, impact).verdict, 'pass');
assert.equal(assertCoverage(requirements, design, complete).verdict, 'pass');
assert.equal(assertTraceability(requirements, design, complete).verdict, 'pass');

function expectBlock(assertion, candidate, message) {
  const result = assertion(candidate);
  assert.equal(result.verdict, 'block', `${message}: ${result.problems?.join('; ') ?? 'no problems reported'}`);
}

expectBlock(
  (candidate) => assertArtifactShape(candidate, impact),
  complete.replace('| TC2 | R1 / D1 / VO1 |', '| TC1 | R1 / D1 / VO1 |'),
  'duplicate TC identifiers must block',
);

for (const [known, unknown] of [['R1', 'R9'], ['D1', 'D9'], ['VO1', 'VO9']]) {
  expectBlock(
    (candidate) => assertTraceability(requirements, design, candidate),
    complete.replaceAll(known, unknown),
    `unknown trace ${unknown} must block`,
  );
}

expectBlock(
  (candidate) => assertArtifactShape(candidate, impact),
  complete.replace('响应包含非空退款标识且持久化记录与 refund-001 一致', ''),
  'empty observable assertion must block',
);
expectBlock(
  (candidate) => assertArtifactShape(candidate, impact),
  complete.replace('响应包含非空退款标识且持久化记录与 refund-001 一致', '验证成功'),
  'generic observable assertion must block',
);
expectBlock(
  (candidate) => assertArtifactShape(candidate, impact),
  complete.replace('响应包含非空退款标识且持久化记录与 refund-001 一致', '系统验证成功'),
  'decorated generic observable assertion must block',
);
expectBlock(
  (candidate) => assertArtifactShape(candidate, impact),
  complete.replace('合法退款请求 refund-001', '<测试数据>'),
  'template placeholders must block',
);
expectBlock(
  (candidate) => assertArtifactShape(candidate, impact),
  complete.replace('合法退款请求 refund-001', '合法退款请求 <refund-id>'),
  'embedded template placeholders must block',
);
for (const [value, label] of [
  ['合法退款请求 NEEDS_DECISION', 'NEEDS_DECISION'],
  ['合法退款请求仍未决', 'unresolved text'],
  ['合法退款请求待补充', 'pending-completion text'],
]) {
  expectBlock(
    (candidate) => assertArtifactShape(candidate, impact),
    complete.replace('合法退款请求 refund-001', value),
    `${label} must block`,
  );
}
expectBlock(
  (candidate) => assertArtifactShape(candidate, impact),
  complete.replace(
    '- TC2 覆盖 critical 失败信号；TC1 与 J1 覆盖最短成功路径，二者均不可删除。',
    '- TC2 覆盖 critical 失败信号；TC1 与 J1 覆盖最短成功路径，二者均不可删除。\n- 补充风险仍为 NEEDS_DECISION。',
  ),
  'placeholders in narrative sections must block',
);

expectBlock(
  (candidate) => assertArtifactShape(candidate, impact),
  `${complete}\n## 执行计划\n\n- 由后续阶段执行。`,
  'an eighth top-level heading must block',
);
for (const [line, label] of [
  ['- exact argv：["./mvnw", "test"]', 'exact argv'],
  ['- 运行 npm test', 'test execution command'],
  ['- 使用 Playwright 打开浏览器并点击提交按钮', 'browser execution instruction'],
]) {
  expectBlock(
    (candidate) => assertArtifactShape(candidate, impact),
    complete.replace(
      '- TC2 覆盖 critical 失败信号；TC1 与 J1 覆盖最短成功路径，二者均不可删除。',
      `- TC2 覆盖 critical 失败信号；TC1 与 J1 覆盖最短成功路径，二者均不可删除。\n${line}`,
    ),
    `${label} must not appear in a test-design candidate`,
  );
}

expectBlock(
  (candidateDesign) => assertTraceability(requirements, candidateDesign, complete),
  design.replace(decisionRow, '| D1 | E1 | 复用退款应用服务 | 保持事务边界 | needs-decision |'),
  'a referenced needs-decision decision must block',
);
expectBlock(
  (candidateDesign) => assertTraceability(requirements, candidateDesign, complete),
  design.replace(decisionRow, '| D1 | E1 | | 保持事务边界 | accepted |'),
  'an incomplete accepted decision must block',
);

for (const unknownSource of ['R9', 'VO9']) {
  expectBlock(
    (candidate) => assertCoverage(requirements, design, candidate),
    complete.replace(
      '| migration | 数据迁移 | normal | N/A | - | 本变更不修改数据结构 |',
      `| ${unknownSource} | 伪造上游来源 | normal | N/A | - | 伪造来源不适用 |\n| migration | 数据迁移 | normal | N/A | - | 本变更不修改数据结构 |`,
    ),
    `unknown coverage source ${unknownSource} must block`,
  );
}
expectBlock(
  (candidate) => assertCoverage(requirements, design, candidate),
  complete.replace(
    '| R1 | 合法退款成功 | normal | applicable | TC1 | - |',
    '| R1 | 合法退款成功 | normal | applicable | TC1 | - |\n| R1 | 退款重复覆盖 | normal | N/A | - | 已由另一行覆盖 |',
  ),
  'duplicate coverage source rows must block',
);
expectBlock(
  (candidate) => assertCoverage(requirements, design, candidate),
  complete.replace('| R1 | 合法退款成功 | normal | applicable | TC1 | - |', '| R1 | 合法退款成功 | normal | applicable | TC1 / TC99 | - |'),
  'Covered By with one unknown TC must block',
);
expectBlock(
  (candidate) => assertCoverage(requirements, design, candidate),
  complete.replace('| R1 | 合法退款成功 | normal | applicable | TC1 | - |', '| R1 | 合法退款成功 | normal | applicable | TC1 and TC2 | - |'),
  'Covered By must be a pure slash-separated TC list',
);
expectBlock(
  (candidate) => assertCoverage(requirements, design, candidate),
  complete.replace('| VO1 | 网关超时失败信号 | critical | applicable | TC2 | - |', '| VO1 | 网关超时失败信号 | critical | applicable | - | - |'),
  'critical failure without a case must block',
);
expectBlock(
  (candidate) => assertCoverage(requirements, design, candidate),
  complete.replace('| J1 | R1 / D1 / VO1 / TC1 | 用户已登录退款页面 | 输入 refund-001 并提交退款 | 页面显示非空退款标识且刷新后状态仍为已退款 | accepted |', ''),
  'applicable E2E without a journey must block',
);
expectBlock(
  (candidate) => assertArtifactShape(candidate, impact),
  complete.replace('| migration | 数据迁移 | normal | N/A | - | 本变更不修改数据结构 |', '| migration | 数据迁移 | normal | N/A | - | |'),
  'N/A without a reason must block',
);

expectBlock(
  (candidate) => assertArtifactShape(candidate, impact),
  complete.replace(' | 删除 refund-001 的退款记录 | accepted |', ' | accepted |'),
  'a complete TC row with fewer than ten columns must block',
);
expectBlock(
  (candidate) => assertArtifactShape(candidate, impact),
  complete.replace('| TC1 | R1 / D1 / VO1 |', '| CASE1 | R1 / D1 / VO1 |'),
  'non-stable TC identifiers must block',
);
expectBlock(
  (candidate) => assertArtifactShape(candidate, impact),
  complete.replaceAll('TC1', 'TC3'),
  'the stable TC sequence must start with TC1',
);

for (const [valid, invalid, label] of [
  ['integration', 'system', 'level'],
  ['high', 'urgent', 'priority'],
  ['accepted', 'draft', 'status'],
]) {
  expectBlock(
    (candidate) => assertArtifactShape(candidate, impact),
    complete.replace(`| ${valid} |`, `| ${invalid} |`),
    `unknown TC ${label} enum must block`,
  );
}

console.log(`PASS test-design-semantic-contract ${mode}`);
