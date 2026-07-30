import path from 'node:path';

const DIRECT_PATH_FIELDS = ['file_path', 'path', 'notebook_path'];
const WRITE_COMMAND = /(?:^|[;&|]\s*)(?:tee(?:\s+-a)?|sed\s+(?:-[^\s]*i[^\s]*|-i)|cp|mv|install|patch)\b|(?:^|[^>])>>?/u;
const PATH_CANDIDATE = /(?:^|[\s'"=])((?:\.\.?\/|\/)?[^\s'";|<>]+(?:src\/(?:main|test)\/java\/[^\s'";|<>]+|openapi\/[^\s'";|<>]+))/gu;
const SHELL_TOKEN = /"([^"]*)"|'([^']*)'|([^\s;&|<>]+)/gu;
const EXEMPT_EXPLORATION_ROOTS = [
  'harness/',
  '.claude/',
  'docs/',
  '.claude-plugin/',
];
const EXEMPT_EXPLORATION_FILES = new Set([
  'CLAUDE.md',
  'AGENTS.md',
  'README.md',
  'package.json',
]);

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

export function isExplorationTargetExempt(root, target) {
  const relative = path.relative(root, target).replaceAll('\\', '/');
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) return false;
  return EXEMPT_EXPLORATION_FILES.has(relative)
    || EXEMPT_EXPLORATION_ROOTS.some((prefix) => relative.startsWith(prefix));
}
