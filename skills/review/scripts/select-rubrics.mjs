import { selectReviewRubrics } from '../../../runtime/api/result.mjs';

export function selectRubrics(input) {
  try {
    return selectReviewRubrics(input);
  } catch (error) {
    throw new Error(`EH-RUBRIC-SELECT-001: ${error.message}`);
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [stage, behavior, impactJson = '{}'] = process.argv.slice(2);
  const impact = JSON.parse(impactJson);
  process.stdout.write(JSON.stringify(selectRubrics({ stage, behavior, impact })) + '\n');
}
