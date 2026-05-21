#!/usr/bin/env node
'use strict';

const fs = require('fs');

function formatDuration(ms) {
  const safeMs = Math.max(0, Math.round(ms));
  const minutes = Math.floor(safeMs / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;
}

function detectFramework({ commandText, raw }) {
  if (typeof commandText === 'string') {
    if (/\bvitest\b/i.test(commandText)) return 'vitest';
    if (/\bjest\b/i.test(commandText)) return 'jest';
  }
  if (raw && typeof raw === 'object') {
    if (raw.wasInterrupted !== undefined || raw.snapshot) return 'jest';
    if (raw.startTime && Array.isArray(raw.testResults)) return 'vitest';
  }
  return 'unknown';
}

function iterAssertionResults(raw) {
  const out = [];
  for (const suite of raw.testResults || []) {
    for (const assertion of suite.assertionResults || []) {
      out.push({ suite, assertion });
    }
  }
  return out;
}

function collectFailures(raw) {
  const failures = [];
  for (const { suite, assertion } of iterAssertionResults(raw)) {
    if (assertion.status !== 'failed') continue;
    const messages = Array.isArray(assertion.failureMessages) ? assertion.failureMessages : [];
    failures.push({
      test: assertion.fullName || assertion.title || '',
      file: suite.name || '',
      line: assertion.location?.line || 0,
      error: messages.join('\n').trim(),
    });
  }
  return failures;
}

function collectSlowTests(raw, limit = 5) {
  const all = [];
  for (const { suite, assertion } of iterAssertionResults(raw)) {
    if (typeof assertion.duration !== 'number') continue;
    all.push({
      test: assertion.fullName || assertion.title || '',
      file: suite.name || '',
      durationMs: assertion.duration,
    });
  }
  return all.sort((a, b) => b.durationMs - a.durationMs).slice(0, limit);
}

function totalDurationMs(raw) {
  if (Array.isArray(raw.testResults) && raw.testResults.length > 0) {
    return raw.testResults.reduce((sum, suite) => {
      if (typeof suite.endTime === 'number' && typeof suite.startTime === 'number') {
        return sum + Math.max(0, suite.endTime - suite.startTime);
      }
      return sum;
    }, 0);
  }
  return 0;
}

function parseUnitResults(raw, projectName, date, { commandText } = {}) {
  const total = raw.numTotalTests || 0;
  const passed = raw.numPassedTests || 0;
  const failed = raw.numFailedTests || 0;
  const skipped = raw.numPendingTests || 0;
  const framework = detectFramework({ commandText, raw });
  return {
    project: projectName,
    type: 'unit',
    date,
    status: failed > 0 ? 'failed' : 'passed',
    framework,
    total,
    passed,
    failed,
    skipped,
    duration: formatDuration(totalDurationMs(raw)),
    failures: collectFailures(raw),
    slowTests: collectSlowTests(raw),
  };
}

function parseUnitOutputText(text, projectName = 'unknown') {
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
        console.error(`[parse-unit-results] Ignoring non-JSON stdout around unit JSON for ${projectName}`);
        return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
      } catch {
        // try next candidate
      }
    }
    throw err;
  }
}

if (require.main === module) {
  const [,, outputFile, projectName, date, commandText] = process.argv;
  const text = fs.readFileSync(outputFile, 'utf8');
  if (text.trim() === '') {
    const stderrLog = outputFile.replace(/\.json$/, '.stderr.log');
    console.error(`[parse-unit-results] Empty unit output for ${projectName} (${outputFile}). Likely cause: unit command failed before producing JSON.`);
    console.error(`[parse-unit-results] Check stderr log: ${stderrLog}`);
    process.exit(2);
  }
  const raw = parseUnitOutputText(text, projectName);
  console.log(JSON.stringify(parseUnitResults(raw, projectName, date, { commandText }), null, 2));
}

module.exports = { parseUnitResults, parseUnitOutputText, detectFramework };
