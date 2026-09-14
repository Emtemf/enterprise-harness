function normalize(value) {
  return String(value || '').replaceAll(/\s+/gu, ' ').trim();
}

export function answerBusinessQuestion(selectedCase, question, alreadyAnswered = new Set()) {
  const normalized = normalize(question);
  const allMatches = selectedCase.requiredFacts.filter((fact) => new RegExp(fact.questionPattern, 'iu').test(normalized));
  const matches = allMatches.filter((fact) => !alreadyAnswered.has(fact.id));
  if (matches.length === 0 && allMatches.length > 0) {
    return {
      answer: allMatches.map(({ answer }) => answer).join('\n'),
      answeredFactIds: [],
      unmatched: false,
      repeated: true,
    };
  }
  if (matches.length === 0) {
    return {
      answer: selectedCase.unmatchedAnswer || '这个问题不在本次变更范围内，保持现有行为；若现有系统没有定义，则不在本次新增规则。请继续询问最关键的未决项。',
      answeredFactIds: [],
      unmatched: true,
      repeated: false,
    };
  }
  return {
    answer: matches.map(({ answer }) => answer).join('\n'),
    answeredFactIds: matches.map(({ id }) => id),
    unmatched: false,
    repeated: false,
  };
}

export function extractQuestionFromStream(events, resultText = '') {
  const toolQuestions = events.flatMap((event) => event.type === 'assistant'
    ? (event.message?.content || []).filter((block) => block.type === 'tool_use' && /AskUserQuestion/iu.test(block.name || ''))
      .flatMap((block) => (block.input?.questions || []).map((item) => item.question).filter(Boolean))
    : []);
  if (toolQuestions.length > 0) return normalize(toolQuestions.at(-1));
  const candidates = String(resultText || '').split(/\r?\n/u).flatMap((raw, index) => {
    const withoutQuote = raw.replace(/^\s*>\s?/u, '');
    if (/^\s*(?:[-+*]|[A-ZＡ-Ｚ][.)、．])\s+/u.test(withoutQuote) || /^\s*\|/u.test(withoutQuote)) return [];
    const content = withoutQuote.replace(/^\s*[#]+\s*/u, '').replaceAll('*', '').trim();
    if (!/[？?]/u.test(content)) return [];
    const score = (/^\s*>/u.test(raw) ? 4 : 0) + (/\*\*/u.test(raw) ? 2 : 0) + (content.length >= 12 ? 1 : 0);
    return [{ content, score, index }];
  });
  if (candidates.length === 0) return null;
  const line = [...candidates].sort((left, right) => left.score - right.score || left.index - right.index).at(-1).content;
  const questionEnd = Math.max(line.lastIndexOf('？'), line.lastIndexOf('?'));
  const throughQuestion = line.slice(0, questionEnd + 1);
  const separator = Math.max(throughQuestion.lastIndexOf('：'), throughQuestion.lastIndexOf(':'));
  return normalize(separator >= 0 ? throughQuestion.slice(separator + 1) : throughQuestion);
}
