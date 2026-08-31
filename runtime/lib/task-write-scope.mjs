function isSafeScopePattern(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || value.includes('\\')) return false;
  if (value.startsWith('/') || /^[A-Za-z]:/u.test(value)) return false;
  const base = value.endsWith('/**') ? value.slice(0, -3) : value;
  return base.length > 0 && !base.split('/').some((part) => part === '' || part === '.' || part === '..');
}

function matches(pattern, relativePath) {
  if (pattern.endsWith('/**')) {
    const base = pattern.slice(0, -3);
    return relativePath === base || relativePath.startsWith(`${base}/`);
  }
  return relativePath === pattern;
}

export function validateTaskWriteScope(scope) {
  const problems = [];
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return ['task write scope is missing'];
  if (!Array.isArray(scope.allowed) || scope.allowed.length === 0 || scope.allowed.some((item) => !isSafeScopePattern(item))) {
    problems.push('task write scope allowed must contain safe repo-relative paths');
  }
  if (!Array.isArray(scope.forbidden) || scope.forbidden.some((item) => !isSafeScopePattern(item))) {
    problems.push('task write scope forbidden must contain only safe repo-relative paths');
  }
  if (Array.isArray(scope.allowed) && Array.isArray(scope.forbidden)
      && scope.allowed.some((item) => scope.forbidden.includes(item))) {
    problems.push('task write scope cannot allow and forbid the same path');
  }
  return [...new Set(problems)];
}

export function taskWriteScopeViolations(changedPaths, scope) {
  const problems = validateTaskWriteScope(scope);
  if (problems.length > 0) return problems;
  const violations = [];
  for (const relativePath of changedPaths || []) {
    if (scope.forbidden.some((pattern) => matches(pattern, relativePath))) {
      violations.push(`${relativePath} matches a forbidden write scope`);
      continue;
    }
    if (!scope.allowed.some((pattern) => matches(pattern, relativePath))) {
      violations.push(`${relativePath} is outside the allowed write scope`);
    }
  }
  return violations;
}
