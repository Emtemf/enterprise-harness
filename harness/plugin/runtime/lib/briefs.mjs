import fs from 'node:fs';
import path from 'node:path';
import { assertSafeId, resolveChild } from './safe-paths.mjs';

function slugify(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'brief';
}

export function briefDir(root, changeId) {
  assertSafeId(changeId, 'changeId');
  return path.join(resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId'), 'briefs');
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

function applyTemplateMetadata(template, changeId, kind, name) {
  const title = String(name || '').trim();
  if (!title) return template;
  if (kind === 'exploration') {
    return template
      .replace('## Question\n', `## Question\n${title}\n\n`)
      .replace('## Scope\n', `## Scope\n- change-id: ${changeId}\n- brief-name: ${title}\n\n`);
  }
  if (kind === 'task') {
    return template
      .replace('## Change ID\n', `## Change ID\n${changeId}\n\n`)
      .replace('## Task ID\n', `## Task ID\n${title}\n\n`)
      .replace('## Goal\n', `## Goal\n${title}\n\n`);
  }
  if (kind === 'verification') {
    return template
      .replace('## Change ID\n', `## Change ID\n${changeId}\n\n`)
      .replace('## Goal\n', `## Goal\n${title}\n\n`)
      .replace('## Scope\n', `## Scope\n- verification-target: ${title}\n\n`);
  }
  return template;
}

export function ensureBrief(root, changeId, kind, name) {
  const dir = briefDir(root, changeId);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, briefFileName(kind, name));
  if (!fs.existsSync(target)) {
    const template = fs.readFileSync(briefTemplatePath(root, kind), 'utf-8');
    fs.writeFileSync(target, applyTemplateMetadata(template, changeId, kind, name), 'utf-8');
  }
  return target;
}
