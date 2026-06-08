'use strict';

const assert = require('assert');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const {
  buildProjectTableBlocks,
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

const tableText1 = payload.blocks
  .filter(b => b.type === 'section' && b.text && typeof b.text.text === 'string' && b.text.text.startsWith('```'))
  .map(b => b.text.text).join('\n');
const lineOf1 = name => tableText1.split('\n').find(l => l.includes(name));
assert.ok(lineOf1('ca-admin').startsWith('✅') && lineOf1('ca-admin').includes('50/50'), 'ca-admin 행');
assert.ok(lineOf1('typist').startsWith('⚠️') && lineOf1('typist').includes('47/50'), 'typist 행 (일부 실패 → ⚠️)');
assert.ok(lineOf1('cv-view').startsWith('❌') && lineOf1('cv-view').includes('결과 없음'), 'cv-view 행 (결과 없음 → ❌)');

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

  // 집계 요약 섹션은 여전히 fields 로 존재 (E2E, Unit)
  const summaryTexts = message.blocks
    .filter(b => b.type === 'section' && Array.isArray(b.fields))
    .flatMap(b => b.fields.map(f => f.text));
  assert.ok(summaryTexts.some(t => t.includes('E2E') && t.includes('프로젝트 통과')), 'missing E2E summary');
  assert.ok(summaryTexts.some(t => t.includes('Unit') && t.includes('프로젝트 통과')), 'missing Unit summary');

  // 프로젝트 영역은 도표 테이블(코드블록)로 렌더
  const tableText = message.blocks
    .filter(b => b.type === 'section' && b.text && typeof b.text.text === 'string' && b.text.text.startsWith('```'))
    .map(b => b.text.text).join('\n');
  const lineOf = name => tableText.split('\n').find(l => l.includes(name));
  assert.ok(tableText.includes('프로젝트') && tableText.includes('E2E') && tableText.includes('Unit'), '테이블 헤더 누락');
  assert.ok(lineOf('ca-admin').includes('19/21') && lineOf('ca-admin').includes('118/120'),
    `ca-admin row missing. saw: ${lineOf('ca-admin')}`);
  // typist 는 unit 미등록 → Unit 셀이 '-'
  assert.ok(lineOf('typist').trim().endsWith('-'),
    `typist Unit - missing. saw: ${lineOf('typist')}`);
  assert.ok(!tableText.includes('·'), '프로젝트 행에 소요시간 구분자(·)가 없어야 함');

  // 종합 헤더는 'E2E 테스트' 대신 '테스트 전체 결과'
  const header = message.blocks.find(b => b.type === 'header');
  assert.strictEqual(header.text.text, '테스트 전체 결과 · 2026-05-21');

  console.log('✅ buildSummaryMessage: integrated e2e+unit');
}

// --- 등록된 unit 인데 error/미수집이면 ❌ 로 집계 ---
{
  const { buildSummaryMessage } = require('../slack-notify');
  const projects = ['biz-mall'];
  const testsByProject = { 'biz-mall': ['unit'] };
  const e2eByProject = new Map();

  // (a) error 상태 결과
  const unitErr = new Map([['biz-mall', { project: 'biz-mall', type: 'unit', status: 'error', error: 'timeout', total: 0, passed: 0, failed: 0, duration: '-' }]]);
  const msgErr = buildSummaryMessage({
    date: '2026-05-27', projects, e2eByProject, unitByProject: unitErr,
    testsByProject, dashboardUrl: 'https://dash.example.com',
  });
  const flatErr = JSON.stringify(msgErr.blocks);
  assert.ok(/일부 실패/.test(flatErr), 'error 결과는 전체 상태를 실패로 만들어야 함');
  assert.ok(/수집 실패/.test(flatErr), '프로젝트 줄에 수집 실패 표시가 있어야 함');

  // (b) 결과 자체가 없는 경우(미수집)도 실패로 집계
  const unitMissing = new Map();
  const msgMissing = buildSummaryMessage({
    date: '2026-05-27', projects, e2eByProject, unitByProject: unitMissing,
    testsByProject, dashboardUrl: 'https://dash.example.com',
  });
  assert.ok(/일부 실패/.test(JSON.stringify(msgMissing.blocks)), '미수집 unit 도 실패로 집계해야 함');

  console.log('✅ slack summary: unit error/missing counts as failure');
}

// === 프로젝트 도표 테이블 ===
{
  // (a) 정확한 정렬 포맷 핀 (작은 픽스처)
  const e2e = new Map([['ca-admin', { project: 'ca-admin', type: 'e2e', status: 'passed', total: 21, passed: 19, failed: 0, duration: '41초' }]]);
  const unit = new Map([['ca-admin', { project: 'ca-admin', type: 'unit', status: 'passed', total: 120, passed: 118, failed: 0, duration: '12초' }]]);
  const tests = { 'ca-admin': ['e2e', 'unit'] };

  const blocks = buildProjectTableBlocks(['ca-admin'], e2e, unit, tests);
  assert.strictEqual(blocks.length, 1, '단일 청크여야 함');
  assert.strictEqual(blocks[0].type, 'section');
  assert.strictEqual(blocks[0].text.type, 'mrkdwn');
  assert.strictEqual(
    blocks[0].text.text,
    '```\n   프로젝트    E2E     Unit\n✅ ca-admin  19/21  118/120\n```'
  );

  // (b) 셀 규칙: 미등록 '-', 결과 없음, 수집 실패
  const projects = ['ca-admin', 'typist', 'scm-front', 'cv-view'];
  const e2e2 = new Map([
    ['ca-admin', { status: 'passed', total: 50, passed: 50 }],
    ['typist', { status: 'failed', total: 50, passed: 47 }],
    ['scm-front', { status: 'passed', total: 0, passed: 0 }],
  ]);
  const unit2 = new Map([
    ['ca-admin', { status: 'passed', total: 120, passed: 118 }],
    ['scm-front', { status: 'error', error: 'timeout' }],
  ]);
  const tests2 = {
    'ca-admin': ['e2e', 'unit'],
    'typist': ['e2e'],
    'scm-front': ['e2e', 'unit'],
    'cv-view': ['e2e'],
  };
  const text = buildProjectTableBlocks(projects, e2e2, unit2, tests2)
    .map(b => b.text.text).join('\n');
  const lineOf = name => text.split('\n').find(l => l.includes(name));

  assert.ok(text.includes('프로젝트') && text.includes('E2E') && text.includes('Unit'), '헤더 누락');
  assert.ok(lineOf('ca-admin').includes('50/50') && lineOf('ca-admin').includes('118/120'), 'ca-admin 셀');
  assert.ok(lineOf('typist').includes('47/50'), 'typist e2e 셀');
  assert.ok(lineOf('typist').trim().endsWith('-'), 'typist unit 미등록은 -');
  assert.ok(lineOf('scm-front').includes('수집 실패'), 'scm-front unit 수집 실패');
  assert.ok(lineOf('cv-view').includes('결과 없음'), 'cv-view e2e 결과 없음');
  assert.ok(!text.includes('·'), '프로젝트 행에 소요시간 구분자(·)가 없어야 함');

  console.log('✅ buildProjectTableBlocks: 정렬/셀 규칙');
}

// === 3단계 아이콘 (✅ / ⚠️ / ❌) ===
{
  const projects = ['allpass', 'partial', 'zerofail', 'missing', 'collecterr'];
  const e2e = new Map([
    ['allpass', { status: 'passed', total: 10, passed: 10, failed: 0 }],
    ['partial', { status: 'failed', total: 10, passed: 8, failed: 2 }],
    ['zerofail', { status: 'failed', total: 10, passed: 0, failed: 10 }],
    // 'missing' → e2e 결과 없음
    ['collecterr', { status: 'passed', total: 5, passed: 5, failed: 0 }],
  ]);
  const unit = new Map([
    ['allpass', { status: 'passed', total: 20, passed: 20, failed: 0 }],
    ['partial', { status: 'passed', total: 20, passed: 20, failed: 0 }],
    ['zerofail', { status: 'passed', total: 20, passed: 20, failed: 0 }],
    ['missing', { status: 'passed', total: 20, passed: 20, failed: 0 }],
    ['collecterr', { status: 'error', error: 'timeout' }],
  ]);
  const tests = {
    allpass: ['e2e', 'unit'],
    partial: ['e2e', 'unit'],
    zerofail: ['e2e', 'unit'],
    missing: ['e2e', 'unit'],
    collecterr: ['e2e', 'unit'],
  };
  const text = buildProjectTableBlocks(projects, e2e, unit, tests)
    .map(b => b.text.text).join('\n');
  const lineOf = name => text.split('\n').find(l => l.includes(name));

  assert.ok(lineOf('allpass').startsWith('✅'), '전부 통과 → ✅');
  assert.ok(lineOf('partial').startsWith('⚠️'), '일부 실패 → ⚠️');
  assert.ok(lineOf('zerofail').startsWith('❌'), '0건 통과 → ❌');
  assert.ok(lineOf('missing').startsWith('❌'), '결과 없음 → ❌');
  assert.ok(lineOf('collecterr').startsWith('❌'), '수집 실패 → ❌');

  // 전체 상태: partial 만 있으면 ⚠️ 일부 경고, catastrophic 있으면 ❌ 일부 실패
  const warnOnly = buildSummaryMessage({
    date: '2026-06-08',
    projects: ['allpass', 'partial'],
    e2eByProject: e2e,
    unitByProject: unit,
    testsByProject: tests,
    dashboardUrl: 'https://dash.example.com',
  });
  assert.ok(/⚠️ 일부 경고/.test(JSON.stringify(warnOnly.blocks)), 'partial 만 있으면 전체 ⚠️ 일부 경고');

  const hasFail = buildSummaryMessage({
    date: '2026-06-08',
    projects: ['allpass', 'partial', 'missing'],
    e2eByProject: e2e,
    unitByProject: unit,
    testsByProject: tests,
    dashboardUrl: 'https://dash.example.com',
  });
  assert.ok(/❌ 일부 실패/.test(JSON.stringify(hasFail.blocks)), 'catastrophic 있으면 전체 ❌ 일부 실패');

  console.log('✅ 3단계 아이콘 (✅ / ⚠️ / ❌)');
}
