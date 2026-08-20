import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_SKILLS = [
  'archive',
  'design',
  'explore-code',
  'harness',
  'implement',
  'plan',
  'research-docs',
  'review',
  'verify',
];

const EXPECTED_AGENTS = [
  'code-explore.md',
  'doc-research.md',
  'artifact-worker.md',
  'implementer.md',
  'reviewer.md',
];

const SUPPORTING_DIRS = ['references', 'assets', 'scripts', 'assert', 'evals'];
const SUPPORTING_PATH = '(?:references|assets|scripts|assert|evals)';

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function listFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(target));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

function extractSupportingRefs(content) {
  const refs = new Set();
  const record = (candidate) => {
    const normalized = candidate.replace(/\\/gu, '/').split('#', 1)[0];
    if (new RegExp(`^${SUPPORTING_PATH}/[^/].+`, 'u').test(normalized)) refs.add(normalized);
  };

  for (const match of content.matchAll(/\]\(([^)\s]+)\)/gu)) record(match[1]);
  const inlinePath = new RegExp(`(?:\\$\\{CLAUDE_SKILL_DIR\\}/)?(${SUPPORTING_PATH}/[A-Za-z0-9._/-]+)`, 'gu');
  for (const match of content.matchAll(inlinePath)) record(match[1]);
  return refs;
}

function importSpecifiers(content) {
  return [...content.matchAll(/\b(?:from\s*|import\s*\(\s*|import\s*)['"]([^'"]+)['"]/gu)]
    .map((match) => match[1].replace(/\\/gu, '/'));
}

export function validateSkillPackaging(pluginRoot) {
  const problems = [];
  const fail = (message) => problems.push(message);
  const skillsRoot = path.join(pluginRoot, 'skills');
  const agentsDir = path.join(pluginRoot, 'agents');
  const pluginManifestPath = path.join(pluginRoot, '.claude-plugin', 'plugin.json');

  if (!fs.existsSync(skillsRoot)) {
    fail('skills/ directory missing');
    return { ok: false, problems };
  }

  const actualSkills = fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  for (const missing of EXPECTED_SKILLS.filter((skill) => !actualSkills.includes(skill))) {
    fail(`expected skill "${missing}" not found`);
  }
  for (const extra of actualSkills.filter((skill) => !EXPECTED_SKILLS.includes(skill))) {
    fail(`unexpected skill "${extra}" not in expected set`);
  }

  if (!fs.existsSync(agentsDir)) {
    fail('agents/ directory missing');
  } else {
    const actualAgents = fs.readdirSync(agentsDir).sort();
    const expectedAgents = [...EXPECTED_AGENTS].sort();
    if (actualAgents.join(',') !== expectedAgents.join(',')) {
      fail(`agents/ actual [${actualAgents}] != expected [${expectedAgents}]`);
    }
  }
  if (!fs.existsSync(pluginManifestPath)) {
    fail('.claude-plugin/plugin.json missing');
  } else {
    try {
      const manifest = JSON.parse(fs.readFileSync(pluginManifestPath, 'utf-8'));
      const manifestAgents = (manifest.agents || []).map((entry) => entry.replace('./agents/', '')).sort();
      const expectedAgents = [...EXPECTED_AGENTS].sort();
      if (manifestAgents.join(',') !== expectedAgents.join(',')) {
        fail(`plugin.json agents [${manifestAgents}] != expected [${expectedAgents}]`);
      }
    } catch (error) {
      fail(`.claude-plugin/plugin.json is invalid JSON: ${error.message}`);
    }
  }

  for (const skill of EXPECTED_SKILLS) {
    const skillDir = path.join(skillsRoot, skill);
    if (!fs.existsSync(skillDir)) continue;
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) {
      fail(`${skill}: SKILL.md missing`);
      continue;
    }
    const content = fs.readFileSync(skillMdPath, 'utf-8');
    const name = content.match(/^name:\s*(.+)$/mu)?.[1]?.trim();
    if (!name) fail(`${skill}: frontmatter name missing`);
    else if (name !== skill) fail(`${skill}: frontmatter name "${name}" != directory name`);

    const singularPath = path.join(skillDir, 'reference');
    if (fs.existsSync(singularPath)) {
      fail(`${skill}: forbidden directory "reference/" (use "references/")`);
    }

    const allowed = new Set(['SKILL.md', ...SUPPORTING_DIRS]);
    for (const entry of fs.readdirSync(skillDir, { withFileTypes: true })) {
      if (!allowed.has(entry.name)) {
        fail(`${skill}: non-standard entry "${entry.name}" not registered in skill-packaging.md`);
      } else if (entry.name !== 'SKILL.md' && !entry.isDirectory()) {
        fail(`${skill}: supporting entry "${entry.name}" must be a directory`);
      }
    }

    const referencedFiles = extractSupportingRefs(content);
    for (const ref of referencedFiles) {
      const target = path.resolve(skillDir, ref);
      const relative = path.relative(skillDir, target);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        fail(`${skill}: SKILL.md supporting reference escapes skill directory: "${ref}"`);
      } else if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        fail(`${skill}: SKILL.md references "${ref}" but file does not exist`);
      }
    }

    for (const dir of SUPPORTING_DIRS) {
      const dirPath = path.join(skillDir, dir);
      if (!fs.existsSync(dirPath)) continue;
      const files = listFiles(dirPath);
      if (files.length === 0) fail(`${skill}: empty supporting directory "${dir}/"`);
      for (const file of files) {
        const ref = toPosix(path.relative(skillDir, file));
        if (!referencedFiles.has(ref)) {
          fail(`${skill}: supporting file "${ref}" is not referenced by SKILL.md (orphan)`);
        }
      }
    }

    if (/\$\{CLAUDE_SKILL_DIR\}\/\.\./u.test(content) || /(?:^|[\s"'`])\.\.\/\.\.\/runtime\//mu.test(content)) {
      fail(`${skill}: cross-plugin access must go through \${CLAUDE_PLUGIN_ROOT}, not a relative skill path`);
    }
    if (/\bnode\s+["']?runtime\//u.test(content)) {
      fail(`${skill}: plugin-global runtime commands must use \${CLAUDE_PLUGIN_ROOT}`);
    }
    if (/\bnode\s+["']\$\{CLAUDE_(?:SKILL_DIR|PLUGIN_ROOT)\}\/[^"']+\.mjs\s+<[^"']+["']/u.test(content)) {
      fail(`${skill}: command arguments must be outside the quoted script path`);
    }

    for (const file of listFiles(skillDir).filter((entry) => entry.endsWith('.mjs'))) {
      const text = fs.readFileSync(file, 'utf-8');
      for (const specifier of importSpecifiers(text)) {
        if (/(?:^|\/)runtime\//u.test(specifier) && !/(?:^|\/)runtime\/api\//u.test(specifier)) {
          const relativeFile = toPosix(path.relative(pluginRoot, file));
          fail(`${relativeFile}: imports non-public runtime module "${specifier}"; use runtime/api/`);
        }
      }
    }
  }

  return { ok: problems.length === 0, problems };
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  const { ok, problems } = validateSkillPackaging(process.cwd());
  if (!ok) {
    for (const problem of problems) console.error(`FAIL ${problem}`);
    process.exit(1);
  }
  console.log(`PASS skill-packaging (${EXPECTED_SKILLS.length} skills, ${EXPECTED_AGENTS.length} agents)`);
}
