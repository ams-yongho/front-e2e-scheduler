'use strict';
const assert = require('assert');
const { parseUnitResults, parseUnitOutputText } = require('../parse-unit-results');

const vitestPassedFixture = {
  numTotalTestSuites: 2,
  numPassedTestSuites: 2,
  numFailedTestSuites: 0,
  numTotalTests: 5,
  numPassedTests: 5,
  numFailedTests: 0,
  numPendingTests: 0,
  startTime: 1716257700000,
  success: true,
  testResults: [
    {
      name: '/abs/path/src/utils/price.test.ts',
      status: 'passed',
      startTime: 1716257700000,
      endTime: 1716257701200,
      assertionResults: [
        { fullName: 'formatPrice handles zero', title: 'handles zero', status: 'passed', duration: 5 },
        { fullName: 'formatPrice handles negative', title: 'handles negative', status: 'passed', duration: 3 },
      ],
    },
    {
      name: '/abs/path/src/utils/date.test.ts',
      status: 'passed',
      startTime: 1716257701200,
      endTime: 1716257702200,
      assertionResults: [
        { fullName: 'formatDate handles ISO', title: 'handles ISO', status: 'passed', duration: 1 },
        { fullName: 'formatDate handles Date object', title: 'handles Date object', status: 'passed', duration: 1 },
        { fullName: 'formatDate handles null', title: 'handles null', status: 'passed', duration: 1 },
      ],
    },
  ],
};

const result = parseUnitResults(vitestPassedFixture, 'ca-admin', '2026-05-21', { commandText: 'pnpm vitest run --reporter=json' });

assert.strictEqual(result.project, 'ca-admin');
assert.strictEqual(result.type, 'unit');
assert.strictEqual(result.date, '2026-05-21');
assert.strictEqual(result.status, 'passed');
assert.strictEqual(result.framework, 'vitest');
assert.strictEqual(result.total, 5);
assert.strictEqual(result.passed, 5);
assert.strictEqual(result.failed, 0);
assert.strictEqual(result.skipped, 0);
assert.strictEqual(result.duration, '2초');
assert.deepStrictEqual(result.failures, []);
assert.ok(Array.isArray(result.slowTests));

console.log('✅ parseUnitResults: vitest passed fixture');

// Jest 실패 픽스처
const jestFailedFixture = {
  numTotalTestSuites: 1,
  numPassedTestSuites: 0,
  numFailedTestSuites: 1,
  numTotalTests: 3,
  numPassedTests: 1,
  numFailedTests: 2,
  numPendingTests: 0,
  success: false,
  wasInterrupted: false,
  testResults: [
    {
      name: '/abs/path/src/utils/price.test.ts',
      status: 'failed',
      startTime: 1716257710000,
      endTime: 1716257711500,
      assertionResults: [
        { fullName: 'formatPrice handles zero', title: 'handles zero', status: 'passed', duration: 5 },
        {
          fullName: 'formatPrice handles negative', title: 'handles negative', status: 'failed', duration: 8,
          failureMessages: ['Expected -1000원 but got -1000'],
          location: { line: 14, column: 4 },
        },
        {
          fullName: 'formatPrice handles huge', title: 'handles huge', status: 'failed', duration: 1,
          failureMessages: ['Expected formatted but got NaN'],
          location: { line: 22, column: 4 },
        },
      ],
    },
  ],
};

const failedResult = parseUnitResults(jestFailedFixture, 'biz-admin', '2026-05-21', { commandText: 'pnpm jest --json' });
assert.strictEqual(failedResult.framework, 'jest');
assert.strictEqual(failedResult.status, 'failed');
assert.strictEqual(failedResult.total, 3);
assert.strictEqual(failedResult.passed, 1);
assert.strictEqual(failedResult.failed, 2);
assert.strictEqual(failedResult.failures.length, 2);
assert.strictEqual(failedResult.failures[0].test, 'formatPrice handles negative');
assert.strictEqual(failedResult.failures[0].file, '/abs/path/src/utils/price.test.ts');
assert.strictEqual(failedResult.failures[0].line, 14);
assert.ok(failedResult.failures[0].error.includes('Expected -1000원'));

console.log('✅ parseUnitResults: jest failed fixture');

// commandText 없이 raw 마커로 식별
const vitestNoCmd = parseUnitResults(vitestPassedFixture, 'x', '2026-05-21');
assert.strictEqual(vitestNoCmd.framework, 'vitest');

const jestNoCmd = parseUnitResults(jestFailedFixture, 'x', '2026-05-21');
assert.strictEqual(jestNoCmd.framework, 'jest');

// 어느 마커도 없는 경우
const ambiguous = parseUnitResults({ numTotalTests: 0, numPassedTests: 0, numFailedTests: 0, numPendingTests: 0, testResults: [] }, 'x', '2026-05-21');
assert.strictEqual(ambiguous.framework, 'unknown');

console.log('✅ parseUnitResults: framework auto-detect');

// 혼합 stdout: 디버그 로그 + JSON
const mixed = `> pnpm vitest run --reporter=json\n` +
  `(node:1234) ExperimentalWarning: blah\n` +
  `${JSON.stringify(vitestPassedFixture)}\n`;
const parsedMixed = parseUnitOutputText(mixed, 'ca-admin');
assert.strictEqual(parsedMixed.numTotalTests, 5);

// 완전히 깨진 입력 → throw
assert.throws(() => parseUnitOutputText('not json at all', 'ca-admin'));

// CLI: 빈 파일 입력 시 exit code 2
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const emptyFile = path.join(os.tmpdir(), `unit-empty-${Date.now()}.json`);
fs.writeFileSync(emptyFile, '', 'utf8');
const cli = spawnSync(process.execPath, [path.resolve(__dirname, '../parse-unit-results.js'), emptyFile, 'ca-admin', '2026-05-21', 'pnpm vitest'], { encoding: 'utf8' });
fs.rmSync(emptyFile, { force: true });
assert.strictEqual(cli.status, 2, `CLI must exit 2 on empty input, got ${cli.status}\nstderr: ${cli.stderr}`);
assert.ok(/Empty unit output/.test(cli.stderr));

console.log('✅ parseUnitResults: defensive empty + mixed stdout');

