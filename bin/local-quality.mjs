import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'));
const args = process.argv.slice(2);
let outDir = null;
let releaseVersion = pkg.version;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--out' && args[index + 1]) outDir = path.resolve(args[++index]);
  else if (arg === '--release-version' && args[index + 1]) releaseVersion = args[++index];
  else if (arg === '--help' || arg === '-h') {
    console.log('Enterprise Harness Local Quality Gate');
    console.log('Usage: node bin/local-quality.mjs [--out <dir>] [--release-version <version>]');
    console.log('Runs all routine quality and release checks locally without GitHub-hosted runners.');
    process.exit(0);
  } else {
    console.error(`Unknown option: ${arg}`);
    process.exit(1);
  }
}

const temporaryOut = outDir === null;
if (temporaryOut) outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-local-quality-'));

function run(label, command, argv) {
  console.log(`\n[local-quality] ${label}`);
  const result = spawnSync(command, argv, {
    cwd: repoRoot,
    encoding: 'utf-8',
    shell: false,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit ${result.status ?? 1}`);
  }
}

try {
  run('prepublish acceptance', process.execPath, ['runtime/prepublish.mjs']);
  run('external project E2E', process.execPath, ['test/external-project/maven-lifecycle-e2e.mjs']);
  run('build allowlisted artifact', process.execPath, ['bin/package.mjs', '--out', outDir]);
  run('verify deterministic artifact content', process.execPath, ['runtime/test/artifact-content-smoke.mjs', 'verify']);
  run('generate SBOM', process.execPath, ['bin/sbom.mjs', path.join(outDir, 'sbom.cdx.json')]);
  run('generate release notes', process.execPath, [
    'bin/release-notes.mjs',
    releaseVersion,
    path.join(outDir, 'release-notes.md'),
  ]);
  run('validate unpacked artifact', process.execPath, [
    'bin/validate-artifact.mjs',
    path.join(outDir, `enterprise-harness-${releaseVersion}.tar.gz`),
    releaseVersion,
  ]);
  console.log(`\nLocal quality gate complete: ${outDir}`);
} catch (error) {
  console.error(`BLOCK EH-LOCAL-QUALITY-001: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (temporaryOut) fs.rmSync(outDir, { recursive: true, force: true });
}
