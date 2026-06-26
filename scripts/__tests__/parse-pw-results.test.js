'use strict';
const assert = require('assert');
const { parsePlaywrightJSON, parsePlaywrightOutputText } = require('../parse-pw-results');

// 기본 케이스: 단일 브라우저, 일부 실패 + flaky + steps
const mockPWOutput = {
  config: {
    projects: [
      { name: 'chromium' },
      { name: 'webkit' },
      { name: 'firefox' },
    ],
  },
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
              projectName: 'webkit',
              status: 'unexpected',
              results: [
                {
                  status: 'failed',
                  duration: 18700,
                  retry: 0,
                  error: { message: 'Expected visible' },
                  steps: [
                    { title: 'login' },
                    { title: 'navigate /cart' },
                    { title: 'click checkout' },
                    { title: 'fill card form' },
                    { title: 'click submit', error: { message: 'Expected visible' } },
                  ],
                  attachments: [
                    { name: 'screenshot', contentType: 'image/png', path: '/tmp/screenshot.png' },
                    { name: 'video',      contentType: 'video/webm', path: '/tmp/video.webm' },
                    { name: 'trace',      contentType: 'application/zip', path: '/tmp/trace.zip' },
                  ],
                },
              ],
            },
            {
              projectName: 'chromium',
              status: 'expected',
              results: [{ status: 'passed', duration: 4200, retry: 0, steps: [], attachments: [] }],
            },
            {
              projectName: 'firefox',
              status: 'expected',
              results: [{ status: 'passed', duration: 4100, retry: 0, steps: [], attachments: [] }],
            },
          ],
        },
        {
          title: '장바구니 추가',
          line: 10,
          tests: [
            {
              projectName: 'chromium',
              status: 'flaky',
              results: [
                { status: 'failed', duration: 1200, retry: 0, steps: [], attachments: [] },
                { status: 'passed', duration: 1100, retry: 1, steps: [], attachments: [] },
              ],
            },
            {
              projectName: 'webkit',
              status: 'expected',
              results: [{ status: 'passed', duration: 1300, retry: 0, steps: [], attachments: [] }],
            },
            {
              projectName: 'firefox',
              status: 'expected',
              results: [{ status: 'passed', duration: 1100, retry: 0, steps: [], attachments: [] }],
            },
          ],
        },
      ],
      suites: [],
    },
  ],
  stats: {
    startTime: '2026-05-09T10:00:00.000Z',
    duration: 222500,
    expected: 5,
    unexpected: 1,
    flaky: 1,
    skipped: 0,
  },
};

const result = parsePlaywrightJSON(mockPWOutput, 'ca-admin', '2026-05-09');

// === 기존 필드 (호환성) ===
assert.strictEqual(result.project, 'ca-admin', 'project');
assert.strictEqual(result.type, 'e2e', 'parsed result must mark its type as e2e');
assert.strictEqual(result.date, '2026-05-09', 'date');
assert.strictEqual(result.status, 'failed', 'status');
assert.strictEqual(result.total, 7, 'total = expected + unexpected + flaky + skipped');
assert.strictEqual(result.passed, 5, 'passed = expected (first-pass only); flaky tracked separately');
assert.strictEqual(result.failed, 1, 'failed = unexpected');
assert.strictEqual(result.flaky, 1, 'flaky count');
assert.strictEqual(result.duration, '3분 42초', 'duration format');

// === 확장 failures: browser, steps, failedStepIdx ===
assert.strictEqual(result.failures.length, 1, '1 failure (flaky는 제외)');
assert.strictEqual(result.failures[0].test, '결제 완료 플로우');
assert.strictEqual(result.failures[0].file, 'checkout.spec.ts');
assert.strictEqual(result.failures[0].line, 84);
assert.strictEqual(result.failures[0].error, 'Expected visible');
assert.strictEqual(result.failures[0].browser, 'webkit', 'browser from projectName');
assert.deepStrictEqual(
  result.failures[0].steps,
  ['login', 'navigate /cart', 'click checkout', 'fill card form', 'click submit'],
  'steps array'
);
assert.strictEqual(result.failures[0].failedStepIdx, 4, 'last failed step index');
assert.deepStrictEqual(
  result.failures[0].attachments.map(a => a.name),
  ['screenshot', 'video', 'trace'],
  'attachment names preserved'
);
assert.deepStrictEqual(
  result.failures[0].attachments.map(a => a.url ?? null),
  [null, null, null],
  'without options, attachments have no url'
);

// === Attachment URL 재매핑 (attachmentsBase / urlBase 옵션) ===
const remappedInput = {
  config: { projects: [{ name: 'chromium' }] },
  suites: [{
    title: 'login.spec.ts',
    file: 'login.spec.ts',
    specs: [{
      title: '로그인 실패',
      line: 12,
      tests: [{
        projectName: 'chromium',
        status: 'unexpected',
        results: [{
          status: 'failed',
          duration: 1000,
          retry: 0,
          error: { message: 'Boom' },
          steps: [{ title: 'click', error: { message: 'Boom' } }],
          attachments: [
            { name: 'screenshot', contentType: 'image/png', path: '/work/test-results/login-fail/test-failed-1.png' },
            { name: 'video',      contentType: 'video/webm', path: '/work/test-results/login-fail/video.webm' },
            { name: 'error-context', contentType: 'text/markdown', path: '/work/test-results/login-fail/error-context.md' },
            { name: 'trace',      contentType: 'application/zip', path: '/work/test-results/login-fail/trace.zip' },
            { name: 'inline-only', contentType: 'text/plain', body: 'aGVsbG8=' },
            { name: 'outside',    contentType: 'image/png', path: '/elsewhere/foo.png' },
          ],
        }],
      }],
    }],
    suites: [],
  }],
  stats: { duration: 1000, expected: 0, unexpected: 1, flaky: 0, skipped: 0 },
};
const remapped = parsePlaywrightJSON(remappedInput, 'biz-admin', '2026-05-21', {
  attachmentsBase: '/work/test-results',
  urlBase: '/results/biz-admin/e2e/attachments/2026-05-21',
});
const remappedAtt = remapped.failures[0].attachments;
assert.strictEqual(remappedAtt[0].url, '/results/biz-admin/e2e/attachments/2026-05-21/login-fail/test-failed-1.png', 'screenshot url remapped');
assert.strictEqual(remappedAtt[1].url, '/results/biz-admin/e2e/attachments/2026-05-21/login-fail/video.webm', 'video url remapped');
assert.strictEqual(remappedAtt[2].url, '/results/biz-admin/e2e/attachments/2026-05-21/login-fail/error-context.md', 'error-context url remapped');
assert.strictEqual(remappedAtt[3].url, '/results/biz-admin/e2e/attachments/2026-05-21/login-fail/trace.zip', 'trace url remapped');
assert.strictEqual(remappedAtt[4].url ?? null, null, 'inline-only attachment without path → no url');
assert.strictEqual(remappedAtt[5].url ?? null, null, 'path outside attachmentsBase → no url');

// === Browsers 매트릭스 ===
assert.strictEqual(result.browsers.length, 3, '3 browsers');
const chromium = result.browsers.find(b => b.id === 'chromium');
assert.strictEqual(chromium.name, 'Chromium');
assert.strictEqual(chromium.icon, 'CR');
assert.strictEqual(chromium.passed, 1, 'chromium passed = expected only');
assert.strictEqual(chromium.failed, 0);
assert.strictEqual(chromium.flaky, 1, 'chromium flaky tracked separately');
assert.strictEqual(chromium.total, 2);
const webkit = result.browsers.find(b => b.id === 'webkit');
assert.strictEqual(webkit.failed, 1, 'webkit had 1 unexpected');
assert.strictEqual(webkit.passed, 1);
assert.strictEqual(webkit.flaky, 0);

// === Flaky tests ===
assert.strictEqual(result.flakyTests.length, 1);
assert.strictEqual(result.flakyTests[0].test, '장바구니 추가');
assert.strictEqual(result.flakyTests[0].file, 'checkout.spec.ts');
assert.strictEqual(result.flakyTests[0].line, 10);
assert.strictEqual(result.flakyTests[0].retries, 1, 'max retry count');

// === Slow tests Top 5 ===
assert.ok(result.slowTests.length >= 1 && result.slowTests.length <= 5);
assert.strictEqual(result.slowTests[0].test, '결제 완료 플로우', 'slowest first');
assert.strictEqual(result.slowTests[0].durationMs, 18700);
assert.strictEqual(result.slowTests[0].file, 'checkout.spec.ts');

// === 통과만 한 케이스 ===
const passed = parsePlaywrightJSON(
  {
    config: { projects: [{ name: 'chromium' }] },
    suites: [],
    stats: { duration: 135000, expected: 50, unexpected: 0, flaky: 0, skipped: 0 },
  },
  'proj', '2026-05-09'
);
assert.strictEqual(passed.status, 'passed');
assert.strictEqual(passed.duration, '2분 15초');
assert.strictEqual(passed.failures.length, 0);
assert.strictEqual(passed.flakyTests.length, 0);
assert.strictEqual(passed.slowTests.length, 0);
assert.strictEqual(passed.browsers.length, 1);

const parsedWithLeadingLog = parsePlaywrightOutputText(
  `◇ injected env (0) from .env.test.local\n${JSON.stringify({
    config: { projects: [{ name: 'chromium' }] },
    suites: [],
    stats: { duration: 1000, expected: 1, unexpected: 0, flaky: 0, skipped: 0 },
  })}`,
  'scm-front'
);
assert.strictEqual(parsedWithLeadingLog.stats.expected, 1, 'leading stdout logs before JSON should be ignored');

const parsedWithBracedLeadingLog = parsePlaywrightOutputText(
  `◇ injected env (0) from .env.test.local // tip: custom filepath { path: '/custom/path/.env' }\n${JSON.stringify({
    config: { projects: [{ name: 'chromium' }] },
    suites: [],
    stats: { duration: 1000, expected: 2, unexpected: 0, flaky: 0, skipped: 0 },
  })}`,
  'scm-front'
);
assert.strictEqual(parsedWithBracedLeadingLog.stats.expected, 2, 'braces in leading logs should be ignored');

// === 실행 자체가 실패한 케이스: webServer 시작 실패 등 top-level errors ===
// Playwright가 테스트를 한 개도 못 돌리면 suites:[]/stats 0이지만 errors[]에 사유가 담긴다.
// 이를 'passed'로 오인하면 안 되고 'error'로 표시하며 사유를 노출해야 한다.
const webServerFail = parsePlaywrightJSON(
  {
    config: { projects: [{ name: 'chromium' }] },
    suites: [],
    errors: [
      { message: 'Error: Process from config.webServer was not able to start. Exit code: 1' },
    ],
    stats: { duration: 71480, expected: 0, unexpected: 0, flaky: 0, skipped: 0 },
  },
  'scm-front', '2026-06-25'
);
assert.strictEqual(webServerFail.status, 'error', 'top-level errors → status error (not passed)');
assert.strictEqual(webServerFail.total, 0, 'no tests collected');
assert.ok(
  /webServer/.test(webServerFail.error || ''),
  'error message surfaced from raw.errors'
);

// === 에러는 없지만 0개 수집된 케이스: 의미 있는 통과가 아니므로 error로 표시 ===
const zeroCollected = parsePlaywrightJSON(
  {
    config: { projects: [{ name: 'chromium' }] },
    suites: [],
    stats: { duration: 500, expected: 0, unexpected: 0, flaky: 0, skipped: 0 },
  },
  'scm-front', '2026-06-25'
);
assert.strictEqual(zeroCollected.status, 'error', '0개 수집 → status error (not passed)');
assert.ok((zeroCollected.error || '').length > 0, '0개 수집 사유 노출');

console.log('✅ All parse-pw-results tests passed');
