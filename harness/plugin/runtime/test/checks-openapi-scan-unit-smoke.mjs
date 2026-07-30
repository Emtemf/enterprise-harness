import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateOpenApiLight } from '../lib/checks.mjs';

function fixture(relative, content) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-openapi-scan-'));
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return root;
}

const valid = fixture('service/openapi/api.yaml', [
  'openapi: 3.0.3',
  'paths:',
  '  /orders:',
  '    get:',
  '      responses:',
  "        '200':",
  '          description: ok',
].join('\n'));
const empty = fixture('openapi/api.yaml', 'openapi: 3.0.3\npaths: {}\n');
const generated = fixture('target/generated/openapi/api.yaml', 'not: openapi\n');
try {
  assert.deepEqual(validateOpenApiLight(valid), []);
  assert.ok(validateOpenApiLight(empty).some((problem) => problem.includes('unsupported:no-parseable-paths')));
  assert.deepEqual(validateOpenApiLight(generated), []);
  console.log('PASS checks-openapi-scan-unit verify');
} finally {
  for (const root of [valid, empty, generated]) fs.rmSync(root, { recursive: true, force: true });
}
