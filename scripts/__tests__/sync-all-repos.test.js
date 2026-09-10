'use strict';

// sync-all-repos.sh / restore-all-repos.sh:
//   run-all.sh 가 프로젝트 순회 전후에 호출한다. projects_dir 의 repo 설정을 모아 레포별로 sync-repo.sh 를 실행하고
//   결과를 JSON 배열 파일로 남긴다. restore 는 그 파일을 읽어 synced 된 레포만 원래 브랜치로 되돌린다.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const syncAll = path.resolve(__dirname, '../sync-all-repos.sh');
const restoreAll = path.resolve(__dirname, '../restore-all-repos.sh');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-all-test-'));
const projectsDir = path.join(tmpRoot, 'projects');
const syncFile = path.join(tmpRoot, 'results', 'sync', '2026-09-11.json');

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com',
  SYNC_SKIP_INSTALL: '1',
};

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, env: gitEnv, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `git ${args.join(' ')} failed in ${cwd}:\n${r.stderr}`);
  return r.stdout.trim();
}

// origin + 개발자 체크아웃(feature 브랜치) 한 쌍을 만든다
function makeRepo(name) {
  const origin = path.join(tmpRoot, `${name}-origin.git`);
  const seed = path.join(tmpRoot, `${name}-seed`);
  const dev = path.join(tmpRoot, `${name}-dev`);
  git(tmpRoot, 'init', '-q', '--bare', origin);
  git(tmpRoot, 'clone', '-q', origin, seed);
  git(seed, 'checkout', '-q', '-b', 'develop');
  fs.writeFileSync(path.join(seed, 'app.txt'), 'v1\n');
  git(seed, 'add', '.');
  git(seed, 'commit', '-q', '-m', 'v1');
  git(seed, 'push', '-q', '-u', 'origin', 'develop');
  git(tmpRoot, 'clone', '-q', '-b', 'develop', origin, dev);
  git(dev, 'checkout', '-q', '-b', 'feat/work');
  fs.writeFileSync(path.join(seed, 'app.txt'), 'v2\n');
  git(seed, 'commit', '-q', '-am', 'v2');
  git(seed, 'push', '-q', 'origin', 'develop');
  return { dev, originHead: git(seed, 'rev-parse', 'HEAD') };
}

function writeConfig(name, config) {
  fs.mkdirSync(path.join(projectsDir, name), { recursive: true });
  fs.writeFileSync(path.join(projectsDir, name, 'config.json'), JSON.stringify({ name, ...config }, null, 2));
}

try {
  const a = makeRepo('a');
  const b = makeRepo('b');
  // b 는 미커밋 변경을 남겨 skipped_dirty 가 되도록
  fs.writeFileSync(path.join(b.dev, 'app.txt'), 'dirty\n');

  writeConfig('a-admin', { path: path.join(a.dev, 'apps/admin'), repo: { root: a.dev } });
  writeConfig('a-mall', { path: path.join(a.dev, 'apps/mall'), repo: { root: a.dev } });
  writeConfig('b-front', { path: path.join(b.dev, 'apps/web'), repo: { root: b.dev } });
  writeConfig('legacy', { path: path.join(tmpRoot, 'legacy') });

  // --- sync-all ---
  const s = spawnSync('bash', [syncAll, projectsDir, syncFile], { env: gitEnv, encoding: 'utf8' });
  assert.strictEqual(s.status, 0, `sync-all should exit 0:\n${s.stdout}\n${s.stderr}`);
  assert.ok(fs.existsSync(syncFile), 'sync 결과 파일이 생성되어야 함');
  const results = JSON.parse(fs.readFileSync(syncFile, 'utf8'));
  assert.strictEqual(results.length, 2, 'repo 설정이 있는 레포 2개만 대상');

  const ra = results.find(r => r.root === a.dev);
  const rb = results.find(r => r.root === b.dev);
  assert.strictEqual(ra.result, 'synced');
  assert.deepStrictEqual(ra.projects, ['a-admin', 'a-mall']);
  assert.strictEqual(git(a.dev, 'branch', '--show-current'), 'develop');
  assert.strictEqual(git(a.dev, 'rev-parse', 'HEAD'), a.originHead);
  assert.strictEqual(rb.result, 'skipped_dirty');
  assert.strictEqual(git(b.dev, 'branch', '--show-current'), 'feat/work');
  assert.ok(s.stdout.includes('synced') && s.stdout.includes('skipped_dirty'), '로그에 레포별 결과가 보여야 함');
  console.log('✅ sync-all-repos: 레포별 1회 동기화 + 결과 파일');

  // --- restore-all ---
  const r = spawnSync('bash', [restoreAll, syncFile], { env: gitEnv, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `restore-all should exit 0:\n${r.stdout}\n${r.stderr}`);
  assert.strictEqual(git(a.dev, 'branch', '--show-current'), 'feat/work', 'synced 레포는 원래 브랜치로 복귀');
  assert.strictEqual(git(b.dev, 'branch', '--show-current'), 'feat/work', 'skipped 레포는 그대로');
  assert.strictEqual(fs.readFileSync(path.join(b.dev, 'app.txt'), 'utf8'), 'dirty\n', 'skipped 레포의 미커밋 변경 보존');
  const afterRestore = JSON.parse(fs.readFileSync(syncFile, 'utf8'));
  assert.strictEqual(afterRestore.find(x => x.root === a.dev).restore, 'restored', '복귀 결과가 파일에 기록되어야 함');
  console.log('✅ restore-all-repos: synced 레포만 원래 브랜치로 복귀');

  // --- 결과 파일이 없으면 restore 는 조용히 종료 ---
  const r2 = spawnSync('bash', [restoreAll, path.join(tmpRoot, 'missing.json')], { env: gitEnv, encoding: 'utf8' });
  assert.strictEqual(r2.status, 0, 'sync 파일이 없으면 no-op 으로 exit 0');
  console.log('✅ restore-all-repos: sync 파일 없으면 no-op');

  console.log('✅ All sync-all-repos tests passed');
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}
