'use strict';
const assert = require('assert');
const { parsePlaywrightJSON } = require('../parse-pw-results');

const mockPWOutput = {
  suites: [
    {
      title: 'checkout.spec.ts',
      file: 'checkout.spec.ts',
      specs: [
        {
          title: '결제 완료 플로우',
          line: 84,
          tests: [
            {
              status: 'unexpected',
              results: [{ status: 'failed', error: { message: 'Expected visible' } }],
            },
          ],
        },
        {
          title: '장바구니 추가',
          line: 10,
          tests: [{ status: 'expected', results: [{ status: 'passed' }] }],
        },
      ],
      suites: [],
    },
  ],
  stats: {
    startTime: '2026-05-08T10:00:00.000Z',
    duration: 222500,
    expected: 47,
    unexpected: 3,
    skipped: 0,
  },
};

const result = parsePlaywrightJSON(mockPWOutput, 'ca-admin', '2026-05-08');

assert.strictEqual(result.project, 'ca-admin', 'project name');
assert.strictEqual(result.date, '2026-05-08', 'date');
assert.strictEqual(result.status, 'failed', 'status when unexpected > 0');
assert.strictEqual(result.total, 50, 'total = expected + unexpected + skipped');
assert.strictEqual(result.passed, 47, 'passed = expected');
assert.strictEqual(result.failed, 3, 'failed = unexpected');
assert.strictEqual(result.skipped, 0, 'skipped');
assert.strictEqual(result.duration, '3분 42초', 'duration format');
assert.strictEqual(result.failures.length, 1, 'one failure extracted');
assert.deepStrictEqual(result.failures[0], {
  test: '결제 완료 플로우',
  file: 'checkout.spec.ts',
  line: 84,
  error: 'Expected visible',
}, 'failure shape');

// 전부 통과한 경우
const passed = parsePlaywrightJSON(
  { suites: [], stats: { duration: 135000, expected: 50, unexpected: 0, skipped: 0 } },
  'proj', '2026-05-08'
);
assert.strictEqual(passed.status, 'passed', 'status when no failures');
assert.strictEqual(passed.duration, '2분 15초', 'duration under 60min');

console.log('✅ All parse-pw-results tests passed');
