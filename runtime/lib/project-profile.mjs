import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_PROJECT_PROFILE = Object.freeze({
  profileVersion: 1,
  language: 'java',
  build: 'maven',
  productionRoots: ['src/main/java'],
  testRoots: ['src/test/java'],
  apiRoots: ['openapi'],
  productionPaths: ['**/src/main/java/**'],
  testPaths: ['**/src/test/java/**'],
  apiPaths: ['**/openapi/**'],
});

function assertStringArray(value, field) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`EH-PROJECT-PROFILE-001: ${field} must be a non-empty string array`);
  }
  return value.map((item) => item.trim());
}

export function validateProjectProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error('EH-PROJECT-PROFILE-001: profile must be an object');
  }
  if (profile.profileVersion !== 1) {
    throw new Error('EH-PROJECT-PROFILE-001: unsupported profileVersion');
  }
  if (typeof profile.language !== 'string' || !profile.language.trim()) {
    throw new Error('EH-PROJECT-PROFILE-001: language is required');
  }
  if (typeof profile.build !== 'string' || !profile.build.trim()) {
    throw new Error('EH-PROJECT-PROFILE-001: build is required');
  }
  return Object.freeze({
    profileVersion: profile.profileVersion,
    language: profile.language.trim(),
    build: profile.build.trim(),
    productionRoots: Object.freeze(assertStringArray(profile.productionRoots, 'productionRoots')),
    testRoots: Object.freeze(assertStringArray(profile.testRoots, 'testRoots')),
    apiRoots: Object.freeze(assertStringArray(profile.apiRoots, 'apiRoots')),
    productionPaths: Object.freeze(assertStringArray(profile.productionPaths, 'productionPaths')),
    testPaths: Object.freeze(assertStringArray(profile.testPaths, 'testPaths')),
    apiPaths: Object.freeze(assertStringArray(profile.apiPaths, 'apiPaths')),
  });
}

export function loadProjectProfile(root, options = {}) {
  const profilePath = options.profilePath || path.join(root, 'harness', 'project.json');
  if (!fs.existsSync(profilePath)) return validateProjectProfile(DEFAULT_PROJECT_PROFILE);
  let profile;
  try {
    profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
  } catch (error) {
    throw new Error(`EH-PROJECT-PROFILE-001: cannot parse ${profilePath}: ${error.message}`);
  }
  return validateProjectProfile(profile);
}

export function profileRoots(root, kind, options = {}) {
  const profile = loadProjectProfile(root, options);
  const field = kind === 'main' ? 'productionRoots' : kind === 'test' ? 'testRoots' : 'apiRoots';
  return profile[field];
}
