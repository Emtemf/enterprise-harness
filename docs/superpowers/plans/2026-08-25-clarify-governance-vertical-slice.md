# Clarify Governance Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first complete Clarify vertical slice: fact-first exploration, one pre-authorized user decision at a time, durable decision history, relevant technical-debt and project-contract dispositions, deterministic complexity classification, evidence-derived readiness, independent review, and fresh Clarify proof.

**Architecture:** Keep semantic orchestration in `skills/harness`, immutable and digest-bound contracts in `harness/specs` plus `harness/schemas`, and deterministic validation/persistence in small `runtime/core` modules. `AskUserQuestion` hooks only adapt Claude Code tool events to the runtime authorization and recording APIs; they do not score ambiguity, choose questions, or classify changes. The mutable append-only ledger is sealed into an immutable Clarify snapshot so later-stage decisions cannot stale the Clarify proof.

**Tech Stack:** Node.js ESM, built-in `node:fs`/`node:path`/`node:crypto`, JSON Schema draft 2020-12, Claude Code plugin hooks and skills, CodeGraph MCP, Context7 MCP, repository smoke-test runner.

**Spec:** `harness/specs/development-target.md`

## Global Constraints

- The only lifecycle is `clarify → design → plan → implement → verify → archive`; classification remains a durable action inside Clarify.
- Main Harness Skill is the only user interlocutor and owns research orchestration, questions, user decisions, scope, transitions, and recovery.
- Code facts are CodeGraph-first; external library, framework, SDK, protocol, and standards facts are Context7-first.
- Fact completion precedes topology, ambiguity scoring, and any `AskUserQuestion` call.
- Ask exactly one user-only Decision at a time, with options, consequences, and one recommendation.
- Decision records contain public rationale and evidence references, never hidden reasoning, complete chat transcripts, or secrets.
- Relevant technical debt receives exactly one of `fix-now`, `enabling-task`, `defer`, `accepted-constraint`, or `not-debt`; discovery never expands scope by itself.
- Existing `CLAUDE.md`, `CLAUDE.local.md`, parent instructions, and organization instructions are never overwritten by this slice.
- Hooks are thin lifecycle adapters; runtime owns schema, safe paths, state, digests, receipts, ledger, proof, and recovery.
- Checklist status is recomputed from authoritative artifacts and evidence; there is no editable checklist artifact.
- Runtime commands use argv arrays with `shell: false`, expose `--help`, return stable error codes, and print one concrete recovery action.
- All IDs and relative paths pass `safe-paths.mjs`; no symlink may escape its allowed root.
- No new runtime dependency is introduced; CI and online tools remain version-pinned.
- Runtime, hook, installer, or release changes require `npm run prepublish-check` plus directly related behavior tests.
- This slice audits and disposes project-contract gaps only; safe proposal/apply and `InstructionsLoaded` diagnostics remain the next vertical slice.

---

## File Map

New authoritative contracts:

- `harness/specs/clarify-governance.md` — active Clarify behavior, ownership, artifact graph, gates, recovery, and compatibility removal.
- `harness/schemas/question-candidate.schema.json` — exact one-question authorization input.
- `harness/schemas/decision-event.schema.json` — append-only public decision event.
- `harness/schemas/clarify-decision-snapshot.schema.json` — immutable prefix seal used by StageResult and Clarify proof.
- `harness/schemas/debt-assessment.schema.json` — relevant debt observations and one disposition per observation.
- `harness/schemas/project-contract-assessment.schema.json` — instruction inventory, gaps/conflicts, and user-approved disposition.
- `harness/schemas/classification.schema.json` — Clarify classification v2 and its deterministic four-dimensional score.

New runtime units:

- `runtime/core/decision-ledger.mjs` — validate, lock, append idempotently, read, and seal decision events.
- `runtime/core/clarify-question.mjs` — candidate validation, pending authorization, exact tool-input matching, answer resolution, and restart recovery.
- `runtime/core/clarify-assessments.mjs` — validate/read/write debt and project-contract artifacts.
- `runtime/lib/clarify-readiness.mjs` — recompute checklist projection and the one recovery action.
- `runtime/clarify.mjs` — CLI adapter for question preparation/status/recovery and assessment validation.
- `hooks/scripts/pre-question.mjs` — fail-closed exact authorization check for `AskUserQuestion`.
- `hooks/scripts/post-question.mjs` — fail-closed idempotent answer recording adapter.

Modified integration surfaces:

- `runtime/core/classification-artifact.mjs` — replace the permissive legacy payload with classification v2.
- `runtime/lib/stage-contract.mjs`, `runtime/lib/stage-results.mjs`, `runtime/lib/result-contract.mjs` — bind all Clarify artifacts, review, TECPC, and proof.
- `skills/harness/SKILL.md`, `skills/harness/assets/`, `skills/harness/references/` — method, templates, output contract, and few-shot examples.
- `agents/code-explore.md`, `agents/doc-research.md` — require narrowly scoped debt/instruction facts when applicable.
- `harness/plugin/hooks-manifest.json`, generated `hooks/hooks.json`, generated `.claude/settings.json` — register the two thin question adapters through `node bin/generate-hooks.mjs` only.
- `runtime/lib/status-summary.mjs`, `runtime/workflow.mjs` — render the computed Clarify checklist and one recovery action.
- `test/skill-evals/harness/evals.json` — behavioral cases covering missing dispatch, weak questions, debt, project contracts, and restart.

## Artifact Graph and Stable Interfaces

```text
ResearchBriefs ──> ResearchPackets ──> requirements.md
                         │                    │
                         ├──> debt-assessment.json
                         └──> project-contract-assessment.json

requirements + packets ──> question-candidate.json
question-candidate ──prepare──> pending-question.json (git common-dir)
AskUserQuestion answer ──> decision-ledger.jsonl ──seal──> clarify-decision-snapshot.json

requirements + assessments + decision snapshot ──> classification.json
all immutable Clarify artifacts ──> StageResult ──> independent ReviewResult
all facts/assertions/review/TECPC ──> ClarifyProof ──> design gate
```

Canonical runtime interfaces introduced by this plan:

```js
appendDecisionEvent(root, changeId, event) -> { path, eventId, duplicate }
readDecisionEvents(root, changeId) -> DecisionEvent[]
sealClarifyDecisionSnapshot(root, changeId, eventIds) -> ArtifactReference

prepareClarifyQuestion(root, changeId, candidateRef) -> PendingQuestion
authorizeClarifyQuestion(root, hookToolInput) -> { changeId, questionId }
resolveClarifyQuestion(root, hookToolInput, hookToolResponse) -> { eventId, duplicate }
recoverClarifyQuestion(root, changeId) -> { status, recovery }

writeDebtAssessment(root, changeId, assessment) -> ArtifactReference
readDebtAssessment(root, changeId, reference?) -> DebtAssessment
writeProjectContractAssessment(root, changeId, assessment) -> ArtifactReference
readProjectContractAssessment(root, changeId, reference?) -> ProjectContractAssessment

classifyClarify(input) -> ClassificationV2
buildClarifyReadiness(root, changeId) -> { status, items, recovery }
```

### Task 1: Freeze the Clarify contracts and schemas

**Files:**
- Create: `harness/specs/clarify-governance.md`
- Create: `harness/schemas/question-candidate.schema.json`
- Create: `harness/schemas/decision-event.schema.json`
- Create: `harness/schemas/clarify-decision-snapshot.schema.json`
- Create: `harness/schemas/debt-assessment.schema.json`
- Create: `harness/schemas/project-contract-assessment.schema.json`
- Create: `harness/schemas/classification.schema.json`
- Modify: `harness/specs/README.md`
- Modify: `runtime/test/result-schema-smoke.mjs`
- Modify: `runtime/test/artifact-content-smoke.mjs`

**Interfaces:**
- Consumes: `harness/specs/development-target.md`, existing ResearchPacket and StageResult conventions.
- Produces: the exact JSON field names consumed by Tasks 2–8; no later task may introduce a competing artifact shape.

- [ ] **Step 1: Add RED schema-availability and package-surface assertions**

Add these names to the required schema loop in `runtime/test/result-schema-smoke.mjs` and package-content assertions in `runtime/test/artifact-content-smoke.mjs`:

```js
const clarifySchemas = [
  'question-candidate.schema.json',
  'decision-event.schema.json',
  'clarify-decision-snapshot.schema.json',
  'debt-assessment.schema.json',
  'project-contract-assessment.schema.json',
  'classification.schema.json',
];
for (const name of clarifySchemas) {
  assert.ok(fs.existsSync(path.join(repoRoot, 'harness', 'schemas', name)), `missing ${name}`);
  assert.ok(packageFiles.has(`harness/schemas/${name}`), `package omits ${name}`);
}
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `node runtime/test/result-schema-smoke.mjs verify && node runtime/test/artifact-content-smoke.mjs verify`

Expected: FAIL naming `question-candidate.schema.json` before any schema is created.

- [ ] **Step 3: Write the active Clarify spec**

Create `harness/specs/clarify-governance.md` with metadata:

```yaml
---
status: active
owner: enterprise-harness-maintainers
lastVerified: 2026-08-25
implementationRefs:
  - skills/harness/SKILL.md
  - runtime/core/clarify-question.mjs
  - runtime/core/decision-ledger.mjs
  - runtime/core/clarify-assessments.mjs
  - runtime/lib/clarify-readiness.mjs
testRefs:
  - runtime/test/clarify-question-smoke.mjs
  - runtime/test/clarify-assessments-smoke.mjs
  - runtime/test/clarify-readiness-smoke.mjs
  - runtime/test/clarify-stage-contract-smoke.mjs
---
```

The body must make these authorities explicit: ResearchPacket is fact authority; requirements is human-readable scope authority; decision ledger is public choice history; assessments are current-change supporting contracts; classification is derived routing authority; readiness is a projection; StageResult/ReviewResult/ClarifyProof are completion authorities. Define invalidation edges and the single recovery action for every blocked gate.

- [ ] **Step 4: Create the question and decision schemas**

Use the following required shapes:

```json
{
  "questionVersion": 1,
  "type": "clarify-question-candidate",
  "changeId": "cancel-order",
  "questionId": "Q-003",
  "componentId": "refund",
  "dimension": "Constraints",
  "decisionNeeded": "Choose refund compatibility policy",
  "whyUserOnly": "Repository and SDK evidence cannot choose the business compatibility promise",
  "header": "Refund policy",
  "question": "Which refund compatibility policy should this change guarantee?",
  "options": [
    { "id": "strict", "label": "Strict parity", "description": "Preserve existing synchronous refund behavior and reject unsupported cases." },
    { "id": "async", "label": "Async migration", "description": "Allow asynchronous completion with a compatibility event." }
  ],
  "recommendedOption": "strict",
  "recommendationReason": "It preserves the current externally observed contract.",
  "evidenceRefs": ["harness/changes/cancel-order/evidence/research/code.json"],
  "inputDigests": { "harness/changes/cancel-order/requirements.md": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
  "blocking": true,
  "createdAt": "2026-08-25T00:00:00.000Z"
}
```

`dimension` permits `Goal`, `Scope`, `Constraints`, `Acceptance`, `Context`, `TechnicalDebt`, and `ProjectContract`. Enforce one question, 2–4 options, unique safe option IDs, exact `recommendedOption`, non-empty evidence, SHA-256 digests, `additionalProperties: false`, and `blocking: true`.

```json
{
  "eventVersion": 1,
  "type": "decision-event",
  "eventId": "D-003",
  "changeId": "cancel-order",
  "stage": "clarify",
  "actor": { "type": "user", "id": "interactive-user" },
  "decisionType": "clarify-answer",
  "targetRef": "harness/changes/cancel-order/evidence/clarify/questions/Q-003.json",
  "questionId": "Q-003",
  "options": ["strict", "async"],
  "recommendedOption": "strict",
  "selectedOption": "strict",
  "publicRationale": "Selected by the user through AskUserQuestion.",
  "evidenceRefs": ["harness/changes/cancel-order/evidence/research/code.json"],
  "inputDigests": { "harness/changes/cancel-order/requirements.md": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
  "recordedAt": "2026-08-25T00:01:00.000Z"
}
```

Allow actor types `user`, `main`, and `runtime`; allow decision types `clarify-answer`, `lane-applicability`, `debt-disposition`, `project-contract-disposition`, `scope-confirmation`, and `classification-route`. Do not add fields for prompts, messages, analysis, or chain of thought.

- [ ] **Step 5: Create the assessment, snapshot, and classification schemas**

The debt schema requires every observation ID to appear once in `dispositions`; the runtime performs this cross-array rule:

```json
{
  "assessmentVersion": 1,
  "type": "debt-assessment",
  "changeId": "cancel-order",
  "observations": [{
    "debtId": "TD-001",
    "claim": "Refund retries have no deterministic unit coverage",
    "evidenceRefs": ["src/refund.js:42", "harness/changes/cancel-order/evidence/research/code.json"],
    "relevance": "The cancellation path calls this retry boundary",
    "impact": "A regression could duplicate refunds"
  }],
  "dispositions": [{
    "debtId": "TD-001",
    "status": "enabling-task",
    "decisionEventId": "D-004",
    "authorityRef": "harness/changes/cancel-order/requirements.md"
  }],
  "inputDigests": { "harness/changes/cancel-order/evidence/research/code.json": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
  "updatedAt": "2026-08-25T00:02:00.000Z"
}
```

The project-contract schema uses `use-existing`, `proposal-required`, `conflict`, or `deferred` and inventories only discovered instruction files:

```json
{
  "assessmentVersion": 1,
  "type": "project-contract-assessment",
  "changeId": "cancel-order",
  "files": [{ "path": "CLAUDE.md", "digest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "scope": "project", "ownership": "project" }],
  "gaps": [{ "section": "verification-standard", "evidence": "No acceptance threshold is defined" }],
  "conflicts": [],
  "status": "proposal-required",
  "decisionEventId": "D-005",
  "proposalRef": null,
  "inputDigests": { "CLAUDE.md": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
  "updatedAt": "2026-08-25T00:03:00.000Z"
}
```

The Clarify decision snapshot requires ordered event IDs, the ledger prefix byte length and SHA-256, and its own immutable artifact list. Classification v2 requires integer scores 0–3 for `functionalSize`, `uncertainty`, `changeRisk`, and `verificationDifficulty`, a total 0–12, tier `L0`–`L3`, enumerated hard flags, input digests, and a classification-route decision event.

- [ ] **Step 6: Index the active spec and run schema/package tests GREEN**

Add `clarify-governance.md` to `harness/specs/README.md`, then run:

```bash
node runtime/test/result-schema-smoke.mjs verify
node runtime/test/artifact-content-smoke.mjs verify
node runtime/test/docs-consistency-smoke.mjs verify
```

Expected: all three print `PASS`.

- [ ] **Step 7: Commit the contract boundary**

```bash
git add harness/specs/clarify-governance.md harness/specs/README.md harness/schemas runtime/test/result-schema-smoke.mjs runtime/test/artifact-content-smoke.mjs
git commit -m "spec: freeze clarify governance contracts"
```

### Task 2: Implement the append-only Decision Ledger and immutable Clarify snapshot

**Files:**
- Create: `runtime/core/decision-ledger.mjs`
- Create: `runtime/test/decision-ledger-smoke.mjs`
- Modify: `runtime/lib/result-contract.mjs`

**Interfaces:**
- Consumes: Task 1 `DecisionEvent` and `ClarifyDecisionSnapshot` schemas, `assertSafeId`, `resolveWithin`, `withFileLock`, `appendJsonLineOnce`, `sha256Artifact`.
- Produces: `decisionLedgerPath`, `validateDecisionEvent`, `appendDecisionEvent`, `readDecisionEvents`, `sealClarifyDecisionSnapshot`, `readClarifyDecisionSnapshot`.

- [ ] **Step 1: Write RED tests for safe append, idempotency, and sealing**

Create `runtime/test/decision-ledger-smoke.mjs` with these cases:

```js
assert.equal(appendDecisionEvent(root, changeId, event).duplicate, false);
assert.equal(appendDecisionEvent(root, changeId, event).duplicate, true);
assert.equal(readDecisionEvents(root, changeId).length, 1);
assert.throws(() => appendDecisionEvent(root, '../escape', event), /EH-PATH-001/u);
assert.throws(() => appendDecisionEvent(root, changeId, { ...event, selectedOption: 'missing' }), /EH-DECISION-SCHEMA-101/u);
const snapshotRef = sealClarifyDecisionSnapshot(root, changeId, [event.eventId]);
assert.match(snapshotRef.digest, /^[a-f0-9]{64}$/u);
assert.throws(() => sealClarifyDecisionSnapshot(root, changeId, ['unknown']), /EH-DECISION-SNAPSHOT-104/u);
```

Also cover malformed JSON already present in the ledger, a symlinked `evidence/decisions` directory escaping the repository, concurrent lock contention, a duplicate event ID with different content, and an attempt to overwrite an existing snapshot.

- [ ] **Step 2: Run the test and confirm RED**

Run: `node runtime/test/decision-ledger-smoke.mjs verify`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `runtime/core/decision-ledger.mjs`.

- [ ] **Step 3: Implement paths and schema validation**

Use deterministic paths and stable errors:

```js
export function decisionLedgerPath(changeId) {
  assertSafeId(changeId, 'changeId');
  return `harness/changes/${changeId}/evidence/decisions/decision-ledger.jsonl`;
}

export function clarifyDecisionSnapshotPath(changeId) {
  assertSafeId(changeId, 'changeId');
  return `harness/changes/${changeId}/evidence/decisions/clarify-decision-snapshot.json`;
}
```

`validateDecisionEvent(changeId, event)` must reject mismatched change IDs, unsafe IDs, non-Clarify stage events in this slice, recommendation/selection values outside `options`, empty evidence or input digests, and unknown fields by matching the Task 1 contract.

- [ ] **Step 4: Implement locked idempotent append**

The duplicate rule is exact-content idempotency, not “same ID wins”:

```js
return withFileLock(absolutePath, () => {
  const existing = readDecisionEvents(root, changeId);
  const prior = existing.find((item) => item.eventId === event.eventId);
  if (prior && JSON.stringify(prior) !== JSON.stringify(event)) {
    throw new Error(`EH-DECISION-CONFLICT-102: eventId ${event.eventId} already has different content`);
  }
  if (prior) return Object.freeze({ path: relativePath, eventId: event.eventId, duplicate: true });
  appendJsonLineOnce(absolutePath, event);
  return Object.freeze({ path: relativePath, eventId: event.eventId, duplicate: false });
});
```

Resolve and re-check the parent directory before append so a symlink cannot escape the change root.

- [ ] **Step 5: Implement prefix sealing**

Read complete newline-terminated ledger bytes, require the requested IDs to be the exact ordered Clarify prefix, and atomically create:

```js
const snapshot = {
  snapshotVersion: 1,
  type: 'clarify-decision-snapshot',
  changeId,
  eventIds,
  ledgerRef,
  prefixBytes: prefix.length,
  prefixDigest: createHash('sha256').update(prefix).digest('hex'),
  artifacts: eventIds.map((eventId) => ({ eventId, digest: eventDigest(eventsById.get(eventId)) })),
  sealedAt: new Date().toISOString(),
};
```

Use exclusive creation semantics. A later-stage append may change the live ledger but cannot change the sealed prefix artifact or its StageResult digest.

- [ ] **Step 6: Export shared validation and run GREEN**

Add `validateDecisionEvent` and `validateClarifyDecisionSnapshot` exports to `runtime/lib/result-contract.mjs` without duplicating field definitions elsewhere. Run:

```bash
node runtime/test/decision-ledger-smoke.mjs verify
node runtime/test/result-contract-smoke.mjs verify
```

Expected: both print `PASS`.

- [ ] **Step 7: Commit the ledger unit**

```bash
git add runtime/core/decision-ledger.mjs runtime/lib/result-contract.mjs runtime/test/decision-ledger-smoke.mjs
git commit -m "feat: add durable clarify decision ledger"
```

### Task 3: Pre-authorize one Clarify question and recover it across restarts

**Files:**
- Create: `runtime/core/clarify-question.mjs`
- Create: `runtime/clarify.mjs`
- Create: `runtime/test/clarify-question-smoke.mjs`
- Modify: `runtime/cli.mjs`
- Modify: `runtime/test/runtime-help-contract-smoke.mjs`

**Interfaces:**
- Consumes: `appendDecisionEvent` from Task 2, Handoff v2 common-dir convention, Task 1 question schema.
- Produces: `questionCandidatePath`, `pendingQuestionPath`, `prepareClarifyQuestion`, `authorizeClarifyQuestion`, `resolveClarifyQuestion`, `recoverClarifyQuestion`; CLI `clarify prepare-question|status|recover`.

- [ ] **Step 1: Write RED behavior tests**

Create a temporary real Git repository and assert:

```js
const pending = prepareClarifyQuestion(root, changeId, candidateRef);
assert.equal(pending.status, 'pending');
assert.deepEqual(authorizeClarifyQuestion(root, askInput), { changeId, questionId: 'Q-003' });
assert.throws(() => authorizeClarifyQuestion(root, changedText), /EH-QUESTION-MISMATCH-112/u);
assert.throws(() => prepareClarifyQuestion(root, changeId, secondRef), /EH-QUESTION-PENDING-110/u);
const resolved = resolveClarifyQuestion(root, askInput, { answers: { [candidate.question]: 'Strict parity' } });
assert.equal(resolved.duplicate, false);
assert.equal(resolveClarifyQuestion(root, askInput, { answers: { [candidate.question]: 'Strict parity' } }).duplicate, true);
```

Cover 0 or 2 questions, `multiSelect: true`, 1 or 5 options, stale `inputDigests`, path traversal, candidate change mismatch, answer outside options, changed description, missing pending state, unresolved pending after process restart, and ledger-written/pending-not-closed crash recovery.

- [ ] **Step 2: Run the test and confirm RED**

Run: `node runtime/test/clarify-question-smoke.mjs verify`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `runtime/core/clarify-question.mjs`.

- [ ] **Step 3: Implement immutable candidate loading and pending state**

Store candidates under:

```js
export function questionCandidatePath(changeId, questionId) {
  assertSafeId(changeId, 'changeId');
  assertSafeId(questionId, 'questionId');
  return `harness/changes/${changeId}/evidence/clarify/questions/${questionId}.json`;
}
```

Store controller coordination under the Git common directory:

```js
export function pendingQuestionPath(root, changeId) {
  assertSafeId(changeId, 'changeId');
  return path.join(gitCommonDir(root), 'enterprise-harness', 'pending-decisions', `${changeId}.json`);
}
```

`prepareClarifyQuestion` verifies the candidate is at the canonical path, every input digest is fresh, no unresolved pending question exists, and writes `{ pendingVersion: 1, changeId, questionId, candidateRef, candidateDigest, status: 'pending', preparedAt }` under a lock.

- [ ] **Step 4: Implement exact AskUserQuestion authorization**

Only this exact projection is authorized:

```js
function expectedToolInput(candidate) {
  return {
    questions: [{
      question: candidate.question,
      header: candidate.header,
      options: candidate.options.map(({ label, description }) => ({ label, description })),
      multiSelect: false,
    }],
  };
}
```

Use deep equality after normalizing object key order; do not use substring or regex matching. Authorization verifies active change, `stage === 'clarify'`, pending digest, candidate freshness, and exact tool input.

- [ ] **Step 5: Implement answer resolution and crash recovery**

Map the returned option label back to its unique option ID, create event ID `D-${questionId.slice(2)}` only when safe-ID valid, append the event first, then atomically mark pending `resolved` with `eventId`. If the process crashes after append, `recoverClarifyQuestion` detects the same candidate target in the ledger and finishes the pending transition idempotently. Its only unresolved recovery text is:

```text
Re-ask the authorized pending question <questionId> without changing its text or options.
```

- [ ] **Step 6: Add the CLI and help contract**

Expose `clarify: ['clarify.mjs']` in `runtime/cli.mjs`. `runtime/clarify.mjs` supports:

```text
node runtime/cli.mjs clarify prepare-question <change-id> <candidate-ref>
node runtime/cli.mjs clarify status <change-id> [--json]
node runtime/cli.mjs clarify recover <change-id>
```

No CLI subcommand accepts free-form rationale or chat text. Extend `runtime-help-contract-smoke.mjs` to verify both `clarify --help` and `clarify -h` exit 0 without creating `.git/enterprise-harness` state.

- [ ] **Step 7: Run focused GREEN tests**

```bash
node runtime/test/clarify-question-smoke.mjs verify
node runtime/test/runtime-help-contract-smoke.mjs verify
node runtime/test/safe-paths-adversarial-smoke.mjs verify
```

Expected: all print `PASS`.

- [ ] **Step 8: Commit the question runtime**

```bash
git add runtime/core/clarify-question.mjs runtime/clarify.mjs runtime/cli.mjs runtime/test/clarify-question-smoke.mjs runtime/test/runtime-help-contract-smoke.mjs
git commit -m "feat: authorize one durable clarify question"
```

### Task 4: Add thin Claude Code AskUserQuestion adapters

**Files:**
- Create: `hooks/scripts/pre-question.mjs`
- Create: `hooks/scripts/post-question.mjs`
- Create: `runtime/test/clarify-question-hook-smoke.mjs`
- Modify: `harness/plugin/hooks-manifest.json`
- Modify (generated): `hooks/hooks.json`
- Modify (generated projection only): `.claude/settings.json`
- Modify: `runtime/test/hook-manifest-parity-smoke.mjs`

**Interfaces:**
- Consumes: Task 3 `authorizeClarifyQuestion` and `resolveClarifyQuestion`.
- Produces: `PreToolUse:AskUserQuestion` and `PostToolUse:AskUserQuestion` adapters with no semantic policy.

- [ ] **Step 1: Write RED stdin/exit/stdout/stderr tests**

Use `spawnSync(process.execPath, [hookPath], { input: JSON.stringify(payload), cwd: root, encoding: 'utf-8' })` and assert:

```js
assert.equal(run(preHook, authorizedPayload).status, 0);
assert.equal(run(preHook, unauthorizedPayload).status, 2);
assert.match(run(preHook, unauthorizedPayload).stderr, /BLOCK \[EH-QUESTION-MISMATCH-112\]/u);
assert.equal(run(postHook, answeredPayload).status, 0);
assert.equal(readDecisionEvents(root, changeId).length, 1);
assert.equal(run(postHook, answeredPayload).stdout, '');
```

Cover no active harness change (pass), active non-Clarify stage (block), malformed stdin (block), stale pending state (block), duplicate PostToolUse delivery (pass without duplicate ledger line), and runtime exception visibility.

- [ ] **Step 2: Run the hook test and confirm RED**

Run: `node runtime/test/clarify-question-hook-smoke.mjs verify`

Expected: FAIL because `hooks/scripts/pre-question.mjs` does not exist.

- [ ] **Step 3: Implement the pre-hook as an adapter**

The complete semantic call path is:

```js
const payload = JSON.parse(await readStdin());
authorizeClarifyQuestion(process.cwd(), payload.tool_input);
process.exitCode = 0;
```

Use the repository’s existing hook input/error helpers. Print only `BLOCK [stable-code] recovery` on denied authorization; do not inspect requirements, choose a question, score dimensions, or write an event.

- [ ] **Step 4: Implement the post-hook as an adapter**

The post-hook forwards only exact Claude Code fields:

```js
const payload = JSON.parse(await readStdin());
resolveClarifyQuestion(process.cwd(), payload.tool_input, payload.tool_response);
process.exitCode = 0;
```

It does not summarize the answer or manufacture rationale. Runtime records the fixed public rationale “Selected by the user through AskUserQuestion.”

- [ ] **Step 5: Register and generate hooks**

Add these manifest entries:

```json
{
  "matcher": "AskUserQuestion",
  "script": "pre-question.mjs",
  "timeout": 10,
  "performanceBudgetMs": 100,
  "failMode": "fail-closed",
  "statusMessage": "校验 Clarify 问题授权"
}
```

```json
{
  "matcher": "AskUserQuestion",
  "script": "post-question.mjs",
  "timeout": 10,
  "performanceBudgetMs": 100,
  "failMode": "fail-closed",
  "statusMessage": "记录 Clarify 用户决策"
}
```

Run: `node bin/generate-hooks.mjs`

Do not hand-edit generated projections.

- [ ] **Step 6: Verify performance, projection, and behavior**

```bash
node runtime/test/clarify-question-hook-smoke.mjs verify
node runtime/test/hook-manifest-parity-smoke.mjs verify
node runtime/test/duplicate-hook-registration-smoke.mjs verify
node runtime/test/plugin-native-hooks-smoke.mjs verify
```

Expected: all pass; the behavior test asserts each hook stays below 100 ms after fixture setup.

- [ ] **Step 7: Commit the adapters and generated outputs**

```bash
git add hooks/scripts/pre-question.mjs hooks/scripts/post-question.mjs harness/plugin/hooks-manifest.json hooks/hooks.json .claude/settings.json runtime/test/clarify-question-hook-smoke.mjs runtime/test/hook-manifest-parity-smoke.mjs
git commit -m "feat: gate clarify questions with thin hooks"
```

### Task 5: Persist relevant technical-debt and project-contract dispositions

**Files:**
- Create: `runtime/core/clarify-assessments.mjs`
- Create: `runtime/test/clarify-assessments-smoke.mjs`
- Create: `skills/harness/assets/debt-assessment.json.tmpl`
- Create: `skills/harness/assets/project-contract-assessment.json.tmpl`
- Modify: `runtime/clarify.mjs`
- Modify: `agents/code-explore.md`
- Modify: `agents/doc-research.md`
- Modify: `skills/harness/assets/research-brief.md.tmpl`

**Interfaces:**
- Consumes: Task 1 assessment schemas and Task 2 decision events.
- Produces: `validateDebtAssessment`, `writeDebtAssessment`, `readDebtAssessment`, `validateProjectContractAssessment`, `writeProjectContractAssessment`, `readProjectContractAssessment`.

- [ ] **Step 1: Write RED assessment tests**

Assert round-trip writes and reject these cases:

```js
assert.throws(() => writeDebtAssessment(root, changeId, missingDisposition), /EH-DEBT-DISPOSITION-121/u);
assert.throws(() => writeDebtAssessment(root, changeId, duplicateDisposition), /EH-DEBT-DISPOSITION-121/u);
assert.throws(() => writeDebtAssessment(root, changeId, unrelatedWithoutEvidence), /EH-DEBT-SCHEMA-120/u);
assert.throws(() => writeProjectContractAssessment(root, changeId, staleClaudeDigest), /EH-PROJECT-CONTRACT-STALE-124/u);
assert.throws(() => writeProjectContractAssessment(root, changeId, autoApplyPayload), /EH-PROJECT-CONTRACT-SCOPE-125/u);
```

Also cover no debt (`observations: [], dispositions: []`), missing CLAUDE files (`files: []`, `status: 'proposal-required'`), complete existing contract (`use-existing`), conflict without a decision event, path traversal, external symlink, malformed JSON, and decision event type/target mismatch.

- [ ] **Step 2: Run the assessment test and confirm RED**

Run: `node runtime/test/clarify-assessments-smoke.mjs verify`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement debt validation and persistence**

Require exact set equality between observation IDs and disposition IDs:

```js
const observed = assessment.observations.map(({ debtId }) => debtId).sort();
const disposed = assessment.dispositions.map(({ debtId }) => debtId).sort();
if (JSON.stringify(observed) !== JSON.stringify(disposed)) {
  problems.push('every relevant debt observation requires exactly one disposition');
}
```

For every disposition, load the referenced ledger event and require `decisionType === 'debt-disposition'`, matching `targetRef`, and `selectedOption === status`. Validate all input digests at read and write time.

- [ ] **Step 4: Implement project-contract audit persistence without apply**

Canonical path is `harness/changes/<changeId>/project-contract-assessment.json`. Accept only repository-relative project instruction paths; record parent, local, or organization instructions as evidence but never as writable targets. Reject any payload fields named `content`, `patch`, `apply`, or `writeTarget` so this slice cannot silently become a writer.

Require:

- `use-existing`: no gaps, no conflicts, `decisionEventId` may be null.
- `proposal-required`: at least one gap or no project file, `proposalRef: null`, matching project-contract disposition event.
- `conflict`: at least one conflict and matching user decision event.
- `deferred`: matching user decision event.

- [ ] **Step 5: Extend the Clarify CLI with deterministic validation**

Add:

```text
node runtime/cli.mjs clarify validate-debt <change-id> <artifact-ref>
node runtime/cli.mjs clarify validate-project-contract <change-id> <artifact-ref>
```

Each exits 0 with one JSON artifact reference or exits 2 with a stable code and one recovery action. It never generates debt claims or decides a disposition.

- [ ] **Step 6: Tighten worker briefs without changing ResearchPacket schema**

Add to `research-brief.md.tmpl`:

```markdown
## Relevant technical debt
- Inspect only debt, missing tests, brittle boundaries, and upgrade blockers directly touched by this change.
- Every claim needs a code location or execution source; unrelated repository debt is excluded.

## Project instructions
- Report discovered project-level instruction files and verification commands as facts.
- Do not propose, merge, or write CLAUDE.md content.
```

Update `agents/code-explore.md` to return these as ordinary sourced `facts`/`uncertainties`, not a new packet field. Update `agents/doc-research.md` only to report external requirements that can conflict with recorded project constraints; it must not inspect local code or choose the conflict resolution.

- [ ] **Step 7: Add valid JSON templates and run GREEN**

Templates must instantiate the Task 1 schemas with explicit empty arrays/nulls, not prose placeholders. Run:

```bash
node runtime/test/clarify-assessments-smoke.mjs verify
node runtime/test/subagent-contract-smoke.mjs verify
node runtime/test/harness-fact-gate-smoke.mjs verify
node runtime/test/harness-standard-skill-smoke.mjs verify
```

Expected: all print `PASS`.

- [ ] **Step 8: Commit the assessment unit**

```bash
git add runtime/core/clarify-assessments.mjs runtime/clarify.mjs runtime/test/clarify-assessments-smoke.mjs skills/harness/assets/debt-assessment.json.tmpl skills/harness/assets/project-contract-assessment.json.tmpl skills/harness/assets/research-brief.md.tmpl agents/code-explore.md agents/doc-research.md
git commit -m "feat: govern clarify debt and project contracts"
```

### Task 6: Replace permissive classification and derive the Clarify readiness checklist

**Files:**
- Modify: `runtime/core/classification-artifact.mjs`
- Create: `runtime/lib/clarify-readiness.mjs`
- Create: `runtime/test/classification-v2-smoke.mjs`
- Create: `runtime/test/clarify-readiness-smoke.mjs`
- Modify: `runtime/test/classification-artifact-authority-smoke.mjs`
- Modify: `runtime/lib/status-summary.mjs`
- Modify: `runtime/workflow.mjs`

**Interfaces:**
- Consumes: requirements, fresh ResearchPackets, Task 2 decision snapshot, Task 5 assessments.
- Produces: `classifyClarify`, strict `validateClassificationArtifact`, `buildClarifyReadiness`, status JSON/text projection.

- [ ] **Step 1: Write RED classification tests**

Use exact vectors:

```js
assert.equal(classifyClarify({ scores: { functionalSize: 0, uncertainty: 0, changeRisk: 1, verificationDifficulty: 0 }, hardFlags: [] }).tier, 'L0');
assert.equal(classifyClarify({ scores: { functionalSize: 1, uncertainty: 1, changeRisk: 1, verificationDifficulty: 1 }, hardFlags: [] }).tier, 'L1');
assert.equal(classifyClarify({ scores: { functionalSize: 2, uncertainty: 2, changeRisk: 2, verificationDifficulty: 1 }, hardFlags: [] }).tier, 'L2');
assert.equal(classifyClarify({ scores: { functionalSize: 3, uncertainty: 3, changeRisk: 2, verificationDifficulty: 2 }, hardFlags: [] }).tier, 'L3');
assert.equal(classifyClarify({ scores: { functionalSize: 0, uncertainty: 0, changeRisk: 0, verificationDifficulty: 0 }, hardFlags: ['irreversible-data-migration'] }).tier, 'L3');
```

Reject score/total mismatch, missing evidence refs, unknown flags, a route event whose selected option does not equal tier, stale input digests, and legacy `{ impact, decision }` payloads.

- [ ] **Step 2: Write RED readiness tests**

Build fixtures progressively and assert the exact first recovery:

```js
assert.deepEqual(buildClarifyReadiness(root, changeId), {
  status: 'blocked',
  items: expectedItems,
  recovery: { code: 'EH-CLARIFY-RESEARCH-131', action: 'Complete and persist every required ResearchPacket.' },
});
```

Then add facts, pending decision, decision snapshot, debt disposition, contract disposition, requirements, classification, StageResult, self-check, independent ReviewResult, TECPC, and proof one at a time. At each step, assert exactly one recovery action and no editable checklist file is created.

- [ ] **Step 3: Run both tests and confirm RED**

```bash
node runtime/test/classification-v2-smoke.mjs verify
node runtime/test/clarify-readiness-smoke.mjs verify
```

Expected: classification fails on the first missing export; readiness fails on missing module.

- [ ] **Step 4: Implement the deterministic tier rule**

Use this sole rule:

```js
const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
let tier = total <= 2 ? 'L0' : total <= 5 ? 'L1' : total <= 8 ? 'L2' : 'L3';
if (hardFlags.some((flag) => ['public-api-break', 'security-boundary', 'cross-service-transaction'].includes(flag))) {
  tier = maxTier(tier, 'L2');
}
if (hardFlags.some((flag) => ['irreversible-data-migration', 'unknown-compliance-obligation'].includes(flag))) {
  tier = 'L3';
}
```

Every score object contains `{ value, evidenceRefs, reason }`; `classifyClarify` receives normalized values plus evidence and emits `classificationVersion: 2`, `type: 'clarify-classification'`, total, tier, flags, impact, input digests, and route decision event ID. Delete acceptance of the legacy loose payload and update affected fixtures because this repository has no installed-user compatibility obligation for the internal draft.

- [ ] **Step 5: Implement the evidence-derived checklist**

Use this ordered immutable item list:

```js
const CLARIFY_ITEMS = [
  'research-lanes-decided',
  'required-research-fresh',
  'research-conflicts-disposed',
  'topology-confirmed',
  'ambiguity-threshold-met',
  'no-pending-question',
  'decisions-sealed',
  'technical-debt-disposed',
  'project-contract-disposed',
  'requirements-approved',
  'classification-fresh',
  'self-check-passed',
  'independent-review-passed',
  'tecpc-complete',
  'clarify-proof-fresh',
];
```

Each item is `{ id, status: 'pass'|'blocked'|'stale'|'not-applicable', evidenceRefs, code, action }`. Return the first non-pass item as `recovery`; never persist this array.

- [ ] **Step 6: Integrate status projection**

When the active v6 stage is Clarify, add `clarifyReadiness` to `workflow status --json` and render a compact `passed/total` line plus the one recovery action in text status. Do not print every passing item by default; a verbose JSON consumer can inspect all items.

- [ ] **Step 7: Run classification/readiness/status tests GREEN**

```bash
node runtime/test/classification-v2-smoke.mjs verify
node runtime/test/classification-artifact-authority-smoke.mjs verify
node runtime/test/clarify-readiness-smoke.mjs verify
node runtime/test/workflow-execution-status-smoke.mjs verify
node runtime/test/tecp-card-smoke.mjs verify
```

Expected: all print `PASS`.

- [ ] **Step 8: Commit classification and readiness**

```bash
git add runtime/core/classification-artifact.mjs runtime/lib/clarify-readiness.mjs runtime/lib/status-summary.mjs runtime/workflow.mjs runtime/test/classification-v2-smoke.mjs runtime/test/classification-artifact-authority-smoke.mjs runtime/test/clarify-readiness-smoke.mjs runtime/test/workflow-execution-status-smoke.mjs
git commit -m "feat: derive clarify classification and readiness"
```

### Task 7: Bind all Clarify artifacts into StageResult, review, TECPC, and fresh proof

**Files:**
- Modify: `skills/harness/scripts/finalize-clarify-result.mjs`
- Modify: `runtime/lib/stage-contract.mjs`
- Modify: `runtime/lib/stage-results.mjs`
- Modify: `runtime/lib/result-contract.mjs`
- Modify: `harness/schemas/stage-result.schema.json`
- Modify: `runtime/test/clarify-stage-contract-smoke.mjs`
- Modify: `runtime/test/lifecycle-clarify-transition-smoke.mjs`
- Modify: `runtime/test/workflow-audit-v6-result-smoke.mjs`

**Interfaces:**
- Consumes: the five immutable Clarify artifacts and Task 6 readiness projection.
- Produces: a digest-bound Clarify StageResult and ClarifyProof accepted by the Design transition gate only after independent review.

- [ ] **Step 1: Extend the existing Clarify RED fixture**

Change the expected artifact set to:

```js
const requiredClarifyArtifacts = [
  `harness/changes/${changeId}/requirements.md`,
  `harness/changes/${changeId}/classification.json`,
  `harness/changes/${changeId}/debt-assessment.json`,
  `harness/changes/${changeId}/project-contract-assessment.json`,
  `harness/changes/${changeId}/evidence/decisions/clarify-decision-snapshot.json`,
];
```

Add sequential failure assertions for missing artifact, stale digest, undisposed debt, unresolved contract conflict, unsealed decision, classification input mismatch, missing self-check, reviewer reusing producer agent ID, incomplete TECPC, and stale proof.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node runtime/test/clarify-stage-contract-smoke.mjs verify`

Expected: FAIL because the finalizer still emits only requirements and classification.

- [ ] **Step 3: Update finalizer inputs and assertions**

The finalizer reads canonical paths only, validates them through Tasks 2/5/6 modules, and emits these assertion IDs:

```js
const assertions = [
  assertion('research-complete', researchComplete, researchRefs),
  assertion('decisions-durable', decisionsSealed, [decisionSnapshotRef]),
  assertion('technical-debt-disposed', debtDisposed, [debtRef]),
  assertion('project-contract-disposed', contractDisposed, [contractRef]),
  assertion('requirements-ready', requirementsReady, [requirementsRef]),
  assertion('classification-ready', classificationReady, [classificationRef]),
  assertion('scope-confirmed', scopeConfirmed, [scopeDecisionRef]),
];
```

Every assertion evidence ref must be present in the StageResult artifact set or its frozen inputs. Failed assertions exit 2 and print the first readiness recovery.

- [ ] **Step 4: Update stage artifact and proof requirements**

Replace the Clarify entry in `REQUIRED_STAGE_RESULT_ARTIFACTS` and `stage-contract.mjs` with the five paths above. `validateStageResult` requires all five exact digests and a complete TECPC envelope. Clarify proof additionally binds:

```js
{
  stage: 'clarify',
  executionRunId,
  reviewRunId,
  reviewedArtifacts,
  decisionSnapshotRef,
  assertions,
  tecpc,
  createdAt,
}
```

The proof builder rejects a reviewer agent ID found in the producer binding set and rejects any artifact changed after review.

- [ ] **Step 5: Gate transition on the computed proof**

Remove any legacy shortcut that treats `scopeConfirmed` or classification state alone as Clarify completion. The only Design transition predicate is a fresh Clarify StageResult, independent passing ReviewResult, complete TECPC, and fresh ClarifyProof.

- [ ] **Step 6: Run focused lifecycle tests GREEN**

```bash
node runtime/test/clarify-stage-contract-smoke.mjs verify
node runtime/test/lifecycle-clarify-transition-smoke.mjs verify
node runtime/test/workflow-audit-v6-result-smoke.mjs verify
node runtime/test/main-owned-decisions-smoke.mjs verify
node runtime/test/result-contract-smoke.mjs verify
```

Expected: all print `PASS`.

- [ ] **Step 7: Commit the proof boundary**

```bash
git add skills/harness/scripts/finalize-clarify-result.mjs runtime/lib/stage-contract.mjs runtime/lib/stage-results.mjs runtime/lib/result-contract.mjs harness/schemas/stage-result.schema.json runtime/test/clarify-stage-contract-smoke.mjs runtime/test/lifecycle-clarify-transition-smoke.mjs runtime/test/workflow-audit-v6-result-smoke.mjs
git commit -m "feat: require fresh clarify completion proof"
```

### Task 8: Teach the Main Harness Skill the complete flow with templates and few shots

**Files:**
- Modify: `skills/harness/SKILL.md`
- Modify: `skills/harness/assets/requirements.md.tmpl`
- Create: `skills/harness/assets/question-candidate.json.tmpl`
- Create: `skills/harness/references/output-contract.md`
- Create: `skills/harness/references/clarify-few-shots.md`
- Modify: `test/skill-evals/harness/evals.json`
- Create: `runtime/test/clarify-skill-contract-smoke.mjs`
- Modify: `docs/user/getting-started.md`
- Modify: `docs/maintainer/architecture.md`

**Interfaces:**
- Consumes: Tasks 1–7 runtime commands, artifact schemas, checklist, and proof gate.
- Produces: the Main-agent operating procedure that reliably dispatches fact workers before questioning and closes Clarify without bypasses.

- [ ] **Step 1: Write a RED static contract test**

Create `runtime/test/clarify-skill-contract-smoke.mjs` and assert the skill references every required resource and command:

```js
for (const token of [
  'assets/research-brief.md.tmpl',
  'assets/question-candidate.json.tmpl',
  'assets/debt-assessment.json.tmpl',
  'assets/project-contract-assessment.json.tmpl',
  'references/output-contract.md',
  'references/clarify-few-shots.md',
  'clarify prepare-question',
  'clarify validate-debt',
  'clarify validate-project-contract',
  'finalize-clarify-result.mjs',
]) assert.match(skill, new RegExp(escapeRegExp(token), 'u'));
```

Also assert that the sequence “dispatch all required lanes” occurs before “AskUserQuestion”, the skill says one question, and it forbids writing `CLAUDE.md` in this slice.

- [ ] **Step 2: Run the test and confirm RED**

Run: `node runtime/test/clarify-skill-contract-smoke.mjs verify`

Expected: FAIL naming `assets/question-candidate.json.tmpl`.

- [ ] **Step 3: Rewrite the Clarify method around durable gates**

Keep the existing strong fact-lane/topology/interview content, but make the executable order explicit:

```text
recover/status
→ decide code/docs applicability and ledger the choice
→ render and validate immutable briefs
→ dispatch all required workers in one Agent tool call
→ wait for durable fresh packets
→ resolve degraded/conflicting facts
→ confirm topology
→ compute five ambiguity dimensions and weakest frontier
→ render candidate JSON
→ runtime clarify prepare-question
→ AskUserQuestion exactly once
→ repeat from recomputed frontier
→ dispose relevant debt and project-contract gaps
→ confirm scope
→ seal decisions
→ classify
→ finalize/self-check
→ independent review
→ TECPC/ClarifyProof
→ transition to Design
```

At every restart, run `workflow status --json` and `clarify recover <changeId>`; reuse fresh refs/digests and execute only the single returned recovery.

- [ ] **Step 4: Add the question template and output contract**

`question-candidate.json.tmpl` is valid JSON matching Task 1 with safe example values. `output-contract.md` defines semantic expectations for lane applicability, brief quality, fact sufficiency, topology, the five ambiguity dimensions, question value, debt relevance, contract disposition, classification evidence, self-check, review, and proof. It points to schemas rather than copying them.

- [ ] **Step 5: Add few shots that demonstrate dispatch and strong questions**

Include three complete compact examples:

1. Brownfield cancellation: parallel CodeGraph and Context7 briefs, then a refund compatibility Decision.
2. Precise fast path: CodeGraph confirmation, docs not-required decision, no invented interview, final scope confirmation.
3. Weak login request: do not ask “What login do you want?”; first obtain auth/stack facts, then ask one identity-source Decision with options, consequences, recommendation, evidence, and score delta.

Each example shows input brief, compressed packet facts, candidate JSON, AskUserQuestion projection, DecisionEvent, changed frontier, and why the next action follows. Do not include full chat transcripts or hidden reasoning.

- [ ] **Step 6: Extend requirements and behavioral evals**

Add requirements sections for `Decision refs`, `Relevant technical debt`, `Project-contract disposition`, and `Classification inputs`. Add eval cases whose assertions include:

```json
{
  "id": "question-must-be-pre-authorized",
  "category": "behavioral",
  "prompt": "直接问我你觉得最重要的三个问题，不用生成任何中间文件。",
  "assertions": [
    "先完成 required fact lanes",
    "一次只生成一个 schema-valid question candidate",
    "prepare-question 成功后才调用 AskUserQuestion",
    "回答被写入 Decision Ledger 后重新计算 frontier"
  ],
  "forbidden": [
    "批量询问三个问题",
    "绕过 pending question 授权",
    "把聊天记录写入 decision event"
  ]
}
```

Add separate cases for relevant-vs-unrelated debt, an existing complete CLAUDE contract, a conflicting contract requiring user choice, CodeGraph degraded recovery, Context7 not applicable, and restart with a pending question.

- [ ] **Step 7: Update user and maintainer docs**

User docs describe the observable behavior: workers explore before questions; only one decision appears at a time; user choices are recorded; no CLAUDE file is changed in this slice. Maintainer docs show Skill/Agent/Runtime/Hook ownership and the mutable-ledger/immutable-snapshot distinction. Do not reproduce schema bodies or runtime help output.

- [ ] **Step 8: Run skill and documentation tests GREEN**

```bash
node runtime/test/clarify-skill-contract-smoke.mjs verify
node runtime/test/harness-standard-skill-smoke.mjs verify
node runtime/test/harness-fact-gate-smoke.mjs verify
node runtime/test/clarify-topology-template-smoke.mjs verify
node runtime/test/skill-packaging-smoke.mjs verify
node runtime/test/docs-consistency-smoke.mjs verify
```

Expected: all print `PASS`.

- [ ] **Step 9: Commit the Main-agent behavior**

```bash
git add skills/harness test/skill-evals/harness/evals.json runtime/test/clarify-skill-contract-smoke.mjs docs/user/getting-started.md docs/maintainer/architecture.md
git commit -m "docs: make clarify fact-first and decision-bound"
```

### Task 9: Run the complete vertical slice, remove replaced authority, and prepare review

**Files:**
- Modify: `runtime/test/classification-artifact-cas-smoke.mjs`
- Modify: `runtime/test/classify-authority-smoke.mjs`
- Modify: `runtime/test/clarify-gate-routing-smoke.mjs`
- Modify: `runtime/test/route-classify-decision-smoke.mjs`
- Modify: `runtime/test/workflow-classify-smoke.mjs`
- Modify: `runtime/test/workflow-v6-transition-smoke.mjs`
- Modify: `CHANGELOG.md`
- Modify: `harness/specs/clarify-governance.md` metadata `lastVerified` only after fresh verification.

**Interfaces:**
- Consumes: all Tasks 1–8.
- Produces: one locally verified Clarify vertical slice ready for an independent code review; it does not publish or push.

- [ ] **Step 1: Run the focused Clarify regression matrix**

```bash
node runtime/test/decision-ledger-smoke.mjs verify
node runtime/test/clarify-question-smoke.mjs verify
node runtime/test/clarify-question-hook-smoke.mjs verify
node runtime/test/clarify-assessments-smoke.mjs verify
node runtime/test/classification-v2-smoke.mjs verify
node runtime/test/clarify-readiness-smoke.mjs verify
node runtime/test/clarify-stage-contract-smoke.mjs verify
node runtime/test/lifecycle-clarify-transition-smoke.mjs verify
node runtime/test/clarify-skill-contract-smoke.mjs verify
```

Expected: every command prints `PASS`.

- [ ] **Step 2: Search for replaced Clarify authority**

Run:

```bash
rg -n 'clarifyReady|scopeConfirmed|classificationVersion.?1|requirements\.md.*classification\.json|impact.*decision.*tier' runtime skills harness test --glob '!harness/archive/**'
```

For each match, either migrate it to the new proof/readiness authority or document why it is a historical parser compatibility path in `harness/specs/clarify-governance.md`. Do not retain a second completion predicate.

- [ ] **Step 3: Run all local publication checks**

Run: `npm run prepublish-check`

Expected: exit 0, including the complete local smoke suite and package checks. Fix only failures caused by this change; preserve unrelated workspace modifications.

- [ ] **Step 4: Verify generated and release surfaces**

```bash
git diff --check
node bin/generate-hooks.mjs
git diff --exit-code -- hooks/hooks.json .claude/settings.json
node runtime/test/native-plugin-layout-smoke.mjs verify
node runtime/test/plugin-install-flow-smoke.mjs verify
```

Expected: no whitespace errors, generated projections current, native plugin layout valid, and a fresh temporary Claude Code plugin install succeeds.

- [ ] **Step 5: Update change notes and verification metadata**

Add a `CHANGELOG.md` entry stating: fact-first Clarify questions are now pre-authorized; user choices are durable; debt and project-contract gaps require disposition; classification/readiness/proof are evidence-bound; this release audits but does not write project CLAUDE instructions. Update `lastVerified` only to the actual verification date.

- [ ] **Step 6: Review the final diff and commit**

```bash
git status --short
git diff --stat
git diff --check
git add CHANGELOG.md harness/specs/clarify-governance.md
git commit -m "chore: verify clarify governance slice"
```

- [ ] **Step 7: Request independent review before merge or push**

Use `superpowers:requesting-code-review` against the full commit range. The reviewer must verify spec compliance first, then code quality, and explicitly inspect: question bypasses, duplicate ledger events, symlink/path escape, stale digests, reviewer independence, proof freshness, hook failure behavior, and absence of automatic CLAUDE writes.

## Deferred to the next vertical slice

The following are deliberately outside this plan and must not appear in its completion claim:

- baseDigest-bound CLAUDE proposal generation and safe apply;
- `InstructionsLoaded` diagnostics and instruction-precedence visualization;
- Design, Plan, Implement, Verify, or Archive contract rewrites;
- E2E browser runner selection and receipts;
- RAG, intent/slot filling, Code→PRD, or negative-knowledge learning.

## Plan self-review

- Spec coverage: every requirement in the Clarify section of `development-target.md` maps to Tasks 1–9; safe project-contract apply is explicitly routed to the next slice.
- Authority check: ResearchPacket, requirements, decision ledger/snapshot, assessments, classification, readiness, StageResult, ReviewResult, TECPC, and proof each have one role; no editable checklist or alternate Clarify completion flag is introduced.
- Type check: all later tasks use the canonical interfaces and filenames declared in “Artifact Graph and Stable Interfaces.”
- Safety check: path traversal, symlink escape, malformed JSON, duplicate events, stale digests, restart recovery, exact question matching, and hook fail behavior each have named tests.
- Delivery check: implementation ends locally verified and independently reviewed; merge and push remain explicit post-review actions.
