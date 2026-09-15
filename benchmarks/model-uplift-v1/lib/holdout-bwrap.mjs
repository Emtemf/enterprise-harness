import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const MASKED_ROOT = '/var/tmp';

export function prepareBwrapHoldout({ casePackPath, casePackDigest }) {
  const realCasePackPath = fs.realpathSync(casePackPath);
  const relative = path.relative(MASKED_ROOT, realCasePackPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`bwrap holdout case pack must be stored below ${MASKED_ROOT}`);
  }
  const probe = spawnSync('bwrap', ['--version'], { encoding: 'utf-8', shell: false });
  if (probe.status !== 0 || probe.error) throw new Error(`bwrap is unavailable: ${probe.error?.message || probe.stderr || probe.stdout}`);
  const wrap = (command, argv, { writableRoot } = {}) => {
    const realWritableRoot = fs.realpathSync(writableRoot);
    const writableRelative = path.relative('/tmp', realWritableRoot);
    if (!writableRelative || writableRelative.startsWith('..') || path.isAbsolute(writableRelative)) {
      throw new Error('bwrap writable benchmark root must be below /tmp');
    }
    const claudeState = path.join(os.homedir(), '.claude');
    const claudeConfig = path.join(os.homedir(), '.claude.json');
    const mutableState = [];
    if (fs.existsSync(claudeState)) mutableState.push('--bind', claudeState, claudeState);
    if (fs.existsSync(claudeConfig)) mutableState.push('--bind', claudeConfig, claudeConfig);
    return {
      command: 'bwrap',
      argv: [
        '--ro-bind', '/', '/',
        '--proc', '/proc',
        '--dev-bind', '/dev', '/dev',
        ...mutableState,
        '--tmpfs', '/tmp',
        '--dir', realWritableRoot,
        '--bind', realWritableRoot, realWritableRoot,
        '--tmpfs', MASKED_ROOT,
        '--', command, ...argv,
      ],
    };
  };
  return {
    receipt: {
      schemaVersion: 1,
      status: 'pass',
      casePackDigest,
      mechanism: 'container-filesystem-isolation',
      verifier: 'business-run.mjs:bwrap-v1',
      generatedAt: new Date().toISOString(),
      maskedRoot: MASKED_ROOT,
      casePackRealPathDigestOnly: true,
    },
    wrap,
    sdkExecutable(command, { writableRoot } = {}) {
      const wrapped = wrap(command, [], { writableRoot });
      const wrapperPath = path.join(fs.realpathSync(writableRoot), '.eh-sdk-bwrap-wrapper.mjs');
      const source = [
        '#!/usr/bin/env node',
        "import { spawnSync } from 'node:child_process';",
        `const result = spawnSync(${JSON.stringify(wrapped.command)}, [...${JSON.stringify(wrapped.argv)}, ...process.argv.slice(2)], { stdio: 'inherit', shell: false });`,
        "if (result.error) { console.error(result.error.message); process.exit(1); }",
        'process.exit(result.status ?? 1);',
        '',
      ].join('\n');
      fs.writeFileSync(wrapperPath, source, { encoding: 'utf-8', mode: 0o700 });
      return wrapperPath;
    },
  };
}
