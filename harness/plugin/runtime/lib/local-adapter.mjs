import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function resolveLocalAdapterPath() {
  if (process.env.HARNESS_LOCAL_ADAPTER) {
    return process.env.HARNESS_LOCAL_ADAPTER;
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'enterprise-harness', 'local-adapter.json');
  }
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(configHome, 'enterprise-harness', 'local-adapter.json');
}

export function readLocalAdapter() {
  const file = resolveLocalAdapterPath();
  if (!fs.existsSync(file)) {
    return { path: file, exists: false, data: null };
  }
  return {
    path: file,
    exists: true,
    data: JSON.parse(fs.readFileSync(file, 'utf-8')),
  };
}
