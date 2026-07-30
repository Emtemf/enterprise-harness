import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
const version = packageJson.version;
const projections = [
  'harness/plugin/manifest.json',
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
];

for (const relative of projections) {
  const file = path.join(root, relative);
  const json = JSON.parse(fs.readFileSync(file, 'utf-8'));
  json.version = version;
  if (relative.endsWith('marketplace.json')) {
    const pluginName = JSON.parse(
      fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf-8'),
    ).name;
    for (const plugin of json.plugins || []) {
      if (plugin.name === pluginName) plugin.version = version;
    }
  }
  fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`, 'utf-8');
}

if (!process.argv.includes('--quiet')) console.log(`Version projections synchronized: ${version}`);
