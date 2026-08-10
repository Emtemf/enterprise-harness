import { createWorktree } from '../lib/worktree.mjs';

// Thin hook: read the event, delegate the entire WorktreeCreate behavior to
// lib/worktree.mjs, print the resulting absolute path. All validation,
// snapshotting and compensation lives in the lib so it can be tested directly.

function exitWithError(message) {
  console.error(message);
  process.exit(1);
}

function readEvent() {
  const chunks = [];
  return new Promise((resolve, reject) => {
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8').trim();
      if (!raw) resolve({});
      else {
        try {
          resolve(JSON.parse(raw));
        } catch (error) {
          reject(error);
        }
      }
    });
    process.stdin.on('error', reject);
  });
}

try {
  const event = await readEvent();
  const worktreePath = createWorktree(event);
  console.log(worktreePath);
  process.exit(0);
} catch (error) {
  exitWithError(error instanceof Error ? error.message : String(error));
}
