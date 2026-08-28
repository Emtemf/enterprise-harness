const REQUIRED_HEADINGS = [
  '输入与测试范围',
  'Coverage Matrix',
  '测试用例',
  'E2E 用户旅程',
  '测试数据、隔离与清理',
  '风险优先级与最小充分集合',
  'Test Design Self-Check',
];

const CASE_HEADER = [
  'TCID',
  'Traces',
  'Level',
  'Priority',
  'Preconditions',
  'Data',
  'Actions',
  'Observable assertions',
  'Cleanup/Recovery',
  'Status',
];
const COVERAGE_HEADER = ['Source', 'Concern', 'Criticality', 'Applicability', 'Covered By', 'N/A Reason'];
const SCOPE_HEADER = ['Dimension', 'Applicability', 'Reason'];
const JOURNEY_HEADER = ['Journey ID', 'Traces', 'Preconditions', 'Steps', 'Observable outcome', 'Status'];
const LEVELS = new Set(['unit', 'integration', 'contract', 'migration', 'security', 'E2E']);
const PRIORITIES = new Set(['critical', 'high', 'normal']);

function escapePattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function section(text, heading) {
  const escaped = escapePattern(heading);
  return text.match(new RegExp(`^##\\s+${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, 'mu'))?.[1]?.trim() ?? '';
}

export function tableCells(line) {
  if (!/^\s*\|.*\|\s*$/u.test(line)) return [];
  return line.trim().slice(1, -1).split('|').map((cell) => cell.trim());
}

function separatorRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell));
}

export function tableRows(sectionText, expectedHeader, label, problems) {
  const rows = sectionText.split(/\r?\n/u).map(tableCells).filter((cells) => cells.length > 0);
  if (rows.length === 0) {
    problems.push(`${label} table is missing`);
    return [];
  }
  if (rows[0].length !== expectedHeader.length || rows[0].some((cell, index) => cell !== expectedHeader[index])) {
    problems.push(`${label} header must be exactly: ${expectedHeader.join(' | ')}`);
  }
  if (!separatorRow(rows[1] ?? []) || rows[1].length !== expectedHeader.length) {
    problems.push(`${label} separator must have exactly ${expectedHeader.length} columns`);
  }
  return rows.slice(2).filter((cells) => !separatorRow(cells));
}

export function isPlaceholder(value, { allowDash = false } = {}) {
  const text = String(value ?? '').trim();
  if (allowDash && text === '-') return false;
  return text.length === 0
    || text === '-'
    || /(?:\b(?:TBD|TODO|unknown|placeholder)\b|待定|按需|<[^>]+>)/iu.test(text)
    || /^(?:null|none)$/iu.test(text)
    || /\{\{[^}]+\}\}|\[\[[^\]]+\]\]/u.test(text);
}

function genericAssertion(value) {
  const normalized = value.trim().replace(/[。.!！\s]+$/gu, '');
  return /^(?:验证成功|测试通过|通过|成功|正常|符合预期|works?|success|pass(?:es|ed)?)$/iu.test(normalized);
}

function duplicateIds(rows, idIndex, pattern, label, problems) {
  const counts = new Map();
  for (const cells of rows) {
    const id = cells[idIndex] ?? '';
    if (!pattern.test(id)) problems.push(`${label} must use a stable identifier: ${id || '<empty>'}`);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  for (const [id, count] of counts) {
    if (id && count > 1) problems.push(`duplicate ${label}: ${id}`);
  }
}

function checkScope(testCasesText, impact, problems) {
  const rows = tableRows(section(testCasesText, '输入与测试范围'), SCOPE_HEADER, 'input scope', problems);
  const e2eRows = rows.filter((cells) => cells[0] === 'E2E');
  if (e2eRows.length !== 1) problems.push('input scope must contain exactly one E2E applicability row');
  for (const cells of rows) {
    if (cells.length !== SCOPE_HEADER.length) {
      problems.push(`input scope row must have exactly ${SCOPE_HEADER.length} columns`);
      continue;
    }
    const [dimension, applicability, reason] = cells;
    if (isPlaceholder(dimension)) problems.push('input scope dimension is empty or placeholder');
    if (!['applicable', 'N/A'].includes(applicability)) problems.push(`input scope applicability is invalid: ${applicability}`);
    if (isPlaceholder(reason)) problems.push(`${dimension || 'scope'} applicability requires a substantive reason`);
  }
  const e2eApplicability = e2eRows[0]?.[1];
  if (impact.e2e === 'yes' && e2eApplicability !== 'applicable') problems.push('e2e impact is yes but E2E scope is not applicable');
  if (impact.e2e === 'no' && e2eApplicability !== 'N/A') problems.push('e2e impact is no but E2E scope is not N/A');
  return e2eApplicability;
}

function checkCoverageMatrix(testCasesText, problems) {
  const rows = tableRows(section(testCasesText, 'Coverage Matrix'), COVERAGE_HEADER, 'coverage matrix', problems);
  if (rows.length === 0) problems.push('coverage matrix must contain at least one row');
  for (const cells of rows) {
    if (cells.length !== COVERAGE_HEADER.length) {
      problems.push(`coverage row must have exactly ${COVERAGE_HEADER.length} columns`);
      continue;
    }
    const [source, concern, criticality, applicability, coveredBy, reason] = cells;
    if (isPlaceholder(source) || isPlaceholder(concern)) problems.push('coverage source and concern must be substantive');
    if (!PRIORITIES.has(criticality)) problems.push(`coverage criticality is invalid: ${criticality}`);
    if (!['applicable', 'N/A'].includes(applicability)) problems.push(`coverage applicability is invalid: ${applicability}`);
    if (applicability === 'applicable') {
      if (isPlaceholder(coveredBy)) problems.push(`applicable coverage ${source || '<empty>'} must name a TC`);
      if (reason !== '-') problems.push(`applicable coverage ${source || '<empty>'} must use - for N/A Reason`);
    }
    if (applicability === 'N/A') {
      if (coveredBy !== '-') problems.push(`N/A coverage ${source || '<empty>'} must use - for Covered By`);
      if (isPlaceholder(reason)) problems.push(`N/A coverage ${source || '<empty>'} requires a reason`);
    }
  }
}

function checkCases(testCasesText, problems) {
  const rows = tableRows(section(testCasesText, '测试用例'), CASE_HEADER, 'test case', problems);
  if (rows.length === 0) problems.push('test case table must contain at least one case');
  duplicateIds(rows, 0, /^TC[1-9][0-9]*$/u, 'TCID', problems);
  for (const cells of rows) {
    if (cells.length !== CASE_HEADER.length) {
      problems.push(`test case ${cells[0] || '<empty>'} must have exactly ${CASE_HEADER.length} columns`);
      continue;
    }
    const [id, traces, level, priority, preconditions, data, actions, observable, cleanup, status] = cells;
    if ([traces, preconditions, data, actions, observable, cleanup].some(isPlaceholder)) {
      problems.push(`test case ${id || '<empty>'} contains an empty or placeholder semantic field`);
    }
    if (!LEVELS.has(level)) problems.push(`test case ${id || '<empty>'} level is invalid: ${level}`);
    if (!PRIORITIES.has(priority)) problems.push(`test case ${id || '<empty>'} priority is invalid: ${priority}`);
    if (genericAssertion(observable)) problems.push(`test case ${id || '<empty>'} observable assertion is generic`);
    if (status !== 'accepted') problems.push(`test case ${id || '<empty>'} status must be accepted`);
  }
}

function checkJourneys(testCasesText, e2eApplicability, problems) {
  const rows = tableRows(section(testCasesText, 'E2E 用户旅程'), JOURNEY_HEADER, 'E2E journey', problems);
  if (e2eApplicability === 'applicable' && rows.length === 0) problems.push('applicable E2E scope requires at least one journey');
  duplicateIds(rows, 0, /^J[1-9][0-9]*$/u, 'Journey ID', problems);
  for (const cells of rows) {
    if (cells.length !== JOURNEY_HEADER.length) {
      problems.push(`E2E journey ${cells[0] || '<empty>'} must have exactly ${JOURNEY_HEADER.length} columns`);
      continue;
    }
    if (cells.slice(1, 5).some(isPlaceholder)) problems.push(`E2E journey ${cells[0]} contains an empty or placeholder field`);
    if (genericAssertion(cells[4])) problems.push(`E2E journey ${cells[0]} observable outcome is generic`);
    if (cells[5] !== 'accepted') problems.push(`E2E journey ${cells[0]} status must be accepted`);
  }
}

function substantiveSection(testCasesText, heading, problems) {
  const content = section(testCasesText, heading);
  const lines = content.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0 || lines.every((line) => isPlaceholder(line.replace(/^[-*]\s*/u, '')))) {
    problems.push(`${heading} has no substantive content`);
  }
  if (lines.some((line) => /(?:<[^>]+>|\b(?:TBD|TODO)\b|待定|按需|\{\{[^}]+\}\})/iu.test(line))) {
    problems.push(`${heading} contains a placeholder`);
  }
}

export function assertArtifactShape(testCasesText, impact = {}, testCasesPath = 'test-cases.md') {
  const problems = [];
  let lastIndex = -1;
  for (const heading of REQUIRED_HEADINGS) {
    const matches = [...testCasesText.matchAll(new RegExp(`^##\\s+${escapePattern(heading)}\\s*$`, 'gmu'))];
    if (matches.length !== 1) problems.push(`${heading} must appear exactly once`);
    if (matches[0] && matches[0].index < lastIndex) problems.push(`${heading} is out of order`);
    if (matches[0]) lastIndex = matches[0].index;
  }

  const e2eApplicability = checkScope(testCasesText, impact, problems);
  checkCoverageMatrix(testCasesText, problems);
  checkCases(testCasesText, problems);
  checkJourneys(testCasesText, e2eApplicability, problems);
  substantiveSection(testCasesText, '测试数据、隔离与清理', problems);
  substantiveSection(testCasesText, '风险优先级与最小充分集合', problems);

  const selfCheck = section(testCasesText, 'Test Design Self-Check');
  if (!/^-\s*verdict\s*[：:]\s*pass\s*$/imu.test(selfCheck)) problems.push('Test Design Self-Check verdict must be pass');
  if (!/^-\s*unresolved decisions\s*[：:]\s*none\s*$/imu.test(selfCheck)) problems.push('Test Design Self-Check unresolved decisions must be none');
  if (!/^-\s*placeholders\s*[：:]\s*none\s*$/imu.test(selfCheck)) problems.push('Test Design Self-Check placeholders must be none');

  return {
    id: 'test-design-artifact-shape',
    verdict: problems.length === 0 ? 'pass' : 'block',
    evidence: [testCasesPath],
    problems,
  };
}
