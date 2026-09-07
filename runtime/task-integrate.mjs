import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { projectRoot } from './lib/checks.mjs';
import { inspectImplementTask } from './lib/stage-results.mjs';
import { assertNoSymlinkComponents, assertSafeId, assertSafeRunId, resolveWithin } from './lib/safe-paths.mjs';
import { withChangeTransaction } from './lib/state-store.mjs';

const root = projectRoot();
const args = process.argv.slice(2);

function help(code = 0) {
  console.log('Enterprise Harness Task Integrate');
  console.log('Usage: node runtime/cli.mjs task-integrate <change-id> <task-id> <execute-run-id>');
  process.exit(code);
}

function atomicCopy(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    fs.copyFileSync(source, temporary);
    fs.chmodSync(temporary, fs.statSync(source).mode);
    fs.renameSync(temporary, target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function integrate(changeId, taskId, executeRunId) {
  assertSafeId(changeId, 'changeId');
  assertSafeId(taskId, 'taskId');
  assertSafeRunId(executeRunId, 'executeRunId');
  return withChangeTransaction(root, changeId, () => {
    const readiness = inspectImplementTask(root, changeId, taskId);
    if (readiness.executionRunId !== executeRunId) {
      throw new Error(`EH-TASK-INTEGRATE-161: execute run is stale; recovery: rerun workflow status ${changeId} --json`);
    }
    if (!['implement.integrate-task', 'implement.task-complete'].includes(readiness.route)) {
      throw new Error(`EH-TASK-INTEGRATE-161: task is not independently reviewed; recovery: run ${readiness.route}`);
    }
    if (readiness.route === 'implement.task-complete') return { status: 'already-integrated', changeId, taskId, executeRunId, changedPaths: readiness.changedPaths };

    const backupRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-integrate-'));
    const backups = [];
    try {
      for (const relative of readiness.changedPaths) {
        const source = resolveWithin(readiness.sourceRoot, relative, 'reviewed changed path');
        const target = resolveWithin(root, relative, 'integration changed path');
        assertNoSymlinkComponents(readiness.sourceRoot, source, 'reviewed changed path');
        assertNoSymlinkComponents(root, target, 'integration changed path');
        const backup = resolveWithin(backupRoot, relative, 'backup path');
        const existed = fs.existsSync(target);
        if (existed) {
          if (!fs.lstatSync(target).isFile()) throw new Error(`EH-TASK-INTEGRATE-161: integration target is not a regular file: ${relative}`);
          atomicCopy(target, backup);
        }
        backups.push({ relative, target, backup, existed });
        if (fs.existsSync(source)) {
          if (!fs.lstatSync(source).isFile()) throw new Error(`EH-TASK-INTEGRATE-161: reviewed path is not a regular file: ${relative}`);
          atomicCopy(source, target);
        } else if (existed) {
          fs.unlinkSync(target);
        }
      }
      const verified = inspectImplementTask(root, changeId, taskId);
      if (verified.route !== 'implement.task-complete') {
        throw new Error(`EH-TASK-INTEGRATE-161: post-copy verification failed: ${verified.problems.join('; ')}`);
      }
      return { status: 'integrated', changeId, taskId, executeRunId, reviewRunId: verified.reviewRunId, changedPaths: verified.changedPaths };
    } catch (error) {
      const rollbackProblems = [];
      for (const item of backups.reverse()) {
        try {
          if (item.existed) atomicCopy(item.backup, item.target);
          else fs.rmSync(item.target, { force: true });
        } catch (rollbackError) {
          rollbackProblems.push(`${item.relative}: ${rollbackError.message}`);
        }
      }
      if (rollbackProblems.length > 0) {
        throw new Error(`EH-TASK-INTEGRATE-161: ${error.message}; rollback failed: ${rollbackProblems.join('; ')}`);
      }
      throw error;
    } finally {
      fs.rmSync(backupRoot, { recursive: true, force: true });
    }
  });
}

if (!args.length || args[0] === '--help' || args[0] === '-h') help(args.length ? 0 : 1);
if (args.length !== 3) help(1);
try {
  console.log(JSON.stringify(integrate(...args), null, 2));
} catch (error) {
  const message = String(error?.message || error);
  const code = message.match(/EH-[A-Z0-9-]+-\d+/u)?.[0] || 'EH-TASK-INTEGRATE-161';
  console.error(`BLOCK ${code}: ${message.replace(/^EH-[A-Z0-9-]+-\d+:\s*/u, '')}`);
  process.exit(2);
}
