import { requirementIds } from './requirement-coverage.mjs';

function section(text, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return text.match(new RegExp(`^##\\s+${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, 'mu'))?.[1] ?? '';
}

function tableRows(text) {
  return text.split(/\r?\n/u)
    .filter((line) => /^\s*\|.*\|\s*$/u.test(line))
    .map((line) => line.trim().slice(1, -1).split('|').map((cell) => cell.trim()))
    .filter((cells) => !cells.every((cell) => /^:?-{3,}:?$/u.test(cell)));
}

function isPlaceholder(value) {
  const text = String(value ?? '').trim();
  return text.length === 0
    || /^(?:TBD|TODO|待定|按需|unknown|N\/A)$/iu.test(text)
    || /^<[^>]+>$/u.test(text);
}

function declarationMap(designText, {
  heading, prefix, columns, label, statusColumn = null,
}, problems) {
  const idPattern = new RegExp(`^${prefix}[0-9][\\w.-]*$`, 'u');
  const rows = tableRows(section(designText, heading)).filter((cells) => idPattern.test(cells[0] ?? ''));
  const counts = rows.reduce((result, cells) => result.set(cells[0], (result.get(cells[0]) ?? 0) + 1), new Map());
  const declarations = new Map();
  for (const cells of rows) {
    const id = cells[0];
    if (counts.get(id) > 1) problems.push(`duplicate ${label} declaration: ${id}`);
    if (cells.length !== columns) {
      problems.push(`${label} ${id} must have exactly ${columns} columns`);
      continue;
    }
    if (cells.slice(1).some(isPlaceholder)) {
      problems.push(`${label} ${id} contains an empty or placeholder field`);
    }
    if (statusColumn !== null && cells[statusColumn] !== 'accepted') {
      problems.push(`${label} ${id} status must be accepted`);
    }
    declarations.set(id, cells);
  }
  return declarations;
}

export function assertTraceability(
  requirementsText,
  designText,
  requirementsPath = 'requirements.md',
  designPath = 'design.md',
  { allowedInputRefs = null } = {},
) {
  const ids = requirementIds(requirementsText);
  const problems = [];
  const requiredCounts = ids.reduce((result, id) => result.set(id, (result.get(id) ?? 0) + 1), new Map());
  for (const [id, count] of requiredCounts) {
    if (count > 1) problems.push(`duplicate requirement identifier: ${id}`);
  }
  if (ids.length === 0) problems.push('requirements contain no stable identifiers in the 验收 section');

  const decisions = declarationMap(designText, {
    heading: '方案与权衡', prefix: 'D', columns: 5, label: 'decision', statusColumn: 4,
  }, problems);
  const evidence = declarationMap(designText, {
    heading: '事实与约束', prefix: 'E', columns: 3, label: 'evidence',
  }, problems);
  const verifications = declarationMap(designText, {
    heading: '测试设计', prefix: 'V', columns: 5, label: 'verification',
  }, problems);
  const rollbacks = declarationMap(designText, {
    heading: '风险、兼容与回滚', prefix: 'RB', columns: 4, label: 'rollback',
  }, problems);

  const allowedRefs = allowedInputRefs ? new Set(allowedInputRefs) : null;
  for (const [id, cells] of evidence) {
    const sourceRef = cells[1].split('#')[0];
    if (allowedRefs && !allowedRefs.has(sourceRef)) {
      problems.push(`evidence ${id} source is not a frozen input: ${cells[1]}`);
    }
  }
  for (const [id, cells] of decisions) {
    const contextEvidence = cells[1].match(/E[0-9][\w.-]*/gu) ?? [];
    if (contextEvidence.length === 0) problems.push(`decision ${id} Context must reference an EID`);
    for (const evidenceId of contextEvidence) {
      if (!evidence.has(evidenceId)) problems.push(`decision ${id} references unknown Context evidence: ${evidenceId}`);
    }
  }

  const traceRows = tableRows(section(designText, 'Requirement Trace'))
    .filter((cells) => /^R[0-9][\w.-]*$/u.test(cells[0] ?? ''));
  const traceCounts = traceRows.reduce((result, cells) => result.set(cells[0], (result.get(cells[0]) ?? 0) + 1), new Map());
  const traces = new Map(traceRows.map((cells) => [cells[0], cells]));
  const requiredSet = new Set(ids);

  for (const tracedId of traceCounts.keys()) {
    if (!requiredSet.has(tracedId)) problems.push(`trace references unknown requirement: ${tracedId}`);
  }
  for (const id of ids) {
    if ((traceCounts.get(id) ?? 0) > 1) problems.push(`duplicate requirement trace: ${id}`);
    const cells = traces.get(id);
    if (!cells || cells.length !== 5) {
      problems.push(`missing structured requirement trace: ${id}`);
      continue;
    }
    const [, decision, evidenceId, verification, rollback] = cells;
    if ([decision, evidenceId, verification, rollback].some(isPlaceholder)) {
      problems.push(`${id} trace contains an empty or placeholder reference`);
    }
    if (!decisions.has(decision)) problems.push(`${id} references unknown decision: ${decision || '<empty>'}`);
    if (!evidence.has(evidenceId)) problems.push(`${id} references unknown evidence: ${evidenceId || '<empty>'}`);
    if (!verifications.has(verification)) problems.push(`${id} references unknown verification: ${verification || '<empty>'}`);
    if (!rollbacks.has(rollback)) problems.push(`${id} references unknown rollback: ${rollback || '<empty>'}`);
  }

  return {
    id: 'traceability',
    verdict: problems.length === 0 ? 'pass' : 'block',
    evidence: [requirementsPath, designPath],
    problems,
  };
}
