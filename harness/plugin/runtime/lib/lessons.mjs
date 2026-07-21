import fs from 'node:fs';
import path from 'node:path';

// 从 harness/lessons/INDEX.md 的 marker 区间读取教训条目。
// 返回 [{ id, severity, tags }]，供 session-start 等消费方按严重度过滤。
export function readLessonIndex(root) {
  const indexFile = path.join(root, 'harness', 'lessons', 'INDEX.md');
  if (!fs.existsSync(indexFile)) return [];
  const raw = fs.readFileSync(indexFile, 'utf-8');
  const begin = '<!-- LESSONS:BEGIN -->';
  const end = '<!-- LESSONS:END -->';
  const b = raw.indexOf(begin);
  const e = raw.indexOf(end);
  if (b === -1 || e === -1 || e < b) return [];
  const middle = raw.slice(b + begin.length, e);
  return middle
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => {
      // 格式：`- <id> — <severity> — <tags>`
      const parts = line.slice(2).split('—').map((p) => p.trim());
      return { id: parts[0] || '', severity: parts[1] || '', tags: parts[2] || '' };
    })
    .filter((entry) => entry.id.length > 0);
}

// 仅返回高严重度教训，session-start 用它把最该避免重复的坑推到上下文最前。
export function highSeverityLessons(root) {
  return readLessonIndex(root).filter((entry) => entry.severity === 'high');
}
