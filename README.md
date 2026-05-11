# front-e2e-scheduler

## 1. 소개

Mac 호스트에서 cron을 통해 Playwright E2E 테스트를 매일 자동 실행하고, 결과를 JSON으로 저장하며, Slack으로 알림을 발송하는 스케줄러입니다. Docker nginx를 통해 팀 대시보드를 제공합니다.

**동작 흐름:**
- 매일 10:00 — cron → `scripts/run-all.sh` → 프로젝트별 결과 `results/[project]/YYYY-MM-DD.json` 저장 → `results/manifest.json` 업데이트 → Slack 전체 요약 알림 1회 전송
- Docker: nginx (포트 8080) → `dashboard/dist/` 빌드 결과 + `results/` 볼륨 마운트

---

## 2. 시작하기

### 1) `.env` 파일 생성

`.env.example`을 복사하여 `.env`를 생성하고, Slack Webhook URL을 설정합니다.

```bash
cp .env.example .env
```

`.env` 파일을 열어 `SLACK_WEBHOOK_URL`과 외부에서 접근 가능한 `DASHBOARD_URL`을 실제 값으로 교체합니다.
`DASHBOARD_URL`은 Slack 메시지를 받는 사람이 접근할 수 있는 공개 도메인, 사내 DNS, VPN 주소, 또는 터널 URL이어야 합니다. `localhost`는 알림 전송 시 거부됩니다.

```
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
DASHBOARD_URL=http://172.17.2.240:8080
```

### 2) 프로젝트 config 확인

`projects/*/config.json`의 `path` 항목이 로컬 ca-front 앱의 실제 경로를 가리키는지 확인합니다.

현재 등록된 프로젝트:
- `ca-admin`
- `typist`
- `cv-view`
- `vis`
- `pv-view`

예시:

```json
{
  "name": "ca-admin",
  "path": "/Users/yonghokim/Documents/GitHub/amass/ca-front/apps/ca-admin",
  "command": "pnpm playwright test",
  "slack_channel": "#qa-alerts"
}
```

### 3) 대시보드 빌드

```bash
cd dashboard
pnpm install
pnpm build
```

### 4) Docker 컨테이너 시작

```bash
docker compose up -d
```

### 5) 대시보드 확인

브라우저에서 `http://localhost:8080` 접속

팀원이 Slack 링크로 접근하려면 `DASHBOARD_URL`이 이 로컬 주소가 아니라 외부 접근 가능한 주소를 가리켜야 합니다. 필요하면 사내 프록시, VPN에서 접근 가능한 Mac 주소, 또는 터널링 도구를 통해 `http://localhost:8080`을 외부 URL에 연결합니다.

---

## 3. crontab 등록

Mac 터미널에서 crontab 편집기를 엽니다:

```bash
crontab -e
```

아래 내용을 추가합니다 (`/absolute/path/to/e2e-scheduler` 부분을 실제 절대 경로로 교체):

```
0 10 * * * /bin/bash /absolute/path/to/e2e-scheduler/scripts/run-all.sh >> /absolute/path/to/e2e-scheduler/logs/cron.log 2>&1
```

**예시** (실제 경로 사용):

```
0 10 * * * /bin/bash /Users/yongho/projects/e2e-scheduler/scripts/run-all.sh >> /Users/yongho/projects/e2e-scheduler/logs/cron.log 2>&1
```

> 참고: `crontab.example` 파일에 등록 예시가 포함되어 있습니다.

등록 후 확인:

```bash
crontab -l
```

---

## 4. 수동 실행 (통합 검증)

### 단일 프로젝트 실행

단일 프로젝트 실행은 결과 JSON만 저장하며 Slack 알림은 보내지 않습니다.

```bash
./scripts/run-project.sh ca-admin
./scripts/run-project.sh typist
./scripts/run-project.sh cv-view
./scripts/run-project.sh vis
./scripts/run-project.sh pv-view
```

### 결과 확인

```bash
cat results/ca-admin/$(date +%Y-%m-%d).json
```

### manifest 확인

```bash
cat results/manifest.json
```

### 전체 실행

전체 실행이 완료되면 모든 프로젝트 결과를 모아 Slack 요약 알림을 한 번 보냅니다.

```bash
./scripts/run-all.sh
```

---

## 5. 새 프로젝트 추가

1. `projects/ca-admin/` 구조를 복사하여 `projects/[프로젝트명]/` 디렉토리를 생성합니다.
2. `config.json`에 `name`, `path`, `command`, `slack_channel`을 설정합니다.
3. `run.sh`를 필요에 맞게 수정합니다.
4. 다음 실행 시 자동으로 포함됩니다.

```bash
cp -r projects/ca-admin projects/new-project
# config.json 및 run.sh 수정
```

---

## 6. 검증 체크리스트

- [ ] `.env` 파일에 `SLACK_WEBHOOK_URL` 설정됨
- [ ] `.env` 파일에 외부 접근 가능한 `DASHBOARD_URL` 설정됨 (`localhost` 사용 불가)
- [ ] `projects/*/config.json`의 `path`가 실제 경로로 설정됨
- [ ] `./scripts/run-project.sh [프로젝트명]` 실행 시 `results/[프로젝트명]/[오늘날짜].json` 생성됨
- [ ] `results/manifest.json`이 올바르게 업데이트됨
- [ ] `./scripts/run-all.sh` 완료 후 Slack #qa-alerts 채널에 전체 요약 메시지 1건 수신됨
- [ ] `docker compose up -d` 실행 후 `http://localhost:8080` 접속 가능
- [ ] 대시보드에 등록된 프로젝트 카드 및 히스토리 표시됨
- [ ] Mac crontab에 등록됨 (`crontab -l`로 확인)
