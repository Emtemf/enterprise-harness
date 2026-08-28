const REQUIRED_HEADINGS = [
  '目标与验收',
  '事实与约束',
  '方案与权衡',
  'Requirement Trace',
  '架构边界',
  '交互与失败路径',
  'API 设计',
  '数据与 SQL 设计',
  '安全、并发与可观测性',
  '测试设计',
  '风险、兼容与回滚',
  'Design Self-Check',
];

function section(designText, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return designText.match(new RegExp(`^##\\s+${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, 'mu'))?.[1]?.trim() ?? '';
}

function hasHeading(designText, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`^##\\s+${escaped}\\s*$`, 'mu').test(designText);
}

function subsection(parentText, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return parentText.match(new RegExp(`^###\\s+${escaped}\\s*$([\\s\\S]*?)(?=^###\\s+|(?![\\s\\S]))`, 'mu'))?.[1]?.trim() ?? '';
}

function substantiveAlternativeRows(text) {
  return text.split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && line.endsWith('|'))
    .map((line) => line.slice(1, -1).split('|').map((cell) => cell.trim()))
    .filter((cells) => cells.length === 4)
    .filter((cells) => !/^方案$/u.test(cells[0]) && !cells.every((cell) => /^:?-{3,}:?$/u.test(cell)))
    .filter((cells) => cells.every((cell) => cell.length > 0 && !/<[^>]+>/u.test(cell)));
}

function isNotApplicable(text) {
  return /(?:^|\s)N\/A(?:\s|：|:|$)/iu.test(text);
}

function hasReason(text) {
  return /N\/A\s*(?:：|:)\s*\S+/iu.test(text);
}

function substantiveContent(text) {
  return text.split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => {
      if (line.length === 0 || line.startsWith('>') || line.startsWith('###') || /^<!--.*-->$/u.test(line)) return false;
      if (/^\|(?:\s*:?-{3,}:?\s*\|)+$/u.test(line)) return false;
      if (/^\|\s*(?:场景|Requirement|EID|DID|VID|RID)\s*\|/iu.test(line)) return false;
      if (/^[-*]\s+[^：:]+[：:]\s*$/u.test(line)) return false;
      if (/^\|(?:\s*\|)+$/u.test(line)) return false;
      if (/<[^>]+>|accepted\s*\/\s*needs-decision|无\s*\/\s*`?NEEDS_DECISION`?/iu.test(line)) return false;
      return true;
    })
    .join('\n');
}

export function assertArtifactShape(designText, designPath = 'design.md', impact = {}) {
  const missing = REQUIRED_HEADINGS.filter((heading) => !hasHeading(designText, heading));
  const problems = missing.map((heading) => `missing design section: ${heading}`);
  for (const heading of ['目标与验收', '架构边界', '交互与失败路径', '安全、并发与可观测性']) {
    if (hasHeading(designText, heading) && !substantiveContent(section(designText, heading))) {
      problems.push(`${heading} has no substantive content`);
    }
  }
  const alternatives = substantiveAlternativeRows(subsection(section(designText, '方案与权衡'), 'Alternatives'));
  if (alternatives.length < 2) {
    problems.push('方案与权衡 must contain at least two substantive Alternatives with trade-offs and conclusions');
  }
  for (const [dimension, heading] of [['api', 'API 设计'], ['data', '数据与 SQL 设计']]) {
    const content = substantiveContent(section(designText, heading));
    if (!content) {
      problems.push(`${heading} has no substantive content`);
      continue;
    }
    if (impact[dimension] === 'yes' && isNotApplicable(content)) {
      problems.push(`${dimension} impact is yes but ${heading} is marked N/A`);
    }
    if (impact[dimension] === 'no' && (!isNotApplicable(content) || !hasReason(content))) {
      problems.push(`${dimension} impact is no but ${heading} lacks N/A with a reason`);
    }
  }
  const selfCheck = section(designText, 'Design Self-Check');
  if (!/^-\s*verdict\s*[：:]\s*pass\s*$/imu.test(selfCheck)) {
    problems.push('Design Self-Check verdict must be pass');
  }
  if (!/^-\s*unresolved decisions\s*[：:]\s*none\s*$/imu.test(selfCheck)) {
    problems.push('Design Self-Check unresolved decisions must be none');
  }
  if (!/^-\s*downstream findings\s*[：:]\s*none\s*$/imu.test(selfCheck)) {
    problems.push('Design Self-Check downstream findings must be none');
  }
  return {
    id: 'artifact-shape',
    verdict: problems.length === 0 ? 'pass' : 'block',
    evidence: [designPath],
    problems,
  };
}
