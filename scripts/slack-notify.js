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

function buildProjectFields(projects, resultsByProject) {
  const fields = [];

  for (const project of projects) {
    const result = resultsByProject.get(project);

    if (!result) {
      fields.push(markdownText(`*❌ ${project}*`));
      fields.push(markdownText('결과 없음'));
      continue;
    }

    const statusIcon = result.status === 'passed' ? '✅' : '❌';
    fields.push(markdownText(`*${statusIcon} ${project}*`));
    fields.push(markdownText(`${result.passed}/${result.total} 통과 · 실패 ${result.failed}건 · ${result.duration}`));
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

function buildSummaryMessage({ date, projects, resultsByProject, dashboardUrl }) {
  const externalDashboardUrl = validateDashboardUrl(dashboardUrl);
  const {
    passedProjects,
    passed,
    total,
    failed,
    durationSeconds,
  } = calculateSummary(projects, resultsByProject);
  const summaryIcon = passedProjects === projects.length ? '✅' : '❌';
  const statusText = summaryIcon === '✅' ? '*✅ 전체 통과*' : '*❌ 일부 실패*';
  const summaryFields = [
    markdownText(`*프로젝트 통과*\n${passedProjects} / ${projects.length}`),
    markdownText(`*테스트 통과*\n${passed} / ${total}`),
    markdownText(`*실패*\n${failed}건`),
    markdownText(`*총 소요시간*\n${formatDurationSeconds(durationSeconds)}`),
  ];
  const projectFields = buildProjectFields(projects, resultsByProject);
  const text = [
    `[E2E 테스트 전체 결과] ${date}`,
    `${summaryIcon} ${passedProjects}/${projects.length} 프로젝트 통과 | 총 ${passed}/${total} 통과 | 실패 ${failed}건`,
    `대시보드: ${externalDashboardUrl}`,
  ].join('\n');
  const blocks = [
    {
      type: 'header',
      text: plainText(`E2E 테스트 전체 결과 · ${date}`),
    },
    {
      type: 'section',
      text: markdownText(statusText),
    },
    {
      type: 'section',
      fields: summaryFields,
    },
    {
      type: 'divider',
    },
    ...chunkFields(projectFields, 10).map(fields => ({
      type: 'section',
      fields,
    })),
    {
      type: 'divider',
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: plainText('대시보드 열기'),
          url: externalDashboardUrl,
          action_id: 'open_dashboard',
        },
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

function readResultsByProject(projects, resultsDir, date) {
  const resultsByProject = new Map();
  for (const project of projects) {
    const resultFile = path.join(resultsDir, project, `${date}.json`);
    if (fs.existsSync(resultFile)) {
      try {
        resultsByProject.set(project, readJson(resultFile));
      } catch (err) {
        console.warn(`[WARN] Skipping unreadable result for ${project}: ${resultFile} (${err.message})`);
      }
    }
  }
  return resultsByProject;
}

function sendSlackMessage(webhookUrl, text) {
  const body = JSON.stringify({ text });
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

  let text;
  if (argv[0] === '--summary') {
    const [, date, projectsDir, resultsDir] = argv;
    if (!date || !projectsDir || !resultsDir) {
      console.error(usage());
      process.exitCode = 1;
      return;
    }
    const projects = readProjectNames(projectsDir);
    const resultsByProject = readResultsByProject(projects, resultsDir, date);
    const summaryMessage = buildSummaryMessage({
      date,
      projects,
      resultsByProject,
      dashboardUrl: env.DASHBOARD_URL,
    });
    text = summaryMessage.text;
  } else {
    const [resultsFile] = argv;
    if (!resultsFile) {
      console.error(usage());
      process.exitCode = 1;
      return;
    }
    text = buildSingleResultMessage(readJson(resultsFile));
  }

  await sendSlackMessage(webhookUrl, text);
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
