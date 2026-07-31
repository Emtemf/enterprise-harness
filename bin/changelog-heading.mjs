// Inserts a release heading under [Unreleased]. Maintainers often write the section by hand
// before releasing, so an existing heading for this version is left alone rather than
// duplicated — every hand-written release before 0.3.2 ended up with a doubled heading.
export function insertReleaseHeading(changelog, version, releaseDate) {
  const heading = `## [${version}]`;
  if (new RegExp(`^${heading.replace(/[[\]]/gu, '\\$&')}`, 'mu').test(changelog)) return changelog;
  return changelog.replace('## [Unreleased]\n', `## [Unreleased]\n\n${heading} - ${releaseDate}\n`);
}
