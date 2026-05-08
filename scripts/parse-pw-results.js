#!/usr/bin/env node
'use strict';

function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;
}

function collectFailures(suites) {
  const failures = [];
  for (const suite of suites || []) {
    for (const spec of suite.specs || []) {
      const isUnexpected = spec.tests?.some(t => t.status === 'unexpected');
      if (isUnexpected) {
        const failedResult = spec.tests
          ?.flatMap(t => t.results || [])
          ?.find(r => r.status === 'failed');
        failures.push({
          test: spec.title,
          file: suite.file || suite.title,
          line: spec.line || 0,
          error: failedResult?.error?.message || '',
        });
      }
    }
    failures.push(...collectFailures(suite.suites));
  }
  return failures;
}

function parsePlaywrightJSON(raw, projectName, date) {
  const { stats } = raw;
  const passed = stats.expected || 0;
  const failed = stats.unexpected || 0;
  const skipped = stats.skipped || 0;
  return {
    project: projectName,
    date,
    status: failed > 0 ? 'failed' : 'passed',
    total: passed + failed + skipped,
    passed,
    failed,
    skipped,
    duration: formatDuration(stats.duration || 0),
    failures: collectFailures(raw.suites),
  };
}

if (require.main === module) {
  const [,, pwOutputFile, projectName, date] = process.argv;
  const raw = JSON.parse(require('fs').readFileSync(pwOutputFile, 'utf8'));
  console.log(JSON.stringify(parsePlaywrightJSON(raw, projectName, date), null, 2));
}

module.exports = { parsePlaywrightJSON };
