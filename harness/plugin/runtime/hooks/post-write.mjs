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
} from '../lib/hook-snapshots.mjs';

const root = projectRoot();
const managed = isHarnessManaged(root);
const trackingChanges = hasChangeTracking(root);

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
if (raw) {
  let event;
  try {
    event = JSON.parse(raw);
  } catch (error) {
    console.error(`BLOCK [EH-HOOK-POST-WRITE-011] invalid hook JSON: ${error.message}`);
    process.exit(1);
  }
  try {
    const targets = extractHookTargets(root, event);
    const active = loadActiveChange(root);
    if (event.tool_name === 'Bash' && isPotentialWriteBash(event.tool_input?.command)) {
      const before = consumeHookSnapshot(root, event.tool_use_id);
      if (!before) {
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
      const declared = new Set(targets.map((target) => path.resolve(target)));
      for (const target of changedGoverned.filter((item) => !declared.has(item))) {
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
    incrementalTargets = [...new Set(targets.map((target) => path.resolve(target)))];
    for (const target of targets) {
      const activeChangeDir = active.ok ? path.resolve(path.join(root, 'harness', 'changes', active.changeId)) : null;
      const touchesActiveChange = activeChangeDir && (target === activeChangeDir || target.startsWith(activeChangeDir + path.sep));
      if ((isGovernedTarget(root, target) || touchesActiveChange) && active.ok && active.data.validation) {
        active.data.validation.status = 'stale';
        active.data.validation.digest = null;
        active.data.validation.validatedAt = null;
        fs.writeFileSync(active.statePath, JSON.stringify(active.data, null, 2) + '\n', 'utf-8');
      }
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
    process.exit(1);
  }
}
if (attributionBlocked) {
  console.error('BLOCK [EH-HOOK-SNAPSHOT-010] Bash 写入无法完整归因；查看 violation ledger 后重试。');
  process.exit(2);
}
const touchesGoverned = incrementalTargets.some((target) => isGovernedTarget(root, target));
const semanticProblems = touchesGoverned ? [
  ...validateOpenApiLight(root),
  ...validateGenericControllerConsistency(root),
] : [];
if (semanticProblems.length) {
  for (const problem of semanticProblems) console.error(problem);
  process.exit(1);
}
const problems = [
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
  process.exit(1);
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
