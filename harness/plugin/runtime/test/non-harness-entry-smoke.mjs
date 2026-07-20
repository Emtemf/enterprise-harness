import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/non-harness-entry-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'non-harness-entry-'));
const targetProject = path.join(tempRoot, 'target-project');
fs.mkdirSync(targetProject, { recursive: true });
fs.writeFileSync(path.join(targetProject, 'pom.xml'), '<project/>\n', 'utf-8');
fs.writeFileSync(path.join(targetProject, 'CLAUDE.md'), '# Target Project\n', 'utf-8');

function runNode(script, input='') {
  return spawnSync('node', [path.join(repoRoot, 'harness', 'plugin', 'runtime', script)], {
    cwd: targetProject,
    encoding: 'utf-8',
    input,
  });
}

try {
  const sessionStart = runNode(path.join('hooks', 'session-start.mjs'));
  const stop = runNode(path.join('hooks', 'stop.mjs'));
  const postWrite = runNode(path.join('hooks', 'post-write.mjs'), JSON.stringify({ tool_input: { file_path: path.join(targetProject, 'src', 'A.java') } }));
  const text = `${sessionStart.stdout}${sessionStart.stderr}\n${stop.stdout}${stop.stderr}\n${postWrite.stdout}${postWrite.stderr}`;

  const failures = [];
  if (sessionStart.status !== 0) failures.push(`session-start exit=${sessionStart.status}`);
  if (stop.status !== 0) failures.push(`stop exit=${stop.status}`);
  if (postWrite.status !== 0) failures.push(`post-write exit=${postWrite.status}`);
  if (!text.includes('/harness')) failures.push('target project entry must still point users to /harness');
  if (text.includes('.harness/')) failures.push('target project entry must not require .harness/ for normal users');
  if (text.includes('bootstrap')) failures.push('target project entry must not require bootstrap for normal users');
  if (text.includes('MODULE_NOT_FOUND')) failures.push('target project entry must not crash with MODULE_NOT_FOUND');

  const ok = failures.length === 0;

  if (mode === 'red') {
    if (!ok) fail(`Expected non-harness project entry contract to fail before implementation:\n${failures.join('\n')}`);
    pass('Red precondition no longer holds.');
  }

  if (!ok) fail(`Expected non-harness project entry contract to pass:\n${failures.join('\n')}`);
  pass(mode === 'green' ? 'Green non-harness entry smoke passed.' : 'Non-harness entry verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
