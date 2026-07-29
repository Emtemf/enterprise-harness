import path from 'node:path';

const DIRECT_PATH_FIELDS = ['file_path', 'path', 'notebook_path'];
const WRITE_COMMAND = /(?:^|[;&|]\s*)(?:tee(?:\s+-a)?|sed\s+(?:-[^\s]*i[^\s]*|-i)|cp|mv|install|patch)\b|(?:^|[^>])>>?/u;
const PATH_CANDIDATE = /(?:^|[\s'"=])((?:\.\.?\/|\/)?[^\s'";|<>]+(?:src\/(?:main|test)\/java\/[^\s'";|<>]+|openapi\/[^\s'";|<>]+))/gu;

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
