#!/usr/bin/env node
'use strict';

const fs = require('fs');
const https = require('https');
const path = require('path');
const { URL } = require('url');

function buildSingleResultMessage(result) {
  const statusIcon = result.status === 'passed' ? '✅' : '❌';
  const lines = [
    `[E2E 테스트 결과] ${result.project}`,
    `${statusIcon} ${result.passed}/${result.total} 통과 | ❌ ${result.failed}건 실패 | ⏱ ${result.duration}`,
  ];

  if (Array.isArray(result.failures) && result.failures.length > 0) {
    lines.push('실패 목록:');
    for (const f of result.failures) {
      lines.push(`- ${f.file} > ${f.test} (${f.line}번째 줄)`);
    }
  }

  return lines.join('\n');
}

function validateDashboardUrl(dashboardUrl) {
  if (!dashboardUrl) {
    throw new Error('DASHBOARD_URL is required for Slack summary notifications');
  }

  const parsed = new URL(dashboardUrl);
  const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (localHosts.has(parsed.hostname)) {
    throw new Error('DASHBOARD_URL must be reachable by Slack recipients, not localhost');
  }

  return dashboardUrl;
}

function parseDurationSeconds(duration) {
  if (typeof duration !== 'string') return 0;

  let seconds = 0;
  const minutesMatch = duration.match(/(\d+)\s*분/);
  const secondsMatch = duration.match(/(\d+)\s*초/);

  if (minutesMatch) seconds += Number(minutesMatch[1]) * 60;
  if (secondsMatch) seconds += Number(secondsMatch[1]);

  return seconds;
}

function formatDurationSeconds(totalSeconds) {
  const safeSeconds = Number.isFinite(totalSeconds) ? totalSeconds : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  if (minutes === 0) return `${seconds}초`;
  return `${minutes}분 ${seconds}초`;
}

function plainText(text) {
  return { type: 'plain_text', text, emoji: true };
}

function markdownText(text) {
  return { type: 'mrkdwn', text };
}

function displayWidth(str) {
  let width = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0);
    // 변형 선택자(️ U+FE0F 등)와 ZWJ는 폭 0 — 앞 이모지에 결합되어 별도 칸을 차지하지 않음
    if ((code >= 0xFE00 && code <= 0xFE0F) || code === 0x200D) continue;
    const wide =
      (code >= 0x1100 && code <= 0x115F) ||  // Hangul Jamo
      (code >= 0x2300 && code <= 0x23FF) ||  // Misc Technical (⏸ 등)
      (code >= 0x2600 && code <= 0x27BF) ||  // Misc Symbols + Dingbats (✅ ❌ ⚠)
      (code >= 0x2E80 && code <= 0xA4CF) ||  // CJK 계열
      (code >= 0xAC00 && code <= 0xD7A3) ||  // Hangul Syllables
      (code >= 0xF900 && code <= 0xFAFF) ||  // CJK Compatibility
      (code >= 0xFE30 && code <= 0xFE4F) ||
      (code >= 0xFF00 && code <= 0xFF60) ||  // Fullwidth
      (code >= 0xFFE0 && code <= 0xFFE6) ||
      (code >= 0x1F000);                     // Emoji/Symbols
    width += wide ? 2 : 1;
  }
  return width;
}

function padEndW(text, width) {
  return text + ' '.repeat(Math.max(0, width - displayWidth(text)));
}

function padStartW(text, width) {
  return ' '.repeat(Math.max(0, width - displayWidth(text))) + text;
}

// 단일 테스트 타입 결과를 3단계로 분류
//  - 'clean'        : 실패 0 (전부 통과 / 테스트 없음)
//  - 'partial'      : 실패가 있지만 일부라도 통과
//  - 'catastrophic' : 결과 없음 / 수집 실패(error) / 0건 통과
function classifyTypeResult(result) {
  if (!result) return 'catastrophic';
  if (result.status === 'error') return 'catastrophic';
  const total = result.total || 0;
  const passed = result.passed || 0;
  const failed = result.failed != null ? result.failed : Math.max(0, total - passed);
  if (total > 0 && passed === 0) return 'catastrophic';
  if (failed > 0) return 'partial';
  return 'clean';
}

// 프로젝트 단위 종합 등급 (등록된 타입들 중 가장 나쁜 단계)
function projectTier(registered, e2e, unit) {
  const tiers = [];
  if (registered.includes('e2e')) tiers.push(classifyTypeResult(e2e));
  if (registered.includes('unit')) tiers.push(classifyTypeResult(unit));
  if (tiers.length === 0) return 'none';
  if (tiers.includes('catastrophic')) return 'catastrophic';
  if (tiers.includes('partial')) return 'partial';
  return 'clean';
}

const TIER_ICON = {
  clean: '✅',
  partial: '⚠️',
  catastrophic: '❌',
  none: '⚠️',
};

function calculateSummary(projects, resultsByProject) {
  return projects.reduce((summary, project) => {
    const result = resultsByProject.get(project);
    if (!result) return summary;

    if (result.status === 'passed') summary.passedProjects += 1;
    summary.passed += result.passed || 0;
    summary.total += result.total || 0;
    summary.failed += result.failed || 0;
    summary.durationSeconds += parseDurationSeconds(result.duration);

    return summary;
  }, {
    passedProjects: 0,
    passed: 0,
    total: 0,
    failed: 0,
    durationSeconds: 0,
  });
}

function buildProjectTableBlocks(projects, e2eByProject, unitByProject, testsByProject) {
  const rows = projects.map(project => {
    const registered = (testsByProject && testsByProject[project]) || [];
    const e2e = e2eByProject.get(project);
    const unit = unitByProject.get(project);

    const e2eCell = !registered.includes('e2e') ? '-'
      : !e2e ? '결과 없음'
      : `${e2e.passed}/${e2e.total}`;
    const unitCell = !registered.includes('unit') ? '-'
      : !unit ? '결과 없음'
      : unit.status === 'error' ? '수집 실패'
      : `${unit.passed}/${unit.total}`;

    const icon = TIER_ICON[projectTier(registered, e2e, unit)];

    return { icon, name: project, e2e: e2eCell, unit: unitCell };
  });

  const nameW = Math.max(displayWidth('프로젝트'), ...rows.map(r => displayWidth(r.name)), 0);
  const e2eW = Math.max(displayWidth('E2E'), ...rows.map(r => displayWidth(r.e2e)), 0);
  const unitW = Math.max(displayWidth('Unit'), ...rows.map(r => displayWidth(r.unit)), 0);

  const GAP = '  ';
  const ICON_PAD = '   '; // 아이콘(폭2) + 공백 = 3, 헤더는 아이콘이 없으므로 공백 3개로 맞춤
  const header = ICON_PAD + padEndW('프로젝트', nameW) + GAP + padStartW('E2E', e2eW) + GAP + padStartW('Unit', unitW);
  const renderRow = r => `${r.icon} ` + padEndW(r.name, nameW) + GAP + padStartW(r.e2e, e2eW) + GAP + padStartW(r.unit, unitW);

  const CHUNK = 40; // Block Kit text 3000자 제한 보호 (40행 ≈ 1.7KB)
  const blocks = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const table = [header, ...slice.map(renderRow)].join('\n');
    blocks.push({ type: 'section', text: markdownText('```\n' + table + '\n```') });
  }
  return blocks;
}

function buildSummaryMessage({ date, projects, e2eByProject, unitByProject, testsByProject, dashboardUrl }) {
  const externalDashboardUrl = validateDashboardUrl(dashboardUrl);

  const e2eEligible = projects.filter(p => (testsByProject?.[p] || ['e2e']).includes('e2e'));
  const unitEligible = projects.filter(p => (testsByProject?.[p] || []).includes('unit'));

  const e2eSummary = calculateSummary(e2eEligible, e2eByProject);
  const unitSummary = calculateSummary(unitEligible, unitByProject);

  // 전체 상태도 프로젝트와 동일한 3단계로 집계 (가장 나쁜 등급 기준)
  const tiers = projects.map(p =>
    projectTier(testsByProject?.[p] || [], e2eByProject.get(p), unitByProject.get(p))
  );
  const worst = tiers.includes('catastrophic') ? 'catastrophic'
    : tiers.includes('partial') ? 'partial'
    : 'clean';
  const summaryIcon = TIER_ICON[worst];
  const statusText = worst === 'catastrophic' ? '*❌ 일부 실패*'
    : worst === 'partial' ? '*⚠️ 일부 경고*'
    : '*✅ 전체 통과*';

  const e2eFields = [
    markdownText(`*E2E 프로젝트 통과*\n${e2eSummary.passedProjects} / ${e2eEligible.length}`),
    markdownText(`*E2E 테스트 통과*\n${e2eSummary.passed} / ${e2eSummary.total}`),
    markdownText(`*E2E 실패*\n${e2eSummary.failed}건`),
    markdownText(`*E2E 소요시간*\n${formatDurationSeconds(e2eSummary.durationSeconds)}`),
  ];
  const unitFields = [
    markdownText(`*Unit 프로젝트 통과*\n${unitSummary.passedProjects} / ${unitEligible.length}`),
    markdownText(`*Unit 테스트 통과*\n${unitSummary.passed} / ${unitSummary.total}`),
    markdownText(`*Unit 실패*\n${unitSummary.failed}건`),
    markdownText(`*Unit 소요시간*\n${formatDurationSeconds(unitSummary.durationSeconds)}`),
  ];

  const projectBlocks = buildProjectTableBlocks(projects, e2eByProject, unitByProject, testsByProject);

  const text = [
    `[테스트 전체 결과] ${date}`,
    `${summaryIcon} E2E ${e2eSummary.passed}/${e2eSummary.total} · Unit ${unitSummary.passed}/${unitSummary.total}`,
    `대시보드: ${externalDashboardUrl}`,
  ].join('\n');

  const blocks = [
    { type: 'header', text: plainText(`테스트 전체 결과 · ${date}`) },
    { type: 'section', text: markdownText(statusText) },
    { type: 'section', fields: e2eFields },
    { type: 'section', fields: unitFields },
    { type: 'divider' },
    ...projectBlocks,
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        { type: 'button', text: plainText('대시보드 열기'), url: externalDashboardUrl, action_id: 'open_dashboard' },
      ],
    },
  ];

  return { text, blocks };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readProjectNames(projectsDir) {
  return fs.readdirSync(projectsDir)
    .sort()
    .filter(dir => fs.existsSync(path.join(projectsDir, dir, 'config.json')))
    .map(dir => readJson(path.join(projectsDir, dir, 'config.json')).name);
}

function readResultsByProject(projects, resultsDir, date, type) {
  const map = new Map();
  for (const project of projects) {
    const file = path.join(resultsDir, project, type, `${date}.json`);
    if (fs.existsSync(file)) {
      try {
        map.set(project, readJson(file));
      } catch (err) {
        console.warn(`[WARN] Skipping unreadable ${type} result for ${project}: ${file} (${err.message})`);
      }
    }
  }
  return map;
}

function sendSlackMessage(webhookUrl, text) {
  const payload = typeof text === 'string' ? { text } : text;
  const body = JSON.stringify(payload);
  const parsed = new URL(webhookUrl);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: `${parsed.pathname}${parsed.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      res => {
        console.log(`Slack response: ${res.statusCode}`);
        if (res.statusCode !== 200) {
          reject(new Error(`Slack returned status ${res.statusCode}`));
          return;
        }
        resolve();
      }
    );

    req.on('error', err => reject(err));
    req.write(body);
    req.end();
  });
}

function usage() {
  return [
    'Usage:',
    '  slack-notify.js <results_file>',
    '  slack-notify.js --summary <date> <projects_dir> <results_dir>',
  ].join('\n');
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const webhookUrl = env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('[ERROR] SLACK_WEBHOOK_URL is not set');
    process.exitCode = 1;
    return;
  }

  let message;
  if (argv[0] === '--summary') {
    const [, date, projectsDir, resultsDir] = argv;
    if (!date || !projectsDir || !resultsDir) {
      console.error(usage());
      process.exitCode = 1;
      return;
    }
    const projects = readProjectNames(projectsDir);

    const testsByProject = {};
    for (const project of projects) {
      const cfgPath = path.join(projectsDir, project, 'config.json');
      let cfg = {};
      try { cfg = readJson(cfgPath); } catch { /* ignore */ }
      const types = [];
      if (typeof cfg.e2e_command === 'string' && cfg.e2e_command.length > 0) types.push('e2e');
      if (typeof cfg.unit_command === 'string' && cfg.unit_command.length > 0) types.push('unit');
      testsByProject[project] = types;
    }

    const e2eByProject = readResultsByProject(projects, resultsDir, date, 'e2e');
    const unitByProject = readResultsByProject(projects, resultsDir, date, 'unit');

    message = buildSummaryMessage({
      date,
      projects,
      e2eByProject,
      unitByProject,
      testsByProject,
      dashboardUrl: env.DASHBOARD_URL,
    });
  } else {
    const [resultsFile] = argv;
    if (!resultsFile) {
      console.error(usage());
      process.exitCode = 1;
      return;
    }
    message = buildSingleResultMessage(readJson(resultsFile));
  }

  await sendSlackMessage(webhookUrl, message);
}

if (require.main === module) {
  main().catch(err => {
    console.error('[ERROR] Slack notification failed:', err.message);
    process.exit(1);
  });
}

module.exports = {
  buildProjectTableBlocks,
  buildSingleResultMessage,
  buildSummaryMessage,
  readProjectNames,
  readResultsByProject,
  sendSlackMessage,
  validateDashboardUrl,
};
