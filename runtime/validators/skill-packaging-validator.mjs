import fs from 'node:fs';
import path from 'node:path';

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

const problems = [];

function fail(message) {
  problems.push(message);
}

function readSkillMd(skillDir) {
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    fail(`${path.basename(skillDir)}: SKILL.md missing`);
    return null;
  }
  return fs.readFileSync(skillMdPath, 'utf-8');
}

function checkNameMatchesDir(skillDir, content) {
  const name = content.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  if (name && name !== path.basename(skillDir)) {
    fail(`${path.basename(skillDir)}: frontmatter name "${name}" != directory name`);
  }
}

function checkNoSingularReference(skillDir) {
  const singularPath = path.join(skillDir, 'reference');
  if (fs.existsSync(singularPath)) {
    fail(`${path.basename(skillDir)}: forbidden directory "reference/" (use "references/")`);
  }
}

function checkNoNonStandardDirs(skillDir) {
  const allowed = new Set(['SKILL.md', ...SUPPORTING_DIRS]);
  for (const entry of fs.readdirSync(skillDir)) {
    if (!allowed.has(entry)) {
      fail(`${path.basename(skillDir)}: non-standard entry "${entry}" not registered in skill-packaging.md`);
    }
  }
}

function checkNoEmptySupportingDirs(skillDir) {
  for (const dir of SUPPORTING_DIRS) {
    const dirPath = path.join(skillDir, dir);
    if (fs.existsSync(dirPath) && fs.readdirSync(dirPath).length === 0) {
      fail(`${path.basename(skillDir)}: empty supporting directory "${dir}/"`);
    }
  }
}

function checkSupportingFilesReachable(skillDir, content) {
  // Extract local markdown links and backtick paths from SKILL.md
  const refs = new Set();
  for (const match of content.matchAll(/\]\(([^)#\s]+(?:\/[^)#\s]*)?)\)/g)) {
    refs.add(match[1]);
  }
  for (const match of content.matchAll(/`(references|assets|scripts|assert|evals)\/[^`\s]+`/g)) {
    refs.add(match[0].slice(1, -1));
  }
  const skillName = path.basename(skillDir);
  const refList = [...refs].filter((ref) => !ref.startsWith('http'));
  const referenced = new Set();
  for (const ref of refList) {
    const target = path.join(skillDir, ref);
    if (!fs.existsSync(target)) {
      fail(`${skillName}: SKILL.md references "${ref}" but file does not exist`);
    } else {
      referenced.add(ref.split('/')[0]);
    }
  }
  return referenced;
}

function checkOrphanFiles(skillDir, referencedRoots) {
  const skillName = path.basename(skillDir);
  for (const dir of SUPPORTING_DIRS) {
    const dirPath = path.join(skillDir, dir);
    if (!fs.existsSync(dirPath)) continue;
    if (!referencedRoots.has(dir)) {
      const files = fs.readdirSync(dirPath);
      if (files.length > 0) {
        fail(`${skillName}: ${dir}/ exists with ${files.length} file(s) but SKILL.md never references it (orphan)`);
      }
    }
  }
}

function checkRuntimePathConvention(skillDir, content) {
  const skillName = path.basename(skillDir);
  const forbidden = /\$\{CLAUDE_SKILL_DIR\}\/\.\.\/\.\.\//g;
  for (const match of content.matchAll(forbidden)) {
    fail(`${skillName}: uses "${match[0]}" — cross-plugin access must go through \${CLAUDE_PLUGIN_ROOT}`);
  }
}

function checkScriptApiBoundary(skillDir) {
  const skillName = path.basename(skillDir);
  const scriptsDir = path.join(skillDir, 'scripts');
  if (!fs.existsSync(scriptsDir)) return;
  for (const script of fs.readdirSync(scriptsDir)) {
    if (!script.endsWith('.mjs')) continue;
    const text = fs.readFileSync(path.join(scriptsDir, script), 'utf-8');
    for (const match of text.matchAll(/from\s+'([^']*runtime\/(?:core|lib)\/[^']*)'/g)) {
      fail(`${skillName}/scripts/${script}: imports internal "${match[1]}" — skill scripts may only import from runtime/api/`);
    }
  }
}

function checkSkillSet(skillsRoot) {
  const actual = fs.readdirSync(skillsRoot).filter((entry) => fs.statSync(path.join(skillsRoot, entry)).isDirectory());
  const expected = [...EXPECTED_SKILLS].sort();
  const actualSorted = [...actual].sort();
  for (const missing of expected.filter((s) => !actual.includes(s))) {
    fail(`expected skill "${missing}" not found`);
  }
  for (const extra of actual.filter((s) => !expected.includes(s))) {
    fail(`unexpected skill "${extra}" not in expected set`);
  }
  return actualSorted.join(',') === expected.join(',');
}

function checkAgents(agentsDir, pluginManifestPath) {
  if (!fs.existsSync(agentsDir)) {
    fail('agents/ directory missing');
    return;
  }
  const actual = fs.readdirSync(agentsDir).sort();
  const expected = [...EXPECTED_AGENTS].sort();
  if (actual.join(',') !== expected.join(',')) {
    fail(`agents/ actual [${actual}] != expected [${expected}]`);
  }
  const manifest = JSON.parse(fs.readFileSync(pluginManifestPath, 'utf-8'));
  const manifestAgents = (manifest.agents || []).map((entry) => entry.replace('./agents/', '')).sort();
  if (manifestAgents.join(',') !== expected.join(',')) {
    fail(`plugin.json agents [${manifestAgents}] != expected [${expected}]`);
  }
}

export function validateSkillPackaging(pluginRoot) {
  const skillsRoot = path.join(pluginRoot, 'skills');
  const agentsDir = path.join(pluginRoot, 'agents');
  const pluginManifestPath = path.join(pluginRoot, '.claude-plugin', 'plugin.json');
  checkSkillSet(skillsRoot);
  checkAgents(agentsDir, pluginManifestPath);
  for (const skill of EXPECTED_SKILLS) {
    const skillDir = path.join(skillsRoot, skill);
    if (!fs.existsSync(skillDir)) continue;
    const content = readSkillMd(skillDir);
    if (content === null) continue;
    checkNameMatchesDir(skillDir, content);
    checkNoSingularReference(skillDir);
    checkNoNonStandardDirs(skillDir);
    checkNoEmptySupportingDirs(skillDir);
    checkRuntimePathConvention(skillDir, content);
    checkScriptApiBoundary(skillDir);
    const referencedRoots = checkSupportingFilesReachable(skillDir, content);
    checkOrphanFiles(skillDir, referencedRoots);
  }
  return { ok: problems.length === 0, problems };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isDirectRun) {
  const { ok, problems: found } = validateSkillPackaging(process.cwd());
  if (!ok) {
    for (const problem of found) console.error(`FAIL ${problem}`);
    process.exit(1);
  }
  console.log(`PASS skill-packaging (${EXPECTED_SKILLS.length} skills, ${EXPECTED_AGENTS.length} agents)`);
}
