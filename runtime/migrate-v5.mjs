import fs from 'node:fs';
import process from 'node:process';
import { migrateV5State } from './compat/v5-migrate.mjs';
import { assertSafeId } from './lib/safe-paths.mjs';

const [, , changeId, flag] = process.argv;
if (!changeId || changeId === '--help' || changeId === '-h') {
  console.log('Usage: enterprise-harness migrate-v5 <change-id> --confirm');
  console.log('Explicitly migrates one active schema v5 change to schema v6. Archives are read-only.');
  process.exit(changeId ? 0 : 1);
}
if (flag !== '--confirm') {
  console.error('EH-V5-MIGRATE-CONFIRM-019: pass --confirm to migrate an active v5 change');
  process.exit(2);
}
try {
  assertSafeId(changeId, 'changeId');
  const statePath = `${process.cwd()}/harness/changes/${changeId}/state.json`;
  if (!fs.existsSync(statePath)) throw new Error(`EH-STATE-NOT-FOUND-016: state does not exist for ${changeId}`);
  const migrated = migrateV5State(statePath, { confirm: true });
  console.log(JSON.stringify(migrated, null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
