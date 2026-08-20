import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_METHODS = new Map([
  ['harness', ['references/stage-decisions.md']],
  ['design', ['references/method.md', 'references/decision-longevity.md']],
  ['plan', ['references/method.md']],
  ['implement', ['references/method.md']],
  ['verify', ['references/method.md']],
  ['archive', ['references/method.md']],
  ['review', ['references/method.md']],
]);
const METHOD_SECTIONS = ['Workflow', 'Decision lenses', 'Failure modes', 'Sources'];
const IMPERATIVE_OPENERS = /^(Drive|Generate|Freeze|Execute|Run|Verify|Apply|Collect)\b/u;

function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(target));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

function frontmatterDescription(content) {
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] || '';
  const lines = frontmatter.split(/\r?\n/u);
  const descriptionIndex = lines.findIndex((line) => /^description:\s*>\s*$/u.test(line));
  if (descriptionIndex >= 0) {
    const folded = [];
    for (const line of lines.slice(descriptionIndex + 1)) {
      if (!/^[ \t]+/u.test(line)) break;
      folded.push(line.trim());
    }
    return folded.filter(Boolean).join(' ');
  }
  return frontmatter.match(/^description:\s*['"]?(.+?)['"]?\s*$/mu)?.[1]?.trim() || '';
}

export function validateSkillContent(pluginRoot) {
  const problems = [];
  const fail = (message) => problems.push(message);
  const skillsRoot = path.join(pluginRoot, 'skills');

  if (!fs.existsSync(skillsRoot)) return { ok: false, problems: ['skills/ directory missing'] };

  const skills = fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const skill of skills) {
    const skillDir = path.join(skillsRoot, skill);
    const skillPath = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;
    const content = fs.readFileSync(skillPath, 'utf-8');
    const description = frontmatterDescription(content);
    if (!description) fail(`${skill}: frontmatter description missing`);
    if (description.length > 1024) fail(`${skill}: description exceeds 1024 characters`);
    if (!/\bUse when\b/iu.test(description)) fail(`${skill}: description must state "Use when ..."`);
    if (IMPERATIVE_OPENERS.test(description)) fail(`${skill}: description must use third person, not imperative "${description.split(/\s/u)[0]}"`);
    if (content.split(/\r?\n/u).length >= 500) fail(`${skill}: SKILL.md must stay below 500 lines`);

    for (const required of REQUIRED_METHODS.get(skill) || []) {
      if (!content.includes(required)) fail(`${skill}: SKILL.md must directly link required method "${required}"`);
      const methodPath = path.join(skillDir, ...required.split('/'));
      if (!fs.existsSync(methodPath)) {
        fail(`${skill}: required method "${required}" missing`);
        continue;
      }
      if (required.endsWith('method.md') || required.endsWith('decision-longevity.md')) {
        const method = fs.readFileSync(methodPath, 'utf-8');
        for (const section of METHOD_SECTIONS) {
          if (!new RegExp(`^## ${section}$`, 'mu').test(method)) {
            fail(`${skill}: ${required} missing "## ${section}"`);
          }
        }
      }
    }

    for (const reference of listFiles(path.join(skillDir, 'references')).filter((file) => file.endsWith('.md'))) {
      const text = fs.readFileSync(reference, 'utf-8');
      if (text.split(/\r?\n/u).length > 100 && !/^## (?:Contents|目录)$/mu.test(text)) {
        fail(`${skill}: ${path.relative(skillDir, reference).replaceAll('\\', '/')} exceeds 100 lines without a contents section`);
      }
    }

    const evalsPath = path.join(skillDir, 'evals', 'evals.json');
    if (!fs.existsSync(evalsPath)) continue;
    let evals;
    try {
      evals = JSON.parse(fs.readFileSync(evalsPath, 'utf-8'));
    } catch {
      continue;
    }
    const scenarios = (evals.cases || []).filter((testCase) =>
      typeof testCase?.prompt === 'string'
      && testCase.prompt.trim()
      && Array.isArray(testCase.expectedBehavior)
      && testCase.expectedBehavior.length >= 2
      && testCase.expectedBehavior.every((item) => typeof item === 'string' && item.trim()));
    if (scenarios.length < 1) fail(`${skill}: evals require at least one prompt with two observable expectedBehavior items`);
  }

  const hookFiles = [
    ...listFiles(path.join(pluginRoot, 'hooks')),
    ...listFiles(path.join(pluginRoot, 'runtime', 'lib', 'hooks')),
  ];
  for (const hookFile of hookFiles) {
    const content = fs.readFileSync(hookFile, 'utf-8');
    if (/(?:skills[/\\][^'"`\s]+[/\\]references|references[/\\](?:method|decision-longevity)\.md)/u.test(content)) {
      fail(`${path.relative(pluginRoot, hookFile).replaceAll('\\', '/')}: Hook must not load Skill method content`);
    }
  }

  return { ok: problems.length === 0, problems };
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  const { ok, problems } = validateSkillContent(process.cwd());
  if (!ok) {
    for (const problem of problems) console.error(`FAIL ${problem}`);
    process.exit(1);
  }
  console.log(`PASS skill-content (${REQUIRED_METHODS.size} method contracts)`);
}
