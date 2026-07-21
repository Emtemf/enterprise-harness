import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// enterprise-harness 插件缓存根目录。
export function pluginCacheRoot(home = os.homedir()) {
  return path.join(home, '.claude', 'plugins', 'cache', 'enterprise-harness', 'enterprise-harness');
}

// 纯逻辑：给定缓存根下的版本目录名列表与要保留的目录路径，
// 返回应清理的版本目录（保留 keepPath 对应的那个）。无 IO，便于单测。
export function selectStaleVersions(versionNames, cacheRoot, keepPath) {
  const keep = keepPath ? path.resolve(keepPath) : null;
  const stale = [];
  for (const name of versionNames) {
    const dir = path.join(cacheRoot, name);
    if (keep && path.resolve(dir) === keep) continue;
    stale.push({ version: name, dir });
  }
  return stale;
}

// 读取缓存根下的版本目录名（不存在则空）。
export function listVersionDirs(cacheRoot) {
  if (!fs.existsSync(cacheRoot)) return [];
  return fs
    .readdirSync(cacheRoot)
    .filter((name) => {
      try {
        return fs.statSync(path.join(cacheRoot, name)).isDirectory();
      } catch {
        return false;
      }
    });
}
