'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-layout-'));
const resultsDir = path.join(tmpRoot, 'results');

try {
  // Fixture 1: 기존 레이아웃 — ca-admin에 루트 날짜 JSON 2개
  fs.mkdirSync(path.join(resultsDir, 'ca-admin'), { recursive: true });
  fs.writeFileSync(path.join(resultsDir, 'ca-admin', '2026-05-19.json'), '{"date":"2026-05-19"}');
  fs.writeFileSync(path.join(resultsDir, 'ca-admin', '2026-05-20.json'), '{"date":"2026-05-20"}');

  // Fixture 2: 이미 e2e/ 하위로 이동된 프로젝트
  fs.mkdirSync(path.join(resultsDir, 'biz-admin', 'e2e'), { recursive: true });
  fs.writeFileSync(path.join(resultsDir, 'biz-admin', 'e2e', '2026-05-20.json'), '{"date":"2026-05-20"}');

  // Fixture 3: 다른 파일 (manifest.json) — 건드리지 않아야 함
  fs.writeFileSync(path.join(resultsDir, 'manifest.json'), '{"projects":[]}');

  const script = path.resolve(__dirname, '../migrate-results-layout.sh');
  const r1 = spawnSync('bash', [script, resultsDir], { encoding: 'utf8' });
  assert.strictEqual(r1.status, 0, `migrate failed:\n${r1.stderr}`);

  assert.ok(fs.existsSync(path.join(resultsDir, 'ca-admin', 'e2e', '2026-05-19.json')));
  assert.ok(fs.existsSync(path.join(resultsDir, 'ca-admin', 'e2e', '2026-05-20.json')));
  assert.ok(!fs.existsSync(path.join(resultsDir, 'ca-admin', '2026-05-19.json')));
  assert.ok(!fs.existsSync(path.join(resultsDir, 'ca-admin', '2026-05-20.json')));
  assert.ok(fs.existsSync(path.join(resultsDir, 'biz-admin', 'e2e', '2026-05-20.json')));
  assert.ok(fs.existsSync(path.join(resultsDir, 'manifest.json')));

  // 두 번째 실행은 idempotent
  const r2 = spawnSync('bash', [script, resultsDir], { encoding: 'utf8' });
  assert.strictEqual(r2.status, 0, `second migrate failed:\n${r2.stderr}`);

  console.log('✅ migrate-results-layout: legacy → e2e/, idempotent');
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}
