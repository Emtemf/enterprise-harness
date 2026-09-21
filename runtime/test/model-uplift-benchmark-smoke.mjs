import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { routeIdentityValid, modelIdentityValid, responseIdentityValid } from '../../benchmarks/model-uplift-v1/lib/model-identity.mjs';
import { validatePreflightReceipt } from '../../benchmarks/model-uplift-v1/lib/preflight-receipt.mjs';
import { answerBusinessQuestion, extractQuestionFromStream } from '../../benchmarks/model-uplift-v1/lib/scripted-user.mjs';
import { gradeBusinessClarification } from '../../benchmarks/model-uplift-v1/lib/business-grade.mjs';
import { validateHoldoutIsolationReceipt } from '../../benchmarks/model-uplift-v1/lib/holdout-receipt.mjs';
import { attachProviderReceipt } from '../../benchmarks/model-uplift-v1/lib/provider-receipt.mjs';
import { bareFinalRequirements } from '../../benchmarks/model-uplift-v1/lib/clarification-output.mjs';
import { prepareBwrapHoldout } from '../../benchmarks/model-uplift-v1/lib/holdout-bwrap.mjs';
import { attachRouteReceipt } from '../../benchmarks/model-uplift-v1/lib/route-receipt.mjs';
import { canonicalAskInputMatches, planHeadlessDecision } from '../../benchmarks/model-uplift-v1/lib/headless-decision.mjs';
import { businessPromptFor, nextNoQuestionStreak } from '../../benchmarks/model-uplift-v1/lib/business-prompt.mjs';
import { initializeFixtureCodeGraph } from '../../benchmarks/model-uplift-v1/lib/fixture-codegraph.mjs';
import { harnessSdkPermissionPolicy } from '../../benchmarks/model-uplift-v1/lib/sdk-permission-policy.mjs';
import { sanitizedSdkToolTrace } from '../../benchmarks/model-uplift-v1/lib/sdk-trace.mjs';
import { assertSdkClaudeCompatibility, parseClaudeCodeVersion } from '../../benchmarks/model-uplift-v1/lib/sdk-runtime.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const benchmark = path.join(root, 'benchmarks/model-uplift-v1');
const businessRunner = fs.readFileSync(path.join(benchmark, 'business-run.mjs'), 'utf-8');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-model-uplift-smoke-'));
const matrix = JSON.parse(fs.readFileSync(path.join(benchmark, 'matrix.json'), 'utf-8'));
const relayTariff = JSON.parse(fs.readFileSync(path.join(benchmark, 'pricing.json'), 'utf-8'));
const businessProtocol = JSON.parse(fs.readFileSync(path.join(benchmark, 'business-evaluation.json'), 'utf-8'));
const businessCases = JSON.parse(fs.readFileSync(path.join(benchmark, 'business-cases.development.json'), 'utf-8'));

assert.deepEqual(matrix.arms.map(({ id }) => id), ['weak-harness', 'weak-bare', 'strong-bare']);
assert.deepEqual(matrix.arms.find(({ id }) => id === 'weak-bare').allowedActualModels, ['glm-5.1']);
assert.equal(matrix.arms.find(({ id }) => id === 'weak-harness').subagentModelOverride, 'claude-haiku-4-5');
assert.equal(matrix.arms.find(({ id }) => id === 'weak-harness').forceSubagentModel, true);
assert.deepEqual(matrix.arms.find(({ id }) => id === 'strong-bare').allowedActualModels, ['glm-5.1', 'glm-5.2']);
assert.deepEqual(matrix.comparisons.map(({ id }) => id), [
  'weak-workflow-uplift', 'weak-model-substitution',
]);
assert.equal(relayTariff.models['glm-5.1'].chargeUnitsPerRequest, 1);
assert.equal(relayTariff.models['glm-5.2'].chargeUnitsPerRequest, 3);
assert.equal(businessProtocol.publicationGate.minimumDistinctCases, 5);
assert.equal(businessProtocol.publicationGate.minimumPairedObservationsPerComparison, 20);
assert.ok(businessProtocol.decisionHierarchy.resourceOnly.includes('input_tokens'));
assert.ok(businessProtocol.tracks.some(({ id }) => id === 'clarification'));
assert.equal(harnessSdkPermissionPolicy.permissionMode, 'default', 'SDK default mode must leave AskUserQuestion available to the PreToolUse answer host');
assert.match(businessRunner, /ask-input-canonical-mismatch[\s\S]{0,300}continue: true/u,
  'canonical Ask mismatch must be recoverable instead of terminating the SDK turn');
assert.match(businessRunner, /callbackDiagnostics\.push\('answered'\)/u,
  'SDK callback evidence must preserve a successful retry after prior mismatches');
assert.doesNotMatch(businessRunner, /canUseTool\s*:/u,
  'canUseTool bypasses AskUserQuestion SDK hooks in Claude Code 2.1.268 and must not be configured');
assert.match(businessRunner, /matcher: 'Bash\|Read\|Write[\s\S]{0,320}permissionDecision: 'allow'/u,
  'SDK hooks must host non-interactive permissions for non-question tools without canUseTool');
assert.match(businessRunner, /authorizeClarifyQuestion\(root, input\.tool_input\)[\s\S]{0,220}sdk-pretooluse-authorized/u,
  'SDK AskUserQuestion bridge must run the same runtime authorization as the plugin PreToolUse hook');
assert.match(businessRunner, /resolveClarifyQuestion\(root, input\.tool_input, input\.tool_response\)[\s\S]{0,180}sdk-posttooluse-persisted/u,
  'SDK AskUserQuestion bridge must persist the answer through the same runtime resolver as the plugin PostToolUse hook');
assert.match(businessRunner, /questionBridgeValid[\s\S]{0,500}measurementValid:[^\n]+questionBridgeValid/u,
  'Harness measurements must fail closed unless the SDK question bridge authorized and persisted each answer');
assert.equal(parseClaudeCodeVersion('2.1.268 (Claude Code)'), '2.1.268');
assert.deepEqual(assertSdkClaudeCompatibility({ version: '0.3.268', claudeCodeVersion: '2.1.268' }, '2.1.268 (Claude Code)'), {
  sdkVersion: '0.3.268', expectedClaudeVersion: '2.1.268', actualClaudeVersion: '2.1.268',
});
assert.throws(
  () => assertSdkClaudeCompatibility({ version: '0.3.272', claudeCodeVersion: '2.1.272' }, '2.1.268 (Claude Code)'),
  /requires Claude Code 2\.1\.272/u,
);
assert.deepEqual(sanitizedSdkToolTrace([
  { message: { content: [{ type: 'tool_use', name: 'Bash', id: 'tool-1', input: { command: 'secret command' } }] } },
  { message: { content: [{ type: 'tool_result', tool_use_id: 'tool-1', is_error: true, content: 'BLOCK EH-SESSION-LEASE-023 secret detail' }] } },
]), [
  { eventIndex: 0, kind: 'tool-use', toolName: 'Bash', toolUseId: 'tool-1' },
  { eventIndex: 1, kind: 'tool-result', toolUseId: 'tool-1', isError: true, diagnosticCode: 'EH-SESSION-LEASE-023' },
]);
assert.doesNotMatch(JSON.stringify(sanitizedSdkToolTrace([
  { message: { content: [{ type: 'tool_result', tool_use_id: 'tool-2', content: '隐藏业务答案' }] } },
])), /隐藏业务答案/u, 'tool trace must not persist hidden answers or tool payloads');
const codeGraphCalls = [];
const codeGraphStatus = initializeFixtureCodeGraph('/tmp/business-fixture', (command, argv, options) => {
  codeGraphCalls.push({ command, argv, options });
  if (argv[0] === 'status') return { status: 0, stdout: '{"initialized":true,"fileCount":2}' };
  return { status: 0, stdout: '' };
});
assert.equal(codeGraphStatus.fileCount, 2);
assert.deepEqual(codeGraphCalls.map(({ argv }) => argv), [
  ['init', '/tmp/business-fixture'],
  ['status', '--json', '/tmp/business-fixture'],
]);
assert.throws(() => initializeFixtureCodeGraph('/tmp/no-code', (command, argv) => (
  argv[0] === 'status'
    ? { status: 0, stdout: '{"initialized":true,"fileCount":0}' }
    : { status: 0, stdout: '' }
)), /no indexable source files/u);
if (spawnSync('codegraph', ['--version'], { encoding: 'utf-8', shell: false }).status === 0) {
  const graphFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-codegraph-smoke-'));
  try {
    fs.writeFileSync(path.join(graphFixture, 'service.mjs'), 'export function service() { return true; }\n');
    const realGraphStatus = initializeFixtureCodeGraph(graphFixture);
    assert.ok(realGraphStatus.fileCount >= 1, 'real CodeGraph must index the fixture source');
  } finally {
    fs.rmSync(graphFixture, { recursive: true, force: true });
  }
}
const isolationReceipt = {
  schemaVersion: 1, status: 'pass', casePackDigest: 'a'.repeat(64),
  mechanism: 'container-filesystem-isolation', verifier: 'benchmark-host', generatedAt: '2026-09-10T00:00:00Z',
};
assert.equal(validateHoldoutIsolationReceipt(isolationReceipt, { casePackDigest: 'a'.repeat(64) }), isolationReceipt);
assert.throws(() => validateHoldoutIsolationReceipt(isolationReceipt, { casePackDigest: 'b'.repeat(64) }), /not bound/u);
const providerRaw = {
  runnerCommit: '1'.repeat(40), routingProfile: 'cc-switch-glm-5.1-vs-5.2',
  records: [{
    armId: 'weak-bare', caseId: 'case-1', repetition: 1,
    actualControllerModel: 'glm-5.1', actualWorkerModels: [], costAuthority: 'claude-code-alias-estimate', providerCostUsd: null,
    invocations: [{ startedAt: '2026-09-10T00:00:00Z', completedAt: '2026-09-10T00:02:00Z' }],
  }],
};
const providerReceipt = {
  schemaVersion: 1, status: 'final', authority: 'provider-billing-export', generatedAt: '2026-09-10T00:00:00Z',
  sourceDigest: 'a'.repeat(64), runnerCommit: providerRaw.runnerCommit, routingProfile: providerRaw.routingProfile,
  records: [{ armId: 'weak-bare', caseId: 'case-1', repetition: 1, requests: [{ providerRequestId: 'request-1', model: 'glm-5.1', observedAt: '2026-09-10T00:01:00Z', costUsd: 0.25 }] }],
};
const reconciledProvider = attachProviderReceipt(providerRaw, providerReceipt);
assert.equal(reconciledProvider.records[0].costAuthority, 'provider-billing');
assert.equal(reconciledProvider.records[0].providerCostUsd, 0.25);
assert.equal(reconciledProvider.records[0].modelTierIdentityValid, true);
assert.equal(reconciledProvider.records[0].providerBillingValid, true);
assert.throws(() => attachProviderReceipt(providerRaw, {
  ...providerReceipt, records: [{ ...providerReceipt.records[0], requests: [{ ...providerReceipt.records[0].requests[0], model: 'glm-5.2' }] }],
}), /does not cover expected route/u);
assert.throws(() => attachProviderReceipt({ ...providerRaw, records: [...providerRaw.records, { ...providerRaw.records[0], caseId: 'case-2' }] }, providerReceipt), /missing record/u);
assert.throws(() => attachProviderReceipt(providerRaw, {
  ...providerReceipt, records: [{ ...providerReceipt.records[0], requests: [{ ...providerReceipt.records[0].requests[0], observedAt: '2026-09-10T01:00:00Z' }] }],
}), /outside benchmark invocation windows/u);
const routeRaw = {
  ...providerRaw,
  records: [{ ...providerRaw.records[0], claudeSessionId: 'session-1', allowedActualModels: ['glm-5.1'] }],
};
const routeReceipt = {
  schemaVersion: 1, status: 'final', authority: 'cc-switch-proxy-log', generatedAt: '2026-09-10T00:03:00Z',
  sourceDigest: 'b'.repeat(64), runnerCommit: routeRaw.runnerCommit, routingProfile: routeRaw.routingProfile,
  records: [{
    armId: 'weak-bare', caseId: 'case-1', repetition: 1, claudeSessionId: 'session-1',
    requests: [{ proxyRequestId: 'proxy-1', model: 'glm-5.1', requestModel: 'claude-haiku-4-5', observedAt: '2026-09-10T00:01:00Z' }],
  }],
};
const reconciledRoute = attachRouteReceipt(routeRaw, routeReceipt, relayTariff);
assert.equal(reconciledRoute.records[0].modelTierIdentityValid, true);
assert.deepEqual(reconciledRoute.records[0].routeProblems, []);
assert.equal(reconciledRoute.records[0].routeAuthority, 'cc-switch-proxy-log');
assert.equal(reconciledRoute.records[0].relayRequestCount, 1);
assert.equal(reconciledRoute.records[0].relayChargeUnits, 1);
assert.deepEqual(reconciledRoute.records[0].relayRequestCountsByModel, { 'glm-5.1': 1 });
const strongRouteRaw = {
  ...routeRaw,
  records: [{
    ...routeRaw.records[0], armId: 'strong-bare', actualControllerModel: 'glm-5.2',
    allowedActualModels: ['glm-5.1', 'glm-5.2'],
  }],
};
const strongRouteReceipt = {
  ...routeReceipt,
  records: [{
    ...routeReceipt.records[0], armId: 'strong-bare',
    requests: [
      { proxyRequestId: 'proxy-weak-aux', model: 'glm-5.1', requestModel: 'claude-haiku-4-5', observedAt: '2026-09-10T00:01:00Z' },
      { proxyRequestId: 'proxy-strong', model: 'glm-5.2', requestModel: 'claude-sonnet-4-6', observedAt: '2026-09-10T00:01:30Z' },
    ],
  }],
};
const reconciledStrongRoute = attachRouteReceipt(strongRouteRaw, strongRouteReceipt, relayTariff);
assert.equal(reconciledStrongRoute.records[0].relayRequestCount, 2);
assert.equal(reconciledStrongRoute.records[0].relayChargeUnits, 4, 'all actual weak and strong requests must be charged');
assert.throws(() => attachRouteReceipt(routeRaw, {
  ...routeReceipt, records: [{ ...routeReceipt.records[0], claudeSessionId: 'other-session' }],
}, relayTariff), /session mismatch/u);
const contaminatedRoute = attachRouteReceipt(routeRaw, {
  ...routeReceipt,
  records: [{
    ...routeReceipt.records[0],
    requests: [...routeReceipt.records[0].requests, { proxyRequestId: 'proxy-strong', model: 'glm-5.2', requestModel: 'claude-sonnet-4-6', observedAt: '2026-09-10T00:01:00Z' }],
  }],
}, relayTariff);
assert.equal(contaminatedRoute.records[0].modelTierIdentityValid, false);
assert.deepEqual(contaminatedRoute.records[0].routeProblems, ['disallowed-model-observed:glm-5.2']);
assert.equal(contaminatedRoute.records[0].relayRequestCount, 2);
assert.equal(contaminatedRoute.records[0].relayChargeUnits, 4, 'polluted routes remain measurable but cannot publish effect');
assert.throws(() => attachRouteReceipt(routeRaw, routeReceipt, {
  ...relayTariff, models: { 'glm-5.2': { chargeUnitsPerRequest: 3 } },
}), /no request rate/u);
assert.equal(businessCases.cases.length, 5);
assert.equal(businessCases.publishable, false, 'committed development cases must never qualify as holdout evidence');
for (const selectedCase of businessCases.cases) {
  assert.ok(Object.keys(selectedCase.evidenceFiles).some((reference) => reference.startsWith('src/') && reference.endsWith('.mjs')), `${selectedCase.id} must include indexable source evidence`);
  const transcript = selectedCase.requiredFacts.map((fact, index) => {
    const scripted = answerBusinessQuestion(selectedCase, `请澄清 ${fact.questionPattern}？`, new Set());
    assert.ok(scripted.answeredFactIds.includes(fact.id), `${selectedCase.id}/${fact.id} must be script-answerable`);
    return { turn: index + 1, question: fact.questionPattern, answer: fact.answer, answeredFactIds: [fact.id], unmatched: false };
  });
  const completeRequirements = [
    ...Object.keys(selectedCase.evidenceFiles),
    ...selectedCase.requiredFacts.map(({ answer }) => answer),
  ].join('\n');
  const grade = gradeBusinessClarification(selectedCase, transcript, completeRequirements);
  assert.equal(grade.accepted, true, `${selectedCase.id} complete transcript must pass`);
  assert.equal(grade.evidenceGroundingRate, 1);
  const assumed = gradeBusinessClarification(selectedCase, transcript.slice(1), completeRequirements);
  assert.ok(assumed.prematureAssumptionRate > 0, `${selectedCase.id} unasked decisions must be counted as premature assumptions`);
  assert.equal(gradeBusinessClarification(selectedCase, transcript.slice(1), '').accepted, false);
}
assert.equal(extractQuestionFromStream([{ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'AskUserQuestion', input: { questions: [{ question: '退款期限是多少？' }] } }] } }], ''), '退款期限是多少？');
assert.equal(extractQuestionFromStream([], '已读取 `docs/provider.txt`：超时必须重试。\n\n**最高价值问题：哪些订单状态允许退款？**'), '哪些订单状态允许退款？');
assert.equal(extractQuestionFromStream([], '**问题：哪些订单状态允许退款？**\n- A. 仅 PAID\n- B. PAID + FULFILLED（是否包含退货流程？）'), '哪些订单状态允许退款？');
assert.equal(extractQuestionFromStream([], '> **用户在什么状态下可以自助申请退款？**\n> - 仅限 PAID？\n> - 是否需要额外约束（例如 N 小时内）？\n请给出边界。'), '用户在什么状态下可以自助申请退款？');
assert.equal(extractQuestionFromStream([], '**业务澄清问题**\n请确认：一个发布需要哪些角色（例如：产品负责人、技术负责人）审批？'), '一个发布需要哪些角色（例如：产品负责人、技术负责人）审批？');
const harnessPromptArm = { workflow: 'enterprise-harness' };
const harnessPromptCase = { initialRequest: '给订单加一个用户自助退款功能。', requiredFacts: [] };
assert.equal(
  businessPromptFor(harnessPromptArm, harnessPromptCase, 1, null, 0),
  businessPromptFor(harnessPromptArm, harnessPromptCase, 9, null, 2),
  'Harness resumes must preserve the exact semantic host prompt binding',
);
assert.equal(nextNoQuestionStreak(nextNoQuestionStreak(nextNoQuestionStreak(0, null), ''), undefined), 3);
assert.equal(nextNoQuestionStreak(2, '下一业务问题'), 0);
const repeatedAnswer = answerBusinessQuestion(businessCases.cases[0], 'FULFILLED 已发货订单可以退款吗？', new Set(['eligible-window']));
assert.equal(repeatedAnswer.unmatched, false);
assert.equal(repeatedAnswer.repeated, true);
const compoundAnswer = answerBusinessQuestion(businessCases.cases[0], '网关退款失败或超时后，订单状态如何处理？', new Set());
assert.deepEqual(compoundAnswer.answeredFactIds.sort(), ['deterministic-failure', 'timeout-policy']);
assert.equal(bareFinalRequirements('当前已确认：只支持全额退款。\n下一问题是什么？'), '');
assert.match(bareFinalRequirements('CLARIFICATION_COMPLETE\n只支持全额退款。'), /只支持全额退款/u);
const refundCase = businessCases.cases.find(({ id }) => id === 'refund-policy');
const businessDecision = planHeadlessDecision(refundCase, {
  questionId: 'Q-REFUND-SCOPE', decisionType: 'clarify-answer', header: '退款范围',
  question: '用户自助退款支持全额还是部分退款？', decisionNeeded: '确定退款金额范围',
  recommendedOption: 'full-and-partial',
  options: [
    { id: 'full-only', label: '仅全额退款', description: '第一版只支持全额退款，不支持部分退款。' },
    { id: 'full-and-partial', label: '全额与部分退款', description: '同时支持全额退款与部分退款。' },
  ],
}, new Set());
assert.equal(businessDecision.selectedOptionId, 'full-only', 'scripted business truth must override an incorrect recommendation');
assert.deepEqual(businessDecision.answeredFactIds, ['partial-refund']);
assert.equal(canonicalAskInputMatches({
  questions: businessDecision.toolInput.questions.map(({ question, header, options, multiSelect }) => ({
    options: options.map(({ label, description }) => ({ description, label })), multiSelect, header, question,
  })),
}, businessDecision.toolInput), true, 'callback matching must ignore JSON object property order');
assert.equal(canonicalAskInputMatches({
  questions: [{ ...businessDecision.toolInput.questions[0], question: 'changed' }],
}, businessDecision.toolInput), false, 'callback matching must still reject changed question content');
const governanceDecision = planHeadlessDecision(refundCase, {
  questionId: 'Q-TOPOLOGY', decisionType: 'scope-confirmation', header: '组件确认',
  question: '单一组件是否正确？', decisionNeeded: '确认组件拓扑', recommendedOption: 'confirm-single',
  options: [
    { id: 'confirm-single', label: '确认单一组件', description: '确认一个顶层组件。' },
    { id: 'adjust', label: '调整范围', description: '调整顶层组件。' },
  ],
}, new Set());
assert.equal(governanceDecision.selectedOptionId, 'confirm-single');

const modelRoutes = {
  haiku: { messageModelFamilies: ['glm-5.1'], billingModelFamilies: ['haiku'] },
  sonnet: { messageModelFamilies: ['glm-5.2'], billingModelFamilies: ['sonnet'] },
};
const bareWeak = { id: 'weak-bare', controllerRoute: 'haiku', workerRoutes: [] };
const harnessWeak = { id: 'weak-harness', controllerRoute: 'haiku', workerRoutes: ['haiku'] };
assert.equal(routeIdentityValid(modelRoutes.haiku, ['glm-5.1'], ['claude-haiku-4-5']), true);
assert.equal(routeIdentityValid(modelRoutes.haiku, ['glm-5.2'], ['claude-haiku-4-5']), true);
assert.equal(responseIdentityValid(modelRoutes.haiku, ['glm-5.2']), false);
assert.equal(modelIdentityValid(bareWeak, modelRoutes, ['claude-haiku-4-5'], ['glm-5.1']), true);
assert.equal(modelIdentityValid(bareWeak, modelRoutes, ['claude-haiku-4-5'], ['glm-5.2']), true);
assert.equal(modelIdentityValid(bareWeak, modelRoutes, ['claude-haiku-4-5', 'claude-sonnet-4-6'], ['glm-5.2']), true);
assert.equal(modelIdentityValid(harnessWeak, modelRoutes, ['claude-haiku-4-5'], ['glm-5.1'], ['glm-5.1']), true);
assert.equal(modelIdentityValid(harnessWeak, modelRoutes, ['claude-haiku-4-5'], ['glm-5.1'], []), false);
const receiptNow = Date.parse('2026-09-10T00:00:00Z');
const validReceipt = {
  status: 'pass', generatedAt: '2026-09-10T00:00:00Z', expiresAfterHours: 24,
  claudeCodeVersion: '2.1.263', environmentFingerprint: 'env-digest', routingProfile: 'cc-switch-glm-5.1-vs-5.2',
  probes: ['haiku', 'sonnet'].map((requestedModel) => ({ requestedModel, identityValid: true, complete: true, exitCode: 0 })),
};
assert.equal(validatePreflightReceipt(validReceipt, {
  expectedModels: new Set(['haiku', 'sonnet']), environmentFingerprint: 'env-digest', claudeCodeVersion: '2.1.263', now: receiptNow,
}), validReceipt);
assert.throws(() => validatePreflightReceipt({ ...validReceipt, generatedAt: '2026-09-08T00:00:00Z' }, {
  expectedModels: new Set(['haiku']), environmentFingerprint: 'env-digest', claudeCodeVersion: '2.1.263', now: receiptNow,
}), /expired/u);
assert.throws(() => validatePreflightReceipt(validReceipt, {
  expectedModels: new Set(['haiku']), environmentFingerprint: 'changed', claudeCodeVersion: '2.1.263', now: receiptNow,
}), /routing environment/u);

try {
  if (process.platform === 'linux' && spawnSync('bwrap', ['--version'], { encoding: 'utf-8', shell: false }).status === 0) {
    const holdoutFixture = fs.mkdtempSync('/var/tmp/eh-holdout-isolation-smoke-');
    try {
      const hiddenPath = path.join(holdoutFixture, 'pack.json');
      fs.writeFileSync(hiddenPath, '{"hidden":true}\n');
      const isolation = prepareBwrapHoldout({ casePackPath: hiddenPath, casePackDigest: 'a'.repeat(64) });
      const wrapped = isolation.wrap(process.execPath, ['-e', "process.exit(require('fs').existsSync(process.argv[1]) ? 9 : 0)", hiddenPath], { writableRoot: fixture });
      const isolated = spawnSync(wrapped.command, wrapped.argv, { encoding: 'utf-8', shell: false });
      assert.equal(isolated.status, 0, `${isolated.stdout}\n${isolated.stderr}`);
      assert.equal(isolation.receipt.maskedRoot, '/var/tmp');
      const sdkExecutable = isolation.sdkExecutable(process.execPath, { writableRoot: fixture });
      const sdkIsolated = spawnSync(sdkExecutable, ['-e', "process.exit(require('fs').existsSync(process.argv[1]) ? 9 : 0)", hiddenPath], { encoding: 'utf-8', shell: false });
      assert.equal(sdkIsolated.status, 0, `${sdkIsolated.stdout}\n${sdkIsolated.stderr}`);
    } finally {
      fs.rmSync(holdoutFixture, { recursive: true, force: true });
    }
    assert.throws(() => prepareBwrapHoldout({ casePackPath: path.join(benchmark, 'business-cases.development.json'), casePackDigest: 'a'.repeat(64) }), /below \/var\/tmp/u);
  }

  fs.mkdirSync(path.join(fixture, 'src'), { recursive: true });
  fs.copyFileSync(path.join(benchmark, 'reference/order-service.mjs'), path.join(fixture, 'src/order-service.mjs'));
  let result = spawnSync(process.execPath, [path.join(benchmark, 'grade.mjs'), fixture], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const good = JSON.parse(result.stdout.trim());
  assert.equal(good.passed, 7);
  assert.equal(good.scorePercent, 100);

  const brokenPath = path.join(fixture, 'src/order-service.mjs');
  fs.writeFileSync(brokenPath, fs.readFileSync(brokenPath, 'utf-8').replace("throw new DomainError('ORDER_NOT_FOUND')", "throw new DomainError('WRONG_CODE')"));
  result = spawnSync(process.execPath, [path.join(benchmark, 'grade.mjs'), fixture], { encoding: 'utf-8', shell: false });
  assert.notEqual(result.status, 0, 'hidden grader must reject a broken business error contract');
  const broken = JSON.parse(result.stdout.trim());
  assert.equal(broken.results.find(({ id }) => id === 'unknown-order').pass, false);

  fs.copyFileSync(path.join(benchmark, 'reference/webhook-verifier.mjs'), path.join(fixture, 'src/webhook-verifier.mjs'));
  result = spawnSync(process.execPath, [path.join(benchmark, 'grade-webhook.mjs'), fixture], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const webhook = JSON.parse(result.stdout.trim());
  assert.equal(webhook.passed, 7);
  assert.equal(webhook.scorePercent, 100);

  fs.mkdirSync(path.join(fixture, 'migrations'), { recursive: true });
  fs.copyFileSync(path.join(benchmark, 'reference/subscription-service.mjs'), path.join(fixture, 'src/subscription-service.mjs'));
  fs.copyFileSync(path.join(benchmark, 'reference/002_plan_change_requests.sql'), path.join(fixture, 'migrations/002_plan_change_requests.sql'));
  fs.copyFileSync(path.join(benchmark, 'reference/002_plan_change_requests.down.sql'), path.join(fixture, 'migrations/002_plan_change_requests.down.sql'));
  result = spawnSync(process.execPath, [path.join(benchmark, 'grade-subscription.mjs'), fixture], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const subscription = JSON.parse(result.stdout.trim());
  assert.equal(subscription.passed, 7);
  assert.equal(subscription.scorePercent, 100);

  result = spawnSync(process.execPath, [path.join(benchmark, 'run.mjs'), '--help'], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--invocation-timeout-ms/u);
  assert.match(result.stdout, /--preflight-receipt/u);
  result = spawnSync(process.execPath, [path.join(benchmark, 'run.mjs'), '--case', 'all'], { encoding: 'utf-8', shell: false });
  assert.notEqual(result.status, 0, 'formal all-case matrix must require a preflight receipt');
  assert.match(result.stderr, /requires --preflight-receipt/u);
  result = spawnSync(process.execPath, [path.join(benchmark, 'business-run.mjs'), '--help'], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--case-pack/u);
  assert.match(result.stdout, /--invocation-timeout-ms/u);
  result = spawnSync(process.execPath, [path.join(benchmark, 'business-run.mjs'), '--invocation-timeout-ms', '0'], { encoding: 'utf-8', shell: false });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be an integer >= 60000/u);
  result = spawnSync(process.execPath, [path.join(benchmark, 'business-run.mjs'), '--case', 'all'], { encoding: 'utf-8', shell: false });
  assert.notEqual(result.status, 0, 'formal all-case business matrix must require a preflight receipt');
  assert.match(result.stderr, /requires --preflight-receipt/u);
  const unsafePackPath = path.join(fixture, 'unsafe-business-pack.json');
  fs.writeFileSync(unsafePackPath, `${JSON.stringify({
    schemaVersion: 1,
    split: 'development',
    publishable: false,
    cases: [{
      id: 'unsafe-case', initialRequest: 'test', evidenceFiles: { '../escape.txt': 'bad' },
      requiredFacts: [{ id: 'fact', weight: 1, questionPattern: 'x', answer: 'y', acceptancePattern: 'y' }],
    }],
  })}\n`);
  result = spawnSync(process.execPath, [path.join(benchmark, 'business-run.mjs'), '--case-pack', unsafePackPath], { encoding: 'utf-8', shell: false });
  assert.notEqual(result.status, 0, 'business case pack paths must not escape the fixture');
  assert.match(result.stderr, /safe relative paths/u);
  const textOnlyPackPath = path.join(fixture, 'text-only-business-pack.json');
  fs.writeFileSync(textOnlyPackPath, `${JSON.stringify({
    schemaVersion: 1,
    split: 'development',
    publishable: false,
    cases: [{
      id: 'text-only', initialRequest: 'test', evidenceFiles: { 'src/facts.txt': 'not code' },
      requiredFacts: [{ id: 'fact', weight: 1, questionPattern: 'x', answer: 'y', acceptancePattern: 'y' }],
    }],
  })}\n`);
  result = spawnSync(process.execPath, [path.join(benchmark, 'business-run.mjs'), '--case-pack', textOnlyPackPath], { encoding: 'utf-8', shell: false });
  assert.notEqual(result.status, 0, 'business case packs must exercise the CodeGraph lane with actual source');
  assert.match(result.stderr, /CodeGraph-indexable source file/u);

  const rawPath = path.join(fixture, 'raw.json');
  const summaryPath = path.join(fixture, 'summary.json');
  const record = (armId, repetition, effectScore, relayChargeUnits, accepted = true) => ({
    armId, caseId: `case-${((repetition - 1) % 5) + 1}`, repetition, completedArchive: armId === 'weak-harness',
    grade: { accepted, effectScore }, totals: { costUsd: null, durationMs: 1 },
    relayChargeUnits, relayRequestCount: relayChargeUnits,
    modelTierIdentityValid: true,
  });
  const records = Array.from({ length: 19 }, (_, index) => index + 1).flatMap((repetition) => [
    record('weak-harness', repetition, 90, 1),
    record('weak-bare', repetition, 70, 1, false),
    record('strong-bare', repetition, 90, 3),
  ]);
  const comparisons = [
    { id: 'weak-workflow-uplift', treatmentArm: 'weak-harness', controlArm: 'weak-bare', minimumEffectGapPp: 0, strictEffectGate: true },
    { id: 'weak-model-substitution', treatmentArm: 'weak-harness', controlArm: 'strong-bare', minimumEffectGapPp: -5 },
  ];
  const raw = () => ({ claimEligibleInput: true, comparisons, records });
  fs.writeFileSync(rawPath, `${JSON.stringify(raw())}\n`);
  result = spawnSync(process.execPath, [path.join(benchmark, 'summarize.mjs'), rawPath, summaryPath], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  let summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  assert.equal(summary.comparisons[0].decision.eligibleForEffectClaim, false, 'nineteen pairs must remain diagnostic');
  assert.equal(summary.comparisons[0].decision.diagnostic.diagnosticEligible, true);
  assert.equal(summary.decision.publishableEffectStory, false);

  records.push(
    record('weak-harness', 20, 90, 1),
    record('weak-bare', 20, 70, 1, false),
    record('strong-bare', 20, 90, 3),
  );
  fs.writeFileSync(rawPath, `${JSON.stringify(raw())}\n`);
  result = spawnSync(process.execPath, [path.join(benchmark, 'summarize.mjs'), rawPath, summaryPath], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  assert.equal(summary.decision.publishableEffectStory, true);
  assert.equal(summary.decision.publishableModelUplift, true);
  assert.equal(summary.decision.resourceMetricsArePublicationGate, false);
  assert.equal(summary.comparisons.find(({ id }) => id === 'weak-model-substitution').decision.diagnostic.bootstrap.effectGapMeanLower95Pp, 0);
  assert.equal(summary.arms.find(({ armId }) => armId === 'weak-harness').relayChargeUnitsPerAcceptedChange, 1);

  fs.writeFileSync(rawPath, `${JSON.stringify({ ...raw(), claimEligibleInput: false })}\n`);
  result = spawnSync(process.execPath, [path.join(benchmark, 'summarize.mjs'), rawPath, summaryPath], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  assert.equal(summary.decision.publishableEffectStory, false, 'development case packs must never support a published claim');
  assert.equal(summary.comparisons[0].decision.reason.effect, 'the case pack is diagnostic-only and cannot support a published claim');

  records[0] = { ...records[0], grade: { accepted: true, effectScore: 0 } };
  fs.writeFileSync(rawPath, `${JSON.stringify(raw())}\n`);
  result = spawnSync(process.execPath, [path.join(benchmark, 'summarize.mjs'), rawPath, summaryPath], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  assert.equal(summary.decision.publishableEffectStory, false, 'an uncertain effect lower bound must block the claim');

  records[0] = { ...records[0], measurementValid: false, totals: { ...records[0].totals, costUsd: null }, providerCostUsd: null };
  fs.writeFileSync(rawPath, `${JSON.stringify(raw())}\n`);
  result = spawnSync(process.execPath, [path.join(benchmark, 'summarize.mjs'), rawPath, summaryPath], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  assert.equal(summary.comparisons.find(({ id }) => id === 'weak-workflow-uplift').decision.eligibleForEffectClaim, false, 'incomplete result must block an effect claim');
  assert.equal(summary.decision.publishableEffectStory, false);
  assert.equal(summary.arms.find(({ armId }) => armId === 'weak-harness').relayChargeUnitsPerAcceptedChange, 1,
    'a failed effect measurement must still retain its observed relay resource usage');

  const identityRecords = Array.from({ length: 20 }, (_, index) => index + 1).flatMap((repetition) => [
    { ...record('weak-harness', repetition, 100, 1), modelIdentityValid: repetition !== 1 },
    record('strong-bare', repetition, 100, 3),
  ]);
  const identityComparison = [{ id: 'identity-check', treatmentArm: 'weak-harness', controlArm: 'strong-bare', minimumEffectGapPp: -5 }];
  fs.writeFileSync(rawPath, `${JSON.stringify({ claimEligibleInput: true, comparisons: identityComparison, records: identityRecords })}\n`);
  result = spawnSync(process.execPath, [path.join(benchmark, 'summarize.mjs'), rawPath, summaryPath], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  assert.equal(summary.comparisons[0].decision.eligibleForEffectClaim, false, 'model identity conflict must block an effect claim');

  const missingModelTierIdentity = identityRecords.map((item) => ({ ...item, modelIdentityValid: true, modelTierIdentityValid: false }));
  fs.writeFileSync(rawPath, `${JSON.stringify({ claimEligibleInput: true, comparisons: identityComparison, records: missingModelTierIdentity })}\n`);
  result = spawnSync(process.execPath, [path.join(benchmark, 'summarize.mjs'), rawPath, summaryPath], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  assert.equal(summary.comparisons[0].decision.eligibleForEffectClaim, false, 'model-tier route receipt must gate a publishable effect claim');

  const noResourceStats = identityRecords.map((item) => ({ ...item, modelIdentityValid: true, relayChargeUnits: null }));
  fs.writeFileSync(rawPath, `${JSON.stringify({ claimEligibleInput: true, comparisons: identityComparison, records: noResourceStats })}\n`);
  result = spawnSync(process.execPath, [path.join(benchmark, 'summarize.mjs'), rawPath, summaryPath], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  assert.equal(summary.comparisons[0].decision.publishableEffect, true, 'effect claim must not require resource statistics');
  assert.equal(summary.arms.find(({ armId }) => armId === 'weak-harness').relayChargeUnitsMedian, null);
  console.log('PASS model-uplift-benchmark smoke');
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
