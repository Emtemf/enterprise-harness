import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { gitCommonDir } from './agent-evidence.mjs';

/**
 * Guard against duplicate hook execution. When the same tool_use_id triggers
 * this hook multiple times (e.g. plugin + settings.json both registered),
 * only the first invocation proceeds; subsequent ones exit immediately.
 *
 * Returns true if this is a duplicate call and the caller should exit(0).
 */
export function dedupGuard(kind, toolUseId, cwd) {
  if (!toolUseId) return false;
  const commonDir = gitCommonDir(cwd || process.cwd());
  const dir = path.join(commonDir, 'enterprise-harness', 'hook-dedup');
  const key = crypto.createHash('sha256').update(`${kind}:${toolUseId}`).digest('hex');
  const marker = path.join(dir, `${key}.lock`);
  if (fs.existsSync(marker)) return true;
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${marker}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, '', { flag: 'wx' });
    fs.renameSync(tmp, marker);
  } catch {
    return true; // race: another invocation won
  }
  // Prune stale markers (>1h)
  try {
    const now = Date.now();
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.lock')) continue;
      const stat = fs.statSync(path.join(dir, f), { throwIfNoEntry: false });
      if (stat && now - stat.mtimeMs > 3_600_000) fs.rmSync(path.join(dir, f), { force: true });
    }
  } catch {}
  return false;
}
