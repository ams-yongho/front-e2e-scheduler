#!/usr/bin/env node
'use strict';

const fs = require('fs');
const https = require('https');
const { URL } = require('url');

const [,, resultsFile] = process.argv;
const result = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
const webhookUrl = process.env.SLACK_WEBHOOK_URL;

if (!webhookUrl) {
  console.error('[ERROR] SLACK_WEBHOOK_URL is not set');
  process.exit(1);
}

const statusIcon = result.status === 'passed' ? '✅' : '❌';
const lines = [
  `[E2E 테스트 결과] ${result.project}`,
  `${statusIcon} ${result.passed}/${result.total} 통과 | ❌ ${result.failed}건 실패 | ⏱ ${result.duration}`,
];

if (result.failures.length > 0) {
  lines.push('실패 목록:');
  for (const f of result.failures) {
    lines.push(`- ${f.file} > ${f.test} (${f.line}번째 줄)`);
  }
}

const body = JSON.stringify({ text: lines.join('\n') });
const parsed = new URL(webhookUrl);

const req = https.request(
  {
    hostname: parsed.hostname,
    path: parsed.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  },
  res => {
    console.log(`Slack response: ${res.statusCode}`);
    if (res.statusCode !== 200) process.exit(1);
  }
);

req.on('error', err => {
  console.error('[ERROR] Slack notification failed:', err.message);
  process.exit(1);
});

req.write(body);
req.end();
