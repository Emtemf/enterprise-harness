import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const stopPath = fileURLToPath(new URL('../hooks/stop.mjs', import.meta.url));
const fixturesRoot = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'test', 'fixtures');
const mode = process.argv[2];
const guidanceTokens = [
  'Stop handoff guidance',
  'change-specific 结论',
  'repo-level 阶段信息',
  'PROGRESS.md',
  'Claude memory',
  '聊天记录',
];

function readText(file) {
  return fs.readFileSync(file, 'utf-8');
}

function runStop(cwd) {
  return spawnSync('node', [stopPath], {
    cwd,
    encoding: 'utf-8',
  });
}

function outputOf(result) {
  return `${result.stdout || ''}${result.stderr || ''}`;
}

function createTempRepo(setup) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-handoff-'));
  fs.mkdirSync(path.join(tempRoot, 'harness', 'changes'), { recursive: true });
  setup(tempRoot);
  return tempRoot;
}

function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function createGuidanceRepo() {
  return createTempRepo((tempRoot) => {
    const changeId = 'stop-handoff-guidance';
    const changeDir = path.join(tempRoot, 'harness', 'changes', changeId);
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`, 'utf-8');
    fs.writeFileSync(path.join(tempRoot, 'PROGRESS.md'), '# Progress\n', 'utf-8');
    fs.writeFileSync(
      path.join(changeDir, 'state.json'),
      JSON.stringify({
        schemaVersion: 1,
        changeId,
        tier: 'L3',
        state: 'EXECUTING',
        impact: {
          api: 'no',
          data: 'no',
          architecture: 'yes',
          rule: 'yes',
        },
        tooling: {
          codegraph: {
            status: 'ready',
            queries: [],
            fallbackReason: null,
          },
          documentation: {
            status: 'not-needed',
            libraries: [],
          },
        },
        validation: {
          status: 'missing',
          digest: null,
          validatedAt: null,
        },
      }, null, 2) + '\n',
      'utf-8'
    );
    fs.writeFileSync(path.join(changeDir, 'validation.md'), '# Validation\n', 'utf-8');
  });
}

function createFixtureRepo(fixtureName, options = {}) {
  return createTempRepo((tempRoot) => {
    const changeDir = path.join(tempRoot, 'harness', 'changes', fixtureName);
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'state.json'), readText(path.join(fixturesRoot, fixtureName, 'state.json')), 'utf-8');
    if (options.withValidation) {
      fs.writeFileSync(path.join(changeDir, 'validation.md'), '# Validation\n', 'utf-8');
    }
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/stop-handoff-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const guidanceRepo = createGuidanceRepo();
const missingValidationRepo = createFixtureRepo('stop-handoff-missing-validation');
const staleValidationRepo = createFixtureRepo('stop-handoff-stale-validation', { withValidation: true });

try {
  const guidanceResult = runStop(guidanceRepo);
  const missingValidationResult = runStop(missingValidationRepo);
  const staleValidationResult = runStop(staleValidationRepo);
  const guidanceOutput = outputOf(guidanceResult);
  const missingValidationOutput = outputOf(missingValidationResult);
  const staleValidationOutput = outputOf(staleValidationResult);

  const hasGuidance = guidanceTokens.every((token) => guidanceOutput.includes(token));
  // Stop hook 放行(exit 0)时 stdout 必须是合法 JSON，否则 Claude Code 报 "JSON validation failed"。
  let allowStdoutIsJson = false;
  try {
    JSON.parse((guidanceResult.stdout || '').trim());
    allowStdoutIsJson = guidanceResult.status === 0;
  } catch {
    allowStdoutIsJson = false;
  }
  const keepsMissingValidationBlock =
    missingValidationResult.status === 2 && missingValidationOutput.includes('缺少 validation.md');
  const keepsStaleValidationBlock =
    staleValidationResult.status === 2 && staleValidationOutput.includes('validation.status=stale');

  if (mode === 'red') {
    if (!hasGuidance || !allowStdoutIsJson || !keepsMissingValidationBlock || !keepsStaleValidationBlock) {
      fail('Expected Stop guidance or validation block contract to be incomplete before implementation');
    }
    pass('Red precondition no longer holds.');
  }

  if (guidanceResult.status !== 0) {
    fail(`Expected Stop guidance path to succeed, got exit=${guidanceResult.status}`);
  }
  if (!allowStdoutIsJson) {
    fail('Expected Stop allow path (exit 0) to emit valid JSON on stdout, got: ' + JSON.stringify(guidanceResult.stdout || ''));
  }
  if (!hasGuidance) {
    fail('Expected Stop output to include handoff guidance for change assets, PROGRESS.md, Claude memory, and chat logs');
  }
  if (!keepsMissingValidationBlock) {
    fail('Expected Stop to keep blocking missing validation.md with exit=2');
  }
  if (!keepsStaleValidationBlock) {
    fail('Expected Stop to keep blocking stale validation on REVIEWED/VALIDATED changes with exit=2');
  }

  pass(mode === 'green' ? 'Green stop handoff smoke passed.' : 'Stop handoff verify smoke passed.');
} finally {
  removeDir(guidanceRepo);
  removeDir(missingValidationRepo);
  removeDir(staleValidationRepo);
}
