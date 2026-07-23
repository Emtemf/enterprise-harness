import assert from 'node:assert/strict';
import path from 'node:path';
import process from 'node:process';
import { isGovernedTarget, requiredGateForTarget } from '../lib/gates.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/gates-governed-target-unit-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const root = path.resolve('/repo');

function target(...segments) {
  return path.join(root, ...segments);
}

const cases = [
  {
    name: 'reference-service/src/main/java (backward compat)',
    target: target('reference-service', 'src', 'main', 'java', 'com', 'example', 'Foo.java'),
    expectGoverned: true,
    expectGate: { needsDesignApproved: true, needsRedVerified: true },
  },
  {
    name: 'reference-service/src/test/java (backward compat)',
    target: target('reference-service', 'src', 'test', 'java', 'com', 'example', 'FooTest.java'),
    expectGoverned: true,
    expectGate: { needsDesignApproved: true, needsRedVerified: false },
  },
  {
    name: 'reference-service/openapi (backward compat)',
    target: target('reference-service', 'openapi', 'order-service.yaml'),
    expectGoverned: true,
    expectGate: { needsDesignApproved: true, needsRedVerified: true },
  },
  {
    name: 'non-reference-service module src/main/java (core fix regression)',
    target: target('foo-service', 'src', 'main', 'java', 'com', 'acme', 'Foo.java'),
    expectGoverned: true,
    expectGate: { needsDesignApproved: true, needsRedVerified: true },
  },
  {
    name: 'generated-sources ancestor directory named target (blacklist ancestor)',
    target: target('order-service', 'target', 'generated-sources', 'annotations', 'src', 'main', 'java', 'Foo.java'),
    expectGoverned: false,
    expectGate: null,
  },
  {
    name: 'package name containing blacklist word "target" must NOT be excluded',
    target: target('src', 'main', 'java', 'com', 'acme', 'target', 'service', 'Foo.java'),
    expectGoverned: true,
    expectGate: { needsDesignApproved: true, needsRedVerified: true },
  },
  {
    name: 'unrelated top-level doc file',
    target: target('README.md'),
    expectGoverned: false,
    expectGate: null,
  },
  {
    name: 'unrelated nested doc file',
    target: target('docs', 'foo.md'),
    expectGoverned: false,
    expectGate: null,
  },
];

const failures = [];
for (const testCase of cases) {
  try {
    const governed = isGovernedTarget(root, testCase.target);
    if (testCase.expectGoverned) {
      assert.ok(governed, `expected isGovernedTarget to be truthy for: ${testCase.name}`);
    } else {
      assert.equal(governed, null, `expected isGovernedTarget to be null for: ${testCase.name}`);
    }
    const gate = requiredGateForTarget(root, testCase.target);
    if (testCase.expectGate === null) {
      assert.equal(gate, null, `expected requiredGateForTarget to be null for: ${testCase.name}`);
    } else {
      assert.deepEqual(gate, testCase.expectGate, `unexpected gate result for: ${testCase.name}`);
    }
  } catch (error) {
    failures.push(`${testCase.name}: ${error.message}`);
  }
}

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
    fail('Expected governed-target detection to fail for non-reference-service paths before the fix, but all cases passed.');
  }
  pass('Red precondition holds: governed-target detection does not yet generalize beyond reference-service/.');
}

if (failures.length > 0) {
  fail('gates-governed-target-unit-smoke failed.');
}

pass(mode === 'green' ? 'Green gates-governed-target-unit-smoke passed.' : 'gates-governed-target-unit-smoke verify passed.');
