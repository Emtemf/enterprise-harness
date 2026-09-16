import { answerBusinessQuestion } from './scripted-user.mjs';
import { isDeepStrictEqual } from 'node:util';

export function canonicalAskInputMatches(actual, expected) {
  return isDeepStrictEqual(actual?.questions, expected?.questions);
}

export function planHeadlessDecision(selectedCase, candidate, answered = new Set()) {
  if (!candidate || typeof candidate.question !== 'string' || !Array.isArray(candidate.options) || candidate.options.length < 2) {
    throw new Error('headless decision requires a valid Clarify question candidate');
  }
  const toolInput = {
    questions: [{
      question: candidate.question,
      header: candidate.header,
      options: candidate.options.map(({ id, label, description }) => ({
        label: id === candidate.recommendedOption ? `${label} (Recommended)` : label,
        description,
      })),
      multiSelect: false,
    }],
  };
  const candidateText = [candidate.question, candidate.decisionNeeded,
    ...candidate.options.flatMap(({ label, description }) => [label, description])].join(' ');
  const scripted = answerBusinessQuestion(selectedCase, candidateText, answered);
  let displayedAnswer = scripted.answer;
  let selectedOptionId = 'other';
  if (candidate.decisionType !== 'clarify-answer') {
    const selected = candidate.options.find(({ id }) => id === candidate.recommendedOption);
    if (!selected) throw new Error('governance candidate requires a valid recommended option');
    displayedAnswer = `${selected.label} (Recommended)`;
    selectedOptionId = selected.id;
  } else if (!scripted.unmatched) {
    const matchingOptions = candidate.options.filter(({ label, description }) => scripted.answeredFactIds.every((factId) => {
      const fact = selectedCase.requiredFacts.find(({ id }) => id === factId);
      return fact && new RegExp(fact.acceptancePattern, 'iu').test(`${label} ${description}`);
    }));
    if (matchingOptions.length === 1) {
      const selected = matchingOptions[0];
      displayedAnswer = selected.id === candidate.recommendedOption ? `${selected.label} (Recommended)` : selected.label;
      selectedOptionId = selected.id;
    }
  }
  return {
    toolInput,
    toolResponse: { answers: { [candidate.question]: displayedAnswer } },
    question: candidate.question,
    answer: displayedAnswer,
    businessAnswer: scripted.answer,
    answeredFactIds: scripted.answeredFactIds,
    unmatched: scripted.unmatched,
    repeated: scripted.repeated,
    decisionType: candidate.decisionType,
    selectedOptionId,
    questionId: candidate.questionId,
  };
}
