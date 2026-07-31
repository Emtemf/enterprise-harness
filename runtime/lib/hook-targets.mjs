import path from 'node:path';
import { isGovernedTarget } from './gates.mjs';

const DIRECT_PATH_FIELDS = ['file_path', 'path', 'notebook_path'];
const WRITE_COMMAND = /(?:^|[;&|]\s*)(?:tee(?:\s+-a)?|sed\s+(?:-[^\s]*i[^\s]*|-i)|cp|mv|install|patch)\b|(?:^|[^>])>>?/u;
const PATH_CANDIDATE = /(?:^|[\s'"=])((?:\.\.?\/|\/)?[^\s'";|<>]+(?:src\/(?:main|test)\/java\/[^\s'";|<>]+|openapi\/[^\s'";|<>]+))/gu;
const SHELL_TOKEN = /"([^"]*)"|'([^']*)'|([^\s;&|<>]+)/gu;

function absolute(root, value) {
  const text = String(value || '').trim();
  if (!text) return null;
  return path.resolve(root, text);
}

export function isPotentialWriteBash(command) {
  return WRITE_COMMAND.test(String(command || ''));
}

export function extractHookTargets(root, event) {
  const toolName = String(event?.tool_name || '');
  const input = event?.tool_input || {};
  if (['Write', 'Edit', 'NotebookEdit'].includes(toolName)
      || (!toolName && DIRECT_PATH_FIELDS.some((field) => input[field]))) {
    return [...new Set(DIRECT_PATH_FIELDS.map((field) => absolute(root, input[field])).filter(Boolean))];
  }
  if (toolName !== 'Bash' || !isPotentialWriteBash(input.command)) return [];
  const targets = [];
  for (const match of String(input.command || '').matchAll(PATH_CANDIDATE)) {
    const candidate = String(match[1] || '').replace(/[),:]$/u, '');
    const governedOffset = candidate.search(/(?:^|\/)src\/(?:main|test)\/java\/|(?:^|\/)openapi\//u);
    if (governedOffset < 0) continue;
    targets.push(absolute(root, candidate));
  }
  return [...new Set(targets.filter(Boolean))];
}

function shellPathTokens(command) {
  const paths = [];
  for (const match of String(command || '').matchAll(SHELL_TOKEN)) {
    const token = String(match[1] ?? match[2] ?? match[3] ?? '').replace(/[),:]$/u, '');
    if (!token || token.startsWith('-')) continue;
    if (token.includes('/') || token.includes('\\') || /^[A-Za-z0-9_.-]+\.[A-Za-z0-9]+$/u.test(token)) {
      paths.push(token);
    }
  }
  return paths;
}

export function extractExplorationTargets(root, event) {
  const toolName = String(event?.tool_name || '');
  const input = event?.tool_input || {};
  if (toolName === 'Bash') {
    return [...new Set(shellPathTokens(input.command).map((value) => absolute(root, value)).filter(Boolean))];
  }
  return [...new Set(
    ['file_path', 'path', 'notebook_path']
      .map((field) => absolute(root, input[field]))
      .filter(Boolean),
  )];
}

// Exploration is gated on governed business code only. Anything else — repo tooling, docs,
// paths outside the root, shell redirect targets, regex literals misparsed as paths — is not
// the gate's concern, so it asks "does any target hit a governed root" rather than requiring
// every target to match an exemption allowlist.
export function isExplorationTargetExempt(root, target) {
  return !isGovernedTarget(root, target);
}
