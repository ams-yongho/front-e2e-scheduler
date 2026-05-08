# E2E 자동화 스케줄러 설계 문서

## Context

프론트 챕터의 여러 프로젝트(초기: ca-admin)에 대해 Playwright E2E 테스트를 매일 자동 실행하고, 결과를 Slack으로 받으며, 팀원들이 웹 대시보드에서 함께 확인할 수 있는 시스템이 필요하다.

Cloud Routines, Cowork 스케줄, GitHub Actions는 각각 Playwright CDN 차단, 동일 네트워크 이슈, 유료 과금 문제로 실패했다. 테스트 대상이 회사 내부망 스테이징 서버이므로 Mac이 VPN/내부망 연결된 상태에서 직접 실행해야 한다. Docker 컨테이너는 Mac의 VPN 라우팅을 자동으로 공유하지 않으므로, E2E 실행은 호스트 Mac에서 수행하고 Docker는 nginx 대시보드 서빙 전용으로 사용한다.

## 확정된 아키텍처

```
[Mac 호스트 - cron 실행]
  crontab (매일 10:00) → scripts/run-all.sh
                              ↓
                    scripts/run-project.sh (프로젝트별)
                              ↓
                    pnpm playwright test --reporter=json
                              ↓
                    results/[project]/[date].json 저장
                    results/manifest.json 업데이트
                              ↓
                    scripts/slack-notify.js → Slack #qa-alerts

[Docker 컨테이너 - 상시 실행]
  nginx
    ├── /           → dashboard/dist/  (Vite 빌드 결과물)
    └── /results/   → results/         (Mac에서 volume 마운트)
  접근: http://localhost:8080
```

**핵심 결정사항:**
- E2E 실행은 Mac 호스트에서 (VPN/내부망 직접 사용)
- Docker는 nginx 대시보드 서빙 전용
- `results/manifest.json`으로 대시보드가 프로젝트 목록 자동 인식

## 파일 구조

```
e2e-scheduler/
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
├── .env.example
├── crontab.example
├── projects/
│   └── ca-admin/
│       ├── config.json
│       └── run.sh
├── scripts/
│   ├── run-all.sh
│   ├── run-project.sh
│   ├── parse-pw-results.js
│   └── slack-notify.js
├── results/
│   ├── manifest.json
│   └── ca-admin/YYYY-MM-DD.json
└── dashboard/
    ├── package.json
    ├── vite.config.ts
    ├── src/
    │   ├── types.ts
    │   ├── api.ts
    │   ├── App.tsx
    │   └── components/
    │       ├── ProjectCard.tsx
    │       ├── HistoryTable.tsx
    │       └── FailureList.tsx
    └── dist/
```

## 결과 JSON 형식

```json
{
  "project": "ca-admin",
  "date": "2026-05-08",
  "status": "failed",
  "total": 50,
  "passed": 47,
  "failed": 3,
  "skipped": 0,
  "duration": "3분 42초",
  "failures": [
    { "test": "결제 완료 플로우", "file": "checkout.spec.ts", "line": 84, "error": "..." }
  ]
}
```

## manifest.json 형식

```json
{
  "projects": ["ca-admin"],
  "lastUpdated": "2026-05-08T10:03:42.000Z"
}
```

## Slack 알림 형식

```
[E2E 테스트 결과] ca-admin
✅ 47/50 통과 | ❌ 3건 실패 | ⏱ 3분 42초
실패 목록:
- checkout.spec.ts > 결제 완료 플로우 (84번째 줄)
```

## 대시보드 (Vite + React + TypeScript + Tailwind + shadcn)

**데이터 흐름:**
1. 앱 마운트 → `/results/manifest.json` fetch → 프로젝트 목록
2. 각 프로젝트별 최근 30일 날짜 순회 → `/results/[project]/[date].json` fetch
3. 최신 결과 → ProjectCard, 전체 히스토리 → HistoryTable, 실패 상세 → FailureList

**shadcn 컴포넌트:** Card, Badge, Table, Collapsible

## 새 프로젝트 추가 방법

`projects/[name]/config.json` + `run.sh` 추가 → 다음 실행부터 자동 포함
