import fs from 'node:fs';
import path from 'node:path';

// Ambiguity scoring gate: clarify 阶段的评分表必须被机械消费，而不是只写在 skill 指令里。
// 契约来源：harness/specs/ambiguity-scoring.md（7 维 0-5 分，关键维度 >= 4 才允许进入 route）。

export const AMBIGUITY_DIMENSIONS = [
  'T 目标 clarity',
  'Scope clarity',
  'User/actor clarity',
  'Data/SQL clarity',
  'Interface/API clarity',
  'Acceptance criteria clarity',
  'Constraint/risk clarity',
];

export const AMBIGUITY_PASS_THRESHOLD = 4;

function normalizeDimensionLabel(label) {
  return String(label || '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseScoreCell(cell) {
  const raw = String(cell || '').replace(/\*\*/g, '').trim();
  if (!raw) return null;
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  return Number(match[0]);
}

// 解析 requirements.md 中的歧义评分表。
// 返回评分、机械计算的 overall/weakest，以及 gate 问题。
export function parseAmbiguityScores(text) {
  const rows = [];
  let overall = null;

  for (const line of String(text || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed.split('|').map((cell) => cell.trim());
    // 形如 | 维度 | 分数 | 说明 |，split 后首尾为空串
    if (cells.length < 4) continue;
    const dimension = normalizeDimensionLabel(cells[1]);
    if (!dimension) continue;
    if (/^-+$/.test(dimension)) continue;
    if (dimension === '维度') continue;

    const score = parseScoreCell(cells[2]);
    if (dimension.toLowerCase() === 'overall') {
      overall = score;
      continue;
    }
    if (!AMBIGUITY_DIMENSIONS.includes(dimension)) continue;
    rows.push({ dimension, score, note: cells[3] || '' });
  }

  const seen = new Set(rows.map((row) => row.dimension));
  const duplicates = rows
    .map((row) => row.dimension)
    .filter((dimension, index, all) => all.indexOf(dimension) !== index);
  const missing = AMBIGUITY_DIMENSIONS.filter((dimension) => !seen.has(dimension));
  for (const row of rows) {
    if (row.score === null) missing.push(row.dimension);
  }
  const belowThreshold = rows
    .filter((row) => row.score !== null && row.score < AMBIGUITY_PASS_THRESHOLD)
    .map((row) => `${row.dimension}=${row.score}`);
  const invalidScores = rows
    .filter((row) => row.score !== null && (!Number.isInteger(row.score) || row.score < 0 || row.score > 5))
    .map((row) => `${row.dimension}=${row.score}`);
  const scored = rows.filter((row) => Number.isFinite(row.score));
  const computedOverall = scored.length === AMBIGUITY_DIMENSIONS.length
    ? Number((scored.reduce((sum, row) => sum + row.score, 0) / scored.length).toFixed(1))
    : null;
  const weakestScore = scored.length ? Math.min(...scored.map((row) => row.score)) : null;
  const weakest = weakestScore === null
    ? []
    : scored.filter((row) => row.score === weakestScore).map((row) => row.dimension);
  const missingEvidence = rows
    .filter((row) => !String(row.note || '').trim())
    .map((row) => row.dimension);

  return {
    rows,
    overall,
    computedOverall,
    weakest,
    weakestScore,
    missing,
    duplicates: [...new Set(duplicates)],
    belowThreshold,
    invalidScores,
    missingEvidence,
  };
}

export function requirementsPath(root, changeId) {
  return path.join(root, 'harness', 'changes', changeId, 'requirements.md');
}

// 机械门禁：clarify -> route 之前，评分表必须存在、填满且全部 >= 阈值。
export function validateAmbiguityGate(root, changeId, state = null) {
  const errors = [];
  // 只对 clarify-first 新结构 change 强制；历史/legacy change 不追溯误杀。
  if (state && ((state.schemaVersion ?? 0) < 3 || !state.workflow)) {
    return errors;
  }
  // start-change 产出的 DRAFT scaffold 只有空模板，clarify 尚未开始。
  // 若在此阶段就要求评分，verify/prepublish 会阻断在工具自身的产物上。
  if (state?.state === 'DRAFT') {
    return errors;
  }
  // ambiguity gate 只在 clarify→route 边界有意义。
  // routeReady=true 表示用户已确认 scope 并通过 route；之后继续强制 >=4 没有意义，
  // 反而会因为 phase-boundary 合理低分（design/plan 尚未冻结的细节）持续 block。
  if (state?.workflow?.routeReady === true) {
    return errors;
  }
  const file = requirementsPath(root, changeId);
  if (!fs.existsSync(file)) {
    errors.push(`${changeId}: 缺少 requirements.md，无法消费歧义评分`);
    return errors;
  }

  const parsed = parseAmbiguityScores(fs.readFileSync(file, 'utf-8'));
  if (parsed.rows.length === 0) {
    errors.push(`${changeId}: requirements.md 未找到歧义评分表（应包含 ${AMBIGUITY_DIMENSIONS.length} 个维度）`);
    return errors;
  }
  if (parsed.missing.length > 0) {
    errors.push(`[EH-CLARIFY-AMBIGUITY-006] ${changeId}: 歧义评分未填写完整，缺失维度: ${[...new Set(parsed.missing)].join(', ')}`);
  }
  if (parsed.duplicates.length > 0) {
    errors.push(`[EH-CLARIFY-AMBIGUITY-006] ${changeId}: 歧义评分维度重复: ${parsed.duplicates.join(', ')}`);
  }
  if (parsed.invalidScores.length > 0) {
    errors.push(`[EH-CLARIFY-AMBIGUITY-006] ${changeId}: 分数必须是 0-5 的整数: ${parsed.invalidScores.join(', ')}`);
  }
  if (parsed.missingEvidence.length > 0) {
    errors.push(`[EH-CLARIFY-AMBIGUITY-006] ${changeId}: 每个分数必须有事实或用户回答依据: ${parsed.missingEvidence.join(', ')}`);
  }
  if (parsed.overall === null) {
    errors.push(`[EH-CLARIFY-AMBIGUITY-006] ${changeId}: 缺少 Overall 分数`);
  } else if (parsed.computedOverall !== null && Math.abs(parsed.overall - parsed.computedOverall) > 0.05) {
    errors.push(`[EH-CLARIFY-AMBIGUITY-006] ${changeId}: Overall=${parsed.overall} 与七维平均值 ${parsed.computedOverall} 不一致`);
  }
  if (parsed.belowThreshold.length > 0) {
    errors.push(`[EH-CLARIFY-AMBIGUITY-006] ${changeId}: 歧义评分未达标（要求所有维度 >= ${AMBIGUITY_PASS_THRESHOLD}）: ${parsed.belowThreshold.join(', ')}`);
  }
  return errors;
}

export function isAmbiguityGateSatisfied(root, changeId) {
  return validateAmbiguityGate(root, changeId).length === 0;
}
