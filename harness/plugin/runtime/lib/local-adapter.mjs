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

export function validateLocalAdapterData(data) {
  const errors = [];
  if (!data || typeof data !== 'object') errors.push('adapter JSON 必须是对象');
  if ((data?.schemaVersion ?? null) !== 1) errors.push('schemaVersion 必须为 1');
  if (!data?.runtimeVersion) errors.push('runtimeVersion 缺失');
  if (!data?.nodeCommand) errors.push('nodeCommand 缺失');
  if (!data?.codegraphCommand) errors.push('codegraphCommand 缺失');
  if (!data?.context7?.mode) errors.push('context7.mode 缺失');
  if (!data?.context7?.apiKeyEnvVar) errors.push('context7.apiKeyEnvVar 缺失');
  if (!data?.mcp?.projectConfig) errors.push('mcp.projectConfig 缺失');
  if (typeof data?.mcp?.requiresLocalApproval !== 'boolean') errors.push('mcp.requiresLocalApproval 必须是布尔值');
  return errors;
}

export function readLocalAdapter() {
  const file = resolveLocalAdapterPath();
  if (!fs.existsSync(file)) {
    return { path: file, exists: false, data: null, errors: ['adapter 文件不存在'] };
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return {
    path: file,
    exists: true,
    data,
    errors: validateLocalAdapterData(data),
  };
}
