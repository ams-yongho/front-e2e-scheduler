'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '../..');
const projectName = '__tmp-command-test';
const projectDir = path.join(repoRoot, 'projects', projectName);
const resultDir = path.join(repoRoot, 'results', projectName);
const today = new Date().toISOString().slice(0, 10);
const resultFile = path.join(resultDir, 'e2e', `${today}.json`);
const pwOutputFile = path.join(os.tmpdir(), `pw-${projectName}-${today}.json`);
const pwStderrFile = path.join(os.tmpdir(), `pw-${projectName}-${today}.stderr.log`);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scheduler-command-test-'));
const fakeBinDir = path.join(tmpDir, 'bin');
const fixtureProjectDir = path.join(tmpDir, 'project');

function writeExecutable(file, content) {
  fs.writeFileSync(file, content, 'utf8');
  fs.chmodSync(file, 0o755);
}

function playwrightJson({ expected, unexpected }) {
  return JSON.stringify({
    config: { projects: [{ name: 'chromium' }] },
    suites: [],
    stats: {
      duration: 1000,
      expected,
      unexpected,
      flaky: 0,
      skipped: 0,
    },
  });
}

try {
  fs.rmSync(projectDir, { recursive: true, force: true });
  fs.rmSync(resultDir, { recursive: true, force: true });
  fs.rmSync(pwOutputFile, { force: true });
  fs.rmSync(pwStderrFile, { force: true });
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(fixtureProjectDir, { recursive: true });
  fs.mkdirSync(fakeBinDir, { recursive: true });

  const configuredEmitter = path.join(fixtureProjectDir, 'configured-command.js');
  fs.writeFileSync(
    configuredEmitter,
    `console.log(${JSON.stringify(playwrightJson({ expected: 1, unexpected: 0 }))});\n`,
    'utf8'
  );

  fs.writeFileSync(
    path.join(projectDir, 'config.json'),
    JSON.stringify({
      name: projectName,
      path: fixtureProjectDir,
      e2e_command: `${process.execPath} ${configuredEmitter} --reporter=json`,
      slack_channel: '#qa-alerts',
    }, null, 2),
    'utf8'
  );

  writeExecutable(
    path.join(projectDir, 'run.sh'),
    `#!/bin/sh\nprintf '%s\\n' '${playwrightJson({ expected: 0, unexpected: 1 })}' > "$1"\n`
  );

  writeExecutable(
    path.join(fakeBinDir, 'pnpm'),
    '#!/bin/sh\n' +
      'if [ "$1" = "exec" ] && [ "$2" = "playwright" ] && [ "$3" = "--version" ]; then\n' +
      '  echo "Version 1.0.0"\n' +
      '  exit 0\n' +
      'fi\n' +
      'echo "unexpected pnpm invocation: $*" >&2\n' +
      'exit 1\n'
  );

  const run = spawnSync('bash', ['scripts/run-project.sh', projectName], {
    cwd: repoRoot,
    env: { ...process.env, PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH}` },
    encoding: 'utf8',
  });

  assert.strictEqual(run.status, 0, `run-project should exit 0\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`);
  assert.ok(fs.existsSync(resultFile), 'result JSON should be written');

  const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  assert.strictEqual(result.status, 'passed', 'scheduler should use config.e2e_command, not projects/<name>/run.sh');
  assert.strictEqual(result.passed, 1);
  assert.strictEqual(result.failed, 0);

  console.log('✅ run-project uses config.e2e_command');

  // --- Unit 경로 시나리오 ---
  const unitProjectName = '__tmp-unit-test';
  const unitProjectDir = path.join(repoRoot, 'projects', unitProjectName);
  const unitResultDir = path.join(repoRoot, 'results', unitProjectName);
  const unitResultFile = path.join(unitResultDir, 'unit', `${today}.json`);

  fs.rmSync(unitProjectDir, { recursive: true, force: true });
  fs.rmSync(unitResultDir, { recursive: true, force: true });
  fs.mkdirSync(unitProjectDir, { recursive: true });

  const unitEmitter = path.join(fixtureProjectDir, 'unit-emitter.js');
  const unitJson = JSON.stringify({
    numTotalTests: 3, numPassedTests: 3, numFailedTests: 0, numPendingTests: 0,
    startTime: 1716257700000,
    testResults: [{
      name: 'a.test.ts', status: 'passed', startTime: 1716257700000, endTime: 1716257701500,
      assertionResults: [
        { fullName: 'a', title: 'a', status: 'passed', duration: 1 },
        { fullName: 'b', title: 'b', status: 'passed', duration: 1 },
        { fullName: 'c', title: 'c', status: 'passed', duration: 1 },
      ],
    }],
  });
  fs.writeFileSync(unitEmitter, `console.log(${JSON.stringify(unitJson)});\n`, 'utf8');

  fs.writeFileSync(
    path.join(unitProjectDir, 'config.json'),
    JSON.stringify({
      name: unitProjectName,
      path: fixtureProjectDir,
      e2e_command: '',
      unit_command: `${process.execPath} ${unitEmitter}`,
      slack_channel: '#qa-alerts',
    }, null, 2),
    'utf8'
  );

  const unitRun = spawnSync('bash', ['scripts/run-project.sh', unitProjectName], {
    cwd: repoRoot,
    env: { ...process.env, PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH}` },
    encoding: 'utf8',
  });

  try {
    assert.strictEqual(unitRun.status, 0, `unit run failed:\nstdout:\n${unitRun.stdout}\nstderr:\n${unitRun.stderr}`);
    assert.ok(fs.existsSync(unitResultFile), `unit result missing: ${unitResultFile}`);
    const unitResult = JSON.parse(fs.readFileSync(unitResultFile, 'utf8'));
    assert.strictEqual(unitResult.type, 'unit');
    assert.strictEqual(unitResult.framework, 'vitest');
    assert.strictEqual(unitResult.total, 3);
    assert.strictEqual(unitResult.passed, 3);
    console.log('✅ run-project unit_command pipeline');
  } finally {
    fs.rmSync(unitProjectDir, { recursive: true, force: true });
    fs.rmSync(unitResultDir, { recursive: true, force: true });
  }

  // --- Attachments 수집 + 14일 보존 시나리오 ---
  const attProjectName = '__tmp-attachments-test';
  const attProjectDir = path.join(repoRoot, 'projects', attProjectName);
  const attResultDir = path.join(repoRoot, 'results', attProjectName);
  const attResultFile = path.join(attResultDir, 'e2e', `${today}.json`);
  const attCopiedDir = path.join(attResultDir, 'e2e', 'attachments', today);
  const attRecentKeep = path.join(attResultDir, 'e2e', 'attachments', '2099-01-01');
  const attOldDir = path.join(attResultDir, 'e2e', 'attachments', '1970-01-01');

  fs.rmSync(attProjectDir, { recursive: true, force: true });
  fs.rmSync(attResultDir, { recursive: true, force: true });
  fs.mkdirSync(attProjectDir, { recursive: true });

  // seed retention fixtures: one old (must be purged), one recent (must survive)
  fs.mkdirSync(attRecentKeep, { recursive: true });
  fs.writeFileSync(path.join(attRecentKeep, 'keep.txt'), 'keep');
  fs.mkdirSync(attOldDir, { recursive: true });
  fs.writeFileSync(path.join(attOldDir, 'gone.txt'), 'gone');

  const attFixtureDir = path.join(tmpDir, 'att-project');
  fs.mkdirSync(attFixtureDir, { recursive: true });

  // emitter creates Playwright-style test-results/ and prints JSON referencing those paths
  const attEmitter = path.join(attFixtureDir, 'att-emitter.js');
  const trBaseDir = path.join(attFixtureDir, 'test-results');
  const trCaseDir = path.join(trBaseDir, 'login-fail-chromium');
  fs.writeFileSync(
    attEmitter,
    [
      'const fs = require("fs");',
      'const path = require("path");',
      `const trCaseDir = ${JSON.stringify(trCaseDir)};`,
      'fs.rmSync(path.dirname(trCaseDir), { recursive: true, force: true });',
      'fs.mkdirSync(trCaseDir, { recursive: true });',
      'fs.writeFileSync(path.join(trCaseDir, "screenshot.png"), "fakepng");',
      'fs.writeFileSync(path.join(trCaseDir, "video.webm"), "fakevid");',
      'fs.writeFileSync(path.join(trCaseDir, "error-context.md"), "# ctx");',
      'console.log(JSON.stringify({',
      '  config: { projects: [{ name: "chromium" }] },',
      '  suites: [{',
      '    title: "login.spec.ts", file: "login.spec.ts",',
      '    specs: [{ title: "fails", line: 1, tests: [{',
      '      projectName: "chromium", status: "unexpected",',
      '      results: [{ status: "failed", duration: 100, retry: 0, error: { message: "boom" },',
      '        steps: [{ title: "click", error: { message: "boom" } }],',
      '        attachments: [',
      '          { name: "screenshot", contentType: "image/png", path: path.join(trCaseDir, "screenshot.png") },',
      '          { name: "video", contentType: "video/webm", path: path.join(trCaseDir, "video.webm") },',
      '          { name: "error-context", contentType: "text/markdown", path: path.join(trCaseDir, "error-context.md") },',
      '        ],',
      '      }] }],',
      '    }], suites: [],',
      '  }],',
      '  stats: { duration: 100, expected: 0, unexpected: 1, flaky: 0, skipped: 0 },',
      '}));',
    ].join('\n'),
    'utf8',
  );

  fs.writeFileSync(
    path.join(attProjectDir, 'config.json'),
    JSON.stringify({
      name: attProjectName,
      path: attFixtureDir,
      e2e_command: `${process.execPath} ${attEmitter} --reporter=json`,
      slack_channel: '#qa-alerts',
    }, null, 2),
    'utf8',
  );

  const attRun = spawnSync('bash', ['scripts/run-project.sh', attProjectName], {
    cwd: repoRoot,
    env: { ...process.env, PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH}` },
    encoding: 'utf8',
  });

  try {
    assert.strictEqual(attRun.status, 0, `attachments run failed:\nstdout:\n${attRun.stdout}\nstderr:\n${attRun.stderr}`);
    assert.ok(fs.existsSync(attResultFile), 'attachments result JSON should be written');

    // 1. attachments copied into results/<proj>/e2e/attachments/<today>/
    assert.ok(fs.existsSync(path.join(attCopiedDir, 'login-fail-chromium', 'screenshot.png')), 'screenshot copied');
    assert.ok(fs.existsSync(path.join(attCopiedDir, 'login-fail-chromium', 'video.webm')), 'video copied');
    assert.ok(fs.existsSync(path.join(attCopiedDir, 'login-fail-chromium', 'error-context.md')), 'error-context copied');

    // 2. JSON has remapped URL (web-accessible under /results/)
    const attResult = JSON.parse(fs.readFileSync(attResultFile, 'utf8'));
    const urls = attResult.failures[0].attachments.map(a => a.url);
    assert.strictEqual(urls[0], `/results/${attProjectName}/e2e/attachments/${today}/login-fail-chromium/screenshot.png`);
    assert.strictEqual(urls[1], `/results/${attProjectName}/e2e/attachments/${today}/login-fail-chromium/video.webm`);
    assert.strictEqual(urls[2], `/results/${attProjectName}/e2e/attachments/${today}/login-fail-chromium/error-context.md`);

    // 3. 14-day retention: 1970 dir purged, 2099 dir kept
    assert.ok(!fs.existsSync(attOldDir), 'attachment dir older than 14 days should be purged');
    assert.ok(fs.existsSync(attRecentKeep), 'recent attachment dir should be kept');

    console.log('✅ run-project attachments collection + 14-day retention');
  } finally {
    fs.rmSync(attProjectDir, { recursive: true, force: true });
    fs.rmSync(attResultDir, { recursive: true, force: true });
  }
} finally {
  fs.rmSync(projectDir, { recursive: true, force: true });
  fs.rmSync(resultDir, { recursive: true, force: true });
  fs.rmSync(pwOutputFile, { force: true });
  fs.rmSync(pwStderrFile, { force: true });
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
