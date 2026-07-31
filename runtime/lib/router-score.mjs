import fs from 'node:fs';
import path from 'node:path';

export const ROUTER_DIMENSIONS = [
  'Scope complexity',
  'Impact breadth',
  'Unknowns / ambiguity',
  'API / data risk',
  'Test / rollback complexity',
];

function parseScoreCell(cell) {
  const raw = String(cell || '').replace(/\*\*/g, '').trim();
  if (!raw) return null;
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  return Number(match[0]);
}

export function changePath(root, changeId) {
  return path.join(root, 'harness', 'changes', changeId, 'change.md');
}

export function parseRouterScores(text) {
  const rows = [];
  let overall = null;
  for (const line of String(text || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed.split('|').map((cell) => cell.trim());
    if (cells.length < 4) continue;
    const dimension = cells[1].replace(/\*\*/g, '').trim();
    if (!dimension || dimension === '维度' || /^-+$/.test(dimension)) continue;
    const score = parseScoreCell(cells[2]);
    if (dimension === 'Overall') {
      overall = score;
      continue;
    }
    if (!ROUTER_DIMENSIONS.includes(dimension)) continue;
    rows.push({ dimension, score, note: cells[3] || '' });
  }
  const seen = new Set(rows.map((r) => r.dimension));
  const missing = ROUTER_DIMENSIONS.filter((d) => !seen.has(d));
  for (const row of rows) {
    if (row.score === null) missing.push(row.dimension);
  }
  return { rows, overall, missing };
}

export function validateRouterScore(root, changeId, state = null) {
  const errors = [];
  if (state && ((state.schemaVersion ?? 0) < 3 || !state.workflow)) {
    return errors;
  }
  // DRAFT scaffold 的 route 评分表尚未填写；route 阶段之前不应阻断。
  if (state?.state === 'DRAFT') {
    return errors;
  }
  const file = changePath(root, changeId);
  if (!fs.existsSync(file)) {
    errors.push(`${changeId}: 缺少 change.md，无法消费 route 评分`);
    return errors;
  }
  const parsed = parseRouterScores(fs.readFileSync(file, 'utf-8'));
  if (parsed.rows.length === 0) {
    errors.push(`${changeId}: change.md 未找到 Router 评分表（应包含 ${ROUTER_DIMENSIONS.length} 个维度）`);
    return errors;
  }
  if (parsed.missing.length > 0) {
    errors.push(`${changeId}: route 评分未填写完整，缺失维度: ${[...new Set(parsed.missing)].join(', ')}`);
  }
  return errors;
}
