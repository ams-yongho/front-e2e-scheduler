'use strict';

const assert = require('assert');
const { buildSummaryMessage, validateDashboardUrl } = require('../slack-notify');

const projects = ['ca-admin', 'typist', 'cv-view'];
const resultsByProject = new Map([
  ['ca-admin', {
    project: 'ca-admin',
    date: '2026-05-11',
    status: 'passed',
    total: 50,
    passed: 50,
    failed: 0,
    duration: '3분 42초',
    failures: [],
  }],
  ['typist', {
    project: 'typist',
    date: '2026-05-11',
    status: 'failed',
    total: 50,
    passed: 47,
    failed: 3,
    duration: '2분 10초',
    failures: [
      { file: 'checkout.spec.ts', test: '결제 완료 플로우', line: 84 },
    ],
  }],
]);

const message = buildSummaryMessage({
  date: '2026-05-11',
  projects,
  resultsByProject,
  dashboardUrl: 'http://172.17.2.240:8080',
});

assert.ok(message.includes('[E2E 테스트 전체 결과] 2026-05-11'));
assert.ok(message.includes('❌ 1/3 프로젝트 통과 | 총 97/100 통과 | 실패 3건'));
assert.ok(message.includes('- ✅ ca-admin: 50/50 통과 | 실패 0건 | 3분 42초'));
assert.ok(message.includes('- ❌ typist: 47/50 통과 | 실패 3건 | 2분 10초'));
assert.ok(message.includes('- ❌ cv-view: 결과 없음'));
assert.ok(message.endsWith('대시보드: http://172.17.2.240:8080'), 'summary must end with externally reachable dashboard link');

assert.strictEqual(
  validateDashboardUrl('http://172.17.2.240:8080'),
  'http://172.17.2.240:8080'
);
assert.throws(
  () => validateDashboardUrl('http://localhost:8080'),
  /DASHBOARD_URL must be reachable by Slack recipients/
);
assert.throws(
  () => validateDashboardUrl(''),
  /DASHBOARD_URL is required/
);

assert.ok(!message.includes('실패 목록:'), 'summary must not include failure detail heading');
assert.ok(!message.includes('checkout.spec.ts'), 'summary must not include failure file detail');
assert.ok(!message.includes('결제 완료 플로우'), 'summary must not include failure test detail');

console.log('✅ All slack-notify tests passed');
