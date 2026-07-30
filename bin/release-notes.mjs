import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const version = process.argv[2];
const output = process.argv[3] || path.join('dist', 'release-notes.md');
if (!version) {
  console.error('Usage: node bin/release-notes.mjs <version> [output]');
  process.exit(1);
}
const changelog = fs.readFileSync('CHANGELOG.md', 'utf-8');
const escaped = version.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const match = changelog.match(new RegExp(`^## \\[${escaped}\\][^\\n]*\\n([\\s\\S]*?)(?=^## \\[|(?![\\s\\S]))`, 'mu'));
if (!match) {
  console.error(`CHANGELOG section missing for ${version}`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, match[1].trim() + '\n', 'utf-8');
console.log(output);
