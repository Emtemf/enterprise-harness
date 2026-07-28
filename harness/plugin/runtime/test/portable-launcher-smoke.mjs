import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const launcherModulePath = path.join(repoRoot, 'bin', 'enterprise-harness.mjs');
const launcherExecutablePath = path.join(repoRoot, 'bin', 'enterprise-harness');
const harnessSkill = fs.readFileSync(path.join(repoRoot, '.claude', 'skills', 'harness', 'SKILL.md'), 'utf-8');
const literalShell = [
  'if command -v enterprise-harness >/dev/null 2>&1; then',
  '  enterprise-harness "$@"',
  'elif test -f harness/plugin/runtime/cli.mjs; then',
  '  node harness/plugin/runtime/cli.mjs "$@"',
  'else',
  '  echo "BLOCK: enterprise-harness launcher unavailable; reload/update the plugin" >&2',
  '  exit 2',
  'fi',
].join('\n');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

function runCommand(command, args, cwd, env = {}) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf-8',
    shell: false,
    env: {
      ...process.env,
      ...env,
    },
  });
}

function runLiteralLauncher(args, cwd, env = {}) {
  const scriptPath = path.join(cwd, 'run-literal-launcher.sh');
  fs.writeFileSync(scriptPath, `#!/usr/bin/env bash\nset -euo pipefail\n${literalShell}\n`, { mode: 0o755 });
  return spawnSync('bash', [scriptPath, ...args], {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      ...env,
    },
  });
}

function removePathEntry(value, entry) {
  return String(value || '')
    .split(path.delimiter)
    .filter(Boolean)
    .filter((item) => path.resolve(item) !== path.resolve(entry))
    .join(path.delimiter);
}

function isExecutable(filePath) {
  const stat = fs.statSync(filePath, { throwIfNoEntry: false });
  if (!stat || !stat.isFile()) return false;
  return (stat.mode & 0o111) !== 0;
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/portable-launcher-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-launcher-'));
const targetRoot = path.join(tempRoot, 'target');
const outsideSourceWrite = path.join(repoRoot, 'harness', 'changes', 'launcher-probe');
fs.mkdirSync(targetRoot, { recursive: true });

try {
  const pathEnv = `${path.join(repoRoot, 'bin')}${path.delimiter}${process.env.PATH || ''}`;
  const commandProbe = runCommand('bash', ['-lc', 'command -v enterprise-harness'], targetRoot, {
    PATH: pathEnv,
  });
  const withLauncherPath = runCommand('enterprise-harness', ['start-change', 'launcher-probe', 'codex', 'L1', 'launcher probe'], targetRoot, {
    PATH: pathEnv,
  });

  const standaloneRuntimeDir = path.join(targetRoot, 'harness', 'plugin', 'runtime');
  fs.mkdirSync(path.dirname(standaloneRuntimeDir), { recursive: true });
  fs.cpSync(path.join(repoRoot, 'harness', 'plugin', 'runtime'), standaloneRuntimeDir, { recursive: true });
  const withoutLauncherPath = runLiteralLauncher(['status'], targetRoot, {
    PATH: removePathEntry(pathEnv, path.join(repoRoot, 'bin')),
  });

  const outsideTarget = path.join(tempRoot, 'outside-target');
  fs.mkdirSync(outsideTarget, { recursive: true });
  const missingLauncherAndFallback = runLiteralLauncher(['status'], outsideTarget, {
    PATH: removePathEntry(process.env.PATH || '', path.join(repoRoot, 'bin')),
  });

  const failures = [];
  if (!fs.existsSync(launcherExecutablePath)) {
    failures.push('portable launcher must install a true extensionless executable bin/enterprise-harness');
  } else if (!isExecutable(launcherExecutablePath)) {
    failures.push('bin/enterprise-harness must be executable (mode 100755 or equivalent)');
  }
  if (!/import\.meta\.url/u.test(fs.readFileSync(launcherModulePath, 'utf-8'))) {
    failures.push('portable launcher module must locate runtime relative to import.meta.url');
  }
  if (!harnessSkill.includes('command -v enterprise-harness')
      || !harnessSkill.includes('enterprise-harness launcher unavailable')) {
    failures.push('harness skill must embed the literal launcher probe/fallback shell snippet');
  }
  if (commandProbe.status !== 0) {
    failures.push(`command -v enterprise-harness failed under PATH: exit=${commandProbe.status} stderr=${String(commandProbe.stderr || '').trim()}`);
  }
  if (!String(commandProbe.stdout || '').trim().endsWith('/bin/enterprise-harness')) {
    failures.push(`command -v enterprise-harness must resolve the extensionless executable, got ${JSON.stringify(String(commandProbe.stdout || '').trim())}`);
  }
  if (withLauncherPath.status !== 0) {
    failures.push(`PATH-backed launcher start-change failed: exit=${withLauncherPath.status} stderr=${String(withLauncherPath.stderr || '').trim()}`);
  }
  if (!fs.existsSync(path.join(targetRoot, 'harness', 'changes', 'launcher-probe', 'state.json'))) {
    failures.push('portable launcher must create the change inside the target cwd');
  }
  if (fs.existsSync(outsideSourceWrite)) {
    failures.push('portable launcher must not create change assets inside the source plugin tree');
  }
  if (!(withoutLauncherPath.status === 0 && String(withoutLauncherPath.stdout || '').includes('Enterprise Harness Status'))) {
    failures.push(`standalone fallback failed: exit=${withoutLauncherPath.status} stdout=${JSON.stringify(String(withoutLauncherPath.stdout || '').trim())} stderr=${JSON.stringify(String(withoutLauncherPath.stderr || '').trim())}`);
  }
  if (missingLauncherAndFallback.status !== 2) {
    failures.push(`missing launcher/fallback must exit 2, got ${missingLauncherAndFallback.status}`);
  }
  if (!String(missingLauncherAndFallback.stderr || '').includes('BLOCK: enterprise-harness launcher unavailable; reload/update the plugin')) {
    failures.push('missing launcher/fallback must print the BLOCK message');
  }

  const ok = failures.length === 0;
  if (mode === 'red') {
    if (!ok) {
      fail(`Expected portable launcher contract to fail before implementation:\n${failures.join('\n')}`);
    }
    pass('Red precondition no longer holds.');
  }
  if (!ok) {
    fail(`Expected portable launcher contract to pass:\n${failures.join('\n')}`);
  }
  pass(mode === 'green' ? 'Green portable-launcher smoke passed.' : 'Portable launcher verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.rmSync(outsideSourceWrite, { recursive: true, force: true });
}
