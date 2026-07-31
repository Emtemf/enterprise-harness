import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const check = process.argv.includes('--check');
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'harness', 'plugin', 'hooks-manifest.json'), 'utf-8'),
);

function render(rootExpression) {
  const hooks = {};
  for (const [event, entries] of Object.entries(manifest.hooks || {})) {
    hooks[event] = entries.map((entry) => {
      const group = {
        hooks: [{
          type: 'command',
          command: `node "${rootExpression}/runtime/hooks/${entry.script}"`,
          timeout: entry.timeout,
          statusMessage: entry.statusMessage,
        }],
      };
      if (entry.matcher) group.matcher = entry.matcher;
      return group;
    });
  }
  return { hooks };
}

const outputs = [
  {
    path: path.join(root, 'hooks', 'hooks.json'),
    value: render('${CLAUDE_PLUGIN_ROOT}'),
  },
  {
    path: path.join(root, '.claude', 'settings.json'),
    value: render('$CLAUDE_PROJECT_DIR'),
  },
];
let stale = false;
for (const output of outputs) {
  const content = `${JSON.stringify(output.value, null, 2)}\n`;
  if (check) {
    if (!fs.existsSync(output.path) || fs.readFileSync(output.path, 'utf-8') !== content) {
      console.error(`stale generated hook config: ${path.relative(root, output.path)}`);
      stale = true;
    }
  } else {
    fs.mkdirSync(path.dirname(output.path), { recursive: true });
    fs.writeFileSync(output.path, content, 'utf-8');
    console.log(`generated ${path.relative(root, output.path)}`);
  }
}
process.exit(stale ? 1 : 0);
