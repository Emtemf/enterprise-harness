import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { validateOpenApiLight } from '../lib/checks.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/checks-openapi-scan-unit-smoke.mjs <red|green|verify>');
  process.exit(1);
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf-8');
}

function withTempRoot(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'checks-openapi-scan-'));
  try {
    callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const failures = [];
function check(desc, fn) {
  try {
    fn();
  } catch (error) {
    failures.push(`${desc}: ${error.message}`);
  }
}

check('reference-service baseline stays valid', () => {
  withTempRoot((root) => {
    writeText(path.join(root, 'reference-service', 'openapi', 'order-service.yaml'), 'openapi: 3.0.0\npaths: {}\ncomponents: {}\n');
    assert.deepEqual(validateOpenApiLight(root), []);
  });
});

check('non-reference-service openapi directory is detected', () => {
  withTempRoot((root) => {
    writeText(path.join(root, 'foo-service', 'openapi', 'spec.yaml'), 'openapi: 3.0.0\npaths: {}\n');
    const problems = validateOpenApiLight(root);
    assert.ok(problems.some((problem) => problem.includes('foo-service/openapi/spec.yaml') && problem.includes('/^components:/m')),
      `expected missing components error for foo-service/openapi/spec.yaml, got: ${JSON.stringify(problems)}`);
  });
});

check('multi-module reports only broken file with relative path', () => {
  withTempRoot((root) => {
    writeText(path.join(root, 'module-a', 'openapi', 'a.yaml'), 'openapi: 3.0.0\npaths: {}\ncomponents: {}\n');
    writeText(path.join(root, 'module-b', 'openapi', 'b.yaml'), 'openapi: 3.0.0\npaths: {}\n');
    const problems = validateOpenApiLight(root);
    assert.ok(problems.some((problem) => problem.includes('module-b/openapi/b.yaml') && problem.includes('/^components:/m')),
      `expected module-b components error, got: ${JSON.stringify(problems)}`);
    assert.ok(!problems.some((problem) => problem.includes('module-a/openapi/a.yaml')),
      `did not expect module-a errors, got: ${JSON.stringify(problems)}`);
  });
});

check('target/generated openapi is ignored', () => {
  withTempRoot((root) => {
    writeText(path.join(root, 'some-module', 'target', 'generated', 'openapi', 'spec.yaml'), 'openapi: 3.0.0\npaths: {}\n');
    assert.deepEqual(validateOpenApiLight(root), []);
  });
});

check('no openapi directory returns empty', () => {
  withTempRoot((root) => {
    writeText(path.join(root, 'README.md'), '# hello\n');
    assert.deepEqual(validateOpenApiLight(root), []);
  });
});

function fail(message) {
  console.error(message);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (mode === 'red') {
  if (failures.length === 0) {
    fail('Expected openapi scan generalization tests to fail before implementation, but all cases passed.');
  }
  pass('Red precondition holds: validateOpenApiLight still only sees the hardcoded reference-service path.');
}

if (failures.length > 0) {
  fail('checks-openapi-scan-unit-smoke failed.');
}

pass(mode === 'green' ? 'Green checks-openapi-scan-unit-smoke passed.' : 'checks-openapi-scan-unit-smoke verify passed.');
