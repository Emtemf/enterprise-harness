import fs from 'node:fs';
import path from 'node:path';

function slugify(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'brief';
}

export function briefDir(root, changeId) {
  return path.join(root, 'harness', 'changes', changeId, 'briefs');
}

export function briefFileName(kind, name) {
  const slug = slugify(name);
  if (kind === 'exploration') return `exploration-${slug}.md`;
  if (kind === 'task') return `task-${slug}.md`;
  if (kind === 'verification') return `verification-${slug}.md`;
  throw new Error(`Unsupported brief kind: ${kind}`);
}

export function briefTemplatePath(root, kind) {
  if (kind === 'exploration') return path.join(root, 'harness', 'templates', 'exploration-brief.md');
  if (kind === 'task') return path.join(root, 'harness', 'templates', 'task-brief.md');
  if (kind === 'verification') return path.join(root, 'harness', 'templates', 'verification-brief.md');
  throw new Error(`Unsupported brief kind: ${kind}`);
}

export function ensureBrief(root, changeId, kind, name) {
  const dir = briefDir(root, changeId);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, briefFileName(kind, name));
  if (!fs.existsSync(target)) {
    const template = fs.readFileSync(briefTemplatePath(root, kind), 'utf-8');
    fs.writeFileSync(target, template, 'utf-8');
  }
  return target;
}
