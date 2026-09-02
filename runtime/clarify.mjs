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
import {
  applyProjectContractProposal,
  persistProjectContractProposal,
  projectContractStatus,
} from './core/project-contract.mjs';
import { formatDiagnostic } from './lib/diagnostics.mjs';
import { buildClarifyArtifactReadiness } from './lib/clarify-readiness.mjs';
import { sha256Artifact } from './lib/result-contract.mjs';
import {
  inspectClarifyRequirements,
  persistClarifyClassification,
  recordClarifyDecision,
  recordClarifyLanes,
  sealClarifyDecisions,
} from './core/clarify-governance.mjs';

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
  console.log('  node runtime/cli.mjs clarify propose-project-contract <change-id> <draft-ref>');
  console.log('  node runtime/cli.mjs clarify apply-project-contract <change-id> <proposal-ref>');
  console.log('  node runtime/cli.mjs clarify project-contract-status <change-id>');
  console.log('  node runtime/cli.mjs clarify record-decision <change-id> <event-ref>');
  console.log('  node runtime/cli.mjs clarify requirements-digest <change-id>');
  console.log('  node runtime/cli.mjs clarify record-lanes <change-id> <input-ref>');
  console.log('  node runtime/cli.mjs clarify seal-decisions <change-id> <event-id> [event-id...]');
  console.log('  node runtime/cli.mjs clarify classify <change-id> <input-ref>');
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
    const ambiguitySummary = buildClarifyArtifactReadiness(root, args[0]).ambiguitySummary;
    if (args[1] === '--json') {
      console.log(JSON.stringify({ ...status, ambiguitySummary }));
    } else {
      console.log(`Clarify question status: ${status.status}`);
      console.log(`歧义指数: ${ambiguitySummary.index ?? '尚不可计算'}（未覆盖 ${ambiguitySummary.totalPredicates - ambiguitySummary.coveredPredicates}/${ambiguitySummary.totalPredicates}）`);
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
  } else if (subcommand === 'record-decision') {
    requireArgs(2, 'clarify record-decision <change-id> <event-ref>', 'EH-DECISION-INPUT-147');
    console.log(JSON.stringify(recordClarifyDecision(root, args[0], args[1]), null, 2));
  } else if (subcommand === 'propose-project-contract') {
    requireArgs(2, 'clarify propose-project-contract <change-id> <draft-ref>', 'EH-PROJECT-CONTRACT-PROPOSAL-162');
    console.log(JSON.stringify(persistProjectContractProposal(root, args[0], args[1]), null, 2));
  } else if (subcommand === 'apply-project-contract') {
    requireArgs(2, 'clarify apply-project-contract <change-id> <proposal-ref>', 'EH-PROJECT-CONTRACT-APPLY-164');
    console.log(JSON.stringify(applyProjectContractProposal(root, args[0], args[1]), null, 2));
  } else if (subcommand === 'project-contract-status') {
    requireArgs(1, 'clarify project-contract-status <change-id>', 'EH-PROJECT-CONTRACT-PROPOSAL-162');
    console.log(JSON.stringify(projectContractStatus(root, args[0]), null, 2));
  } else if (subcommand === 'requirements-digest') {
    requireArgs(1, 'clarify requirements-digest <change-id>', 'EH-LANE-DIGEST-160');
    console.log(JSON.stringify(inspectClarifyRequirements(root, args[0]), null, 2));
  } else if (subcommand === 'record-lanes') {
    requireArgs(2, 'clarify record-lanes <change-id> <input-ref>', 'EH-LANE-INPUT-156');
    console.log(JSON.stringify(recordClarifyLanes(root, args[0], args[1]), null, 2));
  } else if (subcommand === 'seal-decisions') {
    if (args.length < 2) throw new Error('EH-DECISION-SNAPSHOT-104: usage: clarify seal-decisions <change-id> <event-id> [event-id...]');
    console.log(JSON.stringify(sealClarifyDecisions(root, args[0], args.slice(1)), null, 2));
  } else if (subcommand === 'classify') {
    requireArgs(2, 'clarify classify <change-id> <input-ref>', 'EH-CLASSIFICATION-INPUT-148');
    console.log(JSON.stringify(persistClarifyClassification(root, args[0], args[1]), null, 2));
  } else {
    throw new Error(`EH-QUESTION-INPUT-115: unknown clarify command ${subcommand}`);
  }
} catch (error) {
  block(error);
}
