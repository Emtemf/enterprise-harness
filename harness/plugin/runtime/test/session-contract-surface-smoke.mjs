import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const cliPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'cli.mjs');
const doctorPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'doctor.mjs');
const checksPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'lib', 'checks.mjs');
const shellValidatePath = path.join(repoRoot, 'hooks', 'validate-spec-structure.sh');
const files = {
  readme: path.join(repoRoot, 'README.md'),
  agents: path.join(repoRoot, 'AGENTS.md'),
  claude: path.join(repoRoot, 'CLAUDE.md'),
  overview: path.join(repoRoot, 'docs', 'zh-cn', 'overview.md'),
  directoryModel: path.join(repoRoot, 'harness', 'specs', 'directory-model.md'),
};
const mode = process.argv[2];
const requiredRelPaths = ['PROGRESS.md', 'harness/specs/session-lifecycle.md', 'harness/specs/staged-workflow.md'];

function readText(file) {
  return fs.readFileSync(file, 'utf-8');
}

function run(args, command = 'node') {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf-8',
  });
}

function parseDoctorChecks() {
  const result = run([doctorPath, '--json']);
  if (result.status !== 0) {
    return { ok: false, reason: `doctor exit=${result.status}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return { ok: false, reason: 'doctor invalid-json' };
  }
  const requiredFiles = new Set((parsed.checks || []).filter((item) => item.kind === 'required-file').map((item) => item.path));
  return { ok: true, requiredFiles };
}

function docsContainTargets() {
  const texts = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, readText(file)]));
  return {
    hasReadme: requiredRelPaths.every((target) => texts.readme.includes(target)),
    hasAgents: texts.agents.includes('PROGRESS.md') && texts.agents.includes('staged-workflow.md'),
    hasClaude: texts.claude.includes('PROGRESS.md') && texts.claude.includes('staged-workflow.md'),
    hasOverview: requiredRelPaths.every((target) => texts.overview.includes(target)),
    hasDirectoryModel: texts.directoryModel.includes('PROGRESS.md') && texts.directoryModel.includes('session-lifecycle') && texts.directoryModel.includes('requirements.md'),
  };
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
  console.error('Usage: node harness/plugin/runtime/test/session-contract-surface-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const doctor = parseDoctorChecks();
const checksText = readText(checksPath);
const shellValidateText = readText(shellValidatePath);
const docs = docsContainTargets();

if (mode === 'red') {
  const doctorMissing = !doctor.ok || requiredRelPaths.some((target) => !doctor.requiredFiles.has(target));
  const verifyMissing = requiredRelPaths.some((target) => !checksText.includes(`'${target}'`));
  const shellMissing = requiredRelPaths.some((target) => !shellValidateText.includes(target));
  const docsMissing = !docs.hasReadme || !docs.hasAgents || !docs.hasClaude || !docs.hasOverview || !docs.hasDirectoryModel;
  if (doctorMissing || verifyMissing || shellMissing || docsMissing) {
    fail('Expected doctor, verify, full-verify, or repo-facing doc entrypoints to miss PROGRESS.md, session-lifecycle.md, or staged-workflow.md before implementation');
  }
  pass('Red precondition no longer holds.');
}

const verifyResult = run([cliPath, 'verify']);
const fullVerifyResult = run([path.join(repoRoot, 'hooks', 'full-verify.sh')], 'bash');

if (!doctor.ok) {
  fail(`Expected doctor contract to pass, got ${doctor.reason}`);
}
if (requiredRelPaths.some((target) => !doctor.requiredFiles.has(target))) {
  fail('Expected doctor required-file checks to include PROGRESS.md, harness/specs/session-lifecycle.md, and harness/specs/staged-workflow.md');
}
if (requiredRelPaths.some((target) => !checksText.includes(`'${target}'`))) {
  fail('Expected verify requiredPaths to include PROGRESS.md, harness/specs/session-lifecycle.md, and harness/specs/staged-workflow.md');
}
if (requiredRelPaths.some((target) => !shellValidateText.includes(target))) {
  fail('Expected shell structure validation to include PROGRESS.md, harness/specs/session-lifecycle.md, and harness/specs/staged-workflow.md');
}
if (!docs.hasReadme || !docs.hasAgents || !docs.hasClaude || !docs.hasOverview || !docs.hasDirectoryModel) {
  fail('Expected repo-facing docs to reference PROGRESS.md, session-lifecycle.md, staged-workflow.md, and requirements.md entrypoints');
}
if (verifyResult.status !== 0) {
  fail(`Expected cli verify to pass, got exit=${verifyResult.status}`);
}
if (fullVerifyResult.status !== 0) {
  fail(`Expected full-verify to pass, got exit=${fullVerifyResult.status}`);
}

pass(mode === 'green' ? 'Green contract-surface smoke passed.' : 'Contract-surface verify smoke passed.');
