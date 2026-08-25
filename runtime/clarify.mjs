import process from 'node:process';
import {
  prepareClarifyQuestion,
  recoverClarifyQuestion,
} from './core/clarify-question.mjs';
import {
  debtAssessmentPath,
  projectContractAssessmentPath,
  readDebtAssessment,
  readProjectContractAssessment,
} from './core/clarify-assessments.mjs';
import { formatDiagnostic } from './lib/diagnostics.mjs';
import { sha256Artifact } from './lib/result-contract.mjs';

const [, , subcommand, ...args] = process.argv;
const root = process.cwd();

function help(exitCode = 0) {
  console.log('Enterprise Harness Clarify');
  console.log('Usage:');
  console.log('  node runtime/cli.mjs clarify prepare-question <change-id> <candidate-ref>');
  console.log('  node runtime/cli.mjs clarify status <change-id> [--json]');
  console.log('  node runtime/cli.mjs clarify recover <change-id>');
  console.log('  node runtime/cli.mjs clarify validate-debt <change-id> <artifact-ref>');
  console.log('  node runtime/cli.mjs clarify validate-project-contract <change-id> <artifact-ref>');
  process.exit(exitCode);
}

function block(error) {
  const message = String(error?.message || error);
  const code = message.match(/EH-[A-Z0-9-]+-\d+/u)?.[0] || 'EH-QUESTION-INPUT-115';
  console.error(formatDiagnostic(code, message.replace(/^EH-[A-Z0-9-]+-\d+:\s*/u, '')));
  process.exit(2);
}

function requireArgs(expected, usage, code = 'EH-QUESTION-INPUT-115') {
  if (args.length !== expected) {
    throw new Error(`${code}: usage: ${usage}`);
  }
}

function validateCanonicalAssessment(changeId, artifactRef, expectedPath, readAssessment, code) {
  if (artifactRef !== expectedPath) {
    throw new Error(`${code}: artifact-ref must be ${expectedPath}`);
  }
  readAssessment(root, changeId);
  return Object.freeze({ path: expectedPath, digest: sha256Artifact(root, expectedPath) });
}

if (!subcommand || subcommand === '--help' || subcommand === '-h') help(subcommand ? 0 : 1);

try {
  if (subcommand === 'prepare-question') {
    requireArgs(2, 'clarify prepare-question <change-id> <candidate-ref>');
    console.log(JSON.stringify(prepareClarifyQuestion(root, args[0], args[1]), null, 2));
  } else if (subcommand === 'status') {
    if (args.length < 1 || args.length > 2 || (args.length === 2 && args[1] !== '--json')) {
      throw new Error('EH-QUESTION-INPUT-115: usage: clarify status <change-id> [--json]');
    }
    const status = recoverClarifyQuestion(root, args[0], { repair: false });
    if (args[1] === '--json') {
      console.log(JSON.stringify(status));
    } else {
      console.log(`Clarify question status: ${status.status}`);
      if (status.recovery) console.log(status.recovery);
    }
  } else if (subcommand === 'recover') {
    requireArgs(1, 'clarify recover <change-id>');
    console.log(JSON.stringify(recoverClarifyQuestion(root, args[0]), null, 2));
  } else if (subcommand === 'validate-debt') {
    requireArgs(2, 'clarify validate-debt <change-id> <artifact-ref>', 'EH-DEBT-SCHEMA-120');
    console.log(JSON.stringify(validateCanonicalAssessment(
      args[0],
      args[1],
      debtAssessmentPath(args[0]),
      readDebtAssessment,
      'EH-DEBT-SCHEMA-120',
    )));
  } else if (subcommand === 'validate-project-contract') {
    requireArgs(
      2,
      'clarify validate-project-contract <change-id> <artifact-ref>',
      'EH-PROJECT-CONTRACT-SCHEMA-123',
    );
    console.log(JSON.stringify(validateCanonicalAssessment(
      args[0],
      args[1],
      projectContractAssessmentPath(args[0]),
      readProjectContractAssessment,
      'EH-PROJECT-CONTRACT-SCHEMA-123',
    )));
  } else {
    throw new Error(`EH-QUESTION-INPUT-115: unknown clarify command ${subcommand}`);
  }
} catch (error) {
  block(error);
}
