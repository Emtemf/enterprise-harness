import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readLocalAdapter, validateLocalAdapterData } from '../lib/local-adapter.mjs';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const fixturesRoot = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'test', 'fixtures');
const mode = process.argv[2];
const problemKeys = ['path', 'code', 'severity', 'message', 'nextAction', 'source'];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

function isStructured(problem) {
  return problemKeys.every((key) => key in problem);
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/local-adapter-schema-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const missingFieldProblems = validateLocalAdapterData(
  JSON.parse(fs.readFileSync(path.join(fixturesRoot, 'local-adapter-missing-fields.json'), 'utf-8'))
);

const warningFieldProblems = validateLocalAdapterData(
  JSON.parse(fs.readFileSync(path.join(fixturesRoot, 'local-adapter-warning-fields.json'), 'utf-8'))
);

const malformedResult = readLocalAdapter({
  filePath: path.join(fixturesRoot, 'local-adapter-malformed.json'),
  exists: () => true,
  readFile: () => fs.readFileSync(path.join(fixturesRoot, 'local-adapter-malformed.json'), 'utf-8'),
});

const missingFileResult = readLocalAdapter({
  filePath: path.join(fixturesRoot, 'local-adapter-missing-fields.json'),
  exists: () => false,
});

const readFailureMeta = JSON.parse(fs.readFileSync(path.join(fixturesRoot, 'local-adapter-read-failure.meta.json'), 'utf-8'));
const readFailureResult = readLocalAdapter({
  filePath: path.join(fixturesRoot, 'local-adapter-read-failure.json'),
  exists: () => true,
  readFile: () => {
    const error = new Error(readFailureMeta.message);
    error.code = readFailureMeta.code;
    throw error;
  },
});

const hasStructuredProblems =
  missingFieldProblems.length > 0
  && missingFieldProblems.every(isStructured)
  && malformedResult.problems.every(isStructured)
  && missingFileResult.problems.every(isStructured)
  && readFailureResult.problems.every(isStructured);

const hasHardAndWarn =
  missingFieldProblems.some((problem) => problem.path === 'nodeCommand' && problem.severity === 'error')
  && warningFieldProblems.some((problem) => problem.path === 'codegraphCommand' && problem.severity === 'warn');

const hasMalformedJsonProblem = malformedResult.problems.some((problem) => problem.code === 'invalid-json');
const hasMissingFileProblem = missingFileResult.problems.some((problem) => problem.code === 'adapter-file-missing');
const hasReadFailureProblem = readFailureResult.problems.some((problem) => problem.code === 'io-read-failed');
const ok = hasStructuredProblems && hasHardAndWarn && hasMalformedJsonProblem && hasMissingFileProblem && hasReadFailureProblem;

if (mode === 'red') {
  if (!ok) {
    fail('Expected field-level adapter diagnostics and read-failure handling to be missing before implementation');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected field-level adapter diagnostics and read-failure handling to be available');
}

pass(mode === 'green' ? 'Green local-adapter schema smoke passed.' : 'Local-adapter schema verify smoke passed.');
