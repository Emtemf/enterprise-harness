import fs from 'node:fs';
import path from 'node:path';
import { hasChangeTracking, isHarnessManaged } from '../checks.mjs';
import { loadActiveChange, isGovernedTarget } from '../gates.mjs';
import { renderTECPCCard } from '../tecp-card.mjs';
import { appendAgentEvent } from '../agent-evidence.mjs';
import { extractHookTargets, isPotentialWriteBash } from '../hook-targets.mjs';
import {
  captureGovernedSnapshot,
  consumeHookSnapshot,
  diffGovernedSnapshots,
  hookSnapshotAlreadyConsumed,
} from '../hook-snapshots.mjs';
import { canonicalPath, pathIsWithin } from '../safe-paths.mjs';
import { dedupGuard } from '../hook-dedup.mjs';
import { artifactNameForPath, invalidateStateArtifacts } from '../artifacts.mjs';

export function postWrite({ root, raw }) {
  const managed = isHarnessManaged(root);
  const trackingChanges = hasChangeTracking(root);
  // No change tracking at all: nothing to validate or invalidate.
  if (!managed && !trackingChanges) return { status: 'allow', exitCode: 0 };

  if (!raw) return { status: 'allow', exitCode: 0, stdout: renderTecpcCard(root) };

  let event;
  try {
    event = JSON.parse(raw);
  } catch (error) {
    return {
      status: 'block',
      exitCode: 2,
      stderr: `BLOCK [EH-HOOK-POST-WRITE-011] invalid hook JSON: ${error.message}`,
    };
  }

  if (dedupGuard('post-write', event.tool_use_id, event.cwd)) return { status: 'allow', exitCode: 0 };

  const canonicalRoot = canonicalPath(root);

  function relativeToRoot(target) {
    return path.relative(canonicalRoot, canonicalPath(target)).replaceAll('\\', '/');
  }

  function changeWriteScope(target) {
    const canonicalTarget = canonicalPath(target);
    const changesDir = canonicalPath(path.join(root, 'harness', 'changes'));
    if (!pathIsWithin(canonicalTarget, changesDir)) return 'outside-change';
    const relative = path.relative(changesDir, canonicalTarget).replaceAll('\\', '/');
    const [, ...changeRelative] = relative.split('/');
    const artifactPath = changeRelative.join('/');
    if (!artifactPath) return 'change-root';
    if (artifactPath === 'runs' || artifactPath.startsWith('runs/')) return 'volatile-evidence';
    if (artifactPath === 'evidence/workflow-events.jsonl') return 'volatile-evidence';
    if (artifactPath === 'evidence/bootstrap-recovery' || artifactPath.startsWith('evidence/bootstrap-recovery/')) return 'stable-evidence';
    if (artifactPath === 'evidence/tdd' || artifactPath.startsWith('evidence/tdd/')) return 'stable-evidence';
    if (/^evidence\/[^/]+-exploration\.md$/u.test(artifactPath)) return 'stable-evidence';
    return 'authority';
  }

  function changeIdForTarget(target) {
    const canonicalTarget = canonicalPath(target);
    const changesDir = canonicalPath(path.join(root, 'harness', 'changes'));
    if (!pathIsWithin(canonicalTarget, changesDir)) return null;
    const [changeId] = path.relative(changesDir, canonicalTarget).split(path.sep);
    return changeId || null;
  }

  function markValidationStale(statePath, target) {
    if (!fs.existsSync(statePath)) return;
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    const changeDir = path.dirname(statePath);
    const artifact = artifactNameForPath(path.relative(changeDir, target));
    const next = artifact
      ? invalidateStateArtifacts(state, [artifact])
      : {
        ...state,
        validation: state.validation
          ? { ...state.validation, status: 'stale', digest: null, validatedAt: null }
          : state.validation,
      };
    fs.writeFileSync(statePath, JSON.stringify(next, null, 2) + '\n', 'utf-8');
  }

  function invalidateAffectedValidations(active, target) {
    const relative = relativeToRoot(target);
    const isRuntimeControlPlane = relative === 'runtime' || relative.startsWith('runtime/');
    if (isRuntimeControlPlane) {
      const changesDir = path.join(root, 'harness', 'changes');
      if (!fs.existsSync(changesDir)) return;
      for (const entry of fs.readdirSync(changesDir, { withFileTypes: true })) {
        if (entry.isDirectory()) markValidationStale(path.join(changesDir, entry.name, 'state.json'), target);
      }
      return;
    }
    const scope = changeWriteScope(target);
    if (scope !== 'authority' && scope !== 'stable-evidence' && !isGovernedTarget(root, target)) return;
    const changeId = changeIdForTarget(target);
    if (changeId) {
      markValidationStale(path.join(root, 'harness', 'changes', changeId, 'state.json'), target);
      return;
    }
    if (active?.ok && isGovernedTarget(root, target)) markValidationStale(active.statePath, target);
  }

  try {
    const targets = extractHookTargets(root, event);
    const active = loadActiveChange(root);
    const potentialBashWrite = event.tool_name === 'Bash' && isPotentialWriteBash(event.tool_input?.command);
    let attributionBlocked = false;
    if (potentialBashWrite) {
      const before = consumeHookSnapshot(root, event.tool_use_id);
      if (!before && !hookSnapshotAlreadyConsumed(root, event.tool_use_id)) {
        attributionBlocked = true;
        if (active.ok) {
          appendAgentEvent(root, active.changeId, {
            kind: 'violation',
            violation: 'missing-bash-write-snapshot',
            errorCode: 'EH-HOOK-SNAPSHOT-010',
            sessionId: event.session_id,
            toolUseId: event.tool_use_id || null,
            agentId: event.agent_id || null,
            cwd: event.cwd || root,
          });
        }
      }
      const changedGoverned = before
        ? diffGovernedSnapshots(before, captureGovernedSnapshot(root))
          .map((relative) => path.resolve(root, relative))
        : [];
      const declared = new Set(targets.map((target) => canonicalPath(target)));
      for (const target of changedGoverned.filter((item) => !declared.has(canonicalPath(item)))) {
        attributionBlocked = true;
        if (active.ok) {
          appendAgentEvent(root, active.changeId, {
            kind: 'violation',
            violation: 'unparsed-governed-bash-write',
            errorCode: 'EH-HOOK-POST-WRITE-011',
            sessionId: event.session_id,
            toolUseId: event.tool_use_id || null,
            agentId: event.agent_id || null,
            cwd: event.cwd || root,
            target: path.relative(root, target).replaceAll('\\', '/'),
          });
        }
      }
      targets.push(...changedGoverned);
    }
    if (attributionBlocked) {
      return {
        status: 'block',
        exitCode: 2,
        stderr: 'BLOCK [EH-HOOK-SNAPSHOT-010] Bash 写入无法完整归因；查看 violation ledger 后重试。',
      };
    }
    for (const target of targets) {
      invalidateAffectedValidations(active, target);
    }
  } catch (error) {
    const active = loadActiveChange(root);
    if (active.ok) {
      appendAgentEvent(root, active.changeId, {
        kind: 'violation',
        violation: 'post-write-attribution-failed',
        errorCode: 'EH-HOOK-POST-WRITE-011',
        sessionId: event?.session_id,
        toolUseId: event?.tool_use_id || null,
        agentId: event?.agent_id || null,
        cwd: event?.cwd || root,
        detail: error.message,
      });
    }
    return {
      status: 'block',
      exitCode: 2,
      stderr: `BLOCK [EH-HOOK-POST-WRITE-011] ${error.message}`,
    };
  }

  return { status: 'allow', exitCode: 0, stdout: renderTecpcCard(root) };
}

function renderTecpcCard(root) {
  try {
    const active = loadActiveChange(root);
    if (active.ok) {
      return `[Harness 闭环五检]\n${renderTECPCCard(root, active.changeId, active.data)}`;
    }
  } catch (error) {
    return `[Harness 诊断 EH-POST-WRITE-TECP-016] ${error.message}`;
  }
  return '';
}
