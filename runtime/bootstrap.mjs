import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { resolveLocalAdapterPath } from './lib/local-adapter.mjs';
import { atomicWriteJson } from './lib/state-store.mjs';
import { ensureRuntimePaths } from './lib/runtime-paths.mjs';
import { controllerDescriptor, assertControllerSubjectBoundary } from './lib/controller.mjs';

const repoRoot = process.cwd();
const runtimePaths = ensureRuntimePaths(repoRoot);
const controllerRoot = process.env.ENTERPRISE_HARNESS_CONTROLLER_ROOT
  || process.env.CLAUDE_PLUGIN_ROOT;
if (!controllerRoot) {
  throw new Error('EH-CONTROLLER-SUBJECT-002: ENTERPRISE_HARNESS_CONTROLLER_ROOT or CLAUDE_PLUGIN_ROOT must point to an installed released controller');
}
const descriptor = controllerDescriptor(repoRoot, {
  controllerRoot,
  subjectRoot: repoRoot,
  source: process.env.ENTERPRISE_HARNESS_CONTROLLER_SOURCE || 'released-controller',
  controllerRevision: process.env.ENTERPRISE_HARNESS_CONTROLLER_REVISION || '0.4.0-dev',
});
assertControllerSubjectBoundary(descriptor);
atomicWriteJson(path.join(runtimePaths.runtimeRoot, 'controller.json'), descriptor);
const summary = [
  'Enterprise Harness Bootstrap',
  `Repo: ${repoRoot}`,
  `Controller: ${descriptor.controllerRoot}`,
  `Subject: ${descriptor.subjectRoot}`,
  `Local adapter path: ${resolveLocalAdapterPath()}`,
  'Controller and subject are tracked separately; active change state is session-bound.',
  'Use `node runtime/doctor.mjs` to verify runtime readiness.',
  'Project secrets must stay outside the repository.',
];

const markerPath = path.join(repoRoot, 'runtime', '.bootstrap-ran');
fs.writeFileSync(markerPath, new Date().toISOString() + '\n', 'utf-8');
console.log(summary.join('\n'));
