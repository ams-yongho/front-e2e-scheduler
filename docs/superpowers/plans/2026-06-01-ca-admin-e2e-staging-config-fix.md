# ca-admin E2E staging 설정 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스케줄러가 ca-admin E2E를 로컬 `next dev` 서버가 아니라 이미 존재하는 `playwright.staging.config.ts`(배포된 staging 서버 대상, workers:1)로 실행하게 하여, on-demand 컴파일 적체로 인한 30초 타임아웃 대량 실패를 제거한다.

**Architecture:** 스케줄러(`scripts/run-project.sh`)는 `projects/<name>/config.json`의 `e2e_command`를 대상 프로젝트 디렉토리에서 `bash -c`로 실행하고 stdout을 캡처해 `parse-pw-results.js`로 파싱한다. ca-admin의 `e2e_command`만 staging 설정을 가리키도록 바꾸면, 코드 변경 없이 문제가 해결된다.

**Tech Stack:** Playwright, Next.js, pnpm, bash, Node.js(`node:assert` 기반 테스트 스크립트)

---

## 근본 원인 (요약)

2026-06-01 실행 결과(`/tmp/pw-ca-admin-2026-06-01.json`): **PASS 6 / FAIL 15, 실패 전부 `Test timeout of 30000ms exceeded`.**

- 스케줄러 `e2e_command`가 `pnpm playwright test --reporter=json` → 기본 `playwright.config.ts`를 사용.
- 기본 설정은 `webServer: pnpm dev`(= on-demand 라우트 컴파일), `fullyParallel: true`, `workers: undefined`(비-CI라 코어의 ~50% ≈ **20 워커**), `timeout` 기본 30s.
- 차가운 dev 서버 1대에 20 워커가 동시에 서로 다른 라우트로 진입 → 라우트별 컴파일이 직렬 적체 → 30초 초과로 전멸. 타임라인상 초반 웨이브(+0s)는 전멸, 서버가 데워진 늦은 웨이브(+81s)만 통과. 통과한 6개는 "늦게 시작해 서버가 데워진 뒤 실행된 테스트"일 뿐.
- 실패 스크린샷에 페이지가 데이터까지 렌더링됨 → 페이지는 결국 떴지만 30초 *후*에 떴다는 증거.
- 프로젝트엔 의도된 설정 `playwright.staging.config.ts`(baseURL 오버라이드 가능, `workers:1`, `fullyParallel:false`, `timeout:15s`, webServer 없음)가 이미 존재. 실제 접근 가능한 ca-admin staging 호스트는 `ca-admin-staging.amass.co.kr`이므로 스케줄러가 `PLAYWRIGHT_BASE_URL`로 이 URL을 명시해야 한다.

## File Structure

- **Modify:** `projects/ca-admin/config.json` — `e2e_command`를 staging 설정 + stdout JSON 리포터로 교체. (유일한 핵심 변경)
- **Reference (읽기 전용, 변경 없음):**
  - `scripts/run-project.sh` — `e2e_command`를 `bash -c`로 실행, stdout `> $tmp`로 캡처.
  - `/Users/yonghokim/Documents/GitHub/amass/ca-front/apps/ca-admin/playwright.staging.config.ts` — 대상 설정.
  - `scripts/__tests__/run-project.test.js` — 회귀 검증용 기존 테스트.

> **핵심 주의:** staging 설정의 리포터는 `[['json', { outputFile: '/tmp/pw-results.json' }]]`로 **파일**에 쓴다. 스케줄러는 **stdout**을 캡처하므로, `e2e_command`에 CLI `--reporter=json`을 반드시 붙여 stdout 출력으로 오버라이드해야 한다. (CLI `--reporter`는 config의 reporter를 완전히 대체하고, outputFile 미지정 시 stdout으로 출력)

---

### Task 1: 사전 검증 — staging 도달성과 새 명령이 실제로 통과하는지 확인

**Files:** 없음 (검증 전용. config는 아직 바꾸지 않는다 — "변경 전, 새 명령이 통과함"을 먼저 증명)

- [ ] **Step 1: staging 서버 도달성 확인**

Run:
```bash
curl -sk -o /dev/null -w "%{http_code}\n" https://ca-admin-staging.amass.co.kr/health
```
Expected: `200` (또는 앱이 살아있음을 뜻하는 2xx/3xx). 연결 거부/타임아웃이면 Mac이 내부망/VPN에 연결돼 있는지 먼저 확인하고, 연결 후 재실행한다. **여기서 막히면 이후 단계는 무의미하므로 중단하고 네트워크부터 해결.**

- [ ] **Step 2: mutation 테스트가 skip되지 않을 환경인지 확인**

Run:
```bash
grep NEXT_PUBLIC_SERVER /Users/yonghokim/Documents/GitHub/amass/ca-front/apps/ca-admin/.env
```
Expected: `NEXT_PUBLIC_SERVER=staging` — 이 값이어야 `isStagingEnvironment()`가 true가 되어 mutation 스모크가 skip되지 않고 실행된다. (mutation 테스트는 버튼 노출만 확인하는 읽기 전용이라 staging에 안전)

- [ ] **Step 3: 새 명령을 대상 프로젝트에서 직접 실행 (stdout JSON 캡처)**

Run:
```bash
cd /Users/yonghokim/Documents/GitHub/amass/ca-front/apps/ca-admin && \
  PLAYWRIGHT_BASE_URL=https://ca-admin-staging.amass.co.kr pnpm playwright test -c playwright.staging.config.ts --reporter=json > /tmp/ca-admin-staging-check.json 2> /tmp/ca-admin-staging-check.stderr.log; \
  echo "exit=$?"
```
Expected: 명령이 약 1~3분 내 종료(workers:1 직렬 실행). exit code는 일부 테스트 실패 시 1일 수 있으나, **`/tmp/ca-admin-staging-check.json`이 유효한 Playwright JSON으로 stdout에 생성되는 것**이 이 단계의 합격 기준.

- [ ] **Step 4: pass/fail 집계 확인 — 타임아웃 대량 실패가 사라졌는지**

Run:
```bash
node -e '
const r = require("/tmp/ca-admin-staging-check.json");
let pass=0, fail=0; const errs=[];
(function walk(s){(s.suites||[]).forEach(walk);(s.specs||[]).forEach(spec=>spec.tests.forEach(t=>{
  const res=t.results[t.results.length-1];
  if(spec.ok) pass++; else if(res.status!=="skipped"){fail++;
    errs.push(spec.title+" :: "+((res.errors&&res.errors[0]&&res.errors[0].message)||"").split("\n")[0].replace(/\x1b\[[0-9;]*m/g,""));}
}));})(undefined, (r.suites||[]).forEach?0:0);
(r.suites||[]).forEach(function w(s){(s.suites||[]).forEach(w);(s.specs||[]).forEach(spec=>spec.tests.forEach(t=>{const res=t.results[t.results.length-1];if(spec.ok)pass++;else if(res.status!=="skipped"){fail++;errs.push(spec.title.slice(0,40)+" :: "+(((res.errors&&res.errors[0]&&res.errors[0].message)||"").split("\n")[0]).replace(/\x1b\[[0-9;]*m/g,""));}}));});
console.log("PASS:",pass,"FAIL:",fail);
errs.forEach(e=>console.log("  FAIL",e));
'
```
Expected: PASS가 6보다 크게 증가하고(이상적으로 20+ 통과), **남은 실패가 있더라도 `Test timeout of 30000ms exceeded`가 아니라 실제 assertion/콘텐츠 관련 메시지**여야 한다. 타임아웃 대량 실패가 사라졌다면 근본 원인 수정이 검증된 것.

> 만약 staging에서도 일부 실패가 남으면, 그것은 **이번 플랜의 범위 밖(실제 앱/데이터 이슈)**이다. 이 플랜의 성공 기준은 "스케줄러 설정으로 인한 타임아웃 전멸 제거"이지 "모든 테스트 green"이 아니다. 남은 실패는 결과로 보고하고 별도로 다룬다.

---

### Task 2: config.json의 e2e_command를 staging 설정으로 교체

**Files:**
- Modify: `projects/ca-admin/config.json`

- [ ] **Step 1: 변경 전 현재 값 확인**

Run:
```bash
cat projects/ca-admin/config.json
```
Expected (현재):
```json
{
  "name": "ca-admin",
  "path": "/Users/yonghokim/Documents/GitHub/amass/ca-front/apps/ca-admin",
  "slack_channel": "#qa-alerts",
  "e2e_command": "pnpm playwright test --reporter=json",
  "unit_command": "pnpm vitest run --reporter=json"
}
```

- [ ] **Step 2: e2e_command 한 줄만 교체**

`projects/ca-admin/config.json`에서 아래 한 줄을:
```json
  "e2e_command": "pnpm playwright test --reporter=json",
```
다음으로 바꾼다:
```json
  "e2e_command": "PLAYWRIGHT_BASE_URL=https://ca-admin-staging.amass.co.kr pnpm playwright test -c playwright.staging.config.ts --reporter=json",
```
다른 필드(`name`, `path`, `slack_channel`, `unit_command`)는 건드리지 않는다.

- [ ] **Step 3: JSON 유효성 확인**

Run:
```bash
node -e 'const c=require("./projects/ca-admin/config.json"); console.log(c.e2e_command)'
```
Expected: `PLAYWRIGHT_BASE_URL=https://ca-admin-staging.amass.co.kr pnpm playwright test -c playwright.staging.config.ts --reporter=json`
(파싱 에러가 나면 쉼표/따옴표 깨진 것 — 수정)

---

### Task 3: 스케줄러 래퍼로 end-to-end 검증

**Files:** 없음 (실행 검증)

- [ ] **Step 1: 스케줄러를 통해 ca-admin E2E만 실행**

Run:
```bash
./scripts/run-project.sh ca-admin --only e2e
```
Expected: 로그에 `Starting ca-admin E2E tests ...` → `E2E results saved: .../results/ca-admin/e2e/2026-06-01.json`. (run-project.sh가 대상 디렉토리에서 새 `e2e_command`를 실행하고 stdout을 캡처해 파싱)

- [ ] **Step 2: 저장된 결과 JSON 검증 — 스케줄러가 만든 최종 산출물**

Run:
```bash
node -e '
const r = require("./results/ca-admin/e2e/2026-06-01.json");
console.log("status:", r.status, "| passed:", r.passed, "| failed:", r.failed, "| total:", r.total);
'
```
Expected: `parse-pw-results.js`가 생성한 요약 객체가 출력되고, `passed`가 6보다 크게 증가. Task 1 Step 4의 직접 실행 집계와 대체로 일치해야 한다. 결과가 비어있거나 파싱 실패면 stdout 캡처 문제 — `e2e_command`에 `--reporter=json`이 들어갔는지 재확인.

---

### Task 4: 회귀 — 기존 스케줄러 스크립트 테스트 통과 확인

**Files:** 없음 (기존 테스트 실행)

- [ ] **Step 1: run-project 테스트 실행**

Run:
```bash
node scripts/__tests__/run-project.test.js && echo "run-project OK"
```
Expected: 에러 없이 종료, `run-project OK` 출력. (이 테스트는 가짜 프로젝트/바이너리를 쓰므로 config.json 변경과 무관하게 통과해야 한다. 깨지면 의도치 않게 공유 로직을 건드린 것)

- [ ] **Step 2: 파서 테스트 실행**

Run:
```bash
node scripts/__tests__/parse-pw-results.test.js && echo "parse-pw OK"
```
Expected: 에러 없이 종료, `parse-pw OK` 출력.

---

### Task 5: 커밋

**Files:**
- `projects/ca-admin/config.json`
- `docs/superpowers/plans/2026-06-01-ca-admin-e2e-staging-config-fix.md`

- [ ] **Step 1: 변경 스테이징 및 커밋**

```bash
git add projects/ca-admin/config.json docs/superpowers/plans/2026-06-01-ca-admin-e2e-staging-config-fix.md
git commit -m "fix: ca-admin E2E를 staging 설정으로 실행 (dev 컴파일 타임아웃 제거)

기본 playwright.config.ts는 로컬 next dev 서버를 띄워 ~20 워커가
동시에 on-demand 라우트 컴파일을 유발 → 30초 타임아웃으로 15개 실패.
이미 존재하는 playwright.staging.config.ts(배포 staging 대상, workers:1)를
사용하도록 e2e_command 변경. CLI --reporter=json으로 stdout 캡처 유지.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Expected: 커밋 성공. (현재 작업 브랜치 `claude/blissful-herschel-3a8042`에서 진행)

---

## 선택 사항 (Optional) — 대시보드 실패 스크린샷 보존

staging 설정은 `screenshot: 'off'`, `trace: 'off'`라 실패해도 첨부물이 없다. 최근 대시보드 작업(실패 상세에 스크린샷/비디오 렌더)을 staging 실행에서도 살리려면, 대상 프로젝트의 `playwright.staging.config.ts`에서 `use.screenshot`를 `'only-on-failure'`로 바꾼다. 이는 **scheduler 레포가 아니라 ca-front 레포 변경**이며 별도 PR로 다루는 것이 깔끔하다. 핵심 수정(타임아웃 제거)과 분리한다.

## Self-Review

- **Spec coverage:** "왜 6개만 통과하는가"의 원인(dev 서버 컴파일 적체 + 잘못된 config 선택) 규명 → 근본 원인 섹션. 수정(staging config 전환) → Task 2. 검증 → Task 1·3. 회귀 → Task 4. 커밋 → Task 5. 누락 없음.
- **Placeholder scan:** 모든 단계에 실제 명령·예상 출력 명시. TBD/이하 생략 없음.
- **Type/name consistency:** 파일 경로, `e2e_command` 문자열, 결과 파일 경로(`results/ca-admin/e2e/2026-06-01.json`)가 task 전반에서 일치.
