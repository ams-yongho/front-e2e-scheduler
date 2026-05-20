# 스펙 문서

E2E 자동화 스케줄러의 데이터 형식과 운영 스펙을 정의합니다.

## 프로젝트 구조

```
e2e-scheduler/
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
├── crontab.example
├── .env.example
├── projects/
│   ├── ca-admin/
│   │   └── config.json       ← 프로젝트별 경로와 실행 명령어
│   └── project-b/            ← 추가 방법: 이 구조 복사
│       └── config.json
├── scripts/
│   ├── run-all.sh            ← 등록된 모든 프로젝트 순회 실행 + Slack 요약 전송
│   ├── run-project.sh        ← 단일 프로젝트 실행 + 결과 저장
│   └── slack-notify.js       ← Slack Webhook 전송 메시지 생성/전송
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
  "command": "pnpm ca-admin e2e --reporter=json",
  "slack_channel": "#qa-alerts"
}
```

`command`는 스케줄러가 실제 프로젝트 경로에서 실행하는 단일 기준입니다. 대시보드가 결과를 파싱할 수 있도록 Playwright JSON reporter 옵션을 포함해야 합니다.

## 스케줄 실행 방식

Mac 호스트의 cron이 주중 12:00 KST에 `scripts/run-all.sh`를 실행합니다. E2E 실행은 Docker 컨테이너가 아니라 Mac 호스트에서 수행하며, Docker는 nginx로 대시보드와 `results/`를 서빙하는 역할만 담당합니다. 등록 절차는 [README.md](../README.md) 참고.

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

전체 요약 알림은 Slack Incoming Webhook에 `{ text, blocks }` payload로 전송합니다.

- `text`: Slack 알림 미리보기와 접근성 fallback
- `blocks`: Slack 화면에 표시되는 Block Kit 카드형 요약

Block Kit 구성:

1. Header: `E2E 테스트 전체 결과 · YYYY-MM-DD`
2. Status section: `✅ 전체 통과` 또는 `❌ 일부 실패`
3. Summary fields:
   - `프로젝트 통과`: `5 / 8`
   - `테스트 통과`: `107 / 412`
   - `실패`: `137건`
   - `총 소요시간`: `2분 50초`
4. Project result fields:
   - `✅ ca-admin` / `19/21 통과 · 실패 0건 · 29초`
   - `❌ partsfit-mall` / `69/160 통과 · 실패 18건 · 19초`
   - 결과 파일이 없으면 `❌ project-name` / `결과 없음`
5. Actions: `대시보드 열기` 버튼

- `run-all.sh`에서 모든 프로젝트 실행이 끝난 뒤 Slack 요약을 한 번만 전송
- 단일 프로젝트 실행(`run-project.sh`)은 Slack 알림 없이 결과 JSON만 저장
- 실패 테스트 상세는 Slack 메시지에 포함하지 않고 대시보드와 결과 JSON에서 확인
- 대시보드 링크는 `.env`의 `DASHBOARD_URL`을 사용하며, Slack 수신자가 접근할 수 있는 공개 도메인, 사내 DNS, VPN 주소, 또는 터널 URL이어야 함
- `DASHBOARD_URL`이 없거나 `localhost`/`127.0.0.1`/`::1`이면 Slack 요약 전송을 실패 처리
- 특정 프로젝트 결과 파일이 생성되지 않으면 요약에 `결과 없음`으로 표시

## 대시보드 요구사항

- 프론트 챕터 팀원들이 함께 보는 용도 → 디자인 필요
- 프로젝트별 최근 실행 결과 카드 (통과/실패/소요시간)
- 날짜별 히스토리 테이블
- 실패 시 빨간 배지 + 상세 내용 표시
- `results/` 폴더의 JSON을 읽어서 렌더링

## 새 프로젝트 추가 방법

`projects/` 폴더에 새 디렉토리 + `config.json`을 추가하면 `run-all.sh`이 자동으로 순회 대상에 포함됩니다.
