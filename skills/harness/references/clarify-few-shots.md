# Clarify Few-Shots

Load when: the selected phase needs calibration for fact-first dispatch, Fast Path, or one high-value question candidate.
Return to controller: after applying one analogous pattern to the current phase action; never continue the example workflow.

These are compact artifact projections, not
chat transcripts or hidden reasoning. Example digests use the valid all-zero placeholder and must be replaced with the
fresh artifact digest before preparation.

## 1. Brownfield cancellation: facts before refund compatibility

**Input briefs**

- code: “For `cancel-order`, identify current cancellation states, refund call path, active consumers, and tests; exclude design proposals.”
- docs: “For the pinned payment SDK, determine refund idempotency and compatibility constraints; exclude product-policy choices.”
- dispatch: both handoffs are created, then CodeGraph-first and Context7-first workers are dispatched in one Agent call.

**Compressed packet facts**

- code packet: `PENDING` is cancellable; paid cancellation calls `RefundGateway.refund`; mobile and batch consumers use the current response; no retry test exists.
- docs packet: the pinned SDK supports idempotency keys but duplicate semantics differ when no key is supplied; no uncertainty remains.

**Fresh topology prerequisite**: before the business question, canonical candidate `Q-topology` was prepared and its
schema-valid event was persisted:

```json
{"eventVersion":1,"type":"decision-event","eventId":"D-topology","changeId":"cancel-order","stage":"clarify","actor":{"type":"user","id":"interactive-user"},"decisionType":"scope-confirmation","targetRef":"harness/changes/cancel-order/requirements.md","questionId":"Q-topology","options":["confirm","adjust","defer"],"recommendedOption":"confirm","selectedOption":"confirm","publicRationale":"Selected by the user through AskUserQuestion.","evidenceRefs":["harness/changes/cancel-order/requirements.md","harness/changes/cancel-order/evidence/handoffs/code-run/result.json","harness/changes/cancel-order/evidence/handoffs/docs-run/result.json"],"inputDigests":{"harness/changes/cancel-order/requirements.md":"0000000000000000000000000000000000000000000000000000000000000000","harness/changes/cancel-order/evidence/handoffs/code-run/result.json":"0000000000000000000000000000000000000000000000000000000000000000","harness/changes/cancel-order/evidence/handoffs/docs-run/result.json":"0000000000000000000000000000000000000000000000000000000000000000"},"recordedAt":"1970-01-01T00:00:00.000Z"}
```

**Candidate JSON projection**

```json
{
  "questionVersion": 1,
  "type": "clarify-question-candidate",
  "changeId": "cancel-order",
  "questionId": "Q-refund-compat",
  "componentId": "order-cancellation",
  "dimension": "Constraints",
  "decisionNeeded": "Choose refund compatibility for paid cancellations.",
  "whyUserOnly": "Facts expose two valid product policies but do not authorize one.",
  "decisionType": "clarify-answer",
  "targetRef": "harness/changes/cancel-order/requirements.md",
  "header": "Refund",
  "question": "How should paid-order cancellation preserve refund compatibility?",
  "options": [
    {"id": "idempotent-current", "label": "Preserve consumers", "description": "Keep the response and require idempotency keys."},
    {"id": "breaking-retry", "label": "Change retry semantics", "description": "Adopt new semantics with a consumer migration."}
  ],
  "recommendedOption": "idempotent-current",
  "recommendationReason": "Two active consumers exist and no migration window is approved.",
  "evidenceRefs": ["harness/changes/cancel-order/requirements.md", "harness/changes/cancel-order/evidence/handoffs/code-run/result.json", "harness/changes/cancel-order/evidence/handoffs/docs-run/result.json"],
  "inputDigests": {"harness/changes/cancel-order/requirements.md": "0000000000000000000000000000000000000000000000000000000000000000", "harness/changes/cancel-order/evidence/handoffs/code-run/result.json": "0000000000000000000000000000000000000000000000000000000000000000", "harness/changes/cancel-order/evidence/handoffs/docs-run/result.json": "0000000000000000000000000000000000000000000000000000000000000000"},
  "blocking": true,
  "createdAt": "1970-01-01T00:00:00.000Z"
}
```

**AskUserQuestion projection**: one question, header `Refund`; runtime adds `(Recommended)` to `Preserve consumers`
only, then projects the two labels/descriptions above,
`multiSelect: false`; no rationale or second question.

**DecisionEvent**: `D-refund-compat`, actor=user, selected=`idempotent-current`, evidence refs bind both packets and
the candidate inputs; public rationale says the user selected the authorized option.

**Changed frontier**: `order-cancellation × Constraints` 2→4; the next weakest/high-risk item becomes observable
failure acceptance. The next action follows because refund policy is now durable and the frontier was recomputed.

## 2. Precise Fast Path: no invented interview

**Input brief**

- code: “Confirm `OrderService.cancelPending(id)`, `PENDING`, `ORDER_NOT_PENDING`, unit-test conventions, and whether API/data surfaces are touched.”
- docs applicability: `not-required`, because no external library, SDK, protocol, standard, or version behavior is involved; the lane decision binds the raw request and code packet.

**Compressed packet facts**: the symbol and status already exist; current exception mapping uses `ORDER_NOT_PENDING`;
the change stays inside service and unit-test paths; API/data are untouched.

**Candidate JSON projection**

```json
{
  "questionVersion": 1,
  "type": "clarify-question-candidate",
  "changeId": "cancel-pending",
  "questionId": "Q-scope-final",
  "componentId": "cancel-pending",
  "dimension": "Scope",
  "decisionNeeded": "Confirm the already precise execution scope.",
  "whyUserOnly": "Only the user can authorize transition on the complete scope.",
  "decisionType": "scope-confirmation",
  "targetRef": "harness/changes/cancel-pending/requirements.md",
  "header": "Final scope",
  "question": "Confirm this service-only scope and proceed to Design?",
  "options": [
    {"id": "confirm-scope", "label": "Confirm scope", "description": "Implement only the named method and unit tests."},
    {"id": "revise-scope", "label": "Revise scope", "description": "Stay in Clarify and change the boundary."}
  ],
  "recommendedOption": "confirm-scope",
  "recommendationReason": "All five dimensions are evidence-covered and no high-risk assumption remains.",
  "evidenceRefs": ["harness/changes/cancel-pending/requirements.md"],
  "inputDigests": {"harness/changes/cancel-pending/requirements.md": "0000000000000000000000000000000000000000000000000000000000000000"},
  "blocking": true,
  "createdAt": "1970-01-01T00:00:00.000Z"
}
```

**AskUserQuestion projection**: the single scope-confirmation question and its two options. If the raw request already
contains equivalent explicit authorization, no question is invented and that sentence becomes the confirmation evidence.

**DecisionEvent**: when asked, `D-scope-final`, selected=`confirm-scope`; otherwise the existing explicit authorization
is ledgered. **Changed frontier**: Scope 4→5 and no open frontier remains. Next: dispose empty debt/contract assessments,
seal, classify, and finalize because Fast Path reduces questions but skips no completion gate.

## 3. Weak login request: research first, then identity source

Do not ask “What login do you want?” The request lacks stack, current auth, consumers, risks, and observable acceptance.

**Input briefs**

- code: “Identify current auth middleware, identity stores, session mechanism, consumers, failure handling, and tests.”
- docs: created only after code identifies the pinned framework: “For framework/version X, confirm supported identity/session behavior and security constraints.”

**Compressed packet facts**: the service uses framework X, has signed sessions, no local credential store, and delegates
employee identity to an organization IdP; official docs support OIDC and warn against collecting passwords locally.

**Fresh topology prerequisite**: canonical `Q-topology` was prepared first and fresh `D-topology` is already in the
ledger with `decisionType=scope-confirmation`, `targetRef=harness/changes/simple-login/requirements.md`,
`selectedOption=confirm`, and evidence/input digests binding requirements plus both packet refs. Only then may the
identity-source candidate below be prepared.

**Candidate JSON projection**

```json
{
  "questionVersion": 1,
  "type": "clarify-question-candidate",
  "changeId": "simple-login",
  "questionId": "Q-identity-source",
  "componentId": "login-capability",
  "dimension": "Constraints",
  "decisionNeeded": "Choose the authoritative identity source.",
  "whyUserOnly": "The repository supports federation but the intended user population is a product decision.",
  "decisionType": "clarify-answer",
  "targetRef": "harness/changes/simple-login/requirements.md",
  "header": "Identity",
  "question": "Which identity source should authorize this login capability?",
  "options": [
    {"id": "organization-idp", "label": "Organization IdP", "description": "Reuse OIDC and avoid a new credential store; employee access only."},
    {"id": "local-accounts", "label": "Local accounts", "description": "Create a credential authority and expand security, recovery, and data scope."}
  ],
  "recommendedOption": "organization-idp",
  "recommendationReason": "Current code and pinned framework already support OIDC; local credentials add an unrequested security boundary.",
  "evidenceRefs": ["harness/changes/simple-login/requirements.md", "harness/changes/simple-login/evidence/handoffs/code-run/result.json", "harness/changes/simple-login/evidence/handoffs/docs-run/result.json"],
  "inputDigests": {"harness/changes/simple-login/requirements.md": "0000000000000000000000000000000000000000000000000000000000000000", "harness/changes/simple-login/evidence/handoffs/code-run/result.json": "0000000000000000000000000000000000000000000000000000000000000000", "harness/changes/simple-login/evidence/handoffs/docs-run/result.json": "0000000000000000000000000000000000000000000000000000000000000000"},
  "blocking": true,
  "createdAt": "1970-01-01T00:00:00.000Z"
}
```

**AskUserQuestion projection**: header `Identity`; runtime marks only `Organization IdP` as `(Recommended)`, exactly
the two options, `multiSelect: false`.

**DecisionEvent**: `D-identity-source`, selected=`organization-idp`, with packet and requirements digests.
**Changed frontier**: Constraints 1→4; Acceptance remains 1 and becomes the next frontier. Next action is one observable
success/failure Decision, because identity authority is settled but acceptance is still user-owned and under-evidenced.
