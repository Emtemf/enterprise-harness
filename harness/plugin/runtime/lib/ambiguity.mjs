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
// 返回 { rows: [{dimension, score, note}], overall, missing: [], belowThreshold: [] }
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
  const missing = AMBIGUITY_DIMENSIONS.filter((dimension) => !seen.has(dimension));
  for (const row of rows) {
    if (row.score === null) missing.push(row.dimension);
  }
  const belowThreshold = rows
    .filter((row) => row.score !== null && row.score < AMBIGUITY_PASS_THRESHOLD)
    .map((row) => `${row.dimension}=${row.score}`);

  return { rows, overall, missing, belowThreshold };
}

export function requirementsPath(root, changeId) {
  return path.join(root, 'harness', 'changes', changeId, 'requirements.md');
}

// 机械门禁：clarify -> route 之前，评分表必须存在、填满且全部 >= 阈值。
export function validateAmbiguityGate(root, changeId) {
  const errors = [];
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
    errors.push(`${changeId}: 歧义评分未填写完整，缺失维度: ${[...new Set(parsed.missing)].join(', ')}`);
  }
  if (parsed.belowThreshold.length > 0) {
    errors.push(`${changeId}: 歧义评分未达标（要求所有维度 >= ${AMBIGUITY_PASS_THRESHOLD}）: ${parsed.belowThreshold.join(', ')}`);
  }
  return errors;
}

export function isAmbiguityGateSatisfied(root, changeId) {
  return validateAmbiguityGate(root, changeId).length === 0;
}
