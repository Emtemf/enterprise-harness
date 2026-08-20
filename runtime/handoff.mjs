import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { projectRoot } from './lib/checks.mjs';
import { activeChangeId, activeHandoffAgentBinding } from './lib/agent-evidence.mjs';
import { sessionIdFromEnv } from './lib/sessions.mjs';
import { loadActiveChange } from './lib/gates.mjs';
import {
  createHandoffV2,
  loadHandoffV2,
  loadHandoffV2FromMarker,
  parseHandoffV2Marker,
  persistHandoffV2Result,
  v2RunDir,
} from './core/handoff-v2.mjs';
import { resolveWithin } from './lib/safe-paths.mjs';
import { selectReviewRubrics } from './lib/review-rubrics.mjs';
import { readClassificationArtifact } from './core/classification-artifact.mjs';
import { agentForV2Handoff } from './core/handoff-agent.mjs';
import {
  createHandoffInput,
  loadHandoffInput,
  runDir,
  validateHandoffResult,
} from './lib/handoff.mjs';
import { diagnostic, DIAGNOSTICS } from './lib/diagnostics.mjs';
import { resolveWorktreeContext } from './lib/worktree-context.mjs';

const executionRoot = projectRoot();
let worktreeContext;
try {
  worktreeContext = resolveWorktreeContext(executionRoot);
} catch (error) {
  console.error(`BLOCK ${error.message}`);
  process.exit(2);
}
const root = worktreeContext.subjectRoot;
const [action, ...args] = process.argv.slice(2);

function assertSessionChange(changeId) {
  const sessionId = sessionIdFromEnv();
  if (!sessionId) return;
  const active = loadActiveChange(root, { sessionId });
  if (!active.ok) throw new Error(`EH-SESSION-CHANGE-001: session cannot resolve active change (${active.reason})`);
  if (active.changeId !== changeId) {
    throw new Error(`EH-SESSION-CHANGE-001: session is bound to ${active.changeId}, not ${changeId}`);
  }
}

function help() {
  console.log('Enterprise Harness Handoff');
  console.log('Usage: enterprise-harness handoff <create|persist|validate|show|explain> ...');
  console.log('  create <change-id> <stage> <behavior> <execute|check> [parent-run-id] [--input-ref <path>] [--target <text>]');
  console.log('  persist <change-id> <run-id> <result-path>');
  console.log('  validate <input-path> [result-path]');
  console.log('  show <change-id> <run-id>');
  console.log('  explain <error-code>');
}

if (!action || action === '--help' || action === '-h') {
  help();
  process.exit(0);
}

if (action === 'create') {
  const positional = [];
  const inputRefs = [];
  let target = '';
  let pathSummary = '';
  let correction = '';
  let attempt = 1;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--input-ref') inputRefs.push(args[++index]);
    else if (value === '--target') target = args[++index] || '';
    else if (value === '--path') pathSummary = args[++index] || '';
    else if (value === '--correction') correction = args[++index] || '';
    else if (value === '--attempt') attempt = Number(args[++index] || 1);
    else positional.push(value);
  }
  const [changeId = activeChangeId(root), stage, behavior, role = 'execute', parentRunId = null] = positional;
  let state = null;
  try {
    state = JSON.parse(fs.readFileSync(path.join(root, 'harness', 'changes', changeId, 'state.json'), 'utf-8'));
  } catch {
    state = null;
  }
  const isV6 = state?.schemaVersion === 6;
  let classification = null;
  if (!changeId || !stage || !behavior) {
    console.error('Usage: handoff create <change-id> <stage> <behavior> <execute|check> [parent-run-id] [--input-ref <path>]');
    process.exit(1);
  }
  try {
    assertSessionChange(changeId);
    if (isV6 && state?.artifacts?.classification) {
      classification = readClassificationArtifact(root, changeId, state.artifacts.classification);
    }
    const created = isV6
      ? (() => {
        if (role === 'check' && process.env.CLAUDE_AGENT_ID) {
          throw new Error('EH-HANDOFF-AUTH-032: check handoffs are controller-created and cannot be created by a subagent');
        }
        return createHandoffV2(root, {
          changeId,
          stage,
          behavior,
          role,
          parentRunId: parentRunId || null,
          agent: agentForV2Handoff(stage, behavior, role),
          inputRefs,
          rubricIds: role === 'check' ? selectReviewRubrics({ stage, impact: classification?.impact }) : [],
          tecpc: {
            target: target || behavior,
            evidence: inputRefs,
            context: inputRefs,
            path: pathSummary || `${role} ${behavior}`,
            correction: correction || null,
          },
        });
      })()
      : createHandoffInput(root, {
        changeId,
        stage,
        behavior,
        role,
        parentRunId: parentRunId || null,
        inputRefs,
        target: target || behavior,
        context: inputRefs,
        pathSummary: pathSummary || `${role} ${behavior}`,
        correction: correction || 'return blocker with an EH-* code and recovery action',
        attempt,
      });
    const envelope = created.envelope ?? created.input;
    console.log(`HANDOFF_INPUT=${path.relative(root, created.path)}`);
    console.log(`runId=${envelope.runId}`);
    console.log(`agent=${envelope.agent.type}`);
    console.log(`skill=${envelope.agent.skill}`);
    process.exit(0);
  } catch (error) {
    console.error(`BLOCK [EH-HANDOFF-SCHEMA-002] ${error.message}`);
    process.exit(2);
  }
}

if (action === 'persist') {
  const [changeId, runId, resultPath] = args;
  if (!changeId || !runId || !resultPath) {
    console.error('Usage: handoff persist <change-id> <run-id> <result-path>');
    process.exit(1);
  }
  try {
    assertSessionChange(changeId);
    const input = loadHandoffV2(root, changeId, runId);
    const mainOwnedClarify = input.role === 'execute'
      && input.stage === 'clarify'
      && input.agent?.type === 'enterprise-harness:main';
    if (!mainOwnedClarify) {
      const binding = activeHandoffAgentBinding(root, changeId, input, {
        agentId: process.env.CLAUDE_AGENT_ID,
        sessionId: sessionIdFromEnv(),
      });
      if (!binding) {
        throw new Error('EH-HANDOFF-AUTH-033: result persistence requires the active dispatched agent bound to this exact run and role');
      }
    }
    const source = resolveWithin(executionRoot, resultPath, 'resultPath');
    const result = JSON.parse(fs.readFileSync(source, 'utf-8'));
    const persisted = persistHandoffV2Result(root, changeId, runId, result);
    console.log(`HANDOFF_RESULT=${path.relative(root, persisted.path)}`);
    process.exit(0);
  } catch (error) {
    console.error(`BLOCK ${error.message}`);
    process.exit(2);
  }
}

if (action === 'validate') {
  const [inputPath, resultPath] = args;
  const absoluteInput = path.resolve(executionRoot, inputPath || '');
  const marker = parseHandoffV2Marker(`HANDOFF_INPUT=${absoluteInput}`);
  const isV2 = marker && absoluteInput.includes(`${path.sep}enterprise-harness${path.sep}runs${path.sep}`);
  const loaded = isV2
    ? loadHandoffV2FromMarker(root, marker)
    : loadHandoffInput(root, inputPath);
  const problems = [...(loaded.problems || [])];
  if (loaded.ok && resultPath) {
    try {
      const result = JSON.parse(fs.readFileSync(path.resolve(executionRoot, resultPath), 'utf-8'));
      problems.push(...validateHandoffResult(result, loaded.envelope));
    } catch (error) {
      problems.push(`invalid result JSON: ${error.message}`);
    }
  }
  if (problems.length) {
    console.error(`BLOCK [EH-HANDOFF-SCHEMA-002] ${problems.join('; ')}`);
    process.exit(2);
  }
  console.log('PASS handoff contract');
  process.exit(0);
}

if (action === 'show') {
  const [changeId, runId] = args;
  let dir = runDir(root, changeId, runId);
  if (!fs.existsSync(dir)) dir = v2RunDir(root, changeId, runId);
  if (!fs.existsSync(dir)) {
    console.error(`Unknown run: ${runId}`);
    process.exit(1);
  }
  for (const file of fs.readdirSync(dir).sort()) console.log(path.join(dir, file));
  process.exit(0);
}

if (action === 'explain') {
  const code = args[0];
  const item = diagnostic(code);
  if (!item) {
    console.error(`Unknown diagnostic code: ${code}`);
    console.error(`Known codes: ${Object.keys(DIAGNOSTICS).join(', ')}`);
    process.exit(1);
  }
  console.log(`${code}: ${item.summary}`);
  console.log(`Recovery: ${item.recovery}`);
  process.exit(0);
}

console.error(`Unknown handoff action: ${action}`);
help();
process.exit(1);
