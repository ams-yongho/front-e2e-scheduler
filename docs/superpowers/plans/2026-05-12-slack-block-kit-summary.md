# Slack Block Kit Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Slack full-summary notification text blob with a Block Kit payload that shows a readable summary, every project result, and a dashboard button.

**Architecture:** Keep the existing `scripts/run-all.sh` flow unchanged. Update `scripts/slack-notify.js` so the summary path builds `{ text, blocks }` while the single-result path continues to send plain text through the same webhook sender. Add focused tests around the payload shape and make the docs match the new Slack format.

**Tech Stack:** Node.js CommonJS, Slack Incoming Webhook JSON payloads, built-in `assert` tests.

---

## File Structure

- Modify: `scripts/slack-notify.js`
  - Add duration parsing/formatting helpers.
  - Add summary calculation and Block Kit payload builders.
  - Change `sendSlackMessage` so it can send either a string or a payload object.
  - Keep `buildSingleResultMessage` behavior unchanged.
- Modify: `scripts/__tests__/slack-notify.test.js`
  - Replace string-only summary assertions with payload assertions.
  - Keep dashboard URL validation and unreadable result tests.
  - Add assertions for header, summary fields, project rows, result-missing row, dashboard button, and no failure details.
- Modify: `docs/spec.md`
  - Update the Slack notification format section from plain text to Block Kit card structure.

---

### Task 1: Update Slack Summary Tests First

**Files:**
- Modify: `scripts/__tests__/slack-notify.test.js`
- Test: `scripts/__tests__/slack-notify.test.js`

- [ ] **Step 1: Replace summary message assertions with payload assertions**

Replace the current `message` construction and `assert.ok(message.includes(...))` block with this payload-oriented test setup:

```js
const payload = buildSummaryMessage({
  date: '2026-05-11',
  projects,
  resultsByProject,
  dashboardUrl: 'http://172.17.2.240:8080',
});

const serializedPayload = JSON.stringify(payload);

assert.strictEqual(typeof payload.text, 'string');
assert.ok(payload.text.includes('[E2E 테스트 전체 결과] 2026-05-11'));
assert.ok(payload.text.includes('❌ 1/3 프로젝트 통과 | 총 97/100 통과 | 실패 3건'));
assert.ok(Array.isArray(payload.blocks), 'summary payload must include Block Kit blocks');

assert.deepStrictEqual(payload.blocks[0], {
  type: 'header',
  text: {
    type: 'plain_text',
    text: 'E2E 테스트 전체 결과 · 2026-05-11',
    emoji: true,
  },
});

const summarySection = payload.blocks.find(block =>
  block.type === 'section' &&
  block.fields &&
  block.fields.some(field => field.text.includes('*프로젝트 통과*'))
);
assert.ok(summarySection, 'summary fields section should exist');
assert.ok(summarySection.fields.some(field => field.text === '*프로젝트 통과*\n1 / 3'));
assert.ok(summarySection.fields.some(field => field.text === '*테스트 통과*\n97 / 100'));
assert.ok(summarySection.fields.some(field => field.text === '*실패*\n3건'));
assert.ok(summarySection.fields.some(field => field.text === '*총 소요시간*\n5분 52초'));

assert.ok(serializedPayload.includes('*✅ ca-admin*'));
assert.ok(serializedPayload.includes('50/50 통과 · 실패 0건 · 3분 42초'));
assert.ok(serializedPayload.includes('*❌ typist*'));
assert.ok(serializedPayload.includes('47/50 통과 · 실패 3건 · 2분 10초'));
assert.ok(serializedPayload.includes('*❌ cv-view*'));
assert.ok(serializedPayload.includes('결과 없음'));

const actionsBlock = payload.blocks.find(block => block.type === 'actions');
assert.ok(actionsBlock, 'dashboard action block should exist');
assert.deepStrictEqual(actionsBlock.elements[0], {
  type: 'button',
  text: {
    type: 'plain_text',
    text: '대시보드 열기',
    emoji: true,
  },
  url: 'http://172.17.2.240:8080',
  action_id: 'open_dashboard',
});

assert.ok(!serializedPayload.includes('실패 목록:'), 'summary must not include failure detail heading');
assert.ok(!serializedPayload.includes('checkout.spec.ts'), 'summary must not include failure file detail');
assert.ok(!serializedPayload.includes('결제 완료 플로우'), 'summary must not include failure test detail');
```

- [ ] **Step 2: Keep URL validation assertions unchanged**

Keep these assertions in the same test file after the payload assertions:

```js
assert.strictEqual(
  validateDashboardUrl('http://172.17.2.240:8080'),
  'http://172.17.2.240:8080'
);
assert.throws(
  () => validateDashboardUrl('http://localhost:8080'),
  /DASHBOARD_URL must be reachable by Slack recipients/
);
assert.throws(
  () => validateDashboardUrl(''),
  /DASHBOARD_URL is required/
);
```

- [ ] **Step 3: Run the updated test and verify it fails**

Run:

```bash
node scripts/__tests__/slack-notify.test.js
```

Expected: FAIL because `buildSummaryMessage` still returns a string, so `payload.blocks` is not an array.

- [ ] **Step 4: Commit the failing test**

```bash
git add scripts/__tests__/slack-notify.test.js
git commit -m "test: 슬랙 블록킷 요약 payload 검증 추가"
```

---

### Task 2: Implement Block Kit Payload Generation

**Files:**
- Modify: `scripts/slack-notify.js`
- Test: `scripts/__tests__/slack-notify.test.js`

- [ ] **Step 1: Add duration helpers near `validateDashboardUrl`**

Insert these helpers after `validateDashboardUrl`:

```js
function parseDurationSeconds(duration) {
  if (typeof duration !== 'string') return 0;

  let seconds = 0;
  const minutesMatch = duration.match(/(\d+)\s*분/);
  const secondsMatch = duration.match(/(\d+)\s*초/);

  if (minutesMatch) seconds += Number(minutesMatch[1]) * 60;
  if (secondsMatch) seconds += Number(secondsMatch[1]);

  return seconds;
}

function formatDurationSeconds(totalSeconds) {
  const safeSeconds = Number.isFinite(totalSeconds) ? totalSeconds : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  if (minutes === 0) return `${seconds}초`;
  return `${minutes}분 ${seconds}초`;
}
```

- [ ] **Step 2: Add Slack text object helpers**

Insert these helpers after the duration helpers:

```js
function plainText(text) {
  return {
    type: 'plain_text',
    text,
    emoji: true,
  };
}

function markdownText(text) {
  return {
    type: 'mrkdwn',
    text,
  };
}
```

- [ ] **Step 3: Replace `buildSummaryMessage` with payload generation**

Replace the current `buildSummaryMessage` function with this implementation:

```js
function calculateSummary(projects, resultsByProject) {
  return projects.reduce((acc, project) => {
    const result = resultsByProject.get(project);
    if (!result) return acc;

    if (result.status === 'passed') acc.passedProjects += 1;
    acc.passed += result.passed || 0;
    acc.total += result.total || 0;
    acc.failed += result.failed || 0;
    acc.durationSeconds += parseDurationSeconds(result.duration);

    return acc;
  }, {
    passedProjects: 0,
    passed: 0,
    total: 0,
    failed: 0,
    durationSeconds: 0,
  });
}

function buildProjectFields(projects, resultsByProject) {
  const fields = [];

  for (const project of projects) {
    const result = resultsByProject.get(project);
    if (!result) {
      fields.push(markdownText(`*❌ ${project}*`));
      fields.push(markdownText('결과 없음'));
      continue;
    }

    const statusIcon = result.status === 'passed' ? '✅' : '❌';
    fields.push(markdownText(`*${statusIcon} ${project}*`));
    fields.push(markdownText(`${result.passed}/${result.total} 통과 · 실패 ${result.failed}건 · ${result.duration}`));
  }

  return fields;
}

function chunkFields(fields, chunkSize) {
  const chunks = [];
  for (let i = 0; i < fields.length; i += chunkSize) {
    chunks.push(fields.slice(i, i + chunkSize));
  }
  return chunks;
}

function buildSummaryMessage({ date, projects, resultsByProject, dashboardUrl }) {
  const externalDashboardUrl = validateDashboardUrl(dashboardUrl);
  const summary = calculateSummary(projects, resultsByProject);
  const allPassed = summary.passedProjects === projects.length;
  const summaryIcon = allPassed ? '✅' : '❌';
  const statusText = allPassed ? '전체 통과' : '일부 실패';
  const totalDuration = formatDurationSeconds(summary.durationSeconds);
  const text = [
    `[E2E 테스트 전체 결과] ${date}`,
    `${summaryIcon} ${summary.passedProjects}/${projects.length} 프로젝트 통과 | 총 ${summary.passed}/${summary.total} 통과 | 실패 ${summary.failed}건`,
    `대시보드: ${externalDashboardUrl}`,
  ].join('\n');

  const blocks = [
    {
      type: 'header',
      text: plainText(`E2E 테스트 전체 결과 · ${date}`),
    },
    {
      type: 'section',
      text: markdownText(`*${summaryIcon} ${statusText}*`),
    },
    {
      type: 'section',
      fields: [
        markdownText(`*프로젝트 통과*\n${summary.passedProjects} / ${projects.length}`),
        markdownText(`*테스트 통과*\n${summary.passed} / ${summary.total}`),
        markdownText(`*실패*\n${summary.failed}건`),
        markdownText(`*총 소요시간*\n${totalDuration}`),
      ],
    },
    { type: 'divider' },
  ];

  for (const fields of chunkFields(buildProjectFields(projects, resultsByProject), 10)) {
    blocks.push({
      type: 'section',
      fields,
    });
  }

  blocks.push(
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: plainText('대시보드 열기'),
          url: externalDashboardUrl,
          action_id: 'open_dashboard',
        },
      ],
    }
  );

  return { text, blocks };
}
```

- [ ] **Step 4: Run the Slack test and verify it still fails at sending assumptions if needed**

Run:

```bash
node scripts/__tests__/slack-notify.test.js
```

Expected: PASS for payload construction assertions. If it fails, the mismatch should point to an exact field value in the new payload.

- [ ] **Step 5: Export helper functions only if a test needs them**

Keep `module.exports` focused. It should continue to export the existing public functions:

```js
module.exports = {
  buildSingleResultMessage,
  buildSummaryMessage,
  readProjectNames,
  readResultsByProject,
  sendSlackMessage,
  validateDashboardUrl,
};
```

- [ ] **Step 6: Commit payload generation**

```bash
git add scripts/slack-notify.js scripts/__tests__/slack-notify.test.js
git commit -m "feat: 슬랙 전체 요약을 블록킷 payload로 생성"
```

---

### Task 3: Update Webhook Sending to Accept Payload Objects

**Files:**
- Modify: `scripts/slack-notify.js`
- Test: `scripts/__tests__/slack-notify.test.js`

- [ ] **Step 1: Update `sendSlackMessage` body construction**

Replace the first line of `sendSlackMessage`:

```js
const body = JSON.stringify({ text });
```

with:

```js
const payload = typeof text === 'string' ? { text } : text;
const body = JSON.stringify(payload);
```

Keep the rest of the function unchanged.

- [ ] **Step 2: Rename the local variable in `main` for clarity**

Inside `main`, replace:

```js
let text;
```

with:

```js
let message;
```

Then replace assignments and send call:

```js
message = buildSummaryMessage({
  date,
  projects,
  resultsByProject,
  dashboardUrl: env.DASHBOARD_URL,
});
```

```js
message = buildSingleResultMessage(readJson(resultsFile));
```

```js
await sendSlackMessage(webhookUrl, message);
```

- [ ] **Step 3: Run the Slack notification test**

Run:

```bash
node scripts/__tests__/slack-notify.test.js
```

Expected: PASS and print `✅ All slack-notify tests passed`.

- [ ] **Step 4: Commit webhook payload support**

```bash
git add scripts/slack-notify.js
git commit -m "fix: 슬랙 webhook payload 전송 지원"
```

---

### Task 4: Update the Slack Format Documentation

**Files:**
- Modify: `docs/spec.md`

- [ ] **Step 1: Replace the plain text Slack sample**

Replace the current `## Slack 알림 형식` code block with this text:

```md
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
```

Keep the existing policy bullets after the sample, including:

```md
- `run-all.sh`에서 모든 프로젝트 실행이 끝난 뒤 Slack 요약을 한 번만 전송
- 단일 프로젝트 실행(`run-project.sh`)은 Slack 알림 없이 결과 JSON만 저장
- 실패 테스트 상세는 Slack 메시지에 포함하지 않고 대시보드와 결과 JSON에서 확인
- 대시보드 링크는 `.env`의 `DASHBOARD_URL`을 사용하며, Slack 수신자가 접근할 수 있는 공개 도메인, 사내 DNS, VPN 주소, 또는 터널 URL이어야 함
- `DASHBOARD_URL`이 없거나 `localhost`/`127.0.0.1`/`::1`이면 Slack 요약 전송을 실패 처리
- 특정 프로젝트 결과 파일이 생성되지 않으면 요약에 `결과 없음`으로 표시
```

- [ ] **Step 2: Run a focused docs sanity check**

Run:

```bash
rg -n "Slack 알림 형식|Block Kit|대시보드 열기|결과 없음" docs/spec.md
```

Expected: output includes the Slack section heading, Block Kit description, dashboard button text, and result-missing wording.

- [ ] **Step 3: Commit documentation update**

```bash
git add docs/spec.md
git commit -m "docs: 슬랙 알림 형식 문서 업데이트"
```

---

### Task 5: Final Verification

**Files:**
- Verify: `scripts/slack-notify.js`
- Verify: `scripts/__tests__/slack-notify.test.js`
- Verify: `docs/spec.md`

- [ ] **Step 1: Run Slack notification tests**

Run:

```bash
node scripts/__tests__/slack-notify.test.js
```

Expected:

```text
✅ All slack-notify tests passed
```

- [ ] **Step 2: Run the parser tests to catch unrelated script regressions**

Run:

```bash
node scripts/__tests__/parse-pw-results.test.js
```

Expected:

```text
✅ All parse-pw-results tests passed
```

- [ ] **Step 3: Inspect the generated summary payload manually**

Run a Node one-liner or temporary REPL command that imports `buildSummaryMessage` and prints the payload for the same test fixture shape used in `scripts/__tests__/slack-notify.test.js`. Confirm the payload has:

```text
text
blocks[0].type === "header"
summary fields section
project fields section
actions button with DASHBOARD_URL
```

- [ ] **Step 4: Check git status**

Run:

```bash
git status --short
```

Expected: no unstaged changes after the planned commits, or only intentional files if the implementer chooses to squash commits later.
