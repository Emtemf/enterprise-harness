#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { answerBusinessQuestion, extractQuestionFromStream } from './lib/scripted-user.mjs';
import { gradeBusinessClarification } from './lib/business-grade.mjs';
import { modelIdentityValid } from './lib/model-identity.mjs';
import { environmentFingerprint } from './lib/environment-fingerprint.mjs';
import { validatePreflightReceipt } from './lib/preflight-receipt.mjs';
import { validateHoldoutIsolationReceipt } from './lib/holdout-receipt.mjs';
import { isSafeId, isSafeRelativePath } from '../../runtime/lib/safe-paths.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const matrix = JSON.parse(fs.readFileSync(path.join(here, 'matrix.json'), 'utf-8'));
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
if (args.includes('--help')) {
  console.log('Usage: node business-run.mjs [--arm <id>] [--case <id|all>] [--case-pack <path>] [--holdout-isolation-receipt <path>] [--reps <n>] [--budget-usd <n>] [--max-dialogue-turns <n>] [--preflight-receipt <path>] [--results-dir <path>]');
  process.exit(0);
}
const casePackPath = path.resolve(option('--case-pack', path.join(here, 'business-cases.development.json')));
const casePack = JSON.parse(fs.readFileSync(casePackPath, 'utf-8'));
const casePackDigest = crypto.createHash('sha256').update(fs.readFileSync(casePackPath)).digest('hex');
const holdoutIsolationReceiptPath = option('--holdout-isolation-receipt');
const caseOption = option('--case', casePack.cases[0]?.id);
const selectedCases = caseOption === 'all' ? casePack.cases : casePack.cases.filter(({ id }) => id === caseOption);
const selectedArms = option('--arm') ? matrix.arms.filter(({ id }) => id === option('--arm')) : matrix.arms;
const reps = Number(option('--reps', '1'));
const budgetUsd = Number(option('--budget-usd', '1'));
const maxDialogueTurns = Number(option('--max-dialogue-turns', '12'));
const preflightReceiptPath = option('--preflight-receipt');
const resultsDir = path.resolve(option('--results-dir', path.join(here, 'results', `business-${new Date().toISOString().replaceAll(/[:.]/gu, '-')}`)));
function validateCasePack(pack) {
  if (!pack || pack.schemaVersion !== 1 || !['development', 'holdout'].includes(pack.split) || !Array.isArray(pack.cases) || pack.cases.length === 0) {
    throw new Error('case pack must be schemaVersion=1 with development/holdout split and non-empty cases');
  }
  const caseIds = new Set();
  for (const selectedCase of pack.cases) {
    if (!isSafeId(selectedCase.id) || caseIds.has(selectedCase.id)) throw new Error('case ids must be unique safe ids');
    caseIds.add(selectedCase.id);
    if (typeof selectedCase.initialRequest !== 'string' || !selectedCase.initialRequest.trim()) throw new Error(`${selectedCase.id} requires initialRequest`);
    if (!selectedCase.evidenceFiles || Object.keys(selectedCase.evidenceFiles).some((entry) => !isSafeRelativePath(entry))) {
      throw new Error(`${selectedCase.id} evidenceFiles must use safe relative paths`);
    }
    if (!Array.isArray(selectedCase.requiredFacts) || selectedCase.requiredFacts.length === 0) throw new Error(`${selectedCase.id} requires requiredFacts`);
    const factIds = new Set();
    for (const fact of selectedCase.requiredFacts) {
      if (!isSafeId(fact.id) || factIds.has(fact.id)) throw new Error(`${selectedCase.id} fact ids must be unique safe ids`);
      factIds.add(fact.id);
      if (!Number.isFinite(fact.weight) || fact.weight <= 0 || typeof fact.answer !== 'string') throw new Error(`${selectedCase.id}/${fact.id} has invalid weight or answer`);
      for (const field of ['questionPattern', 'acceptancePattern']) {
        if (typeof fact[field] !== 'string' || !fact[field]) throw new Error(`${selectedCase.id}/${fact.id} requires ${field}`);
        try { new RegExp(fact[field], 'iu'); } catch { throw new Error(`${selectedCase.id}/${fact.id} has invalid ${field}`); }
      }
    }
  }
  return pack;
}
validateCasePack(casePack);
if (selectedCases.length === 0) throw new Error('unknown --case');
if (selectedArms.length === 0) throw new Error('unknown --arm');
if (!Number.isSafeInteger(reps) || reps < 1) throw new Error('--reps must be an integer >= 1');
if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new Error('--budget-usd must be > 0');
if (!Number.isSafeInteger(maxDialogueTurns) || maxDialogueTurns < 1) throw new Error('--max-dialogue-turns must be an integer >= 1');
const packInsideRepository = !path.relative(repoRoot, casePackPath).startsWith('..');
if (casePack.split === 'holdout' && packInsideRepository) throw new Error('holdout case pack must be supplied from outside the repository');
if (casePack.split === 'holdout' && casePack.publishable !== true) throw new Error('holdout case pack must declare publishable=true');
let holdoutIsolationReceipt = null;
if (casePack.split === 'holdout') {
  if (!holdoutIsolationReceiptPath) throw new Error('holdout case pack requires --holdout-isolation-receipt');
  holdoutIsolationReceipt = validateHoldoutIsolationReceipt(
    JSON.parse(fs.readFileSync(path.resolve(holdoutIsolationReceiptPath), 'utf-8')),
    { casePackDigest },
  );
}

function exec(command, argv, options = {}) {
  return spawnSync(command, argv, { encoding: 'utf-8', shell: false, ...options });
}
function mustExec(command, argv, options = {}) {
  const result = exec(command, argv, options);
  if (result.status !== 0 || result.error) throw new Error(`${command} failed: ${result.error?.message || result.stderr || result.stdout}`);
  return result;
}
function write(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf-8');
}
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function parseStream(raw) {
  const events = String(raw).split(/\r?\n/u).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  const result = [...events].reverse().find((event) => event.type === 'result');
  const assistant = events.filter((event) => event.type === 'assistant' && event.message);
  const texts = assistant.flatMap((event) => (event.message.content || [])
    .filter((block) => block.type === 'text').map((block) => block.text || ''));
  return {
    events,
    result,
    text: result?.result || texts.join('\n'),
    controllerModels: [...new Set(assistant.filter((event) => !event.subagent_type).map((event) => event.message.model).filter(Boolean))],
    workerModels: [...new Set(assistant.filter((event) => event.subagent_type).map((event) => event.message.model).filter(Boolean))],
    billingModels: Object.keys(result?.modelUsage || {}),
  };
}
function usageOf(result) {
  return Object.values(result?.modelUsage || {}).reduce((sum, item) => ({
    inputTokens: sum.inputTokens + Number(item.inputTokens || 0),
    outputTokens: sum.outputTokens + Number(item.outputTokens || 0),
    cacheReadInputTokens: sum.cacheReadInputTokens + Number(item.cacheReadInputTokens || 0),
    cacheCreationInputTokens: sum.cacheCreationInputTokens + Number(item.cacheCreationInputTokens || 0),
    costUsd: sum.costUsd + Number(item.costUSD || 0),
  }), { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUsd: 0 });
}
function fixture(selectedCase) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-business-eval-'));
  mustExec('git', ['init', '-q'], { cwd: root });
  mustExec('git', ['config', 'user.email', 'business-eval@example.test'], { cwd: root });
  mustExec('git', ['config', 'user.name', 'Business Evaluation'], { cwd: root });
  write(path.join(root, 'AGENTS.md'), '# 业务澄清评测\n\n在需求获得明确确认前不得修改产品代码。仓库事实与外部文档快照必须作为证据，不得把未知业务选择当成事实。\n');
  for (const [relative, content] of Object.entries(selectedCase.evidenceFiles || {})) write(path.join(root, relative), `${content}\n`);
  mustExec('git', ['add', '.'], { cwd: root });
  mustExec('git', ['commit', '-qm', 'business evaluation baseline'], { cwd: root });
  return root;
}
function workflowStatus(root, changeId) {
  const result = exec(process.execPath, [path.join(repoRoot, 'runtime/cli.mjs'), 'workflow', 'status', changeId, '--json'], { cwd: root, timeout: 120_000 });
  if (result.status !== 0) return null;
  try { return JSON.parse(result.stdout); } catch { return null; }
}
function finalRequirements(root, arm, changeId, fallbackText) {
  if (arm.workflow !== 'enterprise-harness') return fallbackText;
  const target = path.join(root, 'harness', 'changes', changeId, 'requirements.md');
  return fs.existsSync(target) ? fs.readFileSync(target, 'utf-8') : fallbackText;
}
function promptFor(arm, selectedCase, turn, pendingAnswer, answeredCount) {
  if (turn === 1 && arm.workflow === 'enterprise-harness') {
    return `/enterprise-harness:harness Start change business-eval-${selectedCase.id}. 用户的完整原始请求是：${selectedCase.initialRequest}\n先派遣代码与外部文档研究，汇聚证据后逐一澄清业务决定。未获得明确答案前不得替用户选择或修改产品代码；最终需求必须用相对路径标注采用的代码与文档证据。`;
  }
  if (turn === 1) {
    return `你处于需求澄清阶段。用户原始请求是：${selectedCase.initialRequest}\n读取仓库代码事实和 docs 下的固定外部文档快照。不得修改产品代码，不得替用户决定业务规则。每轮只问一个最高价值问题；信息充分后输出 CLARIFICATION_COMPLETE 和完整、可验收的需求，并用相对路径标注使用的代码与文档证据。`;
  }
  if (pendingAnswer) return `用户对上一问题的完整回答是：${pendingAnswer}\n记录这个决定，继续澄清；每轮最多问一个问题。`;
  if (answeredCount >= selectedCase.requiredFacts.length) return '所有已提出业务问题都已回答。请自检遗漏，然后完成并输出可验收需求；不要修改产品代码。';
  return arm.workflow === 'enterprise-harness'
    ? '/enterprise-harness:harness 继续当前 change，只执行 durable state 授权的下一个澄清动作。'
    : '继续澄清当前需求；每轮只问一个最高价值问题，信息充分后输出 CLARIFICATION_COMPLETE 和完整需求。';
}
function validatePreflight() {
  if (caseOption !== 'all') return null;
  if (!preflightReceiptPath) throw new Error('--case all requires --preflight-receipt from preflight.mjs');
  const receipt = JSON.parse(fs.readFileSync(path.resolve(preflightReceiptPath), 'utf-8'));
  const version = mustExec('claude', ['--version'], { cwd: repoRoot }).stdout.trim();
  const expectedModels = new Set(selectedArms.flatMap((arm) => [arm.controllerRoute, ...(arm.workerRoutes || [])]));
  validatePreflightReceipt(receipt, {
    expectedModels,
    environmentFingerprint: environmentFingerprint(process.env, version),
    claudeCodeVersion: version,
  });
  return receipt;
}
const preflight = validatePreflight();

function runOnce(arm, selectedCase, repetition) {
  const root = fixture(selectedCase);
  const changeId = `business-eval-${selectedCase.id}`;
  const sessionId = crypto.randomUUID();
  const transcript = [];
  const invocations = [];
  const answered = new Set();
  let pendingAnswer = null;
  let lastText = '';
  try {
    for (let turn = 1; turn <= maxDialogueTurns; turn += 1) {
      const childEnv = { ...process.env, CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: '3' };
      for (const key of Object.keys(childEnv).filter((key) => key.startsWith('EH_BENCHMARK_'))) delete childEnv[key];
      delete childEnv.CLAUDE_CODE_SUBAGENT_MODEL;
      if (arm.subagentModelOverride) childEnv.CLAUDE_CODE_SUBAGENT_MODEL = arm.subagentModelOverride;
      const spent = invocations.reduce((sum, item) => sum + item.usage.costUsd, 0);
      const remaining = budgetUsd - spent;
      if (remaining <= 0.001) break;
      const claudeArgs = [
        '-p', ...(turn === 1 ? ['--session-id', sessionId] : ['--resume', sessionId]),
        '--output-format', 'stream-json', '--verbose', '--max-turns', '60', '--max-budget-usd', remaining.toFixed(6),
        '--model', arm.model, '--permission-mode', 'bypassPermissions', '--setting-sources', '',
      ];
      if (arm.workflow === 'enterprise-harness') claudeArgs.push('--plugin-dir', repoRoot);
      claudeArgs.push(promptFor(arm, selectedCase, turn, pendingAnswer, answered.size));
      pendingAnswer = null;
      const startedAt = Date.now();
      const child = exec('claude', claudeArgs, { cwd: root, env: childEnv, timeout: 900_000 });
      const parsed = parseStream(child.stdout || '');
      lastText = parsed.text;
      const question = extractQuestionFromStream(parsed.events, parsed.text);
      const usage = usageOf(parsed.result);
      invocations.push({
        turn,
        exitCode: child.status,
        durationMs: Date.now() - startedAt,
        usage,
        controllerModels: parsed.controllerModels,
        workerModels: parsed.workerModels,
        billingModels: parsed.billingModels,
        question,
        outputDigest: sha256(child.stdout || ''),
        error: String(child.stderr || '').trim() || null,
      });
      if (question) {
        const scripted = answerBusinessQuestion(selectedCase, question, answered);
        for (const factId of scripted.answeredFactIds) answered.add(factId);
        transcript.push({ turn, question, ...scripted });
        pendingAnswer = scripted.answer;
      }
      const status = arm.workflow === 'enterprise-harness' ? workflowStatus(root, changeId) : null;
      if (arm.workflow === 'enterprise-harness' && status && status.stage !== 'clarify') break;
      if (arm.workflow === 'bare' && /CLARIFICATION_COMPLETE/u.test(parsed.text) && !question) break;
      if (child.status !== 0 && parsed.result?.subtype !== 'error_max_turns') break;
    }
    const requirements = finalRequirements(root, arm, changeId, lastText);
    const statusLines = mustExec('git', ['status', '--short'], { cwd: root }).stdout.split(/\r?\n/u).filter(Boolean);
    const productCodeChanged = statusLines.some((line) => /(?:src|app|lib)\//u.test(line));
    const billingModels = [...new Set(invocations.flatMap((item) => item.billingModels))];
    const controllerModels = [...new Set(invocations.flatMap((item) => item.controllerModels))];
    const workerModels = [...new Set(invocations.flatMap((item) => item.workerModels))];
    const identityValid = modelIdentityValid(arm, matrix.modelRoutes, billingModels, controllerModels, workerModels);
    const billingComplete = invocations.length > 0 && invocations.every((item) => item.billingModels.length > 0);
    return {
      armId: arm.id,
      caseId: selectedCase.id,
      repetition,
      caseSplit: casePack.split,
      transcript,
      finalRequirements: requirements,
      finalRequirementsDigest: sha256(requirements),
      grade: gradeBusinessClarification(selectedCase, transcript, requirements, { productCodeChanged }),
      modelIdentityValid: identityValid,
      billingComplete,
      measurementValid: identityValid && billingComplete,
      costAuthority: 'claude-code-alias-estimate',
      providerCostUsd: null,
      invocations,
      totals: invocations.reduce((sum, item) => ({
        inputTokens: sum.inputTokens + item.usage.inputTokens,
        outputTokens: sum.outputTokens + item.usage.outputTokens,
        cacheReadInputTokens: sum.cacheReadInputTokens + item.usage.cacheReadInputTokens,
        cacheCreationInputTokens: sum.cacheCreationInputTokens + item.usage.cacheCreationInputTokens,
        costUsd: sum.costUsd + item.usage.costUsd,
        durationMs: sum.durationMs + item.durationMs,
      }), { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUsd: 0, durationMs: 0 }),
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

fs.mkdirSync(resultsDir, { recursive: true });
const records = [];
for (const selectedCase of selectedCases) {
  for (let repetition = 1; repetition <= reps; repetition += 1) {
    for (const arm of selectedArms) {
      const record = runOnce(arm, selectedCase, repetition);
      records.push(record);
      console.log(`${arm.id} case=${selectedCase.id} rep=${repetition} accepted=${record.grade.accepted} recall=${record.grade.criticalUnknownRecall.toFixed(3)} identity=${record.modelIdentityValid}`);
    }
  }
}
const output = {
  schemaVersion: 1,
  status: 'business-clarification-observations',
  generatedAt: new Date().toISOString(),
  runnerCommit: mustExec('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }).stdout.trim(),
  casePack: { path: casePackPath, digest: casePackDigest, split: casePack.split, publishable: casePack.publishable === true },
  holdoutIsolation: holdoutIsolationReceipt ? {
    receiptDigest: sha256(fs.readFileSync(path.resolve(holdoutIsolationReceiptPath))),
    mechanism: holdoutIsolationReceipt.mechanism,
    verifier: holdoutIsolationReceipt.verifier,
  } : null,
  claimEligibleInput: casePack.split === 'holdout' && casePack.publishable === true && Boolean(preflight) && Boolean(holdoutIsolationReceipt),
  preflight: preflight ? { path: path.resolve(preflightReceiptPath), digest: sha256(fs.readFileSync(path.resolve(preflightReceiptPath))) } : null,
  arms: selectedArms,
  comparisons: matrix.comparisons,
  records,
};
write(path.join(resultsDir, 'business-results.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(`results=${path.join(resultsDir, 'business-results.json')}`);
