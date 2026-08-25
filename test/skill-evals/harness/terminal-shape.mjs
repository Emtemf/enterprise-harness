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
