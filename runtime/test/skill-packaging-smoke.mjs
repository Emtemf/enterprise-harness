import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateSkillPackaging } from '../validators/skill-packaging-validator.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const validator = path.join(root, 'runtime', 'validators', 'skill-packaging-validator.mjs');

const result = validateSkillPackaging(path.resolve(root));
assert.ok(result.ok, `skill packaging violations:\n${result.problems.map((p) => `  - ${p}`).join('\n')}`);

const direct = spawnSync(process.execPath, [validator], {
  cwd: root,
  encoding: 'utf-8',
  shell: false,
});
assert.equal(direct.status, 0, direct.stderr);
assert.match(direct.stdout, /^PASS skill-packaging/u, 'validator CLI must run on every platform');

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-skill-packaging-'));
try {
  fs.cpSync(path.join(root, 'skills'), path.join(sandbox, 'skills'), { recursive: true });
  fs.cpSync(path.join(root, 'agents'), path.join(sandbox, 'agents'), { recursive: true });
  fs.copyFileSync(path.join(root, 'package.json'), path.join(sandbox, 'package.json'));
  fs.mkdirSync(path.join(sandbox, '.claude-plugin'), { recursive: true });
  fs.copyFileSync(
    path.join(root, '.claude-plugin', 'plugin.json'),
    path.join(sandbox, '.claude-plugin', 'plugin.json'),
  );

  const harnessDir = path.join(sandbox, 'skills', 'harness');
  const harnessSkill = path.join(harnessDir, 'SKILL.md');
  const originalSkill = fs.readFileSync(harnessSkill, 'utf-8');

  fs.mkdirSync(path.join(harnessDir, 'reference'));
  let invalid = validateSkillPackaging(sandbox);
  assert.ok(invalid.problems.some((problem) => problem.includes('forbidden directory "reference/"')));
  fs.rmSync(path.join(harnessDir, 'reference'), { recursive: true });
  assert.ok(validateSkillPackaging(sandbox).ok, 'validator calls must not retain problems from earlier runs');

  fs.writeFileSync(harnessSkill, originalSkill.replace('name: harness', 'name: harness\nname: harness'));
  invalid = validateSkillPackaging(sandbox);
  assert.ok(invalid.problems.some((problem) => problem.includes('duplicate frontmatter key "name"')));
  fs.writeFileSync(harnessSkill, originalSkill);

  const harnessEvals = path.join(harnessDir, 'evals', 'evals.json');
  const originalEvals = fs.readFileSync(harnessEvals, 'utf-8');
  fs.writeFileSync(harnessEvals, originalEvals.replace('"version": "0.5.4"', '"version": "stale"'));
  invalid = validateSkillPackaging(sandbox);
  assert.ok(invalid.problems.some((problem) => problem.includes('evals.version stale')));
  fs.writeFileSync(harnessEvals, originalEvals);

  fs.writeFileSync(path.join(harnessDir, 'references', 'orphan.md'), '# orphan\n');
  invalid = validateSkillPackaging(sandbox);
  assert.ok(invalid.problems.some((problem) => problem.includes('references/orphan.md') && problem.includes('orphan')));
  fs.rmSync(path.join(harnessDir, 'references', 'orphan.md'));

  fs.writeFileSync(
    path.join(harnessDir, 'scripts', 'private-runtime-import.mjs'),
    'const module = await import("../../../runtime/lib/result-contract.mjs");\nvoid module;\n',
  );
  fs.writeFileSync(
    harnessSkill,
    `${originalSkill}\n- [boundary probe](scripts/private-runtime-import.mjs)\n`,
  );
  invalid = validateSkillPackaging(sandbox);
  assert.ok(invalid.problems.some((problem) => problem.includes('imports non-public runtime module')));
  fs.rmSync(path.join(harnessDir, 'scripts', 'private-runtime-import.mjs'));

  fs.writeFileSync(
    harnessSkill,
    `${originalSkill}\n\`node "\${CLAUDE_SKILL_DIR}/../../runtime/cli.mjs" status\`\n`,
  );
  invalid = validateSkillPackaging(sandbox);
  assert.ok(invalid.problems.some((problem) => problem.includes('cross-plugin access')));

  fs.writeFileSync(
    harnessSkill,
    `${originalSkill}\n\`node "\${CLAUDE_SKILL_DIR}/scripts/finalize-clarify-result.mjs <change-id> <run-id>"\`\n`,
  );
  invalid = validateSkillPackaging(sandbox);
  assert.ok(invalid.problems.some((problem) => problem.includes('arguments must be outside')));
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}

console.log(`PASS skill-packaging ${process.argv[2] || 'verify'}`);
