import assert from 'node:assert/strict';
import { parseAmbiguityScores } from '../lib/ambiguity.mjs';

const table = (overall = '4.0', scopeNote = '探索确认单模块边界') => `
| 维度 | 分数(0-5) | 说明 |
|------|----------|------|
| T 目标 clarity | 4 | 用户确认可测试目标 |
| Scope clarity | 4 | ${scopeNote} |
| User/actor clarity | 4 | 用户确认调用角色 |
| Data/SQL clarity | 4 | 探索确认无数据变化 |
| Interface/API clarity | 4 | 探索确认无接口变化 |
| Acceptance criteria clarity | 4 | 已能转成 RED 断言 |
| Constraint/risk clarity | 4 | 用户确认风险与恢复 |
| **Overall** | ${overall} | 七维平均 |
`;

const valid = parseAmbiguityScores(table());
assert.equal(valid.computedOverall, 4);
assert.equal(valid.overall, 4);
assert.deepEqual(valid.weakest, [
  'T 目标 clarity',
  'Scope clarity',
  'User/actor clarity',
  'Data/SQL clarity',
  'Interface/API clarity',
  'Acceptance criteria clarity',
  'Constraint/risk clarity',
]);
assert.deepEqual(valid.missingEvidence, []);

const wrongOverall = parseAmbiguityScores(table('4.8'));
assert.notEqual(wrongOverall.overall, wrongOverall.computedOverall);

const missingEvidence = parseAmbiguityScores(table('4.0', ''));
assert.deepEqual(missingEvidence.missingEvidence, ['Scope clarity']);

const invalidScore = parseAmbiguityScores(table().replace('| Scope clarity | 4 |', '| Scope clarity | 4.5 |'));
assert.deepEqual(invalidScore.invalidScores, ['Scope clarity=4.5']);
console.log(`PASS ambiguity-scoring-contract ${process.argv[2] || 'verify'}`);
