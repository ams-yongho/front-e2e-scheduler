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
} finally {
  fs.rmSync(projectDir, { recursive: true, force: true });
  fs.rmSync(resultDir, { recursive: true, force: true });
  fs.rmSync(pwOutputFile, { force: true });
  fs.rmSync(pwStderrFile, { force: true });
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
