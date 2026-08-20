import assert from 'node:assert/strict';
import * as handoff from '../api/handoff.mjs';
import * as result from '../api/result.mjs';
import * as task from '../api/task.mjs';

const expected = {
  handoff: ['loadHandoffV2', 'readClassificationArtifact', 'v2ResultPath'],
  result: ['selectReviewRubrics', 'sha256Artifact', 'validateReviewResult', 'validateStageResult'],
  task: [
    'assertNoSymlinkComponents',
    'assertSafeId',
    'assertSafeRunId',
    'gitCommonDir',
    'resolveWorktreeContext',
    'taskExecutionReceiptPath',
    'taskExecutionReceiptSpoolPath',
    'validateTaskExecutionReceipt',
  ],
};

for (const [name, api] of Object.entries({ handoff, result, task })) {
  assert.deepEqual(Object.keys(api).sort(), expected[name].sort(), `runtime/api/${name}.mjs public exports changed`);
  for (const exportName of expected[name]) {
    assert.equal(typeof api[exportName], 'function', `${name}.${exportName} must remain callable`);
  }
}

console.log(`PASS runtime-public-api-contract ${process.argv[2] || 'verify'}`);
