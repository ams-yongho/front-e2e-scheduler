'use strict';

const assert = require('assert');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const {
  buildSummaryMessage,
  readResultsByProject,
  sendSlackMessage,
  validateDashboardUrl,
} = require('../slack-notify');

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

function hasMarkdownField(section, text) {
  return section.fields.some(field => field.type === 'mrkdwn' && field.text === text);
}

function assertContainsField(payload, text) {
  const found = payload.blocks.some(block =>
    block.type === 'section' && Array.isArray(block.fields) &&
    block.fields.some(f => f.text === text)
  );
  assert.ok(found, `missing field: ${text}`);
}

async function captureSlackBody(message) {
  const originalRequest = https.request;
  let capturedBody = '';
  let capturedOptions;

  https.request = (options, callback) => {
    capturedOptions = options;
    const req = new EventEmitter();
    req.write = chunk => {
      capturedBody += chunk;
    };
    req.end = () => {
      const res = new EventEmitter();
      res.statusCode = 200;
      callback(res);
    };
    return req;
  };

  try {
    await sendSlackMessage('https://hooks.slack.com/services/T/B/C?x=1', message);
  } finally {
    https.request = originalRequest;
  }

  return { capturedOptions, body: JSON.parse(capturedBody) };
}

const e2eByProject = resultsByProject;
const unitByProject = new Map();
const testsByProject = Object.fromEntries(projects.map(p => [p, ['e2e']]));

const payload = buildSummaryMessage({
  date: '2026-05-11',
  projects,
  e2eByProject,
  unitByProject,
  testsByProject,
  dashboardUrl: 'http://172.17.2.240:8080',
});

const serializedPayload = JSON.stringify(payload);

assert.strictEqual(typeof payload.text, 'string');
assert.ok(payload.text.includes('[테스트 전체 결과] 2026-05-11'));
assert.ok(Array.isArray(payload.blocks), 'summary payload must include Block Kit blocks');

assert.deepStrictEqual(payload.blocks[0], {
  type: 'header',
  text: {
    type: 'plain_text',
    text: '테스트 전체 결과 · 2026-05-11',
    emoji: true,
  },
});

const summarySection = payload.blocks.find(block =>
  block.type === 'section' &&
  block.fields &&
  block.fields.some(field => field.type === 'mrkdwn' && field.text.includes('*E2E 프로젝트 통과*'))
);
assert.ok(summarySection, 'summary fields section should exist');
assert.ok(hasMarkdownField(summarySection, '*E2E 프로젝트 통과*\n1 / 3'));
assert.ok(hasMarkdownField(summarySection, '*E2E 테스트 통과*\n97 / 100'));
assert.ok(hasMarkdownField(summarySection, '*E2E 실패*\n3건'));
assert.ok(hasMarkdownField(summarySection, '*E2E 소요시간*\n5분 52초'));

assertContainsField(payload, '*✅ ca-admin*');
assertContainsField(payload, 'E2E 50/50 · Unit - · 3분 42초');
assertContainsField(payload, '*❌ typist*');
assertContainsField(payload, 'E2E 47/50 · Unit - · 2분 10초');
assertContainsField(payload, '*❌ cv-view*');
assertContainsField(payload, 'E2E 결과 없음 · Unit - · -');

const actionsBlock = payload.blocks.find(block => block.type === 'actions');
assert.ok(actionsBlock, 'dashboard action block should exist');
assert.deepStrictEqual(actionsBlock.elements[0], {
  type: 'button',
  text: {
    type: 'plain_text',
    text: '대시보드 열기',
    emoji: true,
  },
  url: 'http://172.17.2.240:8080',
  action_id: 'open_dashboard',
});

assert.ok(!serializedPayload.includes('실패 목록:'), 'summary must not include failure detail heading');
assert.ok(!serializedPayload.includes('checkout.spec.ts'), 'summary must not include failure file detail');
assert.ok(!serializedPayload.includes('결제 완료 플로우'), 'summary must not include failure test detail');

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

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slack-notify-'));
const resultsDir = path.join(tempDir, 'results');
fs.mkdirSync(path.join(resultsDir, 'ca-admin', 'e2e'), { recursive: true });
fs.mkdirSync(path.join(resultsDir, 'scm-front', 'e2e'), { recursive: true });
fs.writeFileSync(path.join(resultsDir, 'ca-admin', 'e2e', '2026-05-11.json'), JSON.stringify({
  project: 'ca-admin',
  date: '2026-05-11',
  status: 'passed',
  total: 1,
  passed: 1,
  failed: 0,
  duration: '1초',
}));
fs.writeFileSync(path.join(resultsDir, 'scm-front', 'e2e', '2026-05-11.json'), '');

const readableResults = readResultsByProject(['ca-admin', 'scm-front'], resultsDir, '2026-05-11', 'e2e');
assert.ok(readableResults.has('ca-admin'), 'valid result should be included');
assert.ok(!readableResults.has('scm-front'), 'empty result should be skipped');

(async () => {
  const plainMessage = await captureSlackBody('plain text');
  assert.deepStrictEqual(plainMessage.body, { text: 'plain text' });
  assert.strictEqual(plainMessage.capturedOptions.hostname, 'hooks.slack.com');
  assert.strictEqual(plainMessage.capturedOptions.path, '/services/T/B/C?x=1');
  assert.strictEqual(plainMessage.capturedOptions.method, 'POST');

  const blockPayload = { text: 'fallback', blocks: [{ type: 'divider' }] };
  const blockMessage = await captureSlackBody(blockPayload);
  assert.deepStrictEqual(blockMessage.body, blockPayload);

  console.log('✅ All slack-notify tests passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});

// === Unit 통합 시나리오 ===
{
  const projectsIntegrated = ['ca-admin', 'biz-admin', 'typist'];
  const e2eMap = new Map([
    ['ca-admin', { project: 'ca-admin', type: 'e2e', date: '2026-05-21', status: 'passed', total: 21, passed: 19, failed: 0, skipped: 2, duration: '41초', failures: [] }],
    ['biz-admin', { project: 'biz-admin', type: 'e2e', date: '2026-05-21', status: 'failed', total: 160, passed: 69, failed: 18, skipped: 0, duration: '1분 12초', failures: [] }],
  ]);
  const unitMap = new Map([
    ['ca-admin', { project: 'ca-admin', type: 'unit', date: '2026-05-21', status: 'passed', framework: 'vitest', total: 120, passed: 118, failed: 0, skipped: 2, duration: '12초', failures: [] }],
    ['biz-admin', { project: 'biz-admin', type: 'unit', date: '2026-05-21', status: 'passed', framework: 'vitest', total: 410, passed: 410, failed: 0, skipped: 0, duration: '18초', failures: [] }],
  ]);
  const testsByProject = { 'ca-admin': ['e2e', 'unit'], 'biz-admin': ['e2e', 'unit'], 'typist': ['e2e'] };

  const message = buildSummaryMessage({
    date: '2026-05-21',
    projects: projectsIntegrated,
    e2eByProject: e2eMap,
    unitByProject: unitMap,
    testsByProject,
    dashboardUrl: 'http://example.com:8080',
  });

  // 두 개의 Summary 섹션이 있어야 함 (E2E, Unit)
  const summaryTexts = message.blocks
    .filter(b => b.type === 'section' && Array.isArray(b.fields))
    .flatMap(b => b.fields.map(f => f.text));
  assert.ok(summaryTexts.some(t => t.includes('E2E') && t.includes('프로젝트 통과')), 'missing E2E summary');
  assert.ok(summaryTexts.some(t => t.includes('Unit') && t.includes('프로젝트 통과')), 'missing Unit summary');

  // 프로젝트 줄에 두 타입 모두 표기
  assert.ok(summaryTexts.some(t => t === 'E2E 19/21 · Unit 118/120 · 41초 + 12초'),
    `ca-admin combined row missing. saw: ${summaryTexts.filter(t => t.startsWith('E2E')).join(' | ')}`);

  // typist는 unit 미등록 → Unit -
  assert.ok(summaryTexts.some(t => t.includes('Unit -')),
    `typist Unit - missing. saw: ${summaryTexts.filter(t => t.startsWith('E2E') || t.includes('typist')).join(' | ')}`);

  // 종합 헤더는 'E2E 테스트' 대신 '테스트 전체 결과'
  const header = message.blocks.find(b => b.type === 'header');
  assert.strictEqual(header.text.text, '테스트 전체 결과 · 2026-05-21');

  console.log('✅ buildSummaryMessage: integrated e2e+unit');
}
