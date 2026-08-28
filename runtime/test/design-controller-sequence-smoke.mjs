import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fileURLToPath(new URL('../../', import.meta.url));
const behaviorMap = fs.readFileSync(
  path.join(root, 'skills/harness/references/behavior-map.md'),
  'utf-8',
);
const downstreamPitfalls = fs.readFileSync(
  path.join(root, 'skills/harness/references/downstream-pitfalls.md'),
  'utf-8',
);

const commandBlocks = [...behaviorMap.matchAll(/```bash\n([\s\S]*?)```/gu)]
  .map((match) => match[1].replace(/\\\s*\n\s*/gu, ' ').replace(/\s+/gu, ' ').trim());
const architectureExecute = commandBlocks.find((command) => command.includes(
  'handoff create <change-id> design design.produce execute',
));
assert.equal(typeof architectureExecute, 'string', 'Design controller must create the architecture execute handoff');

const architectureSeal = commandBlocks.find((command) => command.includes(
  'design seal-architecture <change-id>',
));
assert.equal(typeof architectureSeal, 'string', 'Design controller must seal the reviewed ArchitectureProof');

const testDesignExecute = commandBlocks.find((command) => command.includes(
  'handoff create <change-id> design design.test-cases execute',
));
assert.equal(typeof testDesignExecute, 'string', 'Design controller must create the test-design execute handoff');
for (const requiredRef of [
  '--input-ref harness/changes/<change-id>/requirements.md',
  '--input-ref <classification-ref>',
  '--input-ref harness/changes/<change-id>/design.md',
  '--input-ref harness/changes/<change-id>/evidence/completion/design-architecture.json',
]) {
  assert.ok(testDesignExecute.includes(requiredRef), `test-design handoff must freeze ${requiredRef}`);
}

assert.match(
  behaviorMap,
  /test-design[^#]*只取 stdout 中的一整行 `HANDOFF_INPUT=<canonical-input\.json-path>`[^#]*不变地作为 `\$ARGUMENTS` 调用 `enterprise-harness:test-design`/isu,
  'Main must pass only the emitted HANDOFF_INPUT marker to the test-design worker',
);
assert.match(
  behaviorMap,
  /test-design[^#]*(?:不得|不能)[^#]*(?:聊天摘要|用户原话|Main 自己推断)/isu,
  'test-design dispatch must forbid extra conversational input',
);

const orderedRecovery = [
  /missing\/stale architecture result[^\n]*design\.produce/iu,
  /missing\/stale architecture review[^\n]*review\(design\)/iu,
  /missing\/stale ArchitectureProof[^\n]*design seal-architecture/iu,
  /missing\/stale test-design result[^\n]*design\.test-cases/iu,
  /missing\/stale test-design review[^\n]*review\(test-design\)/iu,
  /both chains fresh[^\n]*design transition/iu,
];
let previousIndex = -1;
for (const expected of orderedRecovery) {
  const match = expected.exec(behaviorMap);
  assert.ok(match, `missing Design recovery projection ${expected}`);
  assert.ok(match.index > previousIndex, `Design recovery projection is out of order at ${expected}`);
  previousIndex = match.index;
}
assert.match(
  behaviorMap,
  /只(?:选择|执行)[^\n]*(?:第一|最早)[^\n]*(?:一个动作|单一动作)[^\n]*(?:重新读取|重读)[^\n]*(?:status|snapshot)/iu,
  'Design controller must execute only the first recovery action and then re-read runtime status',
);

const designPitfallRow = downstreamPitfalls.split('\n').find((line) => /^\| Design \|/u.test(line));
assert.equal(typeof designPitfallRow, 'string', 'downstream checklist must retain a Design row');
for (const chainEvidence of ['ArchitectureProof', 'test-design StageResult', 'test-design ReviewResult']) {
  assert.ok(designPitfallRow.includes(chainEvidence), `Design handoff checklist must require ${chainEvidence}`);
}

console.log(`PASS design-controller-sequence ${mode}`);
