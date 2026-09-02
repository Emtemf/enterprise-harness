import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { isGovernedTarget } from './gates.mjs';

const DIRECT_PATH_FIELDS = ['file_path', 'path', 'notebook_path'];
const WRITE_COMMAND = /(?:^|[;&|]\s*)(?:tee(?:\s+-a)?|sed\s+(?:-[^\s]*i[^\s]*|-i)|cp|mv|install|patch|rm|rmdir|unlink|mkdir|touch|ln|chmod|chown)\b|(?:^|[^>])>>?|\bnode\s+(?:--eval|-e)\b|\bnode\s+[^;&|]*hooks[\\/]scripts[\\/]|\b(?:python|python3|perl|ruby|bash|sh)\s+(?:-c|-e)\b/u;
const TASK_RUN_COMMAND = /(?:^|[\/\\])task-run\.mjs\b|\bcli\.mjs["']?\s+task-run\b/u;
const PATH_CANDIDATE = /(?:^|[\s'"=])((?:\.\.?\/|\/)?[^\s'";|<>]+(?:src\/(?:main|test)\/java\/[^\s'";|<>]+|openapi\/[^\s'";|<>]+|harness\/changes\/[^\s'";|<>]+|runtime\/[^\s'";|<>]+))/gu;
const SHELL_TOKEN = /"([^"]*)"|'([^']*)'|([^\s;&|<>]+)/gu;
const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TRUSTED_RUNTIME_SCRIPTS = new Map([
  ['${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs', path.join(pluginRoot, 'runtime', 'cli.mjs')],
  ['${CLAUDE_SKILL_DIR}/../../runtime/cli.mjs', path.join(pluginRoot, 'runtime', 'cli.mjs')],
  ['${CLAUDE_PLUGIN_ROOT}/bin/enterprise-harness.mjs', path.join(pluginRoot, 'bin', 'enterprise-harness.mjs')],
]);
const TRUSTED_SKILL_SCRIPT_NAMES = new Set([
  'finalize-clarify-result.mjs',
  'finalize-result.mjs',
  'prepare-input.mjs',
  'select-rubrics.mjs',
]);
const READ_ONLY_GIT_COMMANDS = new Set(['rev-parse']);
const FORBIDDEN_READ_FLAGS = /^(?:--output(?:=|$)|--ext-diff$|--textconv$|--exec(?:=|$)|--pre(?:=|$)|--hostname-bin(?:=|$))/u;

export function tokenizeGovernedBash(command) {
  const input = String(command || '').trim();
  if (!input || /[;&|<>`\n\r\0]/u.test(input) || input.includes('$(')) return null;
  const tokens = [];
  let index = 0;
  while (index < input.length) {
    while (/\s/u.test(input[index] || '')) index += 1;
    if (index >= input.length) break;
    const quote = input[index] === '"' || input[index] === "'" ? input[index] : null;
    if (quote) index += 1;
    let token = '';
    while (index < input.length && (quote ? input[index] !== quote : !/\s/u.test(input[index]))) {
      if (input[index] === '\\') {
        index += 1;
        if (index >= input.length) return null;
      }
      token += input[index];
      index += 1;
    }
    if (quote && input[index] !== quote) return null;
    if (!token) return null;
    tokens.push(token);
    if (quote) index += 1;
  }
  return tokens;
}

function trustedRuntimeScript(root, cwd, value) {
  if (TRUSTED_RUNTIME_SCRIPTS.has(value)) return TRUSTED_RUNTIME_SCRIPTS.get(value);
  const resolved = path.resolve(cwd || root, value);
  for (const trusted of TRUSTED_RUNTIME_SCRIPTS.values()) {
    if (resolved === trusted) return trusted;
  }
  return null;
}

function trustedSkillScript(root, cwd, value) {
  const resolved = path.resolve(cwd || root, value);
  const skillsRoot = path.join(pluginRoot, 'skills');
  const relative = path.relative(skillsRoot, resolved).split(path.sep);
  if (relative.length !== 3 || relative[1] !== 'scripts' || !TRUSTED_SKILL_SCRIPT_NAMES.has(relative[2])) return null;
  if (!fs.existsSync(resolved)) return null;
  return { skill: relative[0], script: relative[2], path: resolved };
}

function runtimeCommandKind(root, cwd, tokens) {
  if (tokens[0] === 'enterprise-harness' && tokens.length >= 2) {
    return { kind: tokens[1] === 'task-run' ? 'task-run' : 'runtime', action: tokens[1], args: tokens.slice(2) };
  }
  if (!['node', process.execPath].includes(tokens[0]) || tokens.length < 3) return null;
  if (!trustedRuntimeScript(root, cwd, tokens[1])) return null;
  return { kind: tokens[2] === 'task-run' ? 'task-run' : 'runtime', action: tokens[2], args: tokens.slice(3) };
}

function skillScriptCommandKind(root, cwd, tokens) {
  if (!['node', process.execPath].includes(tokens[0]) || tokens.length < 2) return null;
  const trusted = trustedSkillScript(root, cwd, tokens[1]);
  return trusted ? { kind: 'skill-script', ...trusted, args: tokens.slice(2) } : null;
}

function isReadOnlyDiagnostic(tokens) {
  if (tokens[0] === 'pwd') return tokens.slice(1).every((token) => ['-L', '-P'].includes(token));
  if (tokens[0] === 'ls') return tokens.slice(1).every((token) => !FORBIDDEN_READ_FLAGS.test(token));
  if (tokens[0] === 'rg') {
    return tokens[1] === '--no-config'
      && tokens.slice(1).every((token) => !FORBIDDEN_READ_FLAGS.test(token));
  }
  if (tokens[0] !== 'git' || !READ_ONLY_GIT_COMMANDS.has(tokens[1])) return false;
  return tokens.slice(2).every((token) => !FORBIDDEN_READ_FLAGS.test(token));
}

export function classifyGovernedBash(root, command, cwd = root) {
  const tokens = tokenizeGovernedBash(command);
  if (!tokens) return { allowed: false, kind: 'denied' };
  const runtime = runtimeCommandKind(root, cwd, tokens);
  if (runtime?.kind === 'task-run') return { allowed: false, ...runtime };
  if (runtime?.kind === 'runtime') return { allowed: true, ...runtime };
  const skillScript = skillScriptCommandKind(root, cwd, tokens);
  if (skillScript) return { allowed: true, ...skillScript };
  if (isReadOnlyDiagnostic(tokens)) return { allowed: true, kind: 'read-only' };
  return { allowed: false, kind: 'denied' };
}

function absolute(root, value) {
  const text = String(value || '').trim();
  if (!text) return null;
  return path.resolve(root, text);
}

export function isPotentialWriteBash(command) {
  const value = String(command || '');
  return WRITE_COMMAND.test(value) || TASK_RUN_COMMAND.test(value);
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
