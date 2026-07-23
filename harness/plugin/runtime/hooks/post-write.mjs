import fs from 'node:fs';
import { projectRoot, isHarnessManaged, hasChangeTracking, validateStructure, validateArtifactStates, validateReviewVerdicts, validateChangeEvidence, validateOpenApiLight, validateReferenceServiceControllerConsistency } from '../lib/checks.mjs';
import path from 'node:path';
import { loadActiveChange, isGovernedTarget } from '../lib/gates.mjs';

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
    const filePath = event.tool_input?.file_path || event.tool_input?.path;
    if (filePath) {
      const target = path.resolve(filePath);
      const active = loadActiveChange(root);
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
  ...validateReferenceServiceControllerConsistency(root),
];
if (semanticProblems.length) {
  for (const problem of semanticProblems) console.error(problem);
  process.exit(1);
}
console.log('Post-write gate passed. 如有业务完成声明，后续仍需 fresh validation 证据。');
