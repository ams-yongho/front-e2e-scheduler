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
