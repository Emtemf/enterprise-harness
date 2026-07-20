import fs from 'node:fs';
import { projectRoot, isHarnessManaged, validateStructure, validateArtifactStates, validateReviewVerdicts, validateChangeEvidence, validateOpenApiLight, validateControllerConsistency } from '../lib/checks.mjs';
import path from 'node:path';
import { loadActiveChange, isGovernedTarget } from '../lib/gates.mjs';

const root = projectRoot();

// If the plugin is installed into a target project that is not harness-managed,
// harness structure/state validation does not apply. No-op gracefully.
if (!isHarnessManaged(root)) {
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
  ...validateStructure(root).map((m) => `${m.kind}:${m.path}`),
  ...validateArtifactStates(root),
  ...validateReviewVerdicts(root),
  ...validateChangeEvidence(root),
];
if (problems.length) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
const semanticProblems = [
  ...validateOpenApiLight(root),
  ...validateControllerConsistency(root),
];
if (semanticProblems.length) {
  for (const problem of semanticProblems) console.error(problem);
  process.exit(1);
}
console.log('Post-write gate passed. 如有业务完成声明，后续仍需 fresh validation 证据。');
