# E2E 자동화 스케줄러 프로젝트

## 목표

여러 프로젝트의 E2E 테스트를 매일 자동으로 실행하고, 결과를 Slack으로 받고, 웹 대시보드에서 팀이 함께 확인할 수 있는 시스템 구축

## 확정된 방식

**도커 컨테이너 + cron + nginx 대시보드**

- 로컬 Mac에서 도커 컨테이너를 항상 실행
- 컨테이너 내부 cron이 매일 오전 10시에 등록된 모든 프로젝트 E2E 테스트 순회 실행
- 결과를 JSON으로 저장하고 Slack #qa-alerts 채널로 전송
- nginx로 웹 대시보드 서빙 → 프론트 챕터 팀원들이 브라우저에서 결과 확인

## 환경 정보

- 패키지 매니저: pnpm
- E2E 프레임워크: Playwright
- 테스트 대상: 회사 내부망 스테이징 서버 (Mac이 내부망 또는 VPN 연결 상태여야 함)
- 대시보드 접근: `http://localhost:8080`

## 프로젝트 구조

```
e2e-scheduler/
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
├── crontab
├── .env.example
├── projects/
│   ├── ca-admin/
│   │   ├── config.json       ← 프로젝트별 설정
│   │   └── run.sh            ← 실행 명령어
│   └── project-b/            ← 추가 방법: 이 구조 복사
│       ├── config.json
│       └── run.sh
├── scripts/
│   ├── run-all.sh            ← 등록된 모든 프로젝트 순회 실행
│   ├── run-project.sh        ← 단일 프로젝트 실행
│   └── slack-notify.js       ← Slack Webhook 전송
├── results/                  ← 실행 결과 JSON 자동 저장
│   └── ca-admin/
│       └── 2026-05-08.json
├── dashboard/                ← 웹 대시보드 (nginx 서빙)
│   └── index.html
├── CLAUDE.md
└── README.md
```

## 프로젝트 config.json 형식

```json
{
  "name": "ca-admin",
  "path": "/Users/yongho/projects/ca-admin",
  "command": "pnpm ca-admin e2e",
  "slack_channel": "#qa-alerts",
  "schedule": "0 10 * * *"
}
```

## 실행 결과 JSON 형식

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
    {
      "test": "결제 완료 플로우",
      "file": "checkout.spec.ts",
      "line": 84,
      "error": "..."
    }
  ]
}
```

## Slack 알림 형식

```
[E2E 테스트 결과] ca-admin
✅ 47/50 통과 | ❌ 3건 실패 | ⏱ 3분 42초
실패 목록:
- checkout.spec.ts > 결제 완료 플로우 (84번째 줄)
- auth.spec.ts > 토큰 만료 처리 (201번째 줄)
```

- 실패가 있어도 반드시 리포트 전송

## 대시보드 요구사항

- 프론트 챕터 팀원들이 함께 보는 용도 → 디자인 필요
- 프로젝트별 최근 실행 결과 카드 (통과/실패/소요시간)
- 날짜별 히스토리 테이블
- 실패 시 빨간 배지 + 상세 내용 표시
- `results/` 폴더의 JSON을 읽어서 렌더링

## 새 프로젝트 추가 방법

`projects/` 폴더에 새 디렉토리 + `config.json` + `run.sh` 추가하면
`run-all.sh`이 자동으로 순회 대상에 포함

## 시도했다가 실패한 방식들

| 방식           | 실패 이유                                                                               |
| -------------- | --------------------------------------------------------------------------------------- |
| Cloud Routines | Anthropic 클라우드 환경에서 `cdn.playwright.dev` 네트워크 차단 → Chromium 다운로드 불가 |
| Cowork 스케줄  | 동일하게 Playwright 실행 불가                                                           |
| GitHub Actions | 유료 과금 발생                                                                          |

## 남은 작업

- [ ] 레포 생성 (`e2e-scheduler`)
- [ ] `projects/ca-admin/config.json` 작성
- [ ] `projects/ca-admin/run.sh` 작성
- [ ] `scripts/run-all.sh` 작성
- [ ] `scripts/run-project.sh` 작성
- [ ] `scripts/slack-notify.js` 작성
- [ ] `Dockerfile` 작성 (Playwright + cron + nginx 포함)
- [ ] `docker-compose.yml` 작성
- [ ] `nginx.conf` 작성
- [ ] `crontab` 작성
- [ ] `dashboard/index.html` 작성 (팀용 대시보드)
- [ ] `.env.example` 작성
- [ ] Slack Webhook URL 환경변수 설정
- [ ] 로컬 테스트 후 검증
