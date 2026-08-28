import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { assertArtifactShape } from '../../skills/design/assert/artifact-shape.mjs';
import { assertTraceability } from '../../skills/design/assert/traceability.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fileURLToPath(new URL('../../', import.meta.url));
const template = fs.readFileSync(path.join(root, 'skills/design/assets/design.md.tmpl'), 'utf-8');
const requirements = fs.readFileSync(path.join(root, 'skills/harness/assets/requirements.md.tmpl'), 'utf-8')
  .replace('可验证的验收要求。', '可以创建退款。')
  .replace('可验证的验收要求。', '重复请求保持幂等。');
const impact = { api: 'yes', data: 'no', architecture: 'yes', rule: 'yes', security: 'yes' };
const requirementsInput = 'harness/changes/refund/requirements.md';
const codeInput = 'harness/changes/refund/evidence/code.json';
const traceResult = (design) => assertTraceability(
  requirements,
  design,
  requirementsInput,
  'harness/changes/refund/design.md',
  { allowedInputRefs: [requirementsInput, codeInput] },
);

const weakTrace = [
  '# Design',
  '## 目标与验收',
  '- R1、R2',
  '## 事实与约束',
  '- evidence: requirements.md',
  '## 方案与权衡',
  '- decision: 使用现有服务。',
  '## Requirement Trace',
  '- R1、R2 已覆盖。',
  '## 架构边界',
  '- controller -> service',
  '## 交互与失败路径',
  '- 请求失败时返回错误。',
  '## API 设计',
  '- POST /refunds',
  '## 数据与 SQL 设计',
  '- N/A：不改变持久化结构。',
  '## 安全、并发与可观测性',
  '- 沿用现有认证。',
  '## 测试设计',
  '- integration test',
  '## 风险、兼容与回滚',
  '- revert',
  '## Design Self-Check',
  '- pass',
].join('\n');

const strongTrace = [
  '# Design',
  '## 目标与验收',
  '- R1、R2',
  '## 事实与约束',
  '| EID | 来源 | 已确认事实 |',
  '|---|---|---|',
  `| E1 | ${requirementsInput} | 必须创建退款 |`,
  `| E2 | ${codeInput} | 已有幂等键边界 |`,
  '## 方案与权衡',
  '### Alternatives',
  '| 方案 | 优点 | 代价/风险 | 结论 |',
  '|---|---|---|---|',
  '| A | 复用既有边界 | 需要补充幂等契约 | 采用 |',
  '| B | 新建退款服务 | 引入额外部署和一致性成本 | 拒绝 |',
  '### Decisions',
  '| DID | Context | Decision | Consequences | Status |',
  '|---|---|---|---|---|',
  '| D1 | E1 | 新增退款应用服务 | 增加一个应用边界 | accepted |',
  '| D2 | E2 | 复用幂等键存储 | 保持调用兼容 | accepted |',
  '## Requirement Trace',
  '| Requirement | Decision | Evidence | Verification | Rollback |',
  '|---|---|---|---|---|',
  '| R1 | D1 | E1 | V1 | RB1 |',
  '| R2 | D2 | E2 | V2 | RB1 |',
  '## 架构边界',
  '- controller 仅适配协议，application service 拥有用例。',
  '## 交互与失败路径',
  '| 场景 | 调用链 | 失败/超时 | 对外结果 |',
  '|---|---|---|---|',
  '| 创建退款 | API -> service -> gateway | gateway timeout | 可重试错误 |',
  '## API 设计',
  '- POST /refunds；认证、幂等、错误和兼容策略见 D1/D2。',
  '## 数据与 SQL 设计',
  '- N/A：当前变更复用既有存储且没有 schema、SQL、迁移或回填。',
  '## 安全、并发与可观测性',
  '- 授权检查、并发幂等、指标和告警均绑定 V2。',
  '## 测试设计',
  '| VID | 层级 | 场景 | 可观察断言 | 后续冻结入口 |',
  '|---|---|---|---|---|',
  '| V1 | integration | 创建退款 | 返回退款标识 | Plan exact argv |',
  '| V2 | integration | 重复请求 | 仅创建一次 | Plan exact argv |',
  '## 风险、兼容与回滚',
  '| RID | 触发条件 | 回滚/恢复动作 | 回滚后验证 |',
  '|---|---|---|---|',
  '| RB1 | 错误率超阈值 | 关闭新路由并恢复旧调用 | 旧流程成功 |',
  '## Design Self-Check',
  '- verdict：pass',
  '- unresolved decisions：none',
  '- downstream findings：none',
].join('\n');

const templateShape = assertArtifactShape(template, 'skills/design/assets/design.md.tmpl', impact);
assert.equal(templateShape.verdict, 'block', 'an unfilled template must not pass as a design artifact');

const weakResult = traceResult(weakTrace);
assert.equal(weakResult.verdict, 'block', 'requirement names outside a structured trace must not pass');

const strongResult = traceResult(strongTrace);
assert.equal(strongResult.verdict, 'pass', strongResult.problems.join('; '));

const missingAlternatives = strongTrace.replace(/### Alternatives[\s\S]*?(?=### Decisions)/u, '');
assert.equal(
  assertArtifactShape(missingAlternatives, 'design.md', impact).verdict,
  'block',
  'design must contain at least two substantive alternatives with trade-offs and conclusions',
);

const duplicateTrace = strongTrace.replace(
  '| R2 | D2 | E2 | V2 | RB1 |',
  '| R1 | D2 | E2 | V2 | RB1 |\n| R2 | D2 | E2 | V2 | RB1 |',
);
const duplicateResult = traceResult(duplicateTrace);
assert.equal(duplicateResult.verdict, 'block', 'duplicate requirement trace rows must not pass');

const headerReference = strongTrace.replace('| R1 | D1 | E1 | V1 | RB1 |', '| R1 | DID | E1 | V1 | RB1 |');
const headerResult = traceResult(headerReference);
assert.equal(headerResult.verdict, 'block', 'table header labels must not count as declared trace IDs');

const pendingDecision = strongTrace.replace('| D1 | E1 | 新增退款应用服务 | 增加一个应用边界 | accepted |', '| D1 | E1 | 新增退款应用服务 | 增加一个应用边界 | needs-decision |');
assert.equal(traceResult(pendingDecision).verdict, 'block', 'needs-decision must not finalize as pass');

const fakeDecision = strongTrace.replace('| D1 | E1 | 新增退款应用服务 | 增加一个应用边界 | accepted |', '| D1 |');
assert.equal(traceResult(fakeDecision).verdict, 'block', 'a one-cell ID table must not declare a decision');

const duplicateDecision = strongTrace.replace('| D2 | E2 | 复用幂等键存储 | 保持调用兼容 | accepted |', '| D1 | E2 | 复用幂等键存储 | 保持调用兼容 | accepted |');
assert.equal(traceResult(duplicateDecision).verdict, 'block', 'duplicate declaration IDs must not pass');

const extraRequirement = strongTrace.replace('| R2 | D2 | E2 | V2 | RB1 |', '| R2 | D2 | E2 | V2 | RB1 |\n| R3 | D2 | E2 | V2 | RB1 |');
assert.equal(traceResult(extraRequirement).verdict, 'block', 'unknown requirement traces must not pass');

const fakeEvidence = strongTrace.replace(codeInput, 'fake.md');
assert.equal(traceResult(fakeEvidence).verdict, 'block', 'evidence sources must be frozen handoff inputs');

const fakeContext = strongTrace.replace('| D2 | E2 | 复用幂等键存储 | 保持调用兼容 | accepted |', '| D2 | E9 | 复用幂等键存储 | 保持调用兼容 | accepted |');
assert.equal(traceResult(fakeContext).verdict, 'block', 'decision Context must reference declared evidence');

const missingApi = strongTrace.replace('## API 设计', '## 未命名接口段');
const impactResult = assertArtifactShape(missingApi, 'design.md', impact);
assert.equal(impactResult.verdict, 'block', 'impact.api=yes must require an API design section');

const emptyApi = strongTrace.replace('- POST /refunds；认证、幂等、错误和兼容策略见 D1/D2。', '');
assert.equal(assertArtifactShape(emptyApi, 'design.md', impact).verdict, 'block', 'impact.api=yes must require substantive API content');

console.log(`PASS design-semantic-contract ${mode}`);
