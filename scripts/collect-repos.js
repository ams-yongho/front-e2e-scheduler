'use strict';
// projects/*/config.json 의 `repo` 설정을 레포 단위로 모은다.
//
//   "repo": { "root": "/abs/path/to/repo", "branch": "develop" }   // branch 생략 시 develop
//
// 같은 root 를 쓰는 프로젝트는 하나로 묶어 run-all.sh 가 레포당 한 번만 동기화하게 한다.
// repo 설정이 없는 프로젝트는 동기화 대상이 아니며 기존처럼 체크아웃 그대로 실행된다.
const fs = require('fs');
const path = require('path');

const DEFAULT_BRANCH = 'develop';

function collectRepos(projectsDir) {
  const byRoot = new Map();

  const names = fs.readdirSync(projectsDir).sort();
  for (const name of names) {
    const configPath = path.join(projectsDir, name, 'config.json');
    if (!fs.existsSync(configPath)) continue;

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const repo = config.repo;
    if (!repo || typeof repo.root !== 'string' || repo.root.length === 0) continue;

    const branch = typeof repo.branch === 'string' && repo.branch.length > 0 ? repo.branch : DEFAULT_BRANCH;
    const existing = byRoot.get(repo.root);
    if (existing) {
      if (existing.branch !== branch) {
        throw new Error(
          `[collect-repos] ${name} 의 repo.branch(${branch}) 가 같은 레포(${repo.root}) 의 다른 프로젝트 branch(${existing.branch}) 와 다릅니다. 레포당 브랜치는 하나여야 합니다.`
        );
      }
      existing.projects.push(config.name || name);
    } else {
      byRoot.set(repo.root, { root: repo.root, branch, projects: [config.name || name] });
    }
  }

  return Array.from(byRoot.values());
}

if (require.main === module) {
  const [, , projectsDir] = process.argv;
  if (!projectsDir) {
    console.error('Usage: collect-repos.js <projects_dir>');
    process.exit(2);
  }
  console.log(JSON.stringify(collectRepos(projectsDir), null, 2));
}

module.exports = { collectRepos, DEFAULT_BRANCH };
