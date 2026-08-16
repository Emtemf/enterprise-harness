import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

export function createTempSandbox(prefix = 'enterprise-harness-smoke-') {
  const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    process.removeListener('exit', cleanup);
    try {
      fs.rmSync(sandboxPath, { recursive: true, force: true });
    } catch (error) {
      process.stderr.write(`Failed to remove temporary sandbox ${sandboxPath}: ${error.message}\n`);
      process.exitCode = 1;
    }
  };

  process.once('exit', cleanup);
  return Object.freeze({ path: sandboxPath, cleanup });
}
