import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  buildDesignArchitectureProof,
  readDesignArchitectureProof,
  sameDesignArchitectureProofBinding,
} from './core/design-proof.mjs';
import { completionChainForBehavior } from './lib/stage-results.mjs';
import {
  assertNoSymlinkComponents,
  assertSafeId,
  resolveChild,
  resolveWithin,
} from './lib/safe-paths.mjs';
import { atomicWriteJson, withChangeTransaction } from './lib/state-store.mjs';

const [, , subcommand, ...args] = process.argv;
const root = process.cwd();

function help(exitCode = 0) {
  console.log('Enterprise Harness Design');
  console.log('Usage:');
  console.log('  node runtime/cli.mjs design seal-architecture <change-id>');
  process.exit(exitCode);
}

function pathError(error) {
  if (String(error?.message || '').includes('EH-PATH-001')) return error;
  return new Error(`EH-PATH-001: ${error.message}`);
}

function architectureProofPath(changeId) {
  let changeRoot;
  let target;
  try {
    assertSafeId(changeId, 'changeId');
    changeRoot = resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId');
    target = resolveWithin(changeRoot, 'evidence/completion/design-architecture.json', 'architecture proof');
    assertNoSymlinkComponents(changeRoot, target, 'architecture proof');
  } catch (error) {
    throw pathError(error);
  }
  return { changeRoot, target };
}

function sealArchitecture(changeId) {
  const { changeRoot, target } = architectureProofPath(changeId);
  const designRef = `harness/changes/${changeId}/design.md`;
  const chain = completionChainForBehavior(root, changeId, 'design.produce', [designRef]);
  if (chain.problems.length > 0) {
    throw new Error(`EH-DESIGN-PROOF-001: ${chain.problems.join('; ')}`);
  }
  const candidate = buildDesignArchitectureProof(root, chain.stageResult, chain.reviewResult);
  return withChangeTransaction(root, changeId, () => {
    if (fs.existsSync(target)) {
      const existing = readDesignArchitectureProof(root, changeId);
      if (!sameDesignArchitectureProofBinding(existing, candidate)) {
        throw new Error('EH-DESIGN-PROOF-001: conflicting immutable architecture proof already exists');
      }
      return existing;
    }
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      assertNoSymlinkComponents(changeRoot, target, 'architecture proof');
      atomicWriteJson(target, candidate);
      assertNoSymlinkComponents(changeRoot, target, 'architecture proof');
    } catch (error) {
      throw pathError(error);
    }
    const persisted = readDesignArchitectureProof(root, changeId);
    if (!sameDesignArchitectureProofBinding(persisted, candidate)) {
      throw new Error('EH-DESIGN-PROOF-001: persisted architecture proof failed immediate revalidation');
    }
    return persisted;
  });
}

function block(error) {
  const message = String(error?.message || error);
  const code = message.match(/EH-[A-Z0-9-]+-\d+/u)?.[0] || 'EH-DESIGN-PROOF-001';
  console.error(`BLOCK ${code}: ${message.replace(/^EH-[A-Z0-9-]+-\d+:\s*/u, '')}`);
  process.exit(2);
}

if (!subcommand || subcommand === '--help' || subcommand === '-h') help(subcommand ? 0 : 1);

try {
  if (subcommand !== 'seal-architecture' || args.length !== 1) {
    throw new Error('EH-DESIGN-PROOF-001: usage: design seal-architecture <change-id>');
  }
  console.log(JSON.stringify(sealArchitecture(args[0]), null, 2));
} catch (error) {
  block(error);
}
