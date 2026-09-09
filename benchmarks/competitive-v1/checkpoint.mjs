export function hasFinalUserQuestion(text) {
  const lines = String(text || '').split(/\r?\n/u).map((line) => (
    line.trim().replace(/^(?:[-*#>]+\s*)+/u, '').replace(/\*+/gu, '').trim()
  )).filter(Boolean);
  const finalLine = lines.at(-1) || '';
  if (!/[？?]\s*$/u.test(finalLine)) return false;
  return /^(?:请|你|您|哪|什么|如何|是否)/u.test(finalLine)
    || /^(?:when|which|what|how|should|would|will|do|does|did|is|are|can|could)\b/iu.test(finalLine);
}
