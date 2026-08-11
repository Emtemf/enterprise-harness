import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadProjectProfile, validateProjectProfile } from '../lib/project-profile.mjs';
import { isGovernedTarget } from '../lib/gates.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-project-profile-'));
try {
  assert.equal(loadProjectProfile(root).build, 'maven');
  fs.mkdirSync(path.join(root, 'harness'), { recursive: true });
  fs.writeFileSync(path.join(root, 'harness', 'project.json'), JSON.stringify({
    profileVersion: 1,
    language: 'java',
    build: 'maven',
    productionRoots: ['app/code'],
    testRoots: ['app/spec'],
    apiRoots: ['contracts'],
    productionPaths: ['**/app/code/**'],
    testPaths: ['**/app/spec/**'],
    apiPaths: ['**/contracts/**'],
  }));
  assert.equal(loadProjectProfile(root).productionRoots[0], 'app/code');
  assert.ok(isGovernedTarget(root, path.join(root, 'service', 'app', 'code', 'Order.java')));
  assert.equal(isGovernedTarget(root, path.join(root, 'service', 'src', 'main', 'java', 'Order.java')), null);
  assert.throws(() => validateProjectProfile({ profileVersion: 1 }), /EH-PROJECT-PROFILE-001/u);
  console.log('PASS project-profile verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
