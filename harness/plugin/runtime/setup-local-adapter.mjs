import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { resolveLocalAdapterPath, validateLocalAdapterData } from './lib/local-adapter.mjs';

const target = resolveLocalAdapterPath();
const source = path.join(process.cwd(), 'harness', 'plugin', 'runtime', 'local-adapter.example.json');
const content = fs.readFileSync(source, 'utf-8');
const template = JSON.parse(content);

function printPendingConfirmation(data) {
  const confirmationFields = [
    `nodeCommand=${data.nodeCommand ?? 'unset'}`,
    `codegraphCommand=${data.codegraphCommand ?? 'unset'}`,
    `context7.apiKeyEnvVar=${data.context7?.apiKeyEnvVar ?? 'unset'}`,
  ];
  console.log(`仍需人工确认: ${confirmationFields.join(', ')}`);
}

if (!process.argv.includes('--write')) {
  console.log('Enterprise Harness Local Adapter Setup');
  console.log(`Resolved path: ${target}`);
  console.log('Dry run only. Pass --write to create the local adapter file.');
  printPendingConfirmation(template);
  process.exit(0);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
let finalData = template;
if (!fs.existsSync(target)) {
  fs.writeFileSync(target, content, 'utf-8');
} else {
  const existing = JSON.parse(fs.readFileSync(target, 'utf-8'));
  const merged = {
    ...template,
    ...existing,
    context7: { ...template.context7, ...(existing.context7 || {}) },
    mcp: { ...template.mcp, ...(existing.mcp || {}) },
  };
  finalData = merged;
  fs.writeFileSync(target, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
}
const problems = validateLocalAdapterData(finalData);
console.log(`Local adapter ready at: ${target}`);
printPendingConfirmation(finalData);
if (problems.length) {
  console.log(`field-level diagnostics: ${problems.map((problem) => `${problem.path}:${problem.code}`).join('; ')}`);
}
