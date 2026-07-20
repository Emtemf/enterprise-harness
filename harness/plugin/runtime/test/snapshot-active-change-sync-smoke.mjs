import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = '/home/wula/IdeaProjects/sdd';
const statusCliPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'status.mjs');
const sessionStartPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'hooks', 'session-start.mjs');
const mode = process.argv[2];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === '.codegraph') continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function setupTempRepo() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-sync-smoke-'));
  const repoCopy = path.join(tempRoot, 'repo');
  copyDir(repoRoot, repoCopy);

  function writeChange(changeId, stateObj, files = {}) {
    const changeDir = path.join(repoCopy, 'harness', 'changes', changeId);
    fs.mkdirSync(path.join(changeDir, 'evidence'), { recursive: true });
    fs.mkdirSync(path.join(changeDir, 'reviews'), { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(changeDir, name), content, 'utf-8');
    }
    fs.writeFileSync(path.join(changeDir, 'validation.md'), '# Validation\n', 'utf-8');
    fs.writeFileSync(path.join(changeDir, 'state.json'), JSON.stringify(stateObj, null, 2) + '\n', 'utf-8');
  }

  writeChange('sync-smoke-a', {
    schemaVersion: 1,
    changeId: 'sync-smoke-a',
    tier: 'L3',
    state: 'DISCOVERED',
    owner: 'harness-governance',
    impact: { api: 'no', data: 'no', architecture: 'yes', rule: 'yes' },
    tooling: { codegraph: { status: 'available', queries: [], fallbackReason: null }, documentation: { status: 'unknown', libraries: [] } },
    decisions: [], blockers: [], approvals: {}, currentTask: null,
    workflow: {
      stage: 'design',
      clarifyReady: true,
      userConfirmedScope: true,
      planReady: false,
      tddStatus: 'not-started',
      nextEntry: '/harness-design'
    },
    validation: { status: 'missing', digest: null, validatedAt: null }
  }, {
    'requirements.md': '# Requirements\n',
    'change.md': '# Change\n',
    'design.md': '# Design\n'
  });

  writeChange('sync-smoke-b', {
    schemaVersion: 1,
    changeId: 'sync-smoke-b',
    tier: 'L3',
    state: 'DRAFT',
    owner: 'harness-governance',
    impact: { api: 'no', data: 'no', architecture: 'yes', rule: 'yes' },
    tooling: { codegraph: { status: 'available', queries: [], fallbackReason: null }, documentation: { status: 'unknown', libraries: [] } },
    decisions: [], blockers: [], approvals: {}, currentTask: null,
    workflow: {
      stage: 'clarify',
      clarifyReady: true,
      userConfirmedScope: true,
      planReady: false,
      tddStatus: 'not-started',
      nextEntry: '/harness'
    },
    validation: { status: 'missing', digest: null, validatedAt: null }
  }, {
    'change.md': '# Change\n'
  });

  fs.writeFileSync(path.join(repoCopy, 'harness', 'ACTIVE_CHANGE'), 'sync-smoke-b\n', 'utf-8');
  return { tempRoot, repoCopy };
}

function runNode(script, cwd) {
  return spawnSync('node', [script], { cwd, encoding: 'utf-8' });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/snapshot-active-change-sync-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const { tempRoot, repoCopy } = setupTempRepo();
try {
  const statusResult = runNode(path.join(repoCopy, 'harness', 'plugin', 'runtime', 'status.mjs'), repoCopy);
  const statusJson = spawnSync('node', [path.join(repoCopy, 'harness', 'plugin', 'runtime', 'status.mjs'), '--json'], { cwd: repoCopy, encoding: 'utf-8' });
  const sessionStart = runNode(sessionStartPath, repoCopy);
  let parsed = null;
  try { parsed = JSON.parse(statusJson.stdout); } catch {}

  const ok =
    statusResult.status === 0 &&
    parsed?.activeChange?.changeId === 'sync-smoke-b' &&
    parsed?.recommendedEntry === '/harness' &&
    parsed?.currentGap === '缺少 requirements.md。' &&
    String(statusResult.stdout || '').includes('普通用户下一步') &&
    String(statusResult.stdout || '').includes('- /harness') &&
    String(sessionStart.stdout || '').includes('[Harness Workflow] 当前 stage: clarify') &&
    String(sessionStart.stdout || '').includes('[Harness Workflow] 推荐恢复入口: /harness');

  if (mode === 'red') {
    if (!ok) {
      fail('Expected snapshot/active-change sync contract to fail before implementation');
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    fail('Expected snapshot/active-change sync contract to pass');
  }

  pass(mode === 'green' ? 'Green snapshot-active-change-sync smoke passed.' : 'Snapshot-active-change-sync verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
