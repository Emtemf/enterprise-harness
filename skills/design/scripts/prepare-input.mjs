import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { sha256Artifact } from '../../../runtime/lib/result-contract.mjs';
import { readClassificationArtifact } from '../../../runtime/core/classification-artifact.mjs';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function requiredFile(changeDir, name) {
  const file = path.join(changeDir, name);
  if (!fs.existsSync(file)) throw new Error(`EH-DESIGN-PREPARE-001: missing ${name}`);
  return file;
}

const [changeId] = process.argv.slice(2);
if (!changeId) {
  console.error('Usage: node skills/design/scripts/prepare-input.mjs <change-id>');
  process.exit(2);
}

try {
  const root = process.cwd();
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  const state = readJson(requiredFile(changeDir, 'state.json'));
  if (state.schemaVersion !== 6 || state.stage !== 'design') {
    throw new Error('EH-DESIGN-PREPARE-002: v6 change must be at design stage');
  }
  const requirements = requiredFile(changeDir, 'requirements.md');
  const classification = readClassificationArtifact(root, changeId, state.artifacts?.classification);
  const inputRefs = ['harness/changes/' + changeId + '/requirements.md'];
  const conditionalReferences = ['references/method.md'];
  if (classification.impact.api === 'yes') conditionalReferences.push('references/api-design.md');
  if (classification.impact.data === 'yes') conditionalReferences.push('references/data-design.md');
  process.stdout.write(JSON.stringify({
    inputVersion: 1,
    changeId,
    stage: 'design',
    classification,
    inputRefs,
    inputDigests: { [inputRefs[0]]: sha256Artifact(root, path.relative(root, requirements)) },
    conditionalReferences,
  }, null, 2) + '\n');
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
