function normalize(value) {
  return String(value || '').replaceAll(/\s+/gu, ' ').trim();
}

export function answerBusinessQuestion(selectedCase, question, alreadyAnswered = new Set()) {
  const normalized = normalize(question);
  const matches = selectedCase.requiredFacts.filter((fact) => !alreadyAnswered.has(fact.id)
    && new RegExp(fact.questionPattern, 'iu').test(normalized));
  if (matches.length === 0) {
    return {
      answer: '这个问题没有对应到预设业务事实。请说明它影响的业务规则，并继续询问最关键的未决项。',
      answeredFactIds: [],
      unmatched: true,
    };
  }
  return {
    answer: matches.map(({ answer }) => answer).join('\n'),
    answeredFactIds: matches.map(({ id }) => id),
    unmatched: false,
  };
}

export function extractQuestionFromStream(events, resultText = '') {
  const toolQuestions = events.flatMap((event) => event.type === 'assistant'
    ? (event.message?.content || []).filter((block) => block.type === 'tool_use' && /AskUserQuestion/iu.test(block.name || ''))
      .flatMap((block) => (block.input?.questions || []).map((item) => item.question).filter(Boolean))
    : []);
  if (toolQuestions.length > 0) return normalize(toolQuestions.at(-1));
  const lines = normalize(resultText).split(/(?<=[？?])\s+/u).filter((line) => /[？?]$/u.test(line));
  return lines.at(-1) || null;
}
