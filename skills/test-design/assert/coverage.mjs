import { section, tableRows } from './artifact-shape.mjs';

const CASE_HEADER = ['TCID', 'Traces', 'Level', 'Priority', 'Preconditions', 'Data', 'Actions', 'Observable assertions', 'Cleanup/Recovery', 'Status'];
const COVERAGE_HEADER = ['Source', 'Concern', 'Criticality', 'Applicability', 'Covered By', 'N/A Reason'];
const SCOPE_HEADER = ['Dimension', 'Applicability', 'Reason'];
const JOURNEY_HEADER = ['Journey ID', 'Traces', 'Preconditions', 'Steps', 'Observable outcome', 'Status'];

function acceptanceSection(requirementsText) {
  return requirementsText.match(/^###\s+验收\s*$([\s\S]*?)(?=^#{2,3}\s+|(?![\s\S]))/mu)?.[1] ?? '';
}

function requirementIds(requirementsText) {
  return [...acceptanceSection(requirementsText).matchAll(/^\s*-\s+(R[1-9][0-9]*)\s*[：:]/gmu)].map((match) => match[1]);
}

function verificationIds(designText) {
  const problems = [];
  return tableRows(
    section(designText, '可验证性义务'),
    ['VOID', 'Requirement / Decision', '必须可观察的行为', '主要失败信号', '后续 Test Design 入口'],
    'verification obligation',
    problems,
  ).map((cells) => cells[0]).filter((id) => /^VO[1-9][0-9]*$/u.test(id));
}

function referencedCases(value) {
  return value.match(/\bTC[1-9][0-9]*\b/gu) ?? [];
}

export function assertCoverage(
  requirementsText,
  designText,
  testCasesText,
  paths = { requirements: 'requirements.md', design: 'design.md', testCases: 'test-cases.md' },
) {
  const problems = [];
  const requirements = requirementIds(requirementsText);
  const obligations = verificationIds(designText);
  const caseRows = tableRows(section(testCasesText, '测试用例'), CASE_HEADER, 'test case', problems);
  const cases = new Map(caseRows.filter((cells) => cells.length === CASE_HEADER.length).map((cells) => [cells[0], cells]));
  const coverageRows = tableRows(section(testCasesText, 'Coverage Matrix'), COVERAGE_HEADER, 'coverage matrix', problems)
    .filter((cells) => cells.length === COVERAGE_HEADER.length);

  if (requirements.length === 0) problems.push('requirements contain no stable R<number> identifiers');
  if (obligations.length === 0) problems.push('design contains no stable VO<number> declarations');

  for (const source of [...requirements, ...obligations]) {
    const rows = coverageRows.filter((cells) => cells[0] === source && cells[3] === 'applicable');
    if (rows.length === 0) {
      problems.push(`missing applicable coverage for ${source}`);
      continue;
    }
    if (!rows.some((cells) => referencedCases(cells[4]).some((id) => cases.has(id)))) {
      problems.push(`${source} coverage does not resolve to an existing test case`);
    }
  }

  for (const cells of coverageRows) {
    if (cells[3] !== 'applicable') continue;
    const resolved = referencedCases(cells[4]).filter((id) => cases.has(id));
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
      if (!referencedCases(cells[1]).some((id) => cases.has(id))) {
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
