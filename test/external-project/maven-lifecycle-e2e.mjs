import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendAgentEvent } from '../../harness/plugin/runtime/lib/agent-evidence.mjs';
import { readAndValidateTddReceipt, tddReceiptSpoolPath } from '../../harness/plugin/runtime/lib/tdd-receipts.mjs';

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-external-maven-'));
const target = path.join(temp, 'target');
const implementation = 'src/main/java/example/GreetingService.java';
const run = (command, args, options = {}) => spawnSync(command, args, {
  cwd: options.cwd || target,
  encoding: 'utf-8',
  shell: false,
  env: { ...process.env, ...options.env },
});
const mustPass = (result, label) => assert.equal(result.status, 0, `${label}\n${result.stdout}\n${result.stderr}`);

// Stage the runtime assets a target project needs. The plugin normally delivers these through
// Claude Code, which this headless test cannot use, so it copies the same subset directly
// rather than depending on a separate installer.
const STAGED_EXCLUDES = ['changes', 'archive', 'work', 'lessons', 'ACTIVE_CHANGE', 'command-policy.json', 'evidence-policy.json'];
function stageRuntime() {
  fs.cpSync(path.join(sourceRoot, 'harness'), path.join(target, 'harness'), {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(path.join(sourceRoot, 'harness'), source);
      if (!relative) return true;
      const [head] = relative.split(path.sep);
      if (STAGED_EXCLUDES.includes(head)) return false;
      return relative !== path.join('plugin', 'runtime', 'test');
    },
  });
  fs.copyFileSync(
    path.join(sourceRoot, 'harness/templates/command-policy.maven.json'),
    path.join(target, 'harness/command-policy.json'),
  );
}

try {
  fs.cpSync(path.join(sourceRoot, 'test/fixtures/maven-spring-project'), target, { recursive: true });
  const implementationText = fs.readFileSync(path.join(target, implementation), 'utf-8');
  fs.rmSync(path.join(target, implementation));
  mustPass(run('git', ['init']), 'git init');
  mustPass(run('git', ['config', 'user.email', 'fixture@example.test']), 'git email');
  mustPass(run('git', ['config', 'user.name', 'Fixture']), 'git name');
  mustPass(run('git', ['add', '.']), 'git add');
  mustPass(run('git', ['commit', '-m', 'broken baseline for real RED']), 'git commit');

  stageRuntime();
  mustPass(run(process.execPath, [path.join(target, 'harness/plugin/runtime/cli.mjs'), 'start-change', 'greeting-api', 'e2e', 'L1', 'greeting']), 'start change');
  fs.writeFileSync(path.join(target, 'harness/changes/greeting-api/task-commands.json'), `${JSON.stringify({
    schemaVersion: 1,
    tasks: {
      'task-greeting': {
        redCommand: ['mvn', '-q', '-Dtest=GreetingServiceTest', 'test'],
        greenCommand: ['mvn', '-q', '-Dtest=GreetingServiceTest', 'test'],
        refactorCommand: ['mvn', '-q', '-Dtest=GreetingServiceTest', 'test'],
        verifyCommand: ['mvn', '-q', 'verify'],
      },
    },
  }, null, 2)}\n`);
  appendAgentEvent(target, 'greeting-api', {
    kind: 'start',
    agentId: 'external-e2e-agent',
    observedAgentType: 'enterprise-harness:tdd-executor',
    cwd: target,
  });
  const env = { HARNESS_TDD_EXECUTOR_ID: 'external-e2e-agent' };
  const tdd = (phase) => run(process.execPath, [
    path.join(target, 'harness/plugin/runtime/tdd-run.mjs'),
    'greeting-api',
    'task-greeting',
    phase,
    '--',
    'mvn',
    '-q',
    '-Dtest=GreetingServiceTest',
    'test',
  ], { env });
  const red = tdd('red');
  assert.notEqual(red.status, 0, 'RED must fail because the target implementation is absent');
  assert.match(`${red.stdout}\n${red.stderr}`, /ClassNotFoundException|example\.GreetingService/u);
  fs.mkdirSync(path.dirname(path.join(target, implementation)), { recursive: true });
  fs.writeFileSync(path.join(target, implementation), implementationText);
  mustPass(tdd('green'), 'GREEN');
  mustPass(tdd('refactor'), 'REFACTOR');
  const receipt = readAndValidateTddReceipt(tddReceiptSpoolPath(target, 'greeting-api', 'task-greeting'), {
    root: target,
    changeId: 'greeting-api',
    taskId: 'task-greeting',
    requireComplete: true,
  });
  assert.equal(receipt.ok, true, receipt.problems.join('; '));
  mustPass(run('mvn', ['-q', 'verify']), 'external verify');
  console.log('PASS external-project-maven-lifecycle e2e');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
