import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.env.ENTERPRISE_HARNESS_SYNC_ROOT || path.resolve(import.meta.dirname, '..'));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
const version = packageJson.version;
const checkOnly = process.argv.includes('--check');
const skillEvalProjections = fs.readdirSync(path.join(root, 'skills'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `skills/${entry.name}/evals/evals.json`)
  .filter((relative) => fs.existsSync(path.join(root, relative)))
  .sort();
const projections = [
  'package-lock.json',
  'harness/plugin/manifest.json',
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  'test/skill-evals/harness/evals.json',
  ...skillEvalProjections,
];
const problems = [];
const pluginName = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf-8')).name;

for (const relative of projections) {
  const file = path.join(root, relative);
  const json = JSON.parse(fs.readFileSync(file, 'utf-8'));
  if (json.version !== version) problems.push(`${relative}: version is ${JSON.stringify(json.version)}, expected ${version}`);
  if (relative === 'package-lock.json' && json.packages?.['']?.version !== version) {
    problems.push(`${relative}: root package version is ${JSON.stringify(json.packages?.['']?.version)}, expected ${version}`);
  }
  if (relative.endsWith('marketplace.json')) {
    const plugin = (json.plugins || []).find((entry) => entry.name === pluginName);
    if (!plugin) problems.push(`${relative}: plugin ${pluginName} is missing`);
    else if (plugin.version !== version) problems.push(`${relative}: ${pluginName} version is ${JSON.stringify(plugin.version)}, expected ${version}`);
  }
  if (!checkOnly) {
    json.version = version;
    if (relative === 'package-lock.json' && json.packages?.['']) json.packages[''].version = version;
    if (relative.endsWith('marketplace.json')) {
      for (const plugin of json.plugins || []) {
        if (plugin.name === pluginName) plugin.version = version;
      }
    }
    fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`, 'utf-8');
  }
}

if (checkOnly && problems.length > 0) {
  for (const problem of problems) console.error(`Version projection drift: ${problem}`);
  process.exitCode = 1;
} else if (!process.argv.includes('--quiet')) {
  console.log(`Version projections synchronized: ${version}`);
}
