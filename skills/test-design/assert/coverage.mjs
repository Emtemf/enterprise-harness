import { section, tableRows } from './artifact-shape.mjs';

const CASE_HEADER = ['TCID', 'Traces', 'Level', 'Priority', 'Preconditions', 'Data', 'Actions', 'Observable assertions', 'Cleanup/Recovery', 'Status'];
const COVERAGE_HEADER = ['Source', 'Concern', 'Criticality', 'Applicability', 'Covered By', 'N/A Reason'];
const SCOPE_HEADER = ['Dimension', 'Applicability', 'Reason'];
const JOURNEY_HEADER = ['Journey ID', 'Traces', 'Preconditions', 'Steps', 'Observable outcome', 'Status'];
const COVERAGE_DIMENSIONS = new Set([
  'api',
  'data',
  'migration',
  'compatibility',
  'rollback',
  'security',
  'concurrency',
  'consistency',
  'observability',
]);

function acceptanceSection(requirementsText) {
  return requirementsText.match(/^###\s+验收\s*$([\s\S]*?)(?=^#{2,3}\s+|(?![\s\S]))/mu)?.[1] ?? '';
}

function requirementIds(requirementsText) {
  return [...acceptanceSection(requirementsText).matchAll(/^\s*-\s+(R[1-9][0-9]*)\s*[：:]/gmu)].map((match) => match[1]);
}

function verificationIds(designText, problems) {
  return tableRows(
    section(designText, '可验证性义务'),
    ['VOID', 'Requirement / Decision', '必须可观察的行为', '主要失败信号', '后续 Test Design 入口'],
    'verification obligation',
    problems,
  ).map((cells) => cells[0]).filter((id) => /^VO[1-9][0-9]*$/u.test(id));
}

function referencedCases(value, owner, problems) {
  if (!/^(?:TC[1-9][0-9]*)(?:\s*\/\s*TC[1-9][0-9]*)*$/u.test(value)) {
    problems.push(`${owner} Covered By must be a pure slash-separated TC list`);
    return [];
  }
  const ids = value.split(/\s*\/\s*/u);
  if (new Set(ids).size !== ids.length) problems.push(`${owner} Covered By contains duplicate TC IDs`);
  return ids;
}

export function assertCoverage(
  requirementsText,
  designText,
  testCasesText,
  paths = { requirements: 'requirements.md', design: 'design.md', testCases: 'test-cases.md' },
) {
  const problems = [];
  const requirements = requirementIds(requirementsText);
  const obligations = verificationIds(designText, problems);
  const caseRows = tableRows(section(testCasesText, '测试用例'), CASE_HEADER, 'test case', problems);
  const cases = new Map(caseRows.filter((cells) => cells.length === CASE_HEADER.length).map((cells) => [cells[0], cells]));
  const coverageRows = tableRows(section(testCasesText, 'Coverage Matrix'), COVERAGE_HEADER, 'coverage matrix', problems)
    .filter((cells) => cells.length === COVERAGE_HEADER.length);
  const knownSources = new Set([...requirements, ...obligations]);
  const sourceCounts = coverageRows.reduce(
    (counts, cells) => counts.set(cells[0], (counts.get(cells[0]) ?? 0) + 1),
    new Map(),
  );

  if (requirements.length === 0) problems.push('requirements contain no stable R<number> identifiers');
  if (obligations.length === 0) problems.push('design contains no stable VO<number> declarations');

  for (const [source, count] of sourceCounts) {
    if (count > 1) problems.push(`duplicate coverage source: ${source}`);
    if (!knownSources.has(source) && !COVERAGE_DIMENSIONS.has(source)) {
      problems.push(`coverage source is neither a known R/VO nor an allowed dimension: ${source}`);
    }
  }

  for (const source of knownSources) {
    const rows = coverageRows.filter((cells) => cells[0] === source && cells[3] === 'applicable');
    if (rows.length !== 1) {
      problems.push(`${source} must have exactly one applicable coverage row`);
      continue;
    }
    const coveredCases = referencedCases(rows[0][4], source, problems);
    if (!coveredCases.some((id) => cases.has(id))) {
      problems.push(`${source} coverage does not resolve to an existing test case`);
    }
  }

  for (const cells of coverageRows) {
    if (cells[3] !== 'applicable') continue;
    const declared = referencedCases(cells[4], cells[0], problems);
    const unknown = declared.filter((id) => !cases.has(id));
    for (const id of unknown) problems.push(`coverage ${cells[0]} references unknown test case: ${id}`);
    const resolved = declared.filter((id) => cases.has(id));
    if (resolved.length === 0) problems.push(`applicable coverage ${cells[0]} has no existing case`);
    if (cells[2] === 'critical' && !resolved.some((id) => cases.get(id)?.[3] === 'critical')) {
      problems.push(`critical coverage ${cells[0]} requires a critical-priority case`);
    }
  }

  const scopeRows = tableRows(section(testCasesText, '输入与测试范围'), SCOPE_HEADER, 'input scope', problems);
  const e2eApplicable = scopeRows.some((cells) => cells[0] === 'E2E' && cells[1] === 'applicable');
  if (e2eApplicable) {
    const journeys = tableRows(section(testCasesText, 'E2E 用户旅程'), JOURNEY_HEADER, 'E2E journey', problems)
      .filter((cells) => cells.length === JOURNEY_HEADER.length && /^J[1-9][0-9]*$/u.test(cells[0]));
    if (journeys.length === 0) problems.push('applicable E2E scope has no journey');
    for (const cells of journeys) {
      const journeyCases = cells[1].match(/\bTC[1-9][0-9]*\b/gu) ?? [];
      if (!journeyCases.some((id) => cases.has(id))) {
        problems.push(`E2E journey ${cells[0]} does not reference an existing test case`);
      }
    }
  }

  return {
    id: 'test-design-coverage',
    verdict: problems.length === 0 ? 'pass' : 'block',
    evidence: [paths.requirements, paths.design, paths.testCases],
    problems,
  };
}
