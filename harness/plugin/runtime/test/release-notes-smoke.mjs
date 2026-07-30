import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-release-notes-'));
try {
  fs.writeFileSync(path.join(temp, 'CHANGELOG.md'), [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '## [1.2.3] - 2026-07-29',
    '',
    '### Fixed',
    '',
    '- Correct release note.',
    '',
    '## [1.2.2] - 2026-07-01',
    '',
    '- Older.',
    '',
  ].join('\n'));
  const result = spawnSync(process.execPath, [
    path.join(root, 'bin/release-notes.mjs'),
    '1.2.3',
    'dist/notes.md',
  ], { cwd: temp, encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  const notes = fs.readFileSync(path.join(temp, 'dist/notes.md'), 'utf-8');
  assert.match(notes, /Correct release note/u);
  assert.doesNotMatch(notes, /Older/u);
  console.log('PASS release-notes verify');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
