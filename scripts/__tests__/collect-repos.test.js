'use strict';

// collect-repos.js: projects/*/config.json 의 repo 설정을 모아 레포 단위(중복 제거)로 돌려준다.
// run-all.sh 가 프로젝트 순회 전에 레포별로 한 번만 동기화하기 위해 사용한다.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { collectRepos } = require('../collect-repos');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'collect-repos-test-'));
const projectsDir = path.join(tmpRoot, 'projects');

function writeConfig(name, config) {
  fs.mkdirSync(path.join(projectsDir, name), { recursive: true });
  fs.writeFileSync(path.join(projectsDir, name, 'config.json'), JSON.stringify({ name, ...config }, null, 2));
}

try {
  // 같은 레포를 공유하는 두 프로젝트 → 레포 1개. 브랜치 생략 시 develop.
  writeConfig('a-admin', { path: '/repos/a/apps/admin', repo: { root: '/repos/a' } });
  writeConfig('a-mall', { path: '/repos/a/apps/mall', repo: { root: '/repos/a', branch: 'develop' } });
  // 다른 레포, 다른 브랜치
  writeConfig('b-front', { path: '/repos/b/apps/web', repo: { root: '/repos/b', branch: 'release' } });
  // repo 설정이 없는 프로젝트 → 동기화 대상 아님 (기존 동작 유지)
  writeConfig('legacy', { path: '/repos/c/apps/x' });
  // config.json 이 없는 디렉토리는 무시
  fs.mkdirSync(path.join(projectsDir, 'no-config'));

  const repos = collectRepos(projectsDir);
  assert.deepStrictEqual(repos, [
    { root: '/repos/a', branch: 'develop', projects: ['a-admin', 'a-mall'] },
    { root: '/repos/b', branch: 'release', projects: ['b-front'] },
  ]);
  console.log('✅ collectRepos: 레포 단위 중복 제거 + 기본 브랜치 develop + repo 없는 프로젝트 제외');

  // 같은 레포에 서로 다른 브랜치를 지정하면 설정 오류로 알린다
  writeConfig('a-conflict', { path: '/repos/a/apps/z', repo: { root: '/repos/a', branch: 'master' } });
  assert.throws(() => collectRepos(projectsDir), /a-conflict.*master.*develop|branch/i);
  fs.rmSync(path.join(projectsDir, 'a-conflict'), { recursive: true, force: true });
  console.log('✅ collectRepos: 같은 레포에 다른 브랜치 지정 시 에러');

  // CLI: JSON 배열을 stdout 으로
  const cli = spawnSync(process.execPath, [path.resolve(__dirname, '../collect-repos.js'), projectsDir], { encoding: 'utf8' });
  assert.strictEqual(cli.status, 0, cli.stderr);
  const parsed = JSON.parse(cli.stdout);
  assert.strictEqual(parsed.length, 2);
  assert.strictEqual(parsed[0].root, '/repos/a');
  console.log('✅ collect-repos CLI: JSON 배열 출력');

  console.log('✅ All collect-repos tests passed');
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}
