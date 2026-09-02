import fs from 'node:fs';
import { readClarifyResearchEvidence } from './clarify-research-evidence.mjs';
import { assertNoSymlinkComponents, resolveWithin } from './safe-paths.mjs';

export function assertClarifyQuestionFactGate(root, changeId) {
  const requirementsRef = `harness/changes/${changeId}/requirements.md`;
  let requirementsPath;
  try {
    requirementsPath = resolveWithin(root, requirementsRef, 'clarify requirements');
    assertNoSymlinkComponents(root, requirementsPath, 'clarify requirements');
  } catch (error) {
    throw new Error(`EH-QUESTION-FACT-GATE-161: ${error.message}`);
  }
  if (!fs.existsSync(requirementsPath)) {
    throw new Error(`EH-QUESTION-FACT-GATE-161: missing canonical requirements ${requirementsRef}`);
  }
  let evidence;
  try {
    evidence = readClarifyResearchEvidence(
      root,
      changeId,
      requirementsRef,
      fs.readFileSync(requirementsPath, 'utf-8'),
    );
  } catch (error) {
    throw new Error(`EH-QUESTION-FACT-GATE-161: ${error.message}`);
  }
  if (!evidence.lanesDecided || !evidence.fresh || !evidence.conflictsDisposed) {
    throw new Error(`EH-QUESTION-FACT-GATE-161: ${evidence.problems.join('; ') || 'Clarify research evidence is incomplete'}`);
  }
  return evidence;
}
