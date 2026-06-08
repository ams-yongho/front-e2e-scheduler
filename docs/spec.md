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
│       ├── e2e/
│       │   └── 2026-05-08.json
│       └── unit/
│           └── 2026-05-08.json
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
  "e2e_command": "pnpm playwright test --reporter=json",
  "unit_command": "pnpm vitest run --reporter=json",
  "slack_channel": "#qa-alerts"
}
```

- `e2e_command`가 없으면 해당 프로젝트의 E2E는 skip, 결과 파일도 생성하지 않는다.
- `unit_command`가 없으면 유닛테스트는 skip되고 Slack/대시보드에 `Unit -`로 표시된다.
- Playwright JSON reporter 옵션 포함은 동일. 유닛테스트는 Vitest 또는 Jest의 JSON reporter를 사용한다.

## 스케줄 실행 방식

Mac 호스트의 cron이 주중 12:00 KST에 `scripts/run-all.sh`를 실행합니다. E2E 실행은 Docker 컨테이너가 아니라 Mac 호스트에서 수행하며, Docker는 nginx로 대시보드와 `results/`를 서빙하는 역할만 담당합니다. 등록 절차는 [README.md](../README.md) 참고.

## E2E 결과 JSON

`results/[project]/e2e/YYYY-MM-DD.json`. 기존 Playwright 파싱 결과에 `"type": "e2e"` 필드가 추가되어 있다.

```json
{
  "project": "ca-admin",
  "type": "e2e",
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

## 유닛테스트 결과 JSON

`results/[project]/unit/YYYY-MM-DD.json`.

```json
{
  "project": "ca-admin",
  "type": "unit",
  "date": "2026-05-21",
  "status": "passed",
  "framework": "vitest",
  "total": 120,
  "passed": 118,
  "failed": 2,
  "skipped": 0,
  "duration": "12초",
  "failures": [{ "test": "...", "file": "...", "line": 14, "error": "..." }],
  "slowTests": [{ "test": "...", "file": "...", "durationMs": 850 }]
}
```

`framework`는 `unit_command`의 단어로 우선 식별, 실패 시 reporter 출력 마커로 fallback. 식별 안 되면 `"unknown"`.

## Slack 알림 형식

전체 요약 알림은 Slack Incoming Webhook에 `{ text, blocks }` payload로 전송합니다.

- `text`: Slack 알림 미리보기와 접근성 fallback
- `blocks`: Slack 화면에 표시되는 Block Kit 카드형 요약

Block Kit 구성:

1. Header: `테스트 전체 결과 · YYYY-MM-DD`
2. Status section: 전체 등급(아래 3단계 중 가장 나쁜 등급) → `✅ 전체 통과` / `⚠️ 일부 경고` / `❌ 일부 실패`
3. Summary fields (E2E와 Unit 두 개):
   - **E2E Summary**
     - `프로젝트 통과`: `5 / 8`
     - `테스트 통과`: `107 / 412`
   - **Unit Summary**
     - `프로젝트 통과`: `4 / 8`
     - `테스트 통과`: `1058 / 1212`
4. Project result table (monospace 코드블록, `프로젝트 | E2E | Unit` 3컬럼 정렬):

   ```
      프로젝트         E2E       Unit
   ✅ ca-admin       19/21   118/120
   ⚠️ partsfit-mall  84/160  1611/1611
   ❌ pv-view           0/4    428/428
   ```

   - 컬럼: 상태 아이콘 + 프로젝트명 / E2E 통과·전체 / Unit 통과·전체
   - 상태 아이콘은 등록된 타입 중 **가장 나쁜 등급** 기준 3단계:
     - `✅` 전부 통과(실패 0)
     - `⚠️` 실패는 있지만 일부라도 통과(부분 실패)
     - `❌` 치명적 — 한 타입이라도 0건 통과 / 결과 없음 / 수집 실패
   - 등록되지 않은 테스트 타입은 `-`, 결과 파일이 없으면 `결과 없음`, Unit 수집 실패는 `수집 실패`
   - 프로젝트별 소요시간은 표에 넣지 않고 상단 집계 요약의 `E2E 소요시간`/`Unit 소요시간`에만 표시
   - 프로젝트가 많으면 40행 단위로 코드블록을 분할(Block Kit 텍스트 3000자 제한 보호)
5. Actions: `대시보드 열기` 버튼

- `run-all.sh`에서 모든 프로젝트 실행이 끝난 뒤 Slack 요약을 한 번만 전송
- 단일 프로젝트 실행(`run-project.sh`)은 Slack 알림 없이 결과 JSON만 저장
- 실패 테스트 상세는 Slack 메시지에 포함하지 않고 대시보드와 결과 JSON에서 확인
- 대시보드 링크는 `.env`의 `DASHBOARD_URL`을 사용하며, Slack 수신자가 접근할 수 있는 공개 도메인, 사내 DNS, VPN 주소, 또는 터널 URL이어야 함
- `DASHBOARD_URL`이 없거나 `localhost`/`127.0.0.1`/`::1`이면 Slack 요약 전송을 실패 처리
- 특정 프로젝트 결과 파일이 생성되지 않으면 요약에 해당 타입을 `-`로 표시
- 전체 상태는 E2E/Unit 모두 통과 시 ✅

## manifest.json 형식

`results/manifest.json`. 대시보드와 Slack이 활용한다.

```json
{
  "projects": ["ca-admin", "biz-admin"],
  "tests": {
    "ca-admin": ["e2e", "unit"],
    "biz-admin": ["e2e"]
  },
  "lastUpdated": "2026-05-21T03:00:00.000Z"
}
```

`tests[project]`는 해당 프로젝트가 등록한 테스트 타입 배열. `config.json`의 `e2e_command`/`unit_command` 존재 여부로 채워진다.

## 대시보드 요구사항

- 프론트 챕터 팀원들이 함께 보는 용도 → 디자인 필요
- 프로젝트 카드는 E2E/Unit 두 줄로 통과/실패/시간을 표시
- 상세 페이지는 E2E/Unit 두 개의 탭으로 분리. 미등록 타입은 비활성 탭
- Unit 탭은 framework 배지, 실패 목록, 느린 테스트, 30일 히스토리를 표시
- `results/` 폴더의 JSON을 읽어서 렌더링

## 새 프로젝트 추가 방법

`projects/` 폴더에 새 디렉토리 + `config.json`을 추가하면 `run-all.sh`이 자동으로 순회 대상에 포함됩니다. `unit_command`를 `config.json`에 함께 등록하면 유닛테스트도 자동 순회 대상에 포함된다.
