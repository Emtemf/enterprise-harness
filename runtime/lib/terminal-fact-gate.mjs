import fs from 'node:fs';

const MAX_TRANSCRIPT_TAIL_BYTES = 512 * 1024;

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

export function terminalFactGateFallbackRequired({ event, active, clarifyRoute = null }) {
  if (event?.stop_hook_active || event?.permission_mode !== 'plan') return false;
  if (!lastUserTurnInvokedHarness(event?.transcript_path)) return false;
  if (!active?.ok) return active?.reason === 'missing-active-change';
  return active.data?.schemaVersion === 6
    && active.data?.stage === 'clarify'
    && clarifyRoute === 'research';
}

function lastUserTurnInvokedHarness(transcriptPath) {
  if (typeof transcriptPath !== 'string' || !transcriptPath.trim()) return false;
  let transcript;
  try {
    const stat = fs.statSync(transcriptPath);
    if (!stat.isFile()) return false;
    const start = Math.max(0, stat.size - MAX_TRANSCRIPT_TAIL_BYTES);
    const descriptor = fs.openSync(transcriptPath, 'r');
    try {
      const buffer = Buffer.alloc(stat.size - start);
      fs.readSync(descriptor, buffer, 0, buffer.length, start);
      transcript = buffer.toString('utf-8');
    } finally {
      fs.closeSync(descriptor);
    }
  } catch {
    return false;
  }
  const lines = transcript.split(/\r?\n/u);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (!line) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record?.type !== 'user' && record?.message?.role !== 'user') continue;
    const content = textContent(record?.message?.content ?? record?.content ?? record?.prompt);
    return /(?:<command-name>\s*)?\/enterprise-harness:harness(?:\s*<\/command-name>)?/u.test(content)
      || /<command-message>\s*enterprise-harness:harness\s*<\/command-message>/u.test(content);
  }
  return false;
}

function textContent(value) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.map((part) => {
    if (typeof part === 'string') return part;
    return typeof part?.text === 'string' ? part.text : '';
  }).join('\n');
}
