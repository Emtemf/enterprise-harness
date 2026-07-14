import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const [, , changeId, owner = 'harness-governance', tier = 'L1', topic = 'minimum-discovery'] = process.argv;

if (!changeId || changeId === '--help' || changeId === '-h') {
  console.log('Enterprise Harness Start Change');
  console.log('Usage: node harness/plugin/runtime/start-change.mjs <change-id> [owner] [tier] [topic]');
  console.log('Creates the minimum change scaffold, prepares one exploration artifact, and sets the active change.');
  process.exit(changeId ? 0 : 1);
}

function run(args) {
  const child = spawnSync('node', ['harness/plugin/runtime/lifecycle.mjs', ...args], {
    cwd: repoRoot,
    encoding: 'utf-8',
  });
  process.stdout.write(child.stdout || '');
  process.stderr.write(child.stderr || '');
  if (child.status !== 0) {
    process.exit(child.status ?? 1);
  }
}

console.log('Enterprise Harness Start Change');
console.log(`Repo: ${repoRoot}`);
console.log(`changeId=${changeId} owner=${owner} tier=${tier}`);

run(['scaffold', changeId, owner, tier]);
if (topic && topic !== '-' && topic !== 'none') {
  run(['exploration', changeId, topic]);
}
run(['active', changeId]);

console.log('Next Steps:');
console.log('- 在 Claude Code 会话中，从 /harness 或 /harness-intake 继续推进 intake。');
console.log('- 当前 change 仍保持 DRAFT，完成最小探索并记录证据后，再推进到 DISCOVERED。');
console.log('- 若后续会修改受治理路径，请先准备 designApproved / redVerified 所需证据。');
