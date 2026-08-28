import { isPlaceholder, section, tableRows } from './artifact-shape.mjs';

const CASE_HEADER = ['TCID', 'Traces', 'Level', 'Priority', 'Preconditions', 'Data', 'Actions', 'Observable assertions', 'Cleanup/Recovery', 'Status'];
const JOURNEY_HEADER = ['Journey ID', 'Traces', 'Preconditions', 'Steps', 'Observable outcome', 'Status'];

function acceptanceSection(requirementsText) {
  return requirementsText.match(/^###\s+验收\s*$([\s\S]*?)(?=^#{2,3}\s+|(?![\s\S]))/mu)?.[1] ?? '';
}

function requirementIds(requirementsText) {
  return new Set([...acceptanceSection(requirementsText).matchAll(/^\s*-\s+(R[1-9][0-9]*)\s*[：:]/gmu)].map((match) => match[1]));
}

function subsection(text, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return text.match(new RegExp(`^###\\s+${escaped}\\s*$([\\s\\S]*?)(?=^###\\s+|(?![\\s\\S]))`, 'mu'))?.[1]?.trim() ?? '';
}

function declarationIds(sectionText, header, pattern, label, problems, { statusIndex = null } = {}) {
  const rows = tableRows(sectionText, header, label, problems);
  const ids = new Set();
  for (const cells of rows) {
    const id = cells[0] ?? '';
    if (!pattern.test(id)) continue;
    if (ids.has(id)) problems.push(`duplicate ${label}: ${id}`);
    if (cells.length !== header.length) {
      problems.push(`${label} ${id} must have exactly ${header.length} columns`);
      continue;
    }
    if (cells.slice(1).some(isPlaceholder)) {
      problems.push(`${label} ${id} contains an empty, unresolved, or placeholder field`);
      continue;
    }
    if (statusIndex !== null && cells[statusIndex] !== 'accepted') {
      problems.push(`${label} ${id} status must be accepted`);
      continue;
    }
    ids.add(id);
  }
  return ids;
}

function validateTrace(owner, value, known, { allowCases = false } = {}, problems) {
  const tokens = value.split(/\s*\/\s*/u).filter(Boolean);
  const expectedToken = allowCases ? /^(?:R|D|VO|TC)[1-9][0-9]*$/u : /^(?:R|D|VO)[1-9][0-9]*$/u;
  if (tokens.length === 0 || tokens.some((token) => !expectedToken.test(token))) {
    problems.push(`${owner} Traces must contain only slash-separated stable R/D/VO${allowCases ? '/TC' : ''} IDs`);
    return;
  }
  if (new Set(tokens).size !== tokens.length) problems.push(`${owner} Traces contains duplicate IDs`);
  for (const prefix of ['R', 'D', 'VO']) {
    if (!tokens.some((token) => token.startsWith(prefix))) problems.push(`${owner} Traces must include a ${prefix} reference`);
  }
  for (const token of tokens) {
    const namespace = token.startsWith('VO') ? 'VO' : token.startsWith('TC') ? 'TC' : token[0];
    if (!known[namespace]?.has(token)) problems.push(`${owner} references unknown ${namespace}: ${token}`);
  }
}

export function assertTraceability(
  requirementsText,
  designText,
  testCasesText,
  paths = { requirements: 'requirements.md', design: 'design.md', testCases: 'test-cases.md' },
) {
  const problems = [];
  const known = {
    R: requirementIds(requirementsText),
    D: declarationIds(
      subsection(section(designText, '方案与权衡'), 'Decisions'),
      ['DID', 'Context（EID）', 'Decision', 'Consequences', 'Status'],
      /^D[1-9][0-9]*$/u,
      'decision',
      problems,
      { statusIndex: 4 },
    ),
    VO: declarationIds(
      section(designText, '可验证性义务'),
      ['VOID', 'Requirement / Decision', '必须可观察的行为', '主要失败信号', '后续 Test Design 入口'],
      /^VO[1-9][0-9]*$/u,
      'verification obligation',
      problems,
    ),
    TC: new Set(),
  };

  const cases = tableRows(section(testCasesText, '测试用例'), CASE_HEADER, 'test case', problems)
    .filter((cells) => cells.length === CASE_HEADER.length && /^TC[1-9][0-9]*$/u.test(cells[0]));
  for (const cells of cases) known.TC.add(cells[0]);
  for (const cells of cases) validateTrace(`test case ${cells[0]}`, cells[1], known, {}, problems);

  const journeys = tableRows(section(testCasesText, 'E2E 用户旅程'), JOURNEY_HEADER, 'E2E journey', problems)
    .filter((cells) => cells.length === JOURNEY_HEADER.length && /^J[1-9][0-9]*$/u.test(cells[0]));
  for (const cells of journeys) validateTrace(`E2E journey ${cells[0]}`, cells[1], known, { allowCases: true }, problems);

  return {
    id: 'test-design-traceability',
    verdict: problems.length === 0 ? 'pass' : 'block',
    evidence: [paths.requirements, paths.design, paths.testCases],
    problems,
  };
}
