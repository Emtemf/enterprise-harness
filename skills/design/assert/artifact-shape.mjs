const REQUIRED_HEADINGS = [
  '目标与验收',
  '事实与约束',
  '决策与证据',
  '架构边界',
  '测试与验证',
  '风险与回滚',
];

export function assertArtifactShape(designText, designPath = 'design.md') {
  const missing = REQUIRED_HEADINGS.filter((heading) => !designText.includes(heading));
  return {
    id: 'artifact-shape',
    verdict: missing.length === 0 ? 'pass' : 'block',
    evidence: [designPath],
    problems: missing.map((heading) => `missing design section: ${heading}`),
  };
}
