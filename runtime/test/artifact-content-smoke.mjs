import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] || 'verify';
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-artifact-'));
const secondOut = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-artifact-repeat-'));
const extract = path.join(out, 'extract');
fs.mkdirSync(extract);

try {
  const packed = spawnSync(process.execPath, [path.join(root, 'bin', 'package.mjs'), '--out', out], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
  });
  assert.equal(packed.status, 0, packed.stderr);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
  const tarball = path.join(out, `enterprise-harness-${pkg.version}.tar.gz`);
  const unpacked = spawnSync('tar', ['-xzf', tarball, '-C', extract], {
    encoding: 'utf-8',
    shell: false,
  });
  assert.equal(unpacked.status, 0, unpacked.stderr);
  const manifest = JSON.parse(fs.readFileSync(path.join(extract, 'manifest-files.json'), 'utf-8'));
  const packageFiles = new Set(manifest.files.map((entry) => entry.path));
  const listed = packageFiles;
  const clarifySchemas = [
    'lane-applicability-input.schema.json',
    'question-candidate.schema.json',
    'decision-event.schema.json',
    'clarify-decision-snapshot.schema.json',
    'debt-assessment.schema.json',
    'project-contract-assessment.schema.json',
    'classification.schema.json',
  ];
  for (const name of clarifySchemas) {
    assert.ok(packageFiles.has(`harness/schemas/${name}`), `package omits ${name}`);
  }
  for (const required of [
    '.claude-plugin/plugin.json',
    'skills/harness/SKILL.md',
    'skills/harness/references/clarify-research.md',
    'skills/harness/references/clarify-decisions.md',
    'skills/harness/references/clarify-completion.md',
    'skills/harness/references/output-contract.md',
    'skills/harness/references/clarify-few-shots.md',
    'skills/harness/assets/lane-applicability-input.json.tmpl',
    'hooks/hooks.json',
    'runtime/cli.mjs',
    'harness/templates/state.json',
    'harness/schemas/state.schema.json',
    'harness/capabilities.json',
    'bin/enterprise-harness.mjs',
    'package.json',
    'CHANGELOG.md',
    '.mcp.json',
  ]) {
    assert.equal(listed.has(required), true, `artifact must contain ${required}`);
  }

  // plugin.json is the installer's contract. Anything it points at must actually
  // ship, or the capability silently disappears for installed users — .mcp.json
  // was declared but unpackaged, so plugin users got no codegraph MCP tools and
  // exploration degraded to raw grep with nothing reporting it.
  const pluginManifest = JSON.parse(fs.readFileSync(path.join(extract, '.claude-plugin/plugin.json'), 'utf-8'));
  const declared = [
    ...(pluginManifest.skills || []),
    ...(pluginManifest.agents || []),
    ...(typeof pluginManifest.mcpServers === 'string' ? [pluginManifest.mcpServers] : []),
  ];
  for (const target of declared) {
    const relative = target.replace(/^\.\//u, '').replace(/\/$/u, '');
    const present = listed.has(relative) || [...listed].some((file) => file.startsWith(`${relative}/`));
    assert.equal(present, true, `plugin.json declares ${target} but the artifact does not ship it`);
  }
  for (const forbidden of [
    'harness/ACTIVE_CHANGE',
    'harness/evidence-policy.json',
    'harness/command-policy.json',
    'PROGRESS.md',
    'runtime/.bootstrap-ran',
  ]) {
    assert.equal(listed.has(forbidden), false, `artifact must exclude ${forbidden}`);
  }
  assert.equal(
    [...listed].some((file) => /^skills\/harness\/evals\//u.test(file)),
    false,
    'Harness development evals must not ship in the plugin artifact',
  );
  assert.equal(
    [...listed].some((file) => /^node_modules\//u.test(file)),
    false,
    'Development-only dependencies must not ship in the plugin artifact',
  );
  // Shipped runtime must not hardcode paths from this repo's own demo service.
  // A checker that silently returns [] when those paths are absent reports zero
  // findings on every real target project while looking like it passed.
  for (const entry of manifest.files) {
    if (!/^runtime\/.*\.mjs$/u.test(entry.path)) continue;
    const text = fs.readFileSync(path.join(extract, entry.path), 'utf-8');
    assert.equal(
      /reference-service/u.test(text),
      false,
      `${entry.path} hardcodes reference-service paths, which do not exist in a target project`,
    );
    assert.equal(
      /(?:from|import\()\s*['"]ajv(?:\/|['"])/u.test(text),
      false,
      `${entry.path} imports the development-only JSON Schema validator`,
    );
  }

  assert.equal(
    [...listed].some((file) => /^(?:harness\/(?:archive|changes|work|lessons)|runtime\/test)\//u.test(file)),
    false,
  );
  for (const entry of manifest.files) {
    const content = fs.readFileSync(path.join(extract, entry.path));
    assert.equal(content.length, entry.size);
    assert.equal(crypto.createHash('sha256').update(content).digest('hex'), entry.sha256);
  }
  const sums = fs.readFileSync(path.join(out, 'SHA256SUMS'), 'utf-8').trim();
  const expected = crypto.createHash('sha256').update(fs.readFileSync(tarball)).digest('hex');
  assert.equal(sums, `${expected}  ${path.basename(tarball)}`);
  const repeated = spawnSync(process.execPath, [path.join(root, 'bin', 'package.mjs'), '--out', secondOut], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
  });
  assert.equal(repeated.status, 0, repeated.stderr);
  const repeatedTarball = path.join(secondOut, path.basename(tarball));
  const repeatedDigest = crypto.createHash('sha256').update(fs.readFileSync(repeatedTarball)).digest('hex');
  assert.equal(repeatedDigest, expected, 'same source state must produce the same tarball digest');
  console.log(`PASS artifact-content ${mode}`);
} finally {
  fs.rmSync(out, { recursive: true, force: true });
  fs.rmSync(secondOut, { recursive: true, force: true });
}
