import fs from 'node:fs';
import { projectRoot, isHarnessManaged, hasChangeTracking, validateStructure, validateArtifactStates, validateReviewVerdicts, validateChangeEvidence, validateOpenApiLight, validateGenericControllerConsistency } from '../lib/checks.mjs';
import path from 'node:path';
import { loadActiveChange, isGovernedTarget } from '../lib/gates.mjs';
import { renderTECPCCard } from '../lib/tecp-card.mjs';
import { appendAgentEvent } from '../lib/agent-evidence.mjs';
import { extractHookTargets, isPotentialWriteBash } from '../lib/hook-targets.mjs';
import {
  captureGovernedSnapshot,
  consumeHookSnapshot,
  diffGovernedSnapshots,
  hookSnapshotAlreadyConsumed,
} from '../lib/hook-snapshots.mjs';
import { canonicalPath, pathIsWithin } from '../lib/safe-paths.mjs';
import { dedupGuard } from '../lib/hook-dedup.mjs';

const root = projectRoot();
const managed = isHarnessManaged(root);
const trackingChanges = hasChangeTracking(root);

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

function activeChangeWriteScope(active, target) {
  if (!active?.ok) return 'outside-active-change';
  const activeChangeDir = canonicalPath(path.join(root, 'harness', 'changes', active.changeId));
  return pathIsWithin(canonicalPath(target), activeChangeDir)
    ? changeWriteScope(target)
    : 'outside-active-change';
}

function requiresFullChangeValidation(active, target) {
  const relative = path.relative(root, canonicalPath(target)).replaceAll('\\', '/');
  const isRuntimeControlPlane = relative === 'runtime' || relative.startsWith('runtime/');
  return isGovernedTarget(root, target)
    || isRuntimeControlPlane
    || changeWriteScope(target) === 'authority';
}

function changeIdForTarget(target) {
  const canonicalTarget = canonicalPath(target);
  const changesDir = canonicalPath(path.join(root, 'harness', 'changes'));
  if (!pathIsWithin(canonicalTarget, changesDir)) return null;
  const [changeId] = path.relative(changesDir, canonicalTarget).split(path.sep);
  return changeId || null;
}

function markValidationStale(statePath) {
  if (!fs.existsSync(statePath)) return;
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  if (!state.validation) return;
  state.validation.status = 'stale';
  state.validation.digest = null;
  state.validation.validatedAt = null;
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

function invalidateAffectedValidations(active, target) {
  const relative = path.relative(root, canonicalPath(target)).replaceAll('\\', '/');
  const isRuntimeControlPlane = relative === 'runtime' || relative.startsWith('runtime/');
  if (isRuntimeControlPlane) {
    const changesDir = path.join(root, 'harness', 'changes');
    if (!fs.existsSync(changesDir)) return;
    for (const entry of fs.readdirSync(changesDir, { withFileTypes: true })) {
      if (entry.isDirectory()) markValidationStale(path.join(changesDir, entry.name, 'state.json'));
    }
    return;
  }
  const scope = changeWriteScope(target);
  if (scope !== 'authority' && scope !== 'stable-evidence' && !isGovernedTarget(root, target)) return;
  const changeId = changeIdForTarget(target);
  if (changeId) {
    markValidationStale(path.join(root, 'harness', 'changes', changeId, 'state.json'));
    return;
  }
  if (active?.ok && isGovernedTarget(root, target)) markValidationStale(active.statePath);
}

// A target project with no harness/changes/ at all has no change-lifecycle state to
// validate against; no-op gracefully rather than reading stdin for nothing.
if (!managed && !trackingChanges) {
  process.exit(0);
}
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks).toString('utf-8').trim();
let incrementalTargets = [];
let attributionBlocked = false;
let potentialBashWrite = false;
if (raw) {
  let event;
  try {
    event = JSON.parse(raw);
  } catch (error) {
    console.error(`BLOCK [EH-HOOK-POST-WRITE-011] invalid hook JSON: ${error.message}`);
    process.exit(2);
  }
  try {
    if (dedupGuard('post-write', event.tool_use_id, event.cwd)) process.exit(0);
    const targets = extractHookTargets(root, event);
    const active = loadActiveChange(root);
    potentialBashWrite = event.tool_name === 'Bash' && isPotentialWriteBash(event.tool_input?.command);
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
    incrementalTargets = [...new Set(targets.map((target) => canonicalPath(target)))];
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
    console.error(`BLOCK [EH-HOOK-POST-WRITE-011] ${error.message}`);
    process.exit(2);
  }
}
if (attributionBlocked) {
  console.error('BLOCK [EH-HOOK-SNAPSHOT-010] Bash 写入无法完整归因；查看 violation ledger 后重试。');
  process.exit(2);
}
const fullValidationTargets = incrementalTargets.filter((target) => requiresFullChangeValidation(loadActiveChange(root), target));
const touchesGoverned = fullValidationTargets.some((target) => isGovernedTarget(root, target));
const semanticProblems = touchesGoverned ? [
  ...validateOpenApiLight(root),
  ...validateGenericControllerConsistency(root),
] : [];
if (semanticProblems.length) {
  for (const problem of semanticProblems) console.error(problem);
  // manifest 声明 post-write 为 fail-closed；Claude Code 只把 exit 2 当作 block，
  // exit 1 会被当成普通失败并放行，等于治理检查形同虚设。
  process.exit(2);
}
const shouldRunFullChangeValidation = !raw
  || (potentialBashWrite && incrementalTargets.length === 0)
  || fullValidationTargets.length > 0;
const problems = !shouldRunFullChangeValidation ? [] : [
  // validateStructure checks this repo's own fixed file list; only meaningful once a
  // target project has fully onboarded (harness/changes/ + harness/specs/ both present).
  ...(managed ? validateStructure(root).map((m) => `${m.kind}:${m.path}`) : []),
  // These three only touch harness/changes/*, are self-guarded for its absence, and should
  // run for any project tracking changes even before it has authored harness/specs/.
  ...(trackingChanges ? validateArtifactStates(root) : []),
  ...(trackingChanges ? validateReviewVerdicts(root) : []),
  ...(trackingChanges ? validateChangeEvidence(root) : []),
];
if (problems.length) {
  for (const problem of problems) console.error(problem);
  process.exit(2);
}
console.log('Post-write gate passed. 如有业务完成声明，后续仍需 fresh validation 证据。');
// 每次写完受治理路径后，输出 TECPC 卡让用户看到进度更新
try {
  const active = loadActiveChange(root);
  if (active.ok) {
    const card = renderTECPCCard(root, active.changeId, active.data);
    console.log(`[Harness 闭环五检]\n${card}`);
  }
} catch (error) {
  console.log(`[Harness 诊断 EH-POST-WRITE-TECP-016] ${error.message}`);
}
