import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const utilityUrl = pathToFileURL(path.join(repoRoot, 'runtime', 'lib', 'temp-sandbox.mjs')).href;
const probe = `
  import fs from 'node:fs';
  import { createTempSandbox } from ${JSON.stringify(utilityUrl)};
  const sandbox = createTempSandbox('temp-sandbox-probe-');
  fs.writeFileSync(sandbox.path + '/marker', 'created\\n');
  console.log(sandbox.path);
  process.exit(0);
`;

const result = spawnSync(process.execPath, ['--input-type=module', '--eval', probe], {
  cwd: repoRoot,
  encoding: 'utf-8',
  env: { ...process.env, TMPDIR: os.tmpdir() },
});

assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
const sandboxPath = result.stdout.trim();
assert.ok(sandboxPath.startsWith(path.join(os.tmpdir(), 'temp-sandbox-probe-')));
assert.equal(fs.existsSync(sandboxPath), false, 'temporary sandbox must be removed on process.exit()');

console.log('PASS temp sandbox cleanup smoke');
