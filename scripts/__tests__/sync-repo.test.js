'use strict';

// sync-repo.sh: 실행 직전에 대상 레포를 지정 브랜치(기본 develop)의 origin 최신으로 맞추고,
// 끝나면 원래 브랜치로 되돌리는 스크립트. 개발자 작업 트리를 절대 훼손하지 않아야 한다.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const script = path.resolve(__dirname, '../sync-repo.sh');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-repo-test-'));
const originDir = path.join(tmpRoot, 'origin.git');
const seedDir = path.join(tmpRoot, 'seed');
const devDir = path.join(tmpRoot, 'dev');
const fakeBinDir = path.join(tmpRoot, 'bin');
const pnpmMarker = path.join(tmpRoot, 'pnpm-calls.log');

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH}`,
};

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, env: gitEnv, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `git ${args.join(' ')} failed in ${cwd}:\n${r.stderr}`);
  return r.stdout.trim();
}

function runSync(root, branch) {
  const r = spawnSync('bash', [script, 'sync', root, branch], { env: gitEnv, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `sync should exit 0 (status is carried in JSON):\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

function runRestore(root, ref) {
  const r = spawnSync('bash', [script, 'restore', root, ref], { env: gitEnv, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `restore should exit 0:\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

function pnpmCalls() {
  return fs.existsSync(pnpmMarker) ? fs.readFileSync(pnpmMarker, 'utf8').trim().split('\n').filter(Boolean) : [];
}

try {
  // fake pnpm: 호출 인자를 기록하고, 실제 pnpm 처럼 install 시 lockfile 사본을 node_modules/.pnpm/lock.yaml 에 남긴다
  fs.mkdirSync(fakeBinDir, { recursive: true });
  fs.writeFileSync(
    path.join(fakeBinDir, 'pnpm'),
    `#!/bin/sh\necho "$*" >> "${pnpmMarker}"\n` +
      'if [ "$1" = "install" ]; then mkdir -p node_modules/.pnpm && cp pnpm-lock.yaml node_modules/.pnpm/lock.yaml; fi\n' +
      'exit 0\n'
  );
  fs.chmodSync(path.join(fakeBinDir, 'pnpm'), 0o755);

  // origin(bare) + seed 클론으로 develop 브랜치 초기 커밋 생성
  git(tmpRoot, 'init', '-q', '--bare', originDir);
  git(tmpRoot, 'clone', '-q', originDir, seedDir);
  git(seedDir, 'checkout', '-q', '-b', 'develop');
  fs.writeFileSync(path.join(seedDir, 'app.txt'), 'v1\n');
  fs.writeFileSync(path.join(seedDir, 'pnpm-lock.yaml'), 'lock-v1\n');
  git(seedDir, 'add', '.');
  git(seedDir, 'commit', '-q', '-m', 'develop v1');
  git(seedDir, 'push', '-q', '-u', 'origin', 'develop');

  // dev 클론 = 개발자 작업 체크아웃. develop 을 받아둔 뒤 feature 브랜치에서 작업 중
  git(tmpRoot, 'clone', '-q', '-b', 'develop', originDir, devDir);
  git(devDir, 'checkout', '-q', '-b', 'feat/work');
  fs.writeFileSync(path.join(devDir, 'feature.txt'), 'wip\n');
  git(devDir, 'add', '.');
  git(devDir, 'commit', '-q', '-m', 'feature wip');

  // origin develop 이 앞서 나감 (lockfile 도 변경)
  fs.writeFileSync(path.join(seedDir, 'app.txt'), 'v2\n');
  fs.writeFileSync(path.join(seedDir, 'pnpm-lock.yaml'), 'lock-v2\n');
  git(seedDir, 'add', '.');
  git(seedDir, 'commit', '-q', '-m', 'develop v2');
  git(seedDir, 'push', '-q', 'origin', 'develop');
  const originDevelopHead = git(seedDir, 'rev-parse', 'HEAD');

  // 1) 깨끗한 트리: develop 으로 전환 + origin 최신 반영 + lockfile 변경으로 pnpm install
  const synced = runSync(devDir, 'develop');
  assert.strictEqual(synced.result, 'synced', JSON.stringify(synced));
  assert.strictEqual(synced.branch, 'develop');
  assert.strictEqual(synced.original_branch, 'feat/work');
  assert.strictEqual(git(devDir, 'branch', '--show-current'), 'develop');
  assert.strictEqual(git(devDir, 'rev-parse', 'HEAD'), originDevelopHead, 'HEAD 가 origin/develop 최신이어야 함');
  assert.strictEqual(synced.head, originDevelopHead.slice(0, 7));
  assert.strictEqual(synced.installed, true, 'lockfile 이 바뀌면 pnpm install 을 실행해야 함');
  assert.ok(pnpmCalls().some(c => c.includes('install') && c.includes('--frozen-lockfile')), `pnpm install --frozen-lockfile 호출 기록: ${pnpmCalls()}`);
  console.log('✅ sync-repo: clean tree → develop 최신 동기화 + lockfile 변경 시 install');

  // 2) 복귀: 원래 feature 브랜치로
  const restored = runRestore(devDir, synced.original_branch);
  assert.strictEqual(restored.result, 'restored', JSON.stringify(restored));
  assert.strictEqual(git(devDir, 'branch', '--show-current'), 'feat/work');
  assert.ok(fs.existsSync(path.join(devDir, 'feature.txt')), 'feature 작업 파일이 그대로 있어야 함');
  console.log('✅ sync-repo: restore → 원래 브랜치 복귀');

  // 3) node_modules 가 develop 의 lockfile 과 이미 일치하면 install 을 다시 하지 않는다
  fs.rmSync(pnpmMarker, { force: true });
  const syncedAgain = runSync(devDir, 'develop');
  assert.strictEqual(syncedAgain.result, 'synced');
  assert.strictEqual(syncedAgain.installed, false, 'node_modules 가 lockfile 과 일치하면 install 생략');
  assert.deepStrictEqual(pnpmCalls(), []);
  runRestore(devDir, 'feat/work');
  console.log('✅ sync-repo: node_modules 가 lockfile 과 일치하면 install 생략');

  // 4) 미커밋 변경이 있으면 건드리지 않는다
  fs.writeFileSync(path.join(devDir, 'feature.txt'), 'uncommitted edit\n');
  const dirty = runSync(devDir, 'develop');
  assert.strictEqual(dirty.result, 'skipped_dirty', JSON.stringify(dirty));
  assert.strictEqual(git(devDir, 'branch', '--show-current'), 'feat/work', '브랜치를 바꾸지 않아야 함');
  assert.strictEqual(fs.readFileSync(path.join(devDir, 'feature.txt'), 'utf8'), 'uncommitted edit\n', '작업 내용이 보존되어야 함');
  git(devDir, 'checkout', '-q', '--', 'feature.txt');
  console.log('✅ sync-repo: 미커밋 변경 → skipped_dirty, 작업 트리 보존');

  // 5) 로컬 develop 에 push 안 한 커밋이 있으면 덮어쓰지 않는다
  git(devDir, 'checkout', '-q', 'develop');
  fs.writeFileSync(path.join(devDir, 'local-only.txt'), 'x\n');
  git(devDir, 'add', '.');
  git(devDir, 'commit', '-q', '-m', 'local only commit');
  const localHead = git(devDir, 'rev-parse', 'HEAD');
  git(devDir, 'checkout', '-q', 'feat/work');
  const ahead = runSync(devDir, 'develop');
  assert.strictEqual(ahead.result, 'skipped_local_ahead', JSON.stringify(ahead));
  assert.strictEqual(git(devDir, 'branch', '--show-current'), 'feat/work');
  assert.strictEqual(git(devDir, 'rev-parse', 'develop'), localHead, '로컬 develop 커밋이 보존되어야 함');
  console.log('✅ sync-repo: 로컬 develop 이 origin 보다 앞서면 skipped_local_ahead');

  // 6) git 레포가 아니면 failed
  const notRepo = path.join(tmpRoot, 'not-a-repo');
  fs.mkdirSync(notRepo);
  const failed = runSync(notRepo, 'develop');
  assert.strictEqual(failed.result, 'failed', JSON.stringify(failed));
  assert.ok(typeof failed.message === 'string' && failed.message.length > 0);
  console.log('✅ sync-repo: git 레포 아니면 failed');

  console.log('✅ All sync-repo tests passed');
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}
