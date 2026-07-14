import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { resolveLocalAdapterPath } from './lib/local-adapter.mjs';

const target = resolveLocalAdapterPath();
const source = path.join(process.cwd(), 'harness', 'plugin', 'runtime', 'local-adapter.example.json');
const content = fs.readFileSync(source, 'utf-8');

if (!process.argv.includes('--write')) {
  console.log('Enterprise Harness Local Adapter Setup');
  console.log(`Resolved path: ${target}`);
  console.log('Dry run only. Pass --write to create the local adapter file.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
if (!fs.existsSync(target)) {
  fs.writeFileSync(target, content, 'utf-8');
} else {
  const existing = JSON.parse(fs.readFileSync(target, 'utf-8'));
  const template = JSON.parse(content);
  const merged = {
    ...template,
    ...existing,
    context7: { ...template.context7, ...(existing.context7 || {}) },
    mcp: { ...template.mcp, ...(existing.mcp || {}) },
  };
  fs.writeFileSync(target, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
}
console.log(`Local adapter ready at: ${target}`);
