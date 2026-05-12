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

function assertProjectRow(payload, projectLabel, resultText) {
  const projectSections = payload.blocks.filter(block =>
    block.type === 'section' && Array.isArray(block.fields)
  );
  const found = projectSections.some(section => {
    return section.fields.some((field, index) => {
      const nextField = section.fields[index + 1];
      return field.type === 'mrkdwn' &&
        field.text === projectLabel &&
        nextField &&
        nextField.type === 'mrkdwn' &&
        nextField.text === resultText;
    });
  });
  assert.ok(found, `missing project row: ${projectLabel} / ${resultText}`);
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

const payload = buildSummaryMessage({
  date: '2026-05-11',
  projects,
  resultsByProject,
  dashboardUrl: 'http://172.17.2.240:8080',
});

const serializedPayload = JSON.stringify(payload);

assert.strictEqual(typeof payload.text, 'string');
assert.ok(payload.text.includes('[E2E 테스트 전체 결과] 2026-05-11'));
assert.ok(payload.text.includes('❌ 1/3 프로젝트 통과 | 총 97/100 통과 | 실패 3건'));
assert.ok(Array.isArray(payload.blocks), 'summary payload must include Block Kit blocks');

assert.deepStrictEqual(payload.blocks[0], {
  type: 'header',
  text: {
    type: 'plain_text',
    text: 'E2E 테스트 전체 결과 · 2026-05-11',
    emoji: true,
  },
});

const summarySection = payload.blocks.find(block =>
  block.type === 'section' &&
  block.fields &&
  block.fields.some(field => field.type === 'mrkdwn' && field.text.includes('*프로젝트 통과*'))
);
assert.ok(summarySection, 'summary fields section should exist');
assert.ok(hasMarkdownField(summarySection, '*프로젝트 통과*\n1 / 3'));
assert.ok(hasMarkdownField(summarySection, '*테스트 통과*\n97 / 100'));
assert.ok(hasMarkdownField(summarySection, '*실패*\n3건'));
assert.ok(hasMarkdownField(summarySection, '*총 소요시간*\n5분 52초'));

assertProjectRow(payload, '*✅ ca-admin*', '50/50 통과 · 실패 0건 · 3분 42초');
assertProjectRow(payload, '*❌ typist*', '47/50 통과 · 실패 3건 · 2분 10초');
assertProjectRow(payload, '*❌ cv-view*', '결과 없음');

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
fs.mkdirSync(path.join(resultsDir, 'ca-admin'), { recursive: true });
fs.mkdirSync(path.join(resultsDir, 'scm-front'), { recursive: true });
fs.writeFileSync(path.join(resultsDir, 'ca-admin', '2026-05-11.json'), JSON.stringify({
  project: 'ca-admin',
  date: '2026-05-11',
  status: 'passed',
  total: 1,
  passed: 1,
  failed: 0,
  duration: '1초',
}));
fs.writeFileSync(path.join(resultsDir, 'scm-front', '2026-05-11.json'), '');

const readableResults = readResultsByProject(['ca-admin', 'scm-front'], resultsDir, '2026-05-11');
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
