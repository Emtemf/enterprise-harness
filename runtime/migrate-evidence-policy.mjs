import process from 'node:process';
import {
  createEvidencePolicy,
  readEvidencePolicy,
} from './lib/evidence-policy.mjs';

export function migrateEvidencePolicy(
  root = process.cwd(),
  { write = false, strictChangeIds = [] } = {},
) {
  const existing = readEvidencePolicy(root);
  if (existing.ok) return { created: false, ...existing };
  if (existing.reason !== 'missing') {
    throw new Error(`existing sealed evidence policy is invalid: ${existing.problems.join('; ')}`);
  }
  if (!write) return { created: false, ok: false, reason: 'missing', path: existing.path };
  const created = createEvidencePolicy(root, { strictChangeIds });
  return { ...created, ok: true, reason: null, problems: [] };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: node runtime/migrate-evidence-policy.mjs [--write]');
    process.exit(0);
  }
  try {
    const strictChangeIds = process.argv
      .filter((value) => value.startsWith('--strict-change='))
      .map((value) => value.slice('--strict-change='.length))
      .filter(Boolean);
    const result = migrateEvidencePolicy(process.cwd(), {
      write: process.argv.includes('--write'),
      strictChangeIds,
    });
    if (result.ok) {
      console.log(result.created
        ? `Created sealed evidence policy: ${result.path}`
        : `Evidence policy valid: ${result.path}`);
      process.exit(0);
    }
    console.log(`Evidence policy missing: ${result.path}; pass --write to seal the current baseline.`);
    process.exit(0);
  } catch (error) {
    console.error(`BLOCK: ${error.message}`);
    process.exit(2);
  }
}
