export const TERMINAL_FACT_GATE_CORRECTION = [
  'Harness fact-gate fallback is mandatory because this Plan-mode turn cannot execute the selected research action.',
  'Replace the entire response with exactly these five lines. Do not add a title, preamble, code fence, explanation, question, or trailing text:',
  'Fact lanes: <required lane states>',
  'Next research action/blocker: <one executable action or one blocker>',
  'Topology: not built',
  'Scores: not computed',
  'User question: none',
].join('\n');

export function evaluateTerminalFactGateShape(output) {
  const problems = [];
  if (typeof output !== 'string') return { pass: false, problems: ['output must be text'] };
  const normalized = output.replace(/\r\n/gu, '\n');
  const withoutTerminalNewline = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  const lines = withoutTerminalNewline.split('\n');
  if (lines.length !== 5) problems.push(`expected exactly 5 lines, received ${lines.length}`);
  const expected = [
    /^Fact lanes: \S.*$/u,
    /^Next research action\/blocker: \S.*$/u,
    /^Topology: not built$/u,
    /^Scores: not computed$/u,
    /^User question: none$/u,
  ];
  for (let index = 0; index < expected.length; index += 1) {
    if (!expected[index].test(lines[index] || '')) problems.push(`line ${index + 1} has invalid shape`);
  }
  return { pass: problems.length === 0, problems };
}

export function terminalFactGateFallbackRequired({
  event,
  active,
  clarifyRoute = null,
  terminalFallbackScope = false,
}) {
  if (!terminalFallbackScope || event?.stop_hook_active || event?.permission_mode !== 'plan') return false;
  if (!active?.ok) {
    return active?.reason === 'missing-active-change' || active?.reason === 'missing-session-binding';
  }
  return active.data?.schemaVersion === 6
    && active.data?.stage === 'clarify'
    && clarifyRoute === 'research';
}
