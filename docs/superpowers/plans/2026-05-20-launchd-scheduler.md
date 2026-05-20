# Launchd Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the documented macOS scheduling path from `cron`/`crontab` to a per-user LaunchAgent while keeping Docker limited to nginx dashboard serving.

**Architecture:** A user LaunchAgent runs `scripts/run-all.sh` every day at 10:00 on the Mac host. The script continues to write `results/` JSON and send the Slack summary, while Docker nginx serves `dashboard/dist/` and `results/` only.

**Tech Stack:** macOS `launchd`/`launchctl`, Bash, Node.js scheduler scripts, Docker nginx.

---

### Task 1: Add LaunchAgent Template

**Files:**
- Create: `launchd/com.front-e2e-scheduler.daily.plist.example`

- [x] **Step 1: Create the template file**

Create `launchd/com.front-e2e-scheduler.daily.plist.example` with this content:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.front-e2e-scheduler.daily</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>/Users/yonghokim/.codex/worktrees/a999/front-e2e-scheduler/scripts/run-all.sh</string>
  </array>

  <key>WorkingDirectory</key>
  <string>/Users/yonghokim/.codex/worktrees/a999/front-e2e-scheduler</string>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>10</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>

  <key>StandardOutPath</key>
  <string>/Users/yonghokim/.codex/worktrees/a999/front-e2e-scheduler/logs/launchd.out.log</string>

  <key>StandardErrorPath</key>
  <string>/Users/yonghokim/.codex/worktrees/a999/front-e2e-scheduler/logs/launchd.err.log</string>
</dict>
</plist>
```

- [x] **Step 2: Validate plist syntax**

Run:

```bash
plutil -lint launchd/com.front-e2e-scheduler.daily.plist.example
```

Expected output:

```text
launchd/com.front-e2e-scheduler.daily.plist.example: OK
```

### Task 2: Update User-Facing Setup Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/spec.md`
- Modify: `docs/decisions.md`

- [x] **Step 1: Update README architecture wording**

Replace the schedule line with LaunchAgent wording:

```markdown
- 매일 10:00 — LaunchAgent → `scripts/run-all.sh` → 프로젝트별 결과 `results/[project]/YYYY-MM-DD.json` 저장 → `results/manifest.json` 업데이트 → Slack 전체 요약 알림 1회 전송
```

- [x] **Step 2: Replace README crontab section**

Replace the `crontab 등록` section with a `LaunchAgent 등록` section that includes these commands:

```bash
mkdir -p ~/Library/LaunchAgents
cp launchd/com.front-e2e-scheduler.daily.plist.example ~/Library/LaunchAgents/com.front-e2e-scheduler.daily.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.front-e2e-scheduler.daily.plist
launchctl enable gui/$(id -u)/com.front-e2e-scheduler.daily
```

Also include verification commands:

```bash
launchctl print gui/$(id -u)/com.front-e2e-scheduler.daily
launchctl kickstart -k gui/$(id -u)/com.front-e2e-scheduler.daily
tail -f logs/launchd.out.log logs/launchd.err.log
```

- [x] **Step 3: Update docs/spec.md project tree and architecture references**

Change `crontab` to `launchd/` in the project tree and describe LaunchAgent as the scheduler.

- [x] **Step 4: Update docs/decisions.md**

Change the final choice title to:

```markdown
## 최종 선택: Mac LaunchAgent + Docker nginx 대시보드
```

Mention that `launchd` is the macOS-native scheduler and Docker remains dashboard-serving only.

### Task 3: Update Agent Instructions And Legacy Cron Example

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `crontab.example`

- [x] **Step 1: Update AGENTS.md and CLAUDE.md architecture labels**

Use this label:

```markdown
**Mac LaunchAgent + 도커 nginx 대시보드**
```

Use this execution bullet:

```markdown
- 로컬 Mac의 LaunchAgent가 매일 오전 10시에 `scripts/run-all.sh` 실행 → 등록된 모든 프로젝트 E2E 테스트 순회
```

- [x] **Step 2: Convert crontab.example into a legacy note**

Replace `crontab.example` with:

```text
# Legacy note
# macOS에서는 crontab 대신 launchd LaunchAgent 사용을 권장합니다.
# 기본 등록 예시는 launchd/com.front-e2e-scheduler.daily.plist.example 파일을 참고하세요.
```

### Task 4: Verify Consistency

**Files:**
- No edits expected unless verification finds a missed reference.

- [x] **Step 1: Check remaining cron references**

Run:

```bash
rg -n "cron|crontab|컨테이너 내부 cron" README.md docs AGENTS.md CLAUDE.md crontab.example
```

Expected: only historical/legacy references in archived plans/specs or the legacy `crontab.example` note remain.

- [x] **Step 2: Check markdown and whitespace**

Run:

```bash
git diff --check
```

Expected: no output and exit code 0.

- [x] **Step 3: Run scheduler script tests**

Run:

```bash
node scripts/__tests__/run-project.test.js
node scripts/__tests__/parse-pw-results.test.js
node scripts/__tests__/slack-notify.test.js
```

Expected: all three scripts exit 0.
