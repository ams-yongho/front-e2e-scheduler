#!/usr/bin/env node
'use strict';

const path = require('path');

function remapAttachmentUrl(attachmentPath, attachmentsBase, urlBase) {
  if (!attachmentPath || !attachmentsBase || !urlBase) return undefined;
  const absBase = path.resolve(attachmentsBase);
  const absPath = path.resolve(attachmentPath);
  const rel = path.relative(absBase, absPath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return undefined;
  const relUrl = rel.split(path.sep).join('/');
  return `${urlBase.replace(/\/+$/, '')}/${relUrl}`;
}

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

function collectFailures(suites, options = {}) {
  const { attachmentsBase, urlBase } = options;
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
        attachments: (failedResult.attachments || []).map(a => {
          const att = {
            name: a.name,
            contentType: a.contentType || '',
          };
          const url = remapAttachmentUrl(a.path, attachmentsBase, urlBase);
          if (url) att.url = url;
          return att;
        }),
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

function parsePlaywrightJSON(raw, projectName, date, options = {}) {
  const stats = raw.stats || {};
  const expected = stats.expected || 0;
  const unexpected = stats.unexpected || 0;
  const flaky = stats.flaky || 0;
  const skipped = stats.skipped || 0;
  return {
    project: projectName,
    type: 'e2e',
    date,
    status: unexpected > 0 ? 'failed' : 'passed',
    total: expected + unexpected + flaky + skipped,
    passed: expected,
    failed: unexpected,
    flaky,
    skipped,
    duration: formatDuration(stats.duration || 0),
    browsers: collectBrowsers(raw),
    failures: collectFailures(raw.suites, options),
    flakyTests: collectFlakyTests(raw.suites),
    slowTests: collectSlowTests(raw.suites),
  };
}

function parsePlaywrightOutputText(text, projectName = 'unknown') {
  try {
    return JSON.parse(text);
  } catch (err) {
    const starts = [];
    const lineStartJson = /^[\t ]*\{/gm;
    let match;
    while ((match = lineStartJson.exec(text)) !== null) {
      starts.push(match.index + match[0].lastIndexOf('{'));
    }

    for (const jsonStart of starts) {
      const jsonEnd = text.lastIndexOf('}');
      if (jsonEnd < jsonStart) continue;
      try {
        console.error(`[parse-pw-results] Ignoring non-JSON stdout around Playwright JSON for ${projectName}`);
        return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
      } catch {
        // Try the next line-start JSON candidate.
      }
    }

    throw err;
  }
}

if (require.main === module) {
  const [,, pwOutputFile, projectName, date, attachmentsBase, urlBase] = process.argv;
  const text = require('fs').readFileSync(pwOutputFile, 'utf8');
  if (text.trim() === '') {
    const stderrLog = pwOutputFile.replace(/\.json$/, '.stderr.log');
    console.error(`[parse-pw-results] Empty Playwright output for ${projectName} (${pwOutputFile}). Likely cause: e2e command failed before producing JSON.`);
    console.error(`[parse-pw-results] Check stderr log for the underlying error: ${stderrLog}`);
    process.exit(2);
  }
  const raw = parsePlaywrightOutputText(text, projectName);
  const options = (attachmentsBase && urlBase) ? { attachmentsBase, urlBase } : {};
  console.log(JSON.stringify(parsePlaywrightJSON(raw, projectName, date, options), null, 2));
}

module.exports = { parsePlaywrightJSON, parsePlaywrightOutputText };
