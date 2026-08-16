import fs from 'node:fs';
import {
  appendAgentEvent,
  isHarnessAgentType,
  normalizeAgentType,
  sha256,
  readAgentEvents,
} from '../agent-evidence.mjs';
import {
  loadHandoffInput,
  parseHandoffResult,
  persistHandoffResult,
  validateHandoffResult,
} from '../handoff.mjs';
import { formatDiagnostic } from '../diagnostics.mjs';
import { hookChangeId, hookRepoRoot } from '../hook-change.mjs';
import { loadHandoffV2, v2ResultPath } from '../../core/handoff-v2.mjs';

function completeV6Handoff({ repoRoot, changeId, event, normalized, observedRaw, cwd, message }) {
  const events = readAgentEvents(repoRoot, changeId);
  const stoppedRuns = new Set(events
    .filter((item) => item.kind === 'stop' && item.agentId === event.agent_id)
    .map((item) => item.runId));
  const candidates = events.filter((item) => (
    item.kind === 'dispatch'
    && item.sessionId === event.session_id
    && item.requestedAgentType === normalized
    && !stoppedRuns.has(item.runId)
  )).flatMap((dispatch) => {
    try {
      const input = loadHandoffV2(repoRoot, changeId, dispatch.runId);
      const resultPath = v2ResultPath(repoRoot, changeId, input.runId, input.role);
      return fs.existsSync(resultPath) ? [{ dispatch, input, resultPath }] : [];
    } catch {
      return [];
    }
  });
  if (candidates.length !== 1) {
    const problems = [`expected one persisted v2 result for the active agent dispatch, found ${candidates.length}`];
    appendAgentEvent(repoRoot, changeId, {
      kind: 'violation',
      violation: 'missing-or-ambiguous-v2-result',
      sessionId: event.session_id,
      agentId: event.agent_id,
      observedAgentType: normalized,
      rawObservedAgentType: observedRaw,
      errorCode: 'EH-SUBAGENT-RESULT-004',
      problems,
      transcriptDigest: sha256(message),
      cwd,
    });
    if (event.stop_hook_active) return { exitCode: 0 };
    return {
      exitCode: 0,
      stdout: `${JSON.stringify({
        decision: 'block',
        reason: formatDiagnostic('EH-SUBAGENT-RESULT-004', problems[0], { changeId }),
      })}\n`,
    };
  }
  const [{ dispatch, input, resultPath }] = candidates;
  appendAgentEvent(repoRoot, changeId, {
    kind: 'stop',
    sessionId: event.session_id,
    agentId: event.agent_id,
    observedAgentType: normalized,
    rawObservedAgentType: observedRaw,
    runId: input.runId,
    behavior: input.behavior,
    handoffRole: input.role,
    handoffPath: resultPath,
    parentRunId: input.parentRunId,
    transcriptDigest: sha256(message),
    cwd,
  });
  void dispatch;
  return { exitCode: 0 };
}

export function subagentStop({ root, event }) {
  const observedRaw = String(event.agent_type || '').trim();
  if (!isHarnessAgentType(observedRaw)) return { exitCode: 0 };
  const normalized = normalizeAgentType(observedRaw);
  const message = String(event.last_assistant_message || '');
  const cwd = event.cwd || root;
  // When the subagent runs in a worktree, process.cwd() is the worktree dir but
  // handoff inputs and agent events live in the main repo. Resolve via git common dir.
  const repoRoot = hookRepoRoot(root, event);
  const changeId = hookChangeId(repoRoot, event);
  if (!changeId || !event.agent_id) return { exitCode: 0 };
  const hasV2Dispatch = readAgentEvents(repoRoot, changeId).some((item) => {
    if (item.kind !== 'dispatch' || item.sessionId !== event.session_id
      || item.requestedAgentType !== normalized) return false;
    try {
      return loadHandoffV2(repoRoot, changeId, item.runId).handoffVersion === 2;
    } catch {
      return false;
    }
  });
  if (hasV2Dispatch) {
    return completeV6Handoff({ repoRoot, changeId, event, normalized, observedRaw, cwd, message });
  }

  const parsed = parseHandoffResult(message);
  const runId = parsed.value?.runId || null;
  const dispatch = runId
    ? [...readAgentEvents(repoRoot, changeId)].reverse().find((item) => (
      item.kind === 'dispatch'
      && item.runId === runId
      && item.requestedAgentType === normalized
    ))
    : null;
  const loaded = dispatch
    ? loadHandoffInput(repoRoot, dispatch.handoffPath, {
      changeId,
      agentType: normalized,
    })
    : { ok: false, problems: ['no matching dispatch for result runId'] };
  const resultProblems = [
    ...(parsed.problems || []),
    ...(loaded.problems || []),
    ...(parsed.ok && loaded.ok
      ? validateHandoffResult(parsed.value, loaded.envelope, normalized)
      : []),
  ];

  if (resultProblems.length > 0) {
    appendAgentEvent(repoRoot, changeId, {
      kind: 'violation',
      violation: 'malformed-subagent-result',
      sessionId: event.session_id,
      agentId: event.agent_id,
      observedAgentType: normalized,
      rawObservedAgentType: observedRaw,
      runId,
      errorCode: 'EH-SUBAGENT-RESULT-004',
      problems: resultProblems,
      transcriptDigest: sha256(message),
      cwd,
    });
    if (event.stop_hook_active) return { exitCode: 0 };
    return {
      exitCode: 0,
      stdout: `${JSON.stringify({
        decision: 'block',
        reason: formatDiagnostic(
          'EH-SUBAGENT-RESULT-004',
          resultProblems.join('; '),
          { changeId, runId },
        ),
      })}\n`,
    };
  }

  const resultPath = persistHandoffResult(repoRoot, loaded.envelope, parsed.value);
  appendAgentEvent(repoRoot, changeId, {
    kind: 'stop',
    sessionId: event.session_id,
    agentId: event.agent_id,
    observedAgentType: normalized,
    rawObservedAgentType: observedRaw,
    runId,
    behavior: loaded.envelope.behavior,
    handoffRole: loaded.envelope.role,
    handoffPath: resultPath,
    parentRunId: loaded.envelope.parentRunId,
    verdict: parsed.value.verdict || null,
    transcriptDigest: sha256(message),
    cwd,
  });
  return { exitCode: 0 };
}
