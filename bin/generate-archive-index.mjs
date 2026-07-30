import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const archive = path.join(root, 'harness', 'archive');
const entries = fs.readdirSync(archive, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const dir = path.join(archive, entry.name);
    const statePath = path.join(dir, 'state.json');
    const changePath = path.join(dir, 'change.md');
    let state = {};
    try {
      state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    } catch {
      state = {};
    }
    const change = fs.existsSync(changePath) ? fs.readFileSync(changePath, 'utf-8') : '';
    const title = change.match(/^#\s+(.+)$/m)?.[1] || state.topic || entry.name;
    return {
      changeId: entry.name,
      title,
      tier: state.tier || null,
      completedAt: state.archivedAt || state.validation?.validatedAt || null,
      summary: state.summary || title,
      tags: state.tags || [],
    };
  })
  .sort((left, right) => left.changeId.localeCompare(right.changeId));

fs.writeFileSync(
  path.join(archive, 'index.json'),
  `${JSON.stringify({ schemaVersion: 1, changes: entries }, null, 2)}\n`,
  'utf-8',
);
console.log(`Indexed ${entries.length} archived changes.`);
