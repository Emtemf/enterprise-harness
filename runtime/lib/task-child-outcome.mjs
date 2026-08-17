const OUTCOME_FIELDS = new Set([
  'outcomeVersion',
  'kind',
  'exitCode',
  'signal',
  'spawnError',
]);

export function validateTaskChildOutcome(outcome) {
  const problems = [];
  if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) {
    return ['task child outcome must be an object'];
  }
  for (const field of Object.keys(outcome)) {
    if (!OUTCOME_FIELDS.has(field)) problems.push(`task child outcome has unknown property ${field}`);
  }
  if (outcome.outcomeVersion !== 1) problems.push('outcomeVersion must be 1');
  if (!['exit', 'signal', 'spawn-error'].includes(outcome.kind)) {
    problems.push('task child outcome kind is invalid');
  }
  if (outcome.kind === 'exit') {
    if (!Number.isInteger(outcome.exitCode)) problems.push('exit outcome requires an integer exitCode');
    if (outcome.signal !== null) problems.push('exit outcome requires signal=null');
    if (outcome.spawnError !== null) problems.push('exit outcome requires spawnError=null');
  }
  if (outcome.kind === 'signal') {
    if (outcome.exitCode !== null) problems.push('signal outcome requires exitCode=null');
    if (!String(outcome.signal || '').trim()) problems.push('signal outcome requires signal');
    if (outcome.spawnError !== null) problems.push('signal outcome requires spawnError=null');
  }
  if (outcome.kind === 'spawn-error') {
    if (outcome.exitCode !== null) problems.push('spawn-error outcome requires exitCode=null');
    if (outcome.signal !== null) problems.push('spawn-error outcome requires signal=null');
    if (!String(outcome.spawnError || '').trim()) problems.push('spawn-error outcome requires spawnError');
  }
  return [...new Set(problems)];
}

export function encodeTaskChildOutcome(outcome) {
  const problems = validateTaskChildOutcome(outcome);
  if (problems.length > 0) throw new Error(`invalid task child outcome: ${problems.join('; ')}`);
  return `${JSON.stringify(outcome)}\n`;
}

export function parseTaskChildOutcome(payload) {
  const text = String(payload || '').trim();
  if (!text) throw new Error('task child outcome is missing');
  let outcome;
  try {
    outcome = JSON.parse(text);
  } catch (error) {
    throw new Error(`task child outcome is invalid JSON: ${error.message}`);
  }
  const problems = validateTaskChildOutcome(outcome);
  if (problems.length > 0) throw new Error(`invalid task child outcome: ${problems.join('; ')}`);
  return outcome;
}
