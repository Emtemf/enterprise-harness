import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const cliPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'cli.mjs');
const context7Path = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'context7.mjs');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

function runNode(scriptPath, args, cwd, env = {}) {
  return spawnSync('node', [scriptPath, ...args], {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      ...env,
    },
  });
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/runtime-launcher-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-launcher-contract-'));
const outsideCwd = path.join(tempRoot, 'outside-cwd');
const stubsDir = path.join(tempRoot, 'stubs');
const argvCapturePath = path.join(tempRoot, 'ctx7-argv.json');
fs.mkdirSync(outsideCwd, { recursive: true });
fs.mkdirSync(stubsDir, { recursive: true });

const stubPath = path.join(stubsDir, 'npx');
fs.writeFileSync(
  stubPath,
  `#!/usr/bin/env node
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(argvCapturePath)}, JSON.stringify(process.argv.slice(2), null, 2) + '\\n', 'utf-8');
process.stdout.write('stub ctx7 ok\\n');
`,
  { mode: 0o755 }
);

try {
  const cliStatus = runNode(cliPath, ['status'], outsideCwd);
  const context7Docs = runNode(
    context7Path,
    ['docs', '/react/react', 'use effect examples'],
    outsideCwd,
    { PATH: `${stubsDir}:${process.env.PATH}` }
  );

  const argvObserved = fs.existsSync(argvCapturePath)
    ? JSON.parse(fs.readFileSync(argvCapturePath, 'utf-8'))
    : null;

  const failures = [];
  if (!(cliStatus.status === 0 && String(cliStatus.stdout || '').includes('Enterprise Harness Status'))) {
    failures.push(`cli status failed (exit=${cliStatus.status}) stdout=${JSON.stringify(String(cliStatus.stdout || '').trim())} stderr=${JSON.stringify(String(cliStatus.stderr || '').trim())}`);
  }
  if (!(context7Docs.status === 0)) {
    failures.push(`context7 docs failed (exit=${context7Docs.status}) stdout=${JSON.stringify(String(context7Docs.stdout || '').trim())} stderr=${JSON.stringify(String(context7Docs.stderr || '').trim())}`);
  }
  const expectedArgv = ['-y', 'ctx7', 'docs', '/react/react', 'use effect examples'];
  if (JSON.stringify(argvObserved) !== JSON.stringify(expectedArgv)) {
    failures.push(`context7 argv mismatch observed=${JSON.stringify(argvObserved)} expected=${JSON.stringify(expectedArgv)}`);
  }

  const ok = failures.length === 0;

  if (mode === 'red') {
    if (!ok) {
      fail(`Expected current launcher contract to fail before implementation:\n${failures.join('\n')}`);
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    fail(`Expected launcher contract smoke to pass:\n${failures.join('\n')}`);
  }

  pass(mode === 'green' ? 'Green runtime launcher contract smoke passed.' : 'Runtime launcher contract verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
