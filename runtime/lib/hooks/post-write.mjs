import fs from 'node:fs';
import path from 'node:path';
import { hasChangeTracking, isHarnessManaged } from '../checks.mjs';
import { isGovernedTarget } from '../gates.mjs';
import { loadHookChange, hookRepoRoot } from '../hook-change.mjs';
import { renderTECPCCard } from '../tecp-card.mjs';
import { extractHookTargets, isPotentialWriteBash } from '../hook-targets.mjs';
import { consumeHookSnapshot, hookSnapshotAlreadyConsumed } from '../hook-snapshots.mjs';
import { canonicalPath, pathIsWithin } from '../safe-paths.mjs';
import { dedupGuard } from '../hook-dedup.mjs';
import { artifactNameForPath, invalidateStateArtifacts } from '../artifacts.mjs';
import { atomicWriteJson } from '../state-store.mjs';

export function postWrite({ root, raw, event: inputEvent = null }) {
  if (!isHarnessManaged(root) && !hasChangeTracking(root)) return { status: 'allow', exitCode: 0 };
  if (!raw) return { status: 'allow', exitCode: 0 };

  let hookEvent;
  try {
    hookEvent = JSON.parse(raw);
  } catch (error) {
    return { status: 'block', exitCode: 2, stderr: `BLOCK [EH-HOOK-POST-WRITE-011] invalid hook JSON: ${error.message}` };
  }

  if (dedupGuard('post-write', hookEvent.tool_use_id, hookEvent.cwd)) return { status: 'allow', exitCode: 0 };

  const canonicalRoot = canonicalPath(root);
  const changesDir = canonicalPath(path.join(root, 'harness', 'changes'));

  function changeWriteScope(target) {
    const t = canonicalPath(target);
    if (!pathIsWithin(t, changesDir)) return 'outside-change';
    const rel = path.relative(changesDir, t).replaceAll('\\', '/');
    const artifactPath = rel.split('/').slice(1).join('/');
    if (!artifactPath) return 'change-root';
    if (artifactPath === 'runs' || artifactPath.startsWith('runs/')) return 'volatile-evidence';
    if (artifactPath === 'evidence/workflow-events.jsonl') return 'volatile-evidence';
    if (artifactPath.startsWith('evidence/bootstrap-recovery') || artifactPath.startsWith('evidence/tdd')) return 'stable-evidence';
    if (/^evidence\/[^/]+-exploration\.md$/u.test(artifactPath)) return 'stable-evidence';
    return 'authority';
  }

  function changeIdForTarget(target) {
    const t = canonicalPath(target);
    if (!pathIsWithin(t, changesDir)) return null;
    const [changeId] = path.relative(changesDir, t).split(path.sep);
    return changeId || null;
  }

  function markValidationStale(statePath, target) {
    if (!fs.existsSync(statePath)) return;
    // post-write validation invalidation is a mechanical artifact→stale projection,
    // not an authoritative state transition. It must not race with concurrent
    // authoritative CAS mutations, so use atomic write rather than raw writeFile.
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    const changeDir = path.dirname(statePath);
    const artifact = artifactNameForPath(path.relative(changeDir, target));
    const next = artifact
      ? invalidateStateArtifacts(state, [artifact])
      : { ...state, validation: state.validation
          ? { ...state.validation, status: 'stale', digest: null, validatedAt: null }
          : state.validation };
    atomicWriteJson(statePath, next);
  }

  function invalidateAffectedValidations(active, target) {
    const relative = path.relative(canonicalRoot, canonicalPath(target)).replaceAll('\\', '/');
    if (relative === 'runtime' || relative.startsWith('runtime/') || relative === 'hooks' || relative.startsWith('hooks/')) {
      if (!fs.existsSync(path.join(root, 'harness', 'changes'))) return;
      for (const entry of fs.readdirSync(path.join(root, 'harness', 'changes'), { withFileTypes: true })) {
        if (entry.isDirectory()) markValidationStale(path.join(root, 'harness', 'changes', entry.name, 'state.json'), target);
      }
      return;
    }
    const scope = changeWriteScope(target);
    if (scope !== 'authority' && scope !== 'stable-evidence' && !isGovernedTarget(root, target)) return;
    const changeId = changeIdForTarget(target);
    if (changeId) {
      markValidationStale(path.join(root, 'harness', 'changes', changeId, 'state.json'), target);
    } else if (active?.ok && isGovernedTarget(root, target)) {
      markValidationStale(active.statePath, target);
    }
  }

  // Bash writes must have a pre-write snapshot for attribution.
  // Missing snapshot = unattributed write → block.
  if (hookEvent.tool_name === 'Bash' && isPotentialWriteBash(hookEvent.tool_input?.command)) {
    const before = consumeHookSnapshot(root, hookEvent.tool_use_id);
    if (!before && !hookSnapshotAlreadyConsumed(root, hookEvent.tool_use_id)) {
      return { status: 'block', exitCode: 2, stderr: 'BLOCK [EH-HOOK-SNAPSHOT-010] Bash 写入无法完整归因；查看 violation ledger 后重试。' };
    }
  }

  try {
    const targets = extractHookTargets(root, hookEvent);
    const active = loadHookChange(root, inputEvent || hookEvent);
    for (const target of targets) {
      invalidateAffectedValidations(active, target);
    }
  } catch (error) {
    return { status: 'block', exitCode: 2, stderr: `BLOCK [EH-HOOK-POST-WRITE-011] ${error.message}` };
  }

  try {
    const active = loadHookChange(root, inputEvent || hookEvent);
    if (active.ok) {
      return { status: 'allow', exitCode: 0, stdout: `[Harness 闭环五检]\n${renderTECPCCard(root, active.changeId, active.data)}` };
    }
  } catch {
    // non-fatal: TECPC card failure does not block the write
  }
  return { status: 'allow', exitCode: 0 };
}
