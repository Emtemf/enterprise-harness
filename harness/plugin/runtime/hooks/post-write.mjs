import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { projectRoot, isHarnessManaged, hasChangeTracking, validateStructure, validateArtifactStates, validateReviewVerdicts, validateChangeEvidence, validateOpenApiLight, validateReferenceServiceControllerConsistency, validateGenericControllerConsistency } from '../lib/checks.mjs';
import path from 'node:path';
import { loadActiveChange, isGovernedTarget } from '../lib/gates.mjs';
import { renderTECPCCard } from '../lib/tecp-card.mjs';
import { appendAgentEvent } from '../lib/agent-evidence.mjs';
import { extractHookTargets, isPotentialWriteBash } from '../lib/hook-targets.mjs';

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
if (raw) {
  try {
    const event = JSON.parse(raw);
    const targets = extractHookTargets(root, event);
    const active = loadActiveChange(root);
    if (event.tool_name === 'Bash' && isPotentialWriteBash(event.tool_input?.command) && active.ok) {
      const diff = spawnSync('git', ['diff', '--name-only'], { cwd: root, encoding: 'utf-8', shell: false });
      const changedGoverned = String(diff.stdout || '').split('\n').filter(Boolean)
        .map((relative) => path.resolve(root, relative)).filter((target) => isGovernedTarget(root, target));
      const declared = new Set(targets.map((target) => path.resolve(target)));
      for (const target of changedGoverned.filter((item) => !declared.has(item))) {
        appendAgentEvent(root, active.changeId, {
          kind: 'violation',
          violation: 'unparsed-governed-bash-write',
          sessionId: event.session_id,
          agentId: event.agent_id || null,
          cwd: event.cwd || root,
          target: path.relative(root, target).replaceAll('\\', '/'),
        });
      }
      targets.push(...changedGoverned);
    }
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
  } catch {}
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
const semanticProblems = [
  ...validateOpenApiLight(root),
  ...validateGenericControllerConsistency(root),
  ...validateReferenceServiceControllerConsistency(root),
];
if (semanticProblems.length) {
  for (const problem of semanticProblems) console.error(problem);
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
} catch {}
