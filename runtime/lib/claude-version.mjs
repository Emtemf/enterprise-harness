export const MINIMUM_CLAUDE_CODE_VERSION = '2.1.219';

function parseVersion(value) {
  const match = String(value || '').match(/\b(\d+)\.(\d+)\.(\d+)\b/u);
  return match ? match.slice(1, 4).map(Number) : null;
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export function evaluateClaudeCodeVersion(result) {
  const minimum = parseVersion(MINIMUM_CLAUDE_CODE_VERSION);
  const output = `${result?.stdout || ''}\n${result?.stderr || ''}`.trim();
  if (result?.status !== 0) {
    return {
      ok: false,
      severity: 'warn',
      status: 'unavailable',
      detectedVersion: null,
      minimumVersion: MINIMUM_CLAUDE_CODE_VERSION,
      detail: `Claude Code CLI unavailable; install >=${MINIMUM_CLAUDE_CODE_VERSION} before using forked stage skills`,
    };
  }

  const detected = parseVersion(output);
  if (!detected) {
    return {
      ok: false,
      severity: 'warn',
      status: 'unknown-version',
      detectedVersion: null,
      minimumVersion: MINIMUM_CLAUDE_CODE_VERSION,
      detail: `Could not parse Claude Code version; required >=${MINIMUM_CLAUDE_CODE_VERSION}`,
    };
  }

  const detectedVersion = detected.join('.');
  const supported = compareVersions(detected, minimum) >= 0;
  return {
    ok: supported,
    severity: supported ? 'info' : 'error',
    status: supported ? 'supported' : 'unsupported',
    detectedVersion,
    minimumVersion: MINIMUM_CLAUDE_CODE_VERSION,
    detail: supported
      ? `Claude Code ${detectedVersion} meets required >=${MINIMUM_CLAUDE_CODE_VERSION}`
      : `Claude Code ${detectedVersion} is unsupported; upgrade to >=${MINIMUM_CLAUDE_CODE_VERSION} for background:false and nested subagents`,
  };
}
