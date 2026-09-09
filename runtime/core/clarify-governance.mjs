import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import {
  assertNoSymlinkComponents,
  assertSafeId,
  isSafeRelativePath,
  resolveWithin,
} from '../lib/safe-paths.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { promptBindingCovers, promptClauseLiterals } from '../lib/prompt-receipts.mjs';
import { clarifyResearchAuthorityDigest, readClarifyResearchEvidence } from '../lib/clarify-research-evidence.mjs';
import { atomicWriteJson, withChangeTransaction } from '../lib/state-store.mjs';
import { statePathFor, updateChangeState, validateV6State } from './change-state.mjs';
import { appendDecisionEvent, appendDecisionEvents, readDecisionEvents, sealClarifyDecisionSnapshot } from './decision-ledger.mjs';
import { loadHandoffV2, v2ResultPath, validateHandoffV2Result } from './handoff-v2.mjs';
import {
  classifyClarify,
  readClassificationArtifact,
  replaceClassificationArtifact,
} from './classification-artifact.mjs';

const PUBLIC_EVENT_TYPES = new Set(['lane-applicability', 'classification-route']);

function safeId(value, label) {
  try { return assertSafeId(value, label); } catch (error) { throw new Error(`EH-PATH-001: ${error.message}`); }
}

function readJson(root, ref, label, code) {
  if (!isSafeRelativePath(ref)) throw new Error(`EH-PATH-001: ${label} must be a safe repository-relative path`);
  let target;
  try {
    target = resolveWithin(root, ref, label);
    assertNoSymlinkComponents(root, target, label);
  } catch (error) {
    throw new Error(`EH-PATH-001: ${error.message}`);
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error(`${code}: missing ${ref}`);
  try { return JSON.parse(fs.readFileSync(target, 'utf-8')); } catch (error) {
    throw new Error(`${code}: invalid JSON in ${ref}: ${error.message}`);
  }
}

function activeClarifyState(root, changeId, code) {
  let state;
  try { state = JSON.parse(fs.readFileSync(statePathFor(root, changeId), 'utf-8')); } catch (error) {
    throw new Error(`${code}: cannot read active v6 Clarify state: ${error.message}`);
  }
  const problems = validateV6State(state, changeId);
  if (problems.length > 0 || state.lifecycle !== 'active' || state.stage !== 'clarify') {
    throw new Error(`${code}: active v6 clarify state required: ${problems.join('; ')}`);
  }
  return state;
}

export function decisionEventInputPath(changeId, eventId) {
  safeId(changeId, 'changeId');
  safeId(eventId, 'eventId');
  return `harness/changes/${changeId}/evidence/clarify/decision-events/${eventId}.json`;
}

export function classificationInputPath(changeId) {
  safeId(changeId, 'changeId');
  return `harness/changes/${changeId}/evidence/clarify/classification-input.json`;
}

export function laneApplicabilityInputPath(changeId) {
  safeId(changeId, 'changeId');
  return `harness/changes/${changeId}/evidence/clarify/lane-applicability-input.json`;
}

export function inspectClarifyRequirements(root, changeId) {
  safeId(changeId, 'changeId');
  activeClarifyState(root, changeId, 'EH-LANE-DIGEST-160');
  const requirementsRef = `harness/changes/${changeId}/requirements.md`;
  try {
    const target = resolveWithin(root, requirementsRef, 'requirements');
    assertNoSymlinkComponents(root, target, 'requirements');
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      throw new Error(`missing ${requirementsRef}`);
    }
    return Object.freeze({
      requirementsRef,
      requirementsDigest: sha256Artifact(root, requirementsRef),
    });
  } catch (error) {
    throw new Error(`EH-LANE-DIGEST-160: cannot inspect current requirements: ${error.message}`);
  }
}

export function inspectClarifySynthesisSources(root, changeId) {
  safeId(changeId, 'changeId');
  activeClarifyState(root, changeId, 'EH-CLARIFY-SOURCES-169');
  const requirementsRef = `harness/changes/${changeId}/requirements.md`;
  let content;
  try { content = fs.readFileSync(resolveWithin(root, requirementsRef, 'requirements'), 'utf-8'); } catch (error) {
    throw new Error(`EH-CLARIFY-SOURCES-169: cannot read ${requirementsRef}: ${error.message}`);
  }
  const research = readClarifyResearchEvidence(root, changeId, requirementsRef, content);
  if (!research.fresh || !research.conflictsDisposed) {
    throw new Error(`EH-CLARIFY-SOURCES-169: fact gate must be clean before synthesis: ${research.problems.join('; ')}`);
  }
  const raw = promptClauseLiterals(originalRequest(content)).map((claim, index) => ({
    sourceId: `RAW-${index + 1}`,
    kind: 'raw-request',
    locator: 'original-request',
    claim,
    evidenceRef: requirementsRef,
  }));
  const facts = research.packets.flatMap((packet, packetIndex) => packet.facts.map(({ claim }, factIndex) => ({
    sourceId: `${packet.source === 'code-explore' ? 'CODE' : 'DOCS'}-${factIndex + 1}`,
    kind: 'research-packet',
    locator: packet.source === 'code-explore' ? 'fact:code' : 'fact:docs',
    claim,
    evidenceRef: research.refs[packetIndex],
  })));
  return Object.freeze({ changeId, requirementsRef, sources: Object.freeze([...raw, ...facts].map(Object.freeze)) });
}

function exactKeys(value, expected, label, problems) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    problems.push(`${label} must be an object`);
    return;
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    problems.push(`${label} fields must be exactly ${wanted.join(', ')}`);
  }
}

function validateLaneInput(changeId, input) {
  const problems = [];
  exactKeys(input, ['inputVersion', 'type', 'changeId', 'requirementsRef', 'requirementsDigest', 'lanes'], 'lane input', problems);
  if (input?.inputVersion !== 1) problems.push('inputVersion must be 1');
  if (input?.type !== 'lane-applicability-input') problems.push('type must be lane-applicability-input');
  if (input?.changeId !== changeId) problems.push(`changeId must be ${changeId}`);
  if (!/^[a-f0-9]{64}$/u.test(input?.requirementsDigest || '')) problems.push('requirementsDigest must be sha256');
  exactKeys(input?.lanes, ['code', 'docs'], 'lanes', problems);
  for (const lane of ['code', 'docs']) {
    const value = input?.lanes?.[lane];
    exactKeys(value, ['selectedOption', 'publicRationale', 'evidenceRefs'], `${lane} lane`, problems);
    if (!['required', 'not-required'].includes(value?.selectedOption)) problems.push(`${lane} selectedOption is invalid`);
    if (lane === 'code' && value?.selectedOption !== 'required') problems.push('code selectedOption must be required');
    if (typeof value?.publicRationale !== 'string' || !value.publicRationale.trim()) problems.push(`${lane} publicRationale is required`);
    if (!Array.isArray(value?.evidenceRefs) || value.evidenceRefs.length === 0
        || new Set(value.evidenceRefs).size !== value.evidenceRefs.length) {
      problems.push(`${lane} evidenceRefs must be a non-empty unique array`);
    }
  }
  return problems;
}

function originalRequest(content) {
  const goalStart = content.indexOf('## 目标与验收');
  const rawStart = content.indexOf('### 原始需求', goalStart);
  const rawEnd = content.indexOf('### 澄清后的目标', rawStart);
  if (goalStart < 0 || rawStart < 0 || rawEnd < 0) return '';
  return content.slice(rawStart + '### 原始需求'.length, rawEnd).trim();
}

function requirementsLaneSelections(content) {
  const start = content.indexOf('## 事实探索门禁');
  const end = content.indexOf('\n## ', start + '## 事实探索门禁'.length);
  const body = start < 0 ? '' : content.slice(start, end < 0 ? content.length : end);
  const rows = body.split('\n').map((line) => line.trim())
    .filter((line) => /^\|\s*(?:code|docs)\s*\|/u.test(line))
    .map((line) => line.slice(1, -1).split('|').map((cell) => cell.trim()));
  const result = new Map();
  for (const cells of rows) {
    if (cells.length !== 7 || result.has(cells[0])) return null;
    result.set(cells[0], {
      required: cells[1].toLowerCase(),
      status: cells[5].toLowerCase(),
      authority: cells[6].trim(),
    });
  }
  return result.size === 2 && result.has('code') && result.has('docs') ? result : null;
}

function atomicWriteText(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, content, { encoding: 'utf-8', mode: 0o644, flag: 'wx' });
    try { fs.renameSync(temporary, target); } catch (error) {
      if (['EPERM', 'EEXIST'].includes(error.code)) {
        fs.rmSync(target, { force: true });
        fs.renameSync(temporary, target);
      } else throw error;
    }
  } finally { fs.rmSync(temporary, { force: true }); }
}

function replaceSection(content, heading, nextHeading, replacement) {
  const start = content.indexOf(heading);
  const end = content.indexOf(nextHeading, start + heading.length);
  if (start < 0 || end < 0) throw new Error(`missing section ${heading}`);
  return `${content.slice(0, start)}${replacement.trimEnd()}\n\n${content.slice(end)}`;
}

function markdownCell(value) {
  return String(value ?? '').replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll(/\r?\n/gu, ' ').trim();
}

export function closeClarifyResearch(root, changeId, runIds) {
  safeId(changeId, 'changeId');
  activeClarifyState(root, changeId, 'EH-CLARIFY-RESEARCH-CLOSE-167');
  if (!Array.isArray(runIds) || runIds.length < 1 || runIds.length > 2 || new Set(runIds).size !== runIds.length) {
    throw new Error('EH-CLARIFY-RESEARCH-CLOSE-167: provide one unique run-id for every required lane');
  }
  const requirementsRef = `harness/changes/${changeId}/requirements.md`;
  let requirementsPath;
  try {
    requirementsPath = resolveWithin(root, requirementsRef, 'requirements');
    assertNoSymlinkComponents(root, requirementsPath, 'requirements');
  } catch (error) {
    throw new Error(`EH-PATH-001: ${error.message}`);
  }
  let seed;
  try { seed = fs.readFileSync(requirementsPath, 'utf-8'); } catch (error) {
    throw new Error(`EH-CLARIFY-RESEARCH-CLOSE-167: cannot read ${requirementsRef}: ${error.message}`);
  }
  const selections = requirementsLaneSelections(seed);
  if (!selections) throw new Error('EH-CLARIFY-RESEARCH-CLOSE-167: requirements must contain the exact seven-column lane table');
  const bound = new Map();
  for (const runId of runIds) {
    let input;
    let packet;
    let resultPath;
    try {
      input = loadHandoffV2(root, changeId, runId);
      resultPath = v2ResultPath(root, changeId, runId);
      packet = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
    } catch (error) {
      throw new Error(`EH-CLARIFY-RESEARCH-CLOSE-167: cannot load ${runId}: ${error.message}`);
    }
    const lane = input.behavior === 'clarify.explore-code' ? 'code'
      : input.behavior === 'clarify.research-docs' ? 'docs' : null;
    if (!lane || input.stage !== 'clarify' || input.role !== 'execute' || bound.has(lane)) {
      throw new Error(`EH-CLARIFY-RESEARCH-CLOSE-167: ${runId} is not a unique Clarify research execute handoff`);
    }
    const problems = validateHandoffV2Result(root, input, packet);
    if (problems.length > 0 || packet.degraded !== false || packet.uncertainties.length > 0) {
      throw new Error(`EH-CLARIFY-RESEARCH-CLOSE-167: ${lane} packet is not clean: ${problems.join('; ') || packet.uncertainties.join('; ') || 'degraded'}`);
    }
    if (input.inputRefs.length !== 1 || !input.inputRefs[0].startsWith(`harness/changes/${changeId}/research/`)) {
      throw new Error(`EH-CLARIFY-RESEARCH-CLOSE-167: ${lane} handoff must bind exactly one canonical research brief`);
    }
    const packetRef = path.relative(root, resultPath).split(path.sep).join('/');
    if (!isSafeRelativePath(packetRef)) throw new Error(`EH-CLARIFY-RESEARCH-CLOSE-167: unsafe canonical packet ref ${packetRef}`);
    bound.set(lane, { runId, briefRef: input.inputRefs[0], packetRef, packet });
  }
  const required = [...selections.entries()].filter(([, value]) => value.required === 'yes').map(([lane]) => lane);
  if (required.some((lane) => !bound.has(lane)) || [...bound.keys()].some((lane) => !required.includes(lane))) {
    throw new Error(`EH-CLARIFY-RESEARCH-CLOSE-167: run IDs must cover required lanes exactly: ${required.join(',')}`);
  }
  let closedSeed = seed.split('\n').map((line) => {
    const match = line.match(/^\|\s*(code|docs)\s*\|/u);
    if (!match || !bound.has(match[1])) return line;
    const lane = match[1];
    const item = bound.get(lane);
    const authority = [item.packet.authority, item.packet.fallback].filter(Boolean).join('; ');
    return `| ${lane} | yes | ${markdownCell(item.briefRef)} | ${item.runId} | ${markdownCell(item.packetRef)} | complete | ${markdownCell(authority)} |`;
  }).join('\n');
  closedSeed = closedSeed.replace(/([-*]\s*fact gate complete\s*[:：]\s*)false\b/iu, '$1true')
    .replace(/([-*]\s*remaining fact uncertainty\s*[:：]).*/iu, '$1 none');
  const rawStart = closedSeed.indexOf('### 原始需求');
  const rawEnd = closedSeed.indexOf('### 澄清后的目标', rawStart);
  const factStart = closedSeed.indexOf('## 事实探索门禁');
  const factEnd = closedSeed.indexOf('\n## ', factStart + '## 事实探索门禁'.length);
  if ([rawStart, rawEnd, factStart].some((value) => value < 0)) {
    throw new Error('EH-CLARIFY-RESEARCH-CLOSE-167: research seed is missing required sections');
  }
  const rawSection = closedSeed.slice(rawStart, rawEnd);
  const factSection = closedSeed.slice(factStart, factEnd < 0 ? closedSeed.length : factEnd);
  let expanded = fs.readFileSync(new URL('../../skills/harness/assets/requirements.md.tmpl', import.meta.url), 'utf-8');
  expanded = replaceSection(expanded, '### 原始需求', '### 澄清后的目标', rawSection);
  expanded = replaceSection(expanded, '## 事实探索门禁', '## 组件拓扑', factSection);
  atomicWriteText(requirementsPath, expanded);
  const lanes = syncClarifyLanes(root, changeId);
  const closed = readClarifyResearchEvidence(root, changeId, requirementsRef, expanded);
  if (!closed.fresh || !closed.conflictsDisposed) {
    throw new Error(`EH-CLARIFY-RESEARCH-CLOSE-167: canonical closure validation failed: ${closed.problems.join('; ')}`);
  }
  return Object.freeze({ changeId, requirementsRef, runIds: [...runIds], lanes });
}

function existingLaneEvent(events, targetRef) {
  return events.find((event) => event.decisionType === 'lane-applicability' && event.targetRef === targetRef) || null;
}

export function syncClarifyLanes(root, changeId) {
  safeId(changeId, 'changeId');
  activeClarifyState(root, changeId, 'EH-LANE-INPUT-156');
  const requirementsRef = `harness/changes/${changeId}/requirements.md`;
  let requirementsPath;
  try {
    requirementsPath = resolveWithin(root, requirementsRef, 'requirements');
    assertNoSymlinkComponents(root, requirementsPath, 'requirements');
  } catch (error) {
    throw new Error(`EH-PATH-001: ${error.message}`);
  }
  let requirementsContent;
  try { requirementsContent = fs.readFileSync(requirementsPath, 'utf-8'); } catch (error) {
    throw new Error(`EH-LANE-INPUT-156: cannot read ${requirementsRef}: ${error.message}`);
  }
  const selections = requirementsLaneSelections(requirementsContent);
  if (!selections || [...selections.values()].some(({ required }) => !['yes', 'no'].includes(required))) {
    throw new Error('EH-LANE-INPUT-156: requirements fact-lane table must decide code and docs exactly once');
  }
  const requirementsDigest = sha256Artifact(root, requirementsRef);
  const inputRef = laneApplicabilityInputPath(changeId);
  let inputPath;
  try {
    inputPath = resolveWithin(root, inputRef, 'lane applicability input');
    assertNoSymlinkComponents(root, inputPath, 'lane applicability input');
  } catch (error) {
    throw new Error(`EH-PATH-001: ${error.message}`);
  }
  const input = {
    inputVersion: 1,
    type: 'lane-applicability-input',
    changeId,
    requirementsRef,
    requirementsDigest,
    lanes: Object.fromEntries(['code', 'docs'].map((lane) => {
      const selection = selections.get(lane);
      const selectedOption = selection.required === 'yes' ? 'required' : 'not-required';
      const authority = selection.authority || (lane === 'code' ? 'codegraph-first' : 'context7-first');
      return [lane, {
        selectedOption,
        publicRationale: `${lane}=${selectedOption}; requirements authority/fallback: ${authority}`,
        evidenceRefs: [requirementsRef],
      }];
    })),
  };
  atomicWriteJson(inputPath, input);
  return recordClarifyLanes(root, changeId, inputRef);
}

export function recordClarifyLanes(root, changeId, inputRef) {
  safeId(changeId, 'changeId');
  activeClarifyState(root, changeId, 'EH-LANE-INPUT-156');
  if (!isSafeRelativePath(inputRef)) throw new Error('EH-PATH-001: lane applicability input must be repository-relative');
  const canonical = laneApplicabilityInputPath(changeId);
  if (inputRef !== canonical) throw new Error(`EH-LANE-INPUT-156: input-ref must be ${canonical}`);
  return withChangeTransaction(root, changeId, () => {
    activeClarifyState(root, changeId, 'EH-LANE-INPUT-156');
    const input = readJson(root, inputRef, 'lane applicability input', 'EH-LANE-INPUT-156');
    const problems = validateLaneInput(changeId, input);
    const requirementsRef = `harness/changes/${changeId}/requirements.md`;
    if (input.requirementsRef !== requirementsRef) problems.push(`requirementsRef must be ${requirementsRef}`);
    if (problems.length > 0) throw new Error(`EH-LANE-INPUT-156: ${problems.join('; ')}`);
    let requirementsContent;
    try {
      requirementsContent = fs.readFileSync(resolveWithin(root, requirementsRef, 'requirements'), 'utf-8');
    } catch (error) {
      throw new Error(`EH-LANE-INPUT-156: cannot read ${requirementsRef}: ${error.message}`);
    }
    const requirementLanes = requirementsLaneSelections(requirementsContent);
    if (!requirementLanes) {
      throw new Error('EH-LANE-INPUT-156: requirements fact-lane table must contain exactly one seven-column code row and docs row');
    }
    for (const lane of ['code', 'docs']) {
      const expectedRequired = input.lanes[lane].selectedOption === 'required' ? 'yes' : 'no';
      const projection = requirementLanes.get(lane);
      if (projection.required !== expectedRequired) {
        throw new Error(`EH-LANE-INPUT-156: requirements ${lane} Required must be ${expectedRequired} to match lane input`);
      }
      const allowedStatuses = expectedRequired === 'yes'
        ? new Set(['pending', 'complete', 'blocked'])
        : new Set(['not-required']);
      if (!allowedStatuses.has(projection.status)) {
        throw new Error(`EH-LANE-INPUT-156: requirements ${lane} Status ${projection.status || '<empty>'} is inconsistent with Required=${expectedRequired}`);
      }
    }
    const requirementsDigest = sha256Artifact(root, requirementsRef);
    if (input.requirementsDigest !== requirementsDigest) {
      throw new Error(`EH-LANE-STALE-157: requirementsDigest does not match current ${requirementsRef}`);
    }
    if (!promptBindingCovers(root, changeId, originalRequest(requirementsContent))) {
      throw new Error('EH-LANE-CONTINUITY-158: requirements original request is not covered by the bound UserPromptSubmit receipt');
    }
    const inputDigestsByLane = {};
    for (const lane of ['code', 'docs']) {
      const refs = input.lanes[lane].evidenceRefs;
      if (!refs.includes(requirementsRef)) {
        throw new Error(`EH-LANE-INPUT-156: ${lane} evidenceRefs must include ${requirementsRef}`);
      }
      inputDigestsByLane[lane] = Object.fromEntries(refs.map((ref) => {
        if (!isSafeRelativePath(ref)) throw new Error(`EH-PATH-001: ${lane} evidence ref must be repository-relative`);
        const target = resolveWithin(root, ref, `${lane} evidence ref`);
        assertNoSymlinkComponents(root, target, `${lane} evidence ref`);
        return [ref, sha256Artifact(root, ref)];
      }));
    }
    const existing = readDecisionEvents(root, changeId);
    const createdAt = new Date().toISOString();
    const authorityDigest = clarifyResearchAuthorityDigest(requirementsContent);
    const events = ['code', 'docs'].map((lane) => {
      const targetRef = `${requirementsRef}#fact-lane-${lane}#sha256=${authorityDigest}`;
      const prior = existingLaneEvent(existing, targetRef);
      if (prior) return prior;
      const suffix = authorityDigest.slice(0, 16);
      const laneInput = input.lanes[lane];
      return {
        eventVersion: 1,
        type: 'decision-event',
        eventId: `lane-${lane}-${suffix}`,
        changeId,
        stage: 'clarify',
        actor: { type: 'main', id: 'harness-main' },
        decisionType: 'lane-applicability',
        targetRef,
        questionId: `lane-${lane}-applicability-${authorityDigest.slice(0, 12)}`,
        options: ['required', 'not-required'],
        recommendedOption: laneInput.selectedOption,
        selectedOption: laneInput.selectedOption,
        publicRationale: laneInput.publicRationale.trim(),
        evidenceRefs: [...laneInput.evidenceRefs],
        inputDigests: inputDigestsByLane[lane],
        recordedAt: createdAt,
      };
    });
    for (const [index, lane] of ['code', 'docs'].entries()) {
      const prior = existingLaneEvent(existing, events[index].targetRef);
      if (prior && (prior.selectedOption !== input.lanes[lane].selectedOption
          || prior.publicRationale !== input.lanes[lane].publicRationale.trim()
          || JSON.stringify(prior.evidenceRefs) !== JSON.stringify(input.lanes[lane].evidenceRefs))) {
        throw new Error(`EH-DECISION-TARGET-106: ${lane} lane target is already resolved with different content`);
      }
    }
    const results = appendDecisionEvents(root, changeId, events);
    return Object.freeze({
      requirementsDigest,
      events: Object.freeze(results.map((result, index) => Object.freeze({
        lane: ['code', 'docs'][index],
        ...result,
        targetRef: events[index].targetRef,
      }))),
    });
  });
}

export function assertCurrentLaneApplicability(root, changeId, lane) {
  safeId(changeId, 'changeId');
  if (!['code', 'docs'].includes(lane)) throw new Error(`EH-LANE-DISPATCH-159: unsupported research lane ${lane}`);
  activeClarifyState(root, changeId, 'EH-LANE-DISPATCH-159');
  const requirementsRef = `harness/changes/${changeId}/requirements.md`;
  const requirementsDigest = sha256Artifact(root, requirementsRef);
  const requirementsContent = fs.readFileSync(resolveWithin(root, requirementsRef, 'requirements'), 'utf-8');
  const authorityDigest = clarifyResearchAuthorityDigest(requirementsContent);
  const targetRef = `${requirementsRef}#fact-lane-${lane}#sha256=${authorityDigest}`;
  const events = readDecisionEvents(root, changeId).filter((event) => (
    event.decisionType === 'lane-applicability' && event.targetRef === targetRef
  ));
  if (events.length !== 1) {
    throw new Error(`EH-LANE-DISPATCH-159: current ${lane} lane requires exactly one fresh DecisionEvent`);
  }
  const event = events[0];
  if (event.selectedOption !== 'required') {
    throw new Error(`EH-LANE-DISPATCH-159: ${lane} lane is not required; do not create its research handoff`);
  }
  try {
    assertFreshBindings(root, event);
  } catch (error) {
    throw new Error(`EH-LANE-STALE-157: ${lane} lane DecisionEvent is stale: ${error.message}`);
  }
  return Object.freeze({ lane, eventId: event.eventId, targetRef, requirementsDigest });
}

function assertFreshBindings(root, event) {
  for (const ref of event.evidenceRefs || []) {
    const artifactRef = ref.match(/^(.*):[1-9]\d*$/u)?.[1] || ref;
    if (!Object.hasOwn(event.inputDigests || {}, artifactRef)) {
      throw new Error(`EH-DECISION-STALE-146: evidenceRefs requires inputDigests.${artifactRef}`);
    }
  }
  for (const [ref, digest] of Object.entries(event.inputDigests || {})) {
    try {
      const target = resolveWithin(root, ref, 'decision event input digest');
      assertNoSymlinkComponents(root, target, 'decision event input digest');
      if (sha256Artifact(root, ref) !== digest) throw new Error(`stale input ${ref}`);
    } catch (error) {
      throw new Error(`EH-DECISION-STALE-146: ${error.message}`);
    }
  }
}

export function recordClarifyDecision(root, changeId, eventRef) {
  safeId(changeId, 'changeId');
  activeClarifyState(root, changeId, 'EH-DECISION-INPUT-147');
  const event = readJson(root, eventRef, 'decision event input', 'EH-DECISION-INPUT-147');
  if (typeof event?.eventId !== 'string' || !event.eventId.trim()) {
    throw new Error('EH-DECISION-INPUT-147: event input requires a safe eventId');
  }
  const canonical = decisionEventInputPath(changeId, event?.eventId);
  if (eventRef !== canonical) throw new Error(`EH-DECISION-INPUT-147: event-ref must be ${canonical}`);
  if (!PUBLIC_EVENT_TYPES.has(event.decisionType) || !['main', 'runtime'].includes(event.actor?.type)) {
    throw new Error('EH-DECISION-INPUT-147: public CLI only accepts main/runtime lane-applicability or classification-route events; user decisions require AskUserQuestion');
  }
  assertFreshBindings(root, event);
  return appendDecisionEvent(root, changeId, event);
}

export function sealClarifyDecisions(root, changeId, eventIds) {
  activeClarifyState(root, changeId, 'EH-DECISION-SNAPSHOT-104');
  return sealClarifyDecisionSnapshot(root, changeId, eventIds);
}

export function persistClarifyClassification(root, changeId, inputRef) {
  safeId(changeId, 'changeId');
  const canonical = classificationInputPath(changeId);
  if (inputRef !== canonical) throw new Error(`EH-CLASSIFICATION-INPUT-148: input-ref must be ${canonical}`);
  const input = readJson(root, inputRef, 'classification input', 'EH-CLASSIFICATION-INPUT-148');
  const classification = classifyClarify(root, changeId, input);
  const state = activeClarifyState(root, changeId, 'EH-CLASSIFICATION-COMMIT-149');
  if (state.artifacts.classification) {
    const existing = readClassificationArtifact(root, changeId, state.artifacts.classification);
    if (JSON.stringify(existing) === JSON.stringify(classification)) {
      return Object.freeze({ ...state.artifacts.classification, duplicate: true, revision: state.revision });
    }
  }
  const committed = replaceClassificationArtifact(root, changeId, classification, (reference) => (
    updateChangeState(root, changeId, (current) => ({
      ...current,
      artifacts: { ...current.artifacts, classification: reference },
      validation: { status: 'stale', digest: null, validatedAt: null },
    }), { expectedRevision: state.revision, type: 'clarify-classification-persisted' })
  ));
  return Object.freeze({ ...committed.artifacts.classification, duplicate: false, revision: committed.revision });
}
