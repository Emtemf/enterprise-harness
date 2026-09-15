import { spawnSync } from 'node:child_process';

function defaultExec(command, argv, options) {
  return spawnSync(command, argv, { encoding: 'utf-8', shell: false, ...options });
}

function requireSuccess(result, step) {
  if (result?.status !== 0 || result?.error) {
    throw new Error(`CodeGraph ${step} failed: ${result?.error?.message || result?.stderr || result?.stdout || 'unknown error'}`);
  }
  return result;
}

export function initializeFixtureCodeGraph(root, execCommand = defaultExec) {
  requireSuccess(execCommand('codegraph', ['init', root], { cwd: root }), 'init');
  const statusResult = requireSuccess(execCommand('codegraph', ['status', '--json', root], { cwd: root }), 'status');
  let status;
  try {
    status = JSON.parse(statusResult.stdout);
  } catch {
    throw new Error('CodeGraph status did not return valid JSON');
  }
  if (status.initialized !== true) throw new Error('CodeGraph fixture is not initialized');
  if (!Number.isSafeInteger(status.fileCount) || status.fileCount < 1) {
    throw new Error('CodeGraph fixture contains no indexable source files');
  }
  return status;
}
