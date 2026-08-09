import path from 'node:path';
import { isGovernedTarget } from './gates.mjs';

const DIRECT_PATH_FIELDS = ['file_path', 'path', 'notebook_path'];
const WRITE_COMMAND = /(?:^|[;&|]\s*)(?:tee(?:\s+-a)?|sed\s+(?:-[^\s]*i[^\s]*|-i)|cp|mv|install|patch)\b|(?:^|[^>])>>?/u;
const PATH_CANDIDATE = /(?:^|[\s'"=])((?:\.\.?\/|\/)?[^\s'";|<>]+(?:src\/(?:main|test)\/java\/[^\s'";|<>]+|openapi\/[^\s'";|<>]+|harness\/changes\/[^\s'";|<>]+|runtime\/[^\s'";|<>]+))/gu;
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
    targets.push(absolute(root, candidate));
  }
  for (const candidate of shellPathTokens(input.command)) {
    const absoluteCandidate = absolute(root, candidate);
    if (!absoluteCandidate) continue;
    const relativeCandidate = path.relative(root, absoluteCandidate).replaceAll('\\', '/');
    const isHarnessArtifact = relativeCandidate === 'runtime'
      || relativeCandidate.startsWith('runtime/')
      || relativeCandidate === 'harness/changes'
      || relativeCandidate.startsWith('harness/changes/');
    if (isHarnessArtifact || isGovernedTarget(root, absoluteCandidate)) targets.push(absoluteCandidate);
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

// Grep 的 pattern 是正则，Glob 的 pattern 是路径。只有看起来像路径的值才当作目标，
// 否则 "class Order" 这类正则会被 resolve 成仓库内的假路径。通配符段在匹配受治理
// 前缀时无害（src/main/java/** 仍落在 src/main/java 下），所以保留原样解析。
function patternLikeValue(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (/\s/u.test(text)) return null;
  if (!text.includes('/') && !text.includes('\\')) return null;
  return text;
}

export function extractExplorationTargets(root, event) {
  const toolName = String(event?.tool_name || '');
  const input = event?.tool_input || {};
  if (toolName === 'Bash') {
    return [...new Set(shellPathTokens(input.command).map((value) => absolute(root, value)).filter(Boolean))];
  }
  // 显式路径字段一律视为作用域；pattern/glob 只在形似路径时才算，避免把正则当路径。
  const scoped = DIRECT_PATH_FIELDS.map((field) => input[field]);
  const patterned = ['glob', 'pattern'].map((field) => patternLikeValue(input[field]));
  return [...new Set(
    [...scoped, ...patterned]
      .map((value) => absolute(root, value))
      .filter(Boolean),
  )];
}

// 一次没有任何可解析目标的 fallback 探索（例如 Grep(pattern:"class X") 不带 path）
// 作用域其实是整个仓库，必然覆盖受治理业务代码。hooks.md 要求这种无法解析作用域的
// fallback 探索 fail-closed；否则 `[].every()` 恒为 true，网关被整体绕过。
export function hasUnboundedExplorationScope(root, event) {
  const toolName = String(event?.tool_name || '');
  if (!['Grep', 'Glob'].includes(toolName)) return false;
  return extractExplorationTargets(root, event).length === 0;
}

// Exploration is gated on governed business code only. Anything else — repo tooling, docs,
// paths outside the root, shell redirect targets, regex literals misparsed as paths — is not
// the gate's concern, so it asks "does any target hit a governed root" rather than requiring
// every target to match an exemption allowlist.
export function isExplorationTargetExempt(root, target) {
  return !isGovernedTarget(root, target);
}
