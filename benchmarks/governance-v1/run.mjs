#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const benchmarkDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(benchmarkDir, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(benchmarkDir, 'cases.json'), 'utf8'));

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function gitHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function runCase(kind, item) {
  const started = process.hrtime.bigint();
  const result = spawnSync(process.execPath, [path.join(repoRoot, item.test), 'verify'], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, NO_COLOR: '1' },
  });
  const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  return {
    id: item.id,
    kind,
    claim: item.claim,
    test: item.test,
    assertion: item.assertion,
    observed: result.status === 0 ? (kind === 'failure' ? 'rejected-as-required' : 'accepted-as-required') : 'benchmark-failed',
    pass: result.status === 0,
    exitCode: result.status,
    durationMs: Math.round(durationMs),
    stdoutSha256: digest(stdout),
    stderrSha256: digest(stderr),
    stdoutTail: stdout.trim().split('\n').slice(-2),
    stderrTail: stderr.trim().split('\n').slice(-2),
  };
}

const results = [
  ...manifest.failureCases.map((item) => runCase('failure', item)),
  ...manifest.successCases.map((item) => runCase('success', item)),
];
const failureResults = results.filter(({ kind }) => kind === 'failure');
const successResults = results.filter(({ kind }) => kind === 'success');
const report = {
  schemaVersion: 1,
  benchmark: 'enterprise-governance-failure-injection',
  generatedAt: new Date().toISOString(),
  gitCommit: gitHead(),
  scope: 'Enterprise Harness deterministic runtime only; this is not a competitor behavior score.',
  summary: {
    failureClassesRejected: failureResults.filter(({ pass }) => pass).length,
    failureClassesTotal: failureResults.length,
    validLifecyclesAccepted: successResults.filter(({ pass }) => pass).length,
    validLifecyclesTotal: successResults.length,
    allPassed: results.every(({ pass }) => pass),
  },
  results,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.summary.allPassed) process.exitCode = 1;
