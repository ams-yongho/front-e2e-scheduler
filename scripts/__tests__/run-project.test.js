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
const resultFile = path.join(resultDir, `${today}.json`);
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
      command: `${process.execPath} ${configuredEmitter} --reporter=json`,
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
  assert.strictEqual(result.status, 'passed', 'scheduler should use config.command, not projects/<name>/run.sh');
  assert.strictEqual(result.passed, 1);
  assert.strictEqual(result.failed, 0);

  console.log('✅ run-project uses config.command');
} finally {
  fs.rmSync(projectDir, { recursive: true, force: true });
  fs.rmSync(resultDir, { recursive: true, force: true });
  fs.rmSync(pwOutputFile, { force: true });
  fs.rmSync(pwStderrFile, { force: true });
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
