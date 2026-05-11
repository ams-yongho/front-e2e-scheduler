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

function buildSummaryMessage({ date, projects, resultsByProject, dashboardUrl }) {
  const externalDashboardUrl = validateDashboardUrl(dashboardUrl);
  const passedProjects = projects.filter(project => {
    const result = resultsByProject.get(project);
    return result && result.status === 'passed';
  }).length;
  const totals = projects.reduce((acc, project) => {
    const result = resultsByProject.get(project);
    if (!result) return acc;
    acc.passed += result.passed || 0;
    acc.total += result.total || 0;
    acc.failed += result.failed || 0;
    return acc;
  }, { passed: 0, total: 0, failed: 0 });

  const summaryIcon = passedProjects === projects.length ? '✅' : '❌';
  const lines = [
    `[E2E 테스트 전체 결과] ${date}`,
    `${summaryIcon} ${passedProjects}/${projects.length} 프로젝트 통과 | 총 ${totals.passed}/${totals.total} 통과 | 실패 ${totals.failed}건`,
    '',
  ];

  for (const project of projects) {
    const result = resultsByProject.get(project);
    if (!result) {
      lines.push(`- ❌ ${project}: 결과 없음`);
      continue;
    }
    const statusIcon = result.status === 'passed' ? '✅' : '❌';
    lines.push(`- ${statusIcon} ${project}: ${result.passed}/${result.total} 통과 | 실패 ${result.failed}건 | ${result.duration}`);
  }

  lines.push('', `대시보드: ${externalDashboardUrl}`);

  return lines.join('\n');
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
      resultsByProject.set(project, readJson(resultFile));
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
    text = buildSummaryMessage({
      date,
      projects,
      resultsByProject,
      dashboardUrl: env.DASHBOARD_URL,
    });
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
