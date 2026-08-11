import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { controllerDescriptor, assertControllerSubjectBoundary } from '../lib/controller.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-controller-'));
try {
  const descriptor = controllerDescriptor(root, {
    controllerRoot: '/opt/enterprise-harness/0.4.0',
    subjectRoot: root,
    source: 'released-controller',
  });
  assert.equal(descriptor.controllerRoot, '/opt/enterprise-harness/0.4.0');
  assert.equal(descriptor.subjectRoot, root);
  assert.equal(descriptor.controllerRoot === descriptor.subjectRoot, false);
  assert.doesNotThrow(() => assertControllerSubjectBoundary(descriptor));
  assert.throws(
    () => assertControllerSubjectBoundary({ ...descriptor, controllerRoot: root }),
    /EH-CONTROLLER-SUBJECT-001/u,
  );
  console.log('PASS controller-subject-boundary verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
