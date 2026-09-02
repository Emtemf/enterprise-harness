import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

export function packInstalledPlugin(sourceRoot) {
  const packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-installed-plugin-pack-'));
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  try {
    const packed = spawnSync(npmCommand, ['pack', '--ignore-scripts', '--pack-destination', packDir, '--json'], {
      cwd: sourceRoot,
      encoding: 'utf-8',
      shell: false,
    });
    assert.equal(packed.status, 0, `${packed.stdout || ''}\n${packed.stderr || ''}`.trim());
    const metadata = JSON.parse(packed.stdout);
    assert.equal(metadata.length, 1);
    const archive = path.join(packDir, metadata[0].filename);
    assert.ok(fs.existsSync(archive), `npm pack must produce ${archive}`);
    const installDir = path.join(packDir, 'installed');
    const extracted = spawnSync(npmCommand, [
      'install', '--ignore-scripts', '--no-save', '--package-lock=false', '--offline',
      '--prefix', installDir, archive,
    ], {
      cwd: sourceRoot,
      encoding: 'utf-8',
      shell: false,
    });
    assert.equal(extracted.status, 0, `${extracted.stdout || ''}\n${extracted.stderr || ''}`.trim());
    return {
      packDir,
      packedRoot: path.join(installDir, 'node_modules', metadata[0].name),
    };
  } catch (error) {
    fs.rmSync(packDir, { recursive: true, force: true });
    throw error;
  }
}
