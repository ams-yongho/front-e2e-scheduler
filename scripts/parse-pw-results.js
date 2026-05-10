#!/usr/bin/env node
'use strict';

const BROWSER_META = {
  chromium: { name: 'Chromium', icon: 'CR' },
  webkit:   { name: 'WebKit',   icon: 'WK' },
  firefox:  { name: 'Firefox',  icon: 'FF' },
};

function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;
}

function browserMeta(id) {
  return BROWSER_META[id] || { name: id, icon: id.slice(0, 2).toUpperCase() };
}

function* iterSpecs(suites) {
  for (const suite of suites || []) {
    for (const spec of suite.specs || []) {
      yield { suite, spec };
    }
    yield* iterSpecs(suite.suites);
  }
}

function lastFailedStepIdx(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return -1;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i] && steps[i].error) return i;
  }
  return steps.length - 1;
}

function collectFailures(suites) {
  const failures = [];
  for (const { suite, spec } of iterSpecs(suites)) {
    for (const test of spec.tests || []) {
      if (test.status !== 'unexpected') continue;
      const failedResult = (test.results || []).find(r => r.status === 'failed') || {};
      const steps = (failedResult.steps || []).map(s => s.title);
      failures.push({
        test: spec.title,
        file: suite.file || suite.title,
        line: spec.line || 0,
        error: failedResult.error?.message || '',
        browser: test.projectName || '',
        steps,
        failedStepIdx: lastFailedStepIdx(failedResult.steps || []),
        attachments: (failedResult.attachments || []).map(a => ({
          name: a.name,
          contentType: a.contentType || '',
        })),
      });
    }
  }
  return failures;
}

function collectFlakyTests(suites) {
  const flaky = [];
  for (const { suite, spec } of iterSpecs(suites)) {
    for (const test of spec.tests || []) {
      if (test.status !== 'flaky') continue;
      const retries = (test.results || []).reduce(
        (max, r) => Math.max(max, r.retry || 0), 0
      );
      flaky.push({
        test: spec.title,
        file: suite.file || suite.title,
        line: spec.line || 0,
        retries,
      });
    }
  }
  return flaky;
}

function collectSlowTests(suites, limit = 5) {
  const all = [];
  for (const { suite, spec } of iterSpecs(suites)) {
    for (const test of spec.tests || []) {
      const lastResult = (test.results || []).slice(-1)[0];
      if (!lastResult) continue;
      all.push({
        test: spec.title,
        file: suite.file || suite.title,
        durationMs: lastResult.duration || 0,
      });
    }
  }
  return all.sort((a, b) => b.durationMs - a.durationMs).slice(0, limit);
}

function collectBrowsers(raw) {
  const projectNames = (raw.config?.projects || []).map(p => p.name);
  const counts = {};
  for (const id of projectNames) {
    counts[id] = { id, ...browserMeta(id), passed: 0, failed: 0, flaky: 0, skipped: 0, total: 0 };
  }
  for (const { spec } of iterSpecs(raw.suites)) {
    for (const test of spec.tests || []) {
      const id = test.projectName || 'unknown';
      if (!counts[id]) counts[id] = { id, ...browserMeta(id), passed: 0, failed: 0, flaky: 0, skipped: 0, total: 0 };
      counts[id].total += 1;
      if (test.status === 'unexpected') counts[id].failed += 1;
      else if (test.status === 'expected') counts[id].passed += 1;
      else if (test.status === 'flaky') counts[id].flaky += 1;
      else if (test.status === 'skipped') counts[id].skipped += 1;
    }
  }
  return Object.values(counts);
}

function parsePlaywrightJSON(raw, projectName, date) {
  const stats = raw.stats || {};
  const expected = stats.expected || 0;
  const unexpected = stats.unexpected || 0;
  const flaky = stats.flaky || 0;
  const skipped = stats.skipped || 0;
  return {
    project: projectName,
    date,
    status: unexpected > 0 ? 'failed' : 'passed',
    total: expected + unexpected + flaky + skipped,
    passed: expected,
    failed: unexpected,
    flaky,
    skipped,
    duration: formatDuration(stats.duration || 0),
    browsers: collectBrowsers(raw),
    failures: collectFailures(raw.suites),
    flakyTests: collectFlakyTests(raw.suites),
    slowTests: collectSlowTests(raw.suites),
  };
}

if (require.main === module) {
  const [,, pwOutputFile, projectName, date] = process.argv;
  const text = require('fs').readFileSync(pwOutputFile, 'utf8');
  if (text.trim() === '') {
    console.error(`[parse-pw-results] Empty Playwright output for ${projectName} (${pwOutputFile}). Likely cause: e2e command failed before producing JSON.`);
    process.exit(2);
  }
  const raw = JSON.parse(text);
  console.log(JSON.stringify(parsePlaywrightJSON(raw, projectName, date), null, 2));
}

module.exports = { parsePlaywrightJSON };
