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

function buildIntegratedProjectFields(projects, e2eByProject, unitByProject, testsByProject) {
  const fields = [];
  for (const project of projects) {
    const registered = (testsByProject && testsByProject[project]) || [];
    const e2e = e2eByProject.get(project);
    const unit = unitByProject.get(project);

    const e2eText = (() => {
      if (!registered.includes('e2e')) return null;
      if (!e2e) return '결과 없음';
      return `${e2e.passed}/${e2e.total}`;
    })();
    const unitText = (() => {
      if (!registered.includes('unit')) return '-';
      if (!unit) return '결과 없음';
      return `${unit.passed}/${unit.total}`;
    })();

    const durationLabel = (() => {
      const totalSec =
        (e2e ? parseDurationSeconds(e2e.duration) : 0) +
        (unit ? parseDurationSeconds(unit.duration) : 0);
      if (!e2e && !unit) return '-';
      return formatDurationSeconds(totalSec);
    })();

    const overallFail =
      (registered.includes('e2e') && (!e2e || e2e.status === 'failed')) ||
      (registered.includes('unit') && unit && unit.status === 'failed');
    const overallIcon = overallFail ? '❌' : (registered.length === 0 ? '⚠' : '✅');

    fields.push(markdownText(`*${overallIcon} ${project}*`));
    fields.push(markdownText(`E2E ${e2eText ?? '-'} · Unit ${unitText} · ${durationLabel}`));
  }
  return fields;
}

function chunkFields(fields, chunkSize) {
  const chunks = [];
  for (let i = 0; i < fields.length; i += chunkSize) {
    chunks.push(fields.slice(i, i + chunkSize));
  }
  return chunks;
}

function buildSummaryMessage({ date, projects, e2eByProject, unitByProject, testsByProject, dashboardUrl }) {
  const externalDashboardUrl = validateDashboardUrl(dashboardUrl);

  const e2eEligible = projects.filter(p => (testsByProject?.[p] || ['e2e']).includes('e2e'));
  const unitEligible = projects.filter(p => (testsByProject?.[p] || []).includes('unit'));

  const e2eSummary = calculateSummary(e2eEligible, e2eByProject);
  const unitSummary = calculateSummary(unitEligible, unitByProject);

  const anyE2eFail = e2eEligible.some(p => {
    const r = e2eByProject.get(p);
    return !r || r.status === 'failed';
  });
  const anyUnitFail = unitEligible.some(p => {
    const r = unitByProject.get(p);
    return r && r.status === 'failed';
  });
  const allGood = !anyE2eFail && !anyUnitFail;
  const summaryIcon = allGood ? '✅' : '❌';
  const statusText = allGood ? '*✅ 전체 통과*' : '*❌ 일부 실패*';

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

  const projectFields = buildIntegratedProjectFields(projects, e2eByProject, unitByProject, testsByProject);

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
    ...chunkFields(projectFields, 10).map(fields => ({ type: 'section', fields })),
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
  buildSingleResultMessage,
  buildSummaryMessage,
  readProjectNames,
  readResultsByProject,
  sendSlackMessage,
  validateDashboardUrl,
};
