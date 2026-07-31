import assert from 'node:assert/strict';
import process from 'node:process';
import { insertReleaseHeading } from '../../bin/changelog-heading.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const base = ['# Changelog', '', '## [Unreleased]', '', '## [0.2.9] - 2026-07-01', '', '- Older.', ''].join('\n');
const failures = [];
function check(desc, fn) {
  try {
    fn();
  } catch (error) {
    failures.push(`${desc}: ${error.message}`);
  }
}

const countHeadings = (text, version) => (
  text.split(/\r?\n/u).filter((line) => line.startsWith(`## [${version}]`)).length
);

check('A: inserts a heading when the version is absent', () => {
  const result = insertReleaseHeading(base, '0.3.0', '2026-07-31');
  assert.equal(countHeadings(result, '0.3.0'), 1);
  assert.match(result, /## \[Unreleased\]\n\n## \[0\.3\.0\] - 2026-07-31\n/u);
});

check('B: a hand-written section is not duplicated', () => {
  const handWritten = base.replace(
    '## [Unreleased]\n',
    '## [Unreleased]\n\n## [0.3.0] - 2026-07-31\n\n### Fixed\n\n- Hand-written entry.\n',
  );
  const result = insertReleaseHeading(handWritten, '0.3.0', '2026-07-31');
  assert.equal(countHeadings(result, '0.3.0'), 1, 'existing heading must not be duplicated');
  assert.match(result, /Hand-written entry/u);
});

check('C: an existing heading is preserved verbatim even when the date differs', () => {
  const handWritten = base.replace('## [Unreleased]\n', '## [Unreleased]\n\n## [0.3.0] - 2026-07-30\n');
  const result = insertReleaseHeading(handWritten, '0.3.0', '2026-07-31');
  assert.equal(countHeadings(result, '0.3.0'), 1);
  assert.match(result, /## \[0\.3\.0\] - 2026-07-30/u);
});

check('D: a different version still gets its own heading', () => {
  const handWritten = base.replace('## [Unreleased]\n', '## [Unreleased]\n\n## [0.3.0] - 2026-07-31\n');
  const result = insertReleaseHeading(handWritten, '0.3.1', '2026-08-01');
  assert.equal(countHeadings(result, '0.3.1'), 1);
  assert.equal(countHeadings(result, '0.3.0'), 1);
});

if (failures.length > 0) {
  console.error('changelog-heading-smoke failed.');
  for (const item of failures) console.error(`  - ${item}`);
  process.exit(1);
}
console.log(`PASS changelog-heading ${mode}`);
