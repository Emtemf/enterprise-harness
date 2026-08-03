import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] || 'verify';
const root = fileURLToPath(new URL('../../', import.meta.url));
const skillsDir = path.join(root, '.claude', 'skills');

const dirs = fs.readdirSync(skillsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
assert.ok(dirs.length > 0, 'repository must define skills');

// A skill whose frontmatter name diverges from its directory ships broken: the
// host resolves skills by directory, but agents and docs reference the name.
const nameMismatch = [];
for (const dir of dirs) {
  const skillPath = path.join(skillsDir, dir, 'SKILL.md');
  assert.ok(fs.existsSync(skillPath), `${dir} must contain SKILL.md`);
  const declared = /^name:\s*(\S+)\s*$/mu.exec(fs.readFileSync(skillPath, 'utf-8'));
  assert.ok(declared, `${dir}/SKILL.md must declare a name`);
  if (declared[1] !== dir) nameMismatch.push(`${dir}/SKILL.md declares name: ${declared[1]}`);
}
assert.deepEqual(nameMismatch, [], `skill name must match its directory:\n${nameMismatch.join('\n')}`);

// bin/package.mjs whitelists .claude/skills as a whole tree, so a directory left
// behind by a rename is packaged and shipped without any error.
const plugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf-8'));
const registered = new Set((plugin.skills || []).map((entry) => path.basename(entry.replace(/\/+$/u, ''))));
assert.deepEqual(
  dirs.filter((dir) => !registered.has(dir)),
  [],
  'every skill directory must be registered in plugin.json (an orphan would still be packaged)',
);
assert.deepEqual(
  [...registered].filter((name) => !dirs.includes(name)).sort(),
  [],
  'plugin.json must not register a skill directory that does not exist',
);

console.log(`PASS skill-registry-contract ${mode} (${dirs.length} skills)`);
