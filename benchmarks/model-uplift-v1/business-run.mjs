#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { answerBusinessQuestion, extractQuestionFromStream } from './lib/scripted-user.mjs';
import { gradeBusinessClarification } from './lib/business-grade.mjs';
import { modelIdentityValid, responseIdentityValid } from './lib/model-identity.mjs';
import { environmentFingerprint } from './lib/environment-fingerprint.mjs';
import { validatePreflightReceipt } from './lib/preflight-receipt.mjs';
import { validateHoldoutIsolationReceipt } from './lib/holdout-receipt.mjs';
import { bareFinalRequirements } from './lib/clarification-output.mjs';
import { prepareBwrapHoldout } from './lib/holdout-bwrap.mjs';
import { planHeadlessDecision } from './lib/headless-decision.mjs';
import { businessPromptFor, nextNoQuestionStreak } from './lib/business-prompt.mjs';
import { initializeFixtureCodeGraph } from './lib/fixture-codegraph.mjs';
import { harnessSdkPermissionPolicy } from './lib/sdk-permission-policy.mjs';
import { sanitizedSdkToolTrace } from './lib/sdk-trace.mjs';
import { assertSdkClaudeCompatibility } from './lib/sdk-runtime.mjs';
import { isSafeId, isSafeRelativePath } from '../../runtime/lib/safe-paths.mjs';
import { promptBindingCovers } from '../../runtime/lib/prompt-receipts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const matrix = JSON.parse(fs.readFileSync(path.join(here, 'matrix.json'), 'utf-8'));
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
if (args.includes('--help')) {
  console.log('Usage: node business-run.mjs [--arm <id>] [--case <id|all>] [--case-pack <path>] [--holdout-isolation bwrap] [--reps <n>] [--budget-usd <n>] [--max-dialogue-turns <n>] [--invocation-timeout-ms <n>] [--preflight-receipt <path>] [--results-dir <path>]');
  process.exit(0);
}
const casePackPath = path.resolve(option('--case-pack', path.join(here, 'business-cases.development.json')));
const casePack = JSON.parse(fs.readFileSync(casePackPath, 'utf-8'));
const casePackDigest = crypto.createHash('sha256').update(fs.readFileSync(casePackPath)).digest('hex');
const holdoutIsolationMode = option('--holdout-isolation');
const caseOption = option('--case', casePack.cases[0]?.id);
const selectedCases = caseOption === 'all' ? casePack.cases : casePack.cases.filter(({ id }) => id === caseOption);
const selectedArms = option('--arm') ? matrix.arms.filter(({ id }) => id === option('--arm')) : matrix.arms;
const reps = Number(option('--reps', '1'));
const budgetUsd = Number(option('--budget-usd', '1'));
const maxDialogueTurns = Number(option('--max-dialogue-turns', '16'));
const invocationTimeoutMs = Number(option('--invocation-timeout-ms', '1800000'));
const preflightReceiptPath = option('--preflight-receipt');
const resultsDir = path.resolve(option('--results-dir', path.join(here, 'results', `business-${new Date().toISOString().replaceAll(/[:.]/gu, '-')}`)));
const codeGraphSourcePattern = /\.(?:c|cc|cpp|cs|go|h|hpp|java|js|jsx|kt|kts|mjs|cjs|php|py|rb|rs|scala|swift|ts|tsx)$/iu;
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
    if (!Object.keys(selectedCase.evidenceFiles).some((entry) => codeGraphSourcePattern.test(entry))) {
      throw new Error(`${selectedCase.id} requires at least one CodeGraph-indexable source file`);
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
if (!Number.isSafeInteger(invocationTimeoutMs) || invocationTimeoutMs < 60_000) throw new Error('--invocation-timeout-ms must be an integer >= 60000');
const packInsideRepository = !path.relative(repoRoot, casePackPath).startsWith('..');
if (casePack.split === 'holdout' && packInsideRepository) throw new Error('holdout case pack must be supplied from outside the repository');
if (casePack.split === 'holdout' && casePack.publishable !== true) throw new Error('holdout case pack must declare publishable=true');
let holdoutIsolation = null;
let holdoutIsolationReceipt = null;
if (casePack.split === 'holdout') {
  if (holdoutIsolationMode !== 'bwrap') throw new Error('holdout case pack requires --holdout-isolation bwrap');
  holdoutIsolation = prepareBwrapHoldout({ casePackPath, casePackDigest });
  holdoutIsolationReceipt = validateHoldoutIsolationReceipt(holdoutIsolation.receipt, { casePackDigest });
}

function exec(command, argv, options = {}) {
  return spawnSync(command, argv, { encoding: 'utf-8', shell: false, ...options });
}
function mustExec(command, argv, options = {}) {
  const result = exec(command, argv, options);
  if (result.status !== 0 || result.error) throw new Error(`${command} failed: ${result.error?.message || result.stderr || result.stdout}`);
  return result;
}
const installedClaude = fs.realpathSync(mustExec('which', ['claude'], { cwd: repoRoot }).stdout.trim());
const installedClaudeVersion = mustExec(installedClaude, ['--version'], { cwd: repoRoot }).stdout.trim();
const agentSdkPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'package.json'), 'utf-8'));
const harnessRuntime = selectedArms.some(({ workflow }) => workflow === 'enterprise-harness')
  ? assertSdkClaudeCompatibility(agentSdkPackage, installedClaudeVersion)
  : null;
function write(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf-8');
}
function writeJsonAtomic(target, value) {
  const temporary = `${target}.${process.pid}.tmp`;
  write(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, target);
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
  write(path.join(root, '.gitignore'), '.codegraph/\n');
  write(path.join(root, 'AGENTS.md'), '# 业务澄清评测\n\n在需求获得明确确认前不得修改产品代码。仓库事实与外部文档快照必须作为证据，不得把未知业务选择当成事实。\n');
  for (const [relative, content] of Object.entries(selectedCase.evidenceFiles || {})) write(path.join(root, relative), `${content}\n`);
  mustExec('git', ['add', '.'], { cwd: root });
  mustExec('git', ['commit', '-qm', 'business evaluation baseline'], { cwd: root });
  initializeFixtureCodeGraph(root);
  return root;
}
function workflowStatus(root, changeId, sessionId) {
  const statusArgs = [path.join(repoRoot, 'runtime/cli.mjs'), 'workflow', 'status'];
  if (changeId) statusArgs.push(changeId);
  statusArgs.push('--json');
  const result = exec(process.execPath, statusArgs, {
    cwd: root,
    timeout: 120_000,
    env: { ...process.env, CLAUDE_SESSION_ID: sessionId, ENTERPRISE_HARNESS_SESSION_ID: sessionId },
  });
  if (result.status !== 0) return null;
  try { return JSON.parse(result.stdout); } catch { return null; }
}
function pendingCandidate(root, changeId) {
  const pendingPath = path.join(root, '.git', 'enterprise-harness', 'pending-decisions', `${changeId}.json`);
  if (!fs.existsSync(pendingPath)) return null;
  const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf-8'));
  if (pending.status !== 'pending' || !isSafeRelativePath(pending.candidateRef)) return null;
  const candidatePath = path.resolve(root, pending.candidateRef);
  if (!candidatePath.startsWith(`${root}${path.sep}`) || !fs.existsSync(candidatePath)) return null;
  return JSON.parse(fs.readFileSync(candidatePath, 'utf-8'));
}

async function invokeHarnessSdk({ root, arm, selectedCase, turn, sessionId, childEnv, answered, changeId, remainingBudgetUsd }) {
  const events = [];
  let plannedDecision = null;
  let resolvedChangeId = changeId;
  let timedOut = false;
  let caughtError = null;
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    timedOut = true;
    abortController.abort();
  }, invocationTimeoutMs);
  const claudeExecutable = holdoutIsolation
    ? holdoutIsolation.sdkExecutable(installedClaude, { writableRoot: root })
    : installedClaude;
  try {
    const stream = query({
      prompt: businessPromptFor(arm, selectedCase, turn, null, answered.size),
      options: {
        cwd: root,
        pathToClaudeCodeExecutable: claudeExecutable,
        sessionId: turn === 1 ? sessionId : undefined,
        resume: turn === 1 ? undefined : sessionId,
        model: arm.model,
        maxTurns: 60,
        maxBudgetUsd: remainingBudgetUsd,
        ...harnessSdkPermissionPolicy,
        settingSources: [],
        plugins: [{ type: 'local', path: repoRoot }],
        env: { ...childEnv, CLAUDE_AGENT_SDK_CLIENT_APP: 'enterprise-harness-model-uplift' },
        abortController,
        canUseTool: async (toolName, input) => {
          if (toolName !== 'AskUserQuestion') return { behavior: 'allow', updatedInput: input };
          const status = workflowStatus(root, resolvedChangeId, sessionId);
          if (status?.changeId) resolvedChangeId = status.changeId;
          const candidate = resolvedChangeId ? pendingCandidate(root, resolvedChangeId) : null;
          if (!candidate) return { behavior: 'deny', message: 'Harness benchmark could not resolve the canonical pending question.', interrupt: true };
          const planned = planHeadlessDecision(selectedCase, candidate, answered);
          if (JSON.stringify(input.questions) !== JSON.stringify(planned.toolInput.questions)) {
            return { behavior: 'deny', message: 'AskUserQuestion input is not the canonical prepared candidate.', interrupt: true };
          }
          plannedDecision = planned;
          return {
            behavior: 'allow',
            updatedInput: { ...planned.toolInput, ...planned.toolResponse },
          };
        },
      },
    });
    for await (const event of stream) events.push(event);
  } catch (error) {
    caughtError = error;
  } finally {
    clearTimeout(timeout);
  }
  const result = [...events].reverse().find((event) => event.type === 'result');
  const assistant = events.filter((event) => event.type === 'assistant' && event.message);
  const text = result?.result || assistant.flatMap((event) => (event.message.content || [])
    .filter((block) => block.type === 'text').map((block) => block.text || '')).join('\n');
  return {
    events,
    result,
    text,
    plannedDecision,
    changeId: resolvedChangeId,
    timedOut,
    error: caughtError,
    status: caughtError || result?.is_error ? 1 : 0,
    controllerModels: [...new Set(assistant.filter((event) => !event.parent_tool_use_id && !event.subagent_type).map((event) => event.message.model).filter(Boolean))],
    workerModels: [...new Set(assistant.filter((event) => event.parent_tool_use_id || event.subagent_type).map((event) => event.message.model).filter(Boolean))],
    billingModels: Object.keys(result?.modelUsage || {}),
  };
}
function finalRequirements(root, arm, changeId, fallbackText) {
  if (arm.workflow !== 'enterprise-harness') return bareFinalRequirements(fallbackText);
  if (!changeId) return fallbackText;
  const target = path.join(root, 'harness', 'changes', changeId, 'requirements.md');
  return fs.existsSync(target) ? fs.readFileSync(target, 'utf-8') : fallbackText;
}
function validatePreflight() {
  if (caseOption !== 'all') return null;
  if (!preflightReceiptPath) throw new Error('--case all requires --preflight-receipt from preflight.mjs');
  const receipt = JSON.parse(fs.readFileSync(path.resolve(preflightReceiptPath), 'utf-8'));
  const version = installedClaudeVersion;
  const expectedModels = new Set(selectedArms.flatMap((arm) => [arm.controllerRoute, ...(arm.workerRoutes || [])]));
  validatePreflightReceipt(receipt, {
    expectedModels,
    environmentFingerprint: environmentFingerprint(process.env, version),
    claudeCodeVersion: version,
  });
  return receipt;
}
const preflight = validatePreflight();
const runnerCommit = mustExec('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }).stdout.trim();
const runnerTreeClean = mustExec('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: repoRoot }).stdout.trim() === '';
if (casePack.split === 'holdout' && !runnerTreeClean) throw new Error('holdout runs require a clean committed benchmark runner');

async function runOnce(arm, selectedCase, repetition) {
  const root = fixture(selectedCase);
  let changeId = null;
  const sessionId = crypto.randomUUID();
  const transcript = [];
  const invocations = [];
  const answered = new Set();
  let pendingAnswer = null;
  let lastText = '';
  let noQuestionStreak = 0;
  let stopReason = null;
  const checkpoint = path.join(resultsDir, 'checkpoints', `${arm.id}--${selectedCase.id}--${repetition}.json`);
  try {
    for (let turn = 1; turn <= maxDialogueTurns; turn += 1) {
      const childEnv = { ...process.env, CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: '3' };
      for (const key of Object.keys(childEnv).filter((key) => key.startsWith('EH_BENCHMARK_'))) delete childEnv[key];
      delete childEnv.CLAUDE_CODE_SUBAGENT_MODEL;
      delete childEnv.CLAUDE_CODE_SUBAGENT_MODEL_FORCE;
      if (arm.subagentModelOverride) childEnv.CLAUDE_CODE_SUBAGENT_MODEL = arm.subagentModelOverride;
      if (arm.forceSubagentModel) childEnv.CLAUDE_CODE_SUBAGENT_MODEL_FORCE = '1';
      const spent = invocations.reduce((sum, item) => sum + item.usage.costUsd, 0);
      const remaining = budgetUsd - spent;
      if (remaining <= 0.001) break;
      const claudeArgs = [
        '-p', ...(turn === 1 ? ['--session-id', sessionId] : ['--resume', sessionId]),
        '--output-format', 'stream-json', '--verbose', '--max-turns', '60', '--max-budget-usd', remaining.toFixed(6),
        '--model', arm.model, '--permission-mode', 'bypassPermissions', '--setting-sources', '',
        businessPromptFor(arm, selectedCase, turn, pendingAnswer, answered.size),
      ];
      pendingAnswer = null;
      const startedAt = Date.now();
      let child;
      let parsed;
      if (arm.workflow === 'enterprise-harness') {
        parsed = await invokeHarnessSdk({ root, arm, selectedCase, turn, sessionId, childEnv, answered, changeId, remainingBudgetUsd: remaining });
        child = { status: parsed.status, error: parsed.error, stderr: parsed.error?.message || '' };
        if (parsed.changeId) changeId = parsed.changeId;
      } else {
        const invocation = holdoutIsolation ? holdoutIsolation.wrap('claude', claudeArgs, { writableRoot: root }) : { command: 'claude', argv: claudeArgs };
        child = exec(invocation.command, invocation.argv, { cwd: root, env: childEnv, timeout: invocationTimeoutMs });
        parsed = parseStream(child.stdout || '');
      }
      lastText = parsed.text;
      let question = arm.workflow === 'enterprise-harness'
        ? parsed.plannedDecision?.question || null
        : extractQuestionFromStream(parsed.events, parsed.text);
      const usage = usageOf(parsed.result);
      invocations.push({
        turn,
        startedAt: new Date(startedAt).toISOString(),
        completedAt: new Date().toISOString(),
        exitCode: child.status,
        durationMs: Date.now() - startedAt,
        usage,
        controllerModels: parsed.controllerModels,
        workerModels: parsed.workerModels,
        billingModels: parsed.billingModels,
        question,
        text: parsed.text,
        outputDigest: sha256(arm.workflow === 'enterprise-harness' ? JSON.stringify(parsed.events) : child.stdout || ''),
        timedOut: arm.workflow === 'enterprise-harness' ? parsed.timedOut : child.error?.code === 'ETIMEDOUT',
        error: child.error?.message || String(child.stderr || '').trim() || null,
        ...(arm.workflow === 'enterprise-harness' ? { toolTrace: sanitizedSdkToolTrace(parsed.events) } : {}),
      });
      const status = arm.workflow === 'enterprise-harness' ? workflowStatus(root, changeId, sessionId) : null;
      if (status?.changeId) changeId = status.changeId;
      const bridged = parsed.plannedDecision;
      if (bridged) {
        for (const factId of bridged.answeredFactIds) answered.add(factId);
        if (bridged.decisionType === 'clarify-answer') transcript.push({ turn, ...bridged });
        invocations.at(-1).question = question;
        invocations.at(-1).sdkDecision = {
          questionId: bridged.questionId,
          decisionType: bridged.decisionType,
          selectedOptionId: bridged.selectedOptionId,
        };
      } else if (question) {
        const scripted = answerBusinessQuestion(selectedCase, question, answered);
        for (const factId of scripted.answeredFactIds) answered.add(factId);
        transcript.push({ turn, question, ...scripted });
        pendingAnswer = scripted.answer;
      }
      noQuestionStreak = nextNoQuestionStreak(noQuestionStreak, question);
      writeJsonAtomic(checkpoint, {
        schemaVersion: 1,
        status: 'running',
        runnerCommit,
        runnerTreeClean,
        routingProfile: matrix.routingProfile,
        armId: arm.id,
        caseId: selectedCase.id,
        repetition,
        changeId,
        lastCompletedTurn: turn,
        answeredFactIds: [...answered].sort(),
        transcript,
        invocations,
      });
      if (arm.workflow === 'enterprise-harness' && status && status.stage !== 'clarify') break;
      if (arm.workflow === 'bare' && /CLARIFICATION_COMPLETE/u.test(parsed.text) && !question) break;
      if (child.status !== 0 && parsed.result?.subtype !== 'error_max_turns') break;
      if (noQuestionStreak >= 3) {
        stopReason = 'three-consecutive-turns-without-question';
        break;
      }
    }
    const requirements = finalRequirements(root, arm, changeId, lastText);
    const statusLines = mustExec('git', ['status', '--short'], { cwd: root }).stdout.split(/\r?\n/u).filter(Boolean);
    const productCodeChanged = statusLines.some((line) => /(?:src|app|lib)\//u.test(line));
    const billingModels = [...new Set(invocations.flatMap((item) => item.billingModels))];
    const controllerModels = [...new Set(invocations.flatMap((item) => item.controllerModels))];
    const workerModels = [...new Set(invocations.flatMap((item) => item.workerModels))];
    const identityValid = modelIdentityValid(arm, matrix.modelRoutes, billingModels, controllerModels, workerModels);
    const responseIdentity = responseIdentityValid(matrix.modelRoutes[arm.controllerRoute], controllerModels)
      && (arm.workerRoutes || []).every((routeId) => responseIdentityValid(matrix.modelRoutes[routeId], workerModels));
    const billingComplete = invocations.length > 0 && invocations.every((item) => item.billingModels.length > 0);
    const rawRequestBound = arm.workflow !== 'enterprise-harness'
      || Boolean(changeId && promptBindingCovers(root, changeId, selectedCase.initialRequest));
    const record = {
      armId: arm.id,
      workflow: arm.workflow,
      claudeSessionId: sessionId,
      actualControllerModel: matrix.modelRoutes[arm.controllerRoute]?.actualModel || null,
      actualWorkerModels: (arm.workerRoutes || []).map((route) => matrix.modelRoutes[route]?.actualModel).filter(Boolean),
      allowedActualModels: arm.allowedActualModels || [],
      caseId: selectedCase.id,
      repetition,
      changeId,
      caseSplit: casePack.split,
      transcript,
      finalRequirements: requirements,
      finalRequirementsDigest: sha256(requirements),
      grade: gradeBusinessClarification(selectedCase, transcript, requirements, { productCodeChanged }),
      modelIdentityValid: identityValid,
      responseIdentityValid: responseIdentity,
      rawRequestBound,
      billingComplete,
      measurementValid: identityValid && billingComplete && rawRequestBound,
      stopReason,
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
    writeJsonAtomic(checkpoint, {
      schemaVersion: 1,
      status: 'complete',
      runnerCommit,
      runnerTreeClean,
      routingProfile: matrix.routingProfile,
      lastCompletedTurn: invocations.length,
      record,
    });
    return record;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

fs.mkdirSync(resultsDir, { recursive: true });
const records = [];
for (const selectedCase of selectedCases) {
  for (let repetition = 1; repetition <= reps; repetition += 1) {
    for (const arm of selectedArms) {
      const record = await runOnce(arm, selectedCase, repetition);
      records.push(record);
      console.log(`${arm.id} case=${selectedCase.id} rep=${repetition} accepted=${record.grade.accepted} recall=${record.grade.criticalUnknownRecall.toFixed(3)} identity=${record.modelIdentityValid}`);
    }
  }
}
const output = {
  schemaVersion: 1,
  status: 'business-clarification-observations',
  generatedAt: new Date().toISOString(),
  runnerCommit,
  runnerTreeClean,
  casePack: { path: casePackPath, digest: casePackDigest, split: casePack.split, publishable: casePack.publishable === true },
  holdoutIsolation: holdoutIsolationReceipt ? {
    receiptDigest: sha256(JSON.stringify(holdoutIsolationReceipt)),
    mechanism: holdoutIsolationReceipt.mechanism,
    verifier: holdoutIsolationReceipt.verifier,
    maskedRoot: holdoutIsolationReceipt.maskedRoot,
  } : null,
  claimEligibleInput: casePack.split === 'holdout' && casePack.publishable === true && Boolean(preflight) && Boolean(holdoutIsolationReceipt),
  preflight: preflight ? { path: path.resolve(preflightReceiptPath), digest: sha256(fs.readFileSync(path.resolve(preflightReceiptPath))) } : null,
  arms: selectedArms,
  routingProfile: matrix.routingProfile,
  harnessRuntime,
  comparisons: matrix.comparisons,
  records,
};
write(path.join(resultsDir, 'business-results.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(`results=${path.join(resultsDir, 'business-results.json')}`);
