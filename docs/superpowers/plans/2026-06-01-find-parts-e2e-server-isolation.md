# find-parts E2E 서버 격리 (포트 충돌 / reuseExistingServer) 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** find-parts의 모든 E2E 테스트가 실패하는 원인(다른 앱이 점유한 포트 3000을 재사용)을 제거하고, 전용 포트 + `reuseExistingServer: false`로 서버를 격리한다.

**Architecture:** Playwright `webServer`가 항상 find-parts 자신의 dev 서버를 전용 포트(기본 3011)에서 띄우도록 고정한다. 외부에 떠 있는 서버를 절대 재사용하지 않으므로(`reuseExistingServer: false`), scm-front 등 다른 앱이 3000을 점유해도 find-parts 테스트가 엉뚱한 앱으로 돌아가지 않는다. 동일 모노레포의 `fp-part-quote`(3010) 및 `ca-front`의 모든 앱이 이미 쓰는 검증된 패턴을 따른다.

**Tech Stack:** Playwright (`@playwright/test`), Next.js (`next dev`), `env-cmd`, Vitest(가드 테스트).

---

## 근본 원인 (조사 결과 / Root Cause)

증거:

- find-parts `playwright.config.ts`: `baseURL: 'http://localhost:3000'`, `webServer.command: 'pnpm dev'`, `webServer.url: 'http://localhost:3000'`, `reuseExistingServer: !process.env.CI`.
- 스케줄러는 `pnpm playwright test --reporter=json`를 **`CI` 없이** 실행 → `reuseExistingServer === true`.
- `scm-front/apps/scm`도 `localhost:3000`을 쓰며 `command: 'pnpm build && pnpm start'`(장수명 `next start` 프로덕션 서버, `timeout: 600_000`). Playwright 종료 시 `pnpm` → `next start` 자식 프로세스가 고아(orphan)로 남아 3000을 계속 점유한다.
- find-parts 실패 결과 33건 중 32건의 `test-results/*/error-context.md` 스냅샷이 find-parts가 아니라 **"SCM QA · 회원/상품 관리"** 앱(`/members`, `/products`, `/audit` 내비)을 `localhost:3000`에서 렌더링 → find-parts 테스트가 SCM 앱을 대상으로 돌아가 전부 실패. 나머지 1건은 `net::ERR_CONNECTION_REFUSED`(점유 서버가 잠시 죽어있던 타이밍).

결론: **포트 3000을 공유 + `reuseExistingServer: !CI`(스케줄러에서 사실상 `true`)** 조합 때문에 find-parts가 외부(scm) 서버를 잡아채 모든 테스트가 실패한다.

해결: find-parts에 전용 포트를 주고 `reuseExistingServer: false`로 격리한다. 이것만으로 find-parts는 누가 3000을 점유하든 영향을 받지 않는다.

### 안전성 사전 확인 (포트 변경이 깨뜨리지 않는 것)

- **CORS:** find-parts 앱은 staging API(`https://fp-back-staging.amass.co.kr`, cross-origin)를 호출하지만, **모든 E2E 스펙이 `**/api/**`를 `page.route`로 모킹**한다(`e2e/helpers/auth.ts`의 `mockStagingFallback`가 catch-all). 따라서 테스트 중 실제 staging API/CORS를 타지 않으며, 포트를 3000이 아닌 값으로 바꿔도 안전하다. (`fp-part-quote`가 3010으로 동일하게 동작 중)
- **앱 내부 리다이렉트:** 상대 경로(`waitForURL('**/hero')` 등) 기반이라 포트와 무관.
- **health 게이팅:** find-parts에는 `src/app/health` 라우트가 존재하므로 `webServer.url`을 `/health`로 둘 수 있다(`ca-front` 앱들과 동일).

---

## File Structure

대상 저장소는 **find-parts 앱**(`/Users/yonghokim/Documents/GitHub/amass/fp-front/packages/find-parts`)이다. 스케줄러 저장소는 수정하지 않는다(스케줄러는 config의 `e2e_command`만 호출하므로 변경 불필요).

- **Modify:** `/Users/yonghokim/Documents/GitHub/amass/fp-front/packages/find-parts/playwright.config.ts`
  — 전용 포트(env 오버라이드 가능, 기본 3011) + `reuseExistingServer: false` + `/health` 게이팅. 단일 책임: E2E 실행 환경 정의.
- **Create (Test):** `/Users/yonghokim/Documents/GitHub/amass/fp-front/packages/find-parts/src/test/playwright-config.guard.test.ts`
  — 격리 불변식(외부 서버 재사용 금지 / 3000 미사용)을 텍스트로 검증하는 Vitest 회귀 가드. 단일 책임: 설정이 다시 3000+reuse로 회귀하는 것을 막는다.

> Vitest 설정 확인: `vitest.config.ts`의 `include: ['**/*.test.{ts,tsx}']`이며 `e2e/**`와 `playwright.config.ts`는 `exclude`됨. 가드 테스트는 `src/test/*.test.ts`(include 매치, 실행 대상)에 두고, `playwright.config.ts`를 **파일 텍스트로 읽어** 검증한다(설정을 import/실행하지 않음). 스케줄러의 `unit_command`(`pnpm vitest run`)에도 자동 포함되어 회귀를 잡는다.

---

## Task 1: E2E 서버 격리 — 가드 테스트(red) → 설정 수정(green)

**Files:**
- Create: `/Users/yonghokim/Documents/GitHub/amass/fp-front/packages/find-parts/src/test/playwright-config.guard.test.ts`
- Modify: `/Users/yonghokim/Documents/GitHub/amass/fp-front/packages/find-parts/playwright.config.ts`

작업 디렉토리는 모두 find-parts 앱 루트다:
```bash
cd /Users/yonghokim/Documents/GitHub/amass/fp-front/packages/find-parts
```

- [ ] **Step 1: 실패하는 가드 테스트 작성**

`src/test/playwright-config.guard.test.ts` 생성:

```ts
import { readFileSync } from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

// vitest 는 find-parts 앱 루트에서 실행되므로 process.cwd() 가 패키지 루트다.
const configPath = path.resolve(process.cwd(), 'playwright.config.ts');
const configSrc = readFileSync(configPath, 'utf-8');

describe('playwright.config E2E 서버 격리 불변식', () => {
  it('외부(기존) 서버를 절대 재사용하지 않는다', () => {
    expect(configSrc).toMatch(/reuseExistingServer:\s*false/);
    // CI 여부에 따라 재사용하던 과거 회귀 패턴을 금지한다.
    expect(configSrc).not.toMatch(/reuseExistingServer:\s*!process\.env\.CI/);
  });

  it('포트 3000을 공유하지 않고 전용 포트를 사용한다', () => {
    // 다른 앱(scm-front 등)과 충돌하던 3000 하드코딩을 금지한다.
    expect(configSrc).not.toMatch(/localhost:3000/);
    // 전용 포트는 E2E_PORT 로 오버라이드 가능해야 한다.
    expect(configSrc).toMatch(/E2E_PORT/);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인 (red)**

Run:
```bash
pnpm vitest run src/test/playwright-config.guard.test.ts
```
Expected: 두 케이스 모두 FAIL.
- "외부(기존) 서버를 절대 재사용하지 않는다": 현재 설정에 `reuseExistingServer: !process.env.CI`가 있어 `toMatch(/reuseExistingServer:\s*false/)` 실패.
- "포트 3000을 공유하지 않고 전용 포트를 사용한다": 현재 `localhost:3000`가 존재하고 `E2E_PORT`가 없어 실패.

- [ ] **Step 3: playwright.config.ts 수정 (전용 포트 + reuse:false + /health)**

`playwright.config.ts` 전체를 아래로 교체:

```ts
import { defineConfig, devices } from '@playwright/test';

// E2E 전용 포트. 다른 앱(scm-front 등)과 3000 포트를 공유하면
// reuseExistingServer 가 외부 서버를 잡아채 엉뚱한 앱으로 테스트가 돌아간다.
// 같은 모노레포의 fp-part-quote(3010)와 동일하게 전용 포트 + reuseExistingServer:false 로 격리한다.
const E2E_PORT = Number(process.env.E2E_PORT) || 3011;
const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'blob' : 'html',
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // pnpm dev = `env-cmd -f .env.staging next dev` 에 전용 포트를 명시한다.
    command: `env-cmd -f .env.staging next dev -p ${E2E_PORT}`,
    // health 라우트(src/app/health)가 200 을 반환할 때까지 대기한다.
    url: `${E2E_BASE_URL}/health`,
    // 외부 서버를 절대 재사용하지 않는다 — 포트 충돌로 시끄럽게 실패하는 편이
    // 엉뚱한 앱을 대상으로 조용히 전부 실패하는 것보다 낫다.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
```

- [ ] **Step 4: 가드 테스트 재실행 → 통과 확인 (green)**

Run:
```bash
pnpm vitest run src/test/playwright-config.guard.test.ts
```
Expected: 2 passed.

- [ ] **Step 5: 커밋**

```bash
cd /Users/yonghokim/Documents/GitHub/amass/fp-front
git add packages/find-parts/playwright.config.ts packages/find-parts/src/test/playwright-config.guard.test.ts
git commit -m "fix(find-parts): isolate E2E webServer on dedicated port (3011) with reuseExistingServer:false

포트 3000 공유 + reuseExistingServer:!CI 조합으로 scm-front 등 외부 서버를
재사용해 모든 E2E 가 엉뚱한 앱(SCM)에서 실행되어 실패하던 문제 수정."
```

---

## Task 2: 행위 검증 — 포트 3000 점유 상황에서 격리 증명

코드 변경 없이, 실제 버그 재현 조건(3000 점유)에서 수정이 효과 있는지 확인한다. 작업 디렉토리: find-parts 앱 루트.

```bash
cd /Users/yonghokim/Documents/GitHub/amass/fp-front/packages/find-parts
```

- [ ] **Step 1: 잔여 서버 정리 후 포트 3000을 가짜(decoy) 서버로 점유**

scm의 고아 `next start`를 흉내내 3000을 점유한다(별도 터미널/백그라운드).

```bash
# 혹시 떠 있을 수 있는 잔여 프로세스 정리
lsof -ti:3000 -ti:3011 | xargs kill -9 2>/dev/null || true
# 3000 을 점유 (find-parts 가 아닌 임의 서버)
python3 -m http.server 3000 >/tmp/decoy-3000.log 2>&1 &
echo "DECOY_PID=$!"
sleep 1
# 점유 확인
lsof -iTCP:3000 -sTCP:LISTEN -n -P
```
Expected: 3000 LISTEN 상태(python). find-parts와 무관한 서버.

- [ ] **Step 2: 수정된 설정으로 전체 E2E 실행**

Run:
```bash
pnpm playwright test --reporter=line
```
Expected:
- Playwright가 3000(decoy)을 **무시**하고 `env-cmd -f .env.staging next dev -p 3011`로 자체 서버를 3011에 기동한 뒤 `http://localhost:3011/health`가 200을 반환할 때까지 대기.
- 테스트가 find-parts 앱(`/hero`, `/product`, `/search`, `/wish` 등) 대상으로 실행됨.
- 결과: 전체(33) 통과. (만약 통과하지 않는 케이스가 있으면 그건 격리와 별개의 실제 결함이므로 Step 4에서 분류한다.)

- [ ] **Step 3: 산출물 스냅샷이 더 이상 SCM 앱이 아님을 확인**

실패가 0이면 `test-results/`에 새 error-context가 없어야 한다. 혹시 실패가 남았다면:
```bash
grep -rl "SCM QA" test-results/ 2>/dev/null && echo "STILL_WRONG_APP" || echo "OK: no SCM snapshots"
```
Expected: `OK: no SCM snapshots` (SCM 앱 스냅샷이 사라짐 = 격리 성공).

- [ ] **Step 4: decoy 정리**

```bash
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
echo "decoy stopped"
```
Expected: 3000 점유 해제.

- [ ] **Step 5: 잔여 실제 결함 처리(있을 때만)**

Step 2에서 격리 후에도 실패하는 스펙이 남으면, 그것은 포트 문제와 무관한 별도 결함이다. 해당 스펙의 `error-context.md`(이제 find-parts 앱 스냅샷)를 근거로 superpowers:systematic-debugging 으로 개별 디버깅한다. (예: 셀렉터 변경, 모킹 누락) — 본 플랜의 범위 밖이며 발견 시 별도 작업으로 분리한다.

> 검증 태스크이므로 커밋 없음.

---

## Task 3 (선택/관련 하드닝): scm-front가 포트 3000을 고아 서버로 점유하지 못하게 한다

> **범위 주의:** Task 1만으로 find-parts는 완전히 해결된다. 이 태스크는 *근본 점유원*(scm-front의 고아 `next start`)을 없애 다른 3000-공유 프로젝트들의 동일 사고도 예방하는 보강이다. 별도 저장소(`scm-front`)를 건드리므로 선택 사항으로 분리한다. 진행하지 않을 경우 건너뛴다.

**Files:**
- Modify: `/Users/yonghokim/Documents/GitHub/amass/scm-front/apps/scm/playwright.config.ts`
- Create (Test): `/Users/yonghokim/Documents/GitHub/amass/scm-front/apps/scm/src/__tests__/playwright-config.guard.test.ts` *(경로는 scm 저장소의 vitest include 규칙에 맞게 조정; 아래 Step 1에서 확인)*

```bash
cd /Users/yonghokim/Documents/GitHub/amass/scm-front/apps/scm
```

- [ ] **Step 1: scm의 vitest include 규칙과 health 라우트 유무 확인**

Run:
```bash
sed -n '1,60p' vitest.config.ts 2>/dev/null || sed -n '1,60p' vite.config.ts
ls src/app/health 2>/dev/null || echo "NO_HEALTH_ROUTE"
```
Expected: vitest `test.include` 패턴 확인(가드 테스트 위치 결정용)과 `/health` 라우트 존재 여부 확인. health 라우트가 없으면 `webServer.url`은 `http://localhost:<port>/`(루트)로 둔다.

- [ ] **Step 2: 실패하는 가드 테스트 작성**

scm의 include 패턴에 맞는 위치(예: `src/__tests__/playwright-config.guard.test.ts`)에 생성:

```ts
import { readFileSync } from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const configSrc = readFileSync(
  path.resolve(process.cwd(), 'playwright.config.ts'),
  'utf-8'
);

describe('scm playwright.config E2E 서버 격리 불변식', () => {
  it('외부(기존) 서버를 재사용하지 않는다', () => {
    expect(configSrc).toMatch(/reuseExistingServer:\s*false/);
    expect(configSrc).not.toMatch(/reuseExistingServer:\s*!process\.env\.CI/);
  });

  it('포트 3000을 공유하지 않고 전용 포트를 사용한다', () => {
    expect(configSrc).not.toMatch(/localhost:3000/);
    expect(configSrc).toMatch(/E2E_PORT/);
  });
});
```

- [ ] **Step 3: 가드 테스트 실행 → 실패 확인 (red)**

Run (scm 저장소의 단위 테스트 러너에 맞게; 대개):
```bash
pnpm vitest run src/__tests__/playwright-config.guard.test.ts
```
Expected: 2 FAIL (현재 `localhost:3000`, `reuseExistingServer: !process.env.CI`).

- [ ] **Step 4: scm playwright.config.ts 수정 (전용 포트 + reuse:false)**

현재 `webServer`/`use` 블록을 아래 패턴으로 교체한다. scm은 `pnpm build && pnpm start`(`next start`)를 쓰므로 포트 플래그를 `start`에 전달한다(`next start -p <port>`):

```ts
const E2E_PORT = Number(process.env.E2E_PORT) || 3020;
const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

// ...use.baseURL 을 E2E_BASE_URL 로:
//   use: { baseURL: E2E_BASE_URL, locale: 'ko-KR', trace: 'on-first-retry', screenshot: 'only-on-failure' }

// ...webServer:
webServer: {
  command: `pnpm build && pnpm start -p ${E2E_PORT}`,
  // health 라우트가 있으면 `${E2E_BASE_URL}/health`, 없으면 E2E_BASE_URL
  url: E2E_BASE_URL,
  reuseExistingServer: false,
  timeout: 600_000,
},
```

> 주의: `next start`는 장수명 프로세스다. `reuseExistingServer: false`이면 Playwright가 매 실행 자체 기동/종료하지만, 고아 프로세스가 남아 다음 실행에서 같은 포트를 점유할 수 있다. 스케줄러 보강(아래 Notes)으로 실행 전 포트 정리를 권장한다.

- [ ] **Step 5: 가드 테스트 재실행 → 통과 확인 (green)**

Run:
```bash
pnpm vitest run src/__tests__/playwright-config.guard.test.ts
```
Expected: 2 passed.

- [ ] **Step 6: 커밋**

```bash
cd /Users/yonghokim/Documents/GitHub/amass/scm-front
git add apps/scm/playwright.config.ts apps/scm/src/__tests__/playwright-config.guard.test.ts
git commit -m "fix(scm): isolate E2E webServer on dedicated port with reuseExistingServer:false

다른 앱(find-parts 등)이 3000 을 재사용해 SCM 앱으로 잘못 테스트되던
포트 점유/공유 사고 예방."
```

---

## Notes — 스케줄러 측 선택적 보강 (이 플랜에서는 코드 변경 안 함)

근본 수정은 위 Task 1로 끝나지만, 운영 안정성을 위해 다음을 후속으로 고려할 수 있다(별도 작업으로 분리 권장):

- **실행 전 포트 정리:** `scripts/run-project.sh`의 `run_e2e()`에서 E2E 명령 실행 직전, 고아 dev/prod 서버를 정리. 단, 프로젝트마다 포트가 다르므로 config에 `e2e_port`를 추가해 `lsof -ti:$PORT | xargs kill -9` 형태로 정리하는 방식이 안전. (현재 config 스키마에 포트 필드 없음 → 추가 설계 필요)
- **`CI` 강제 지양:** 스케줄러에서 `CI=1`을 전역으로 주면 모든 `reuseExistingServer: !process.env.CI` 설정이 `false`가 되지만, 포트 공유 프로젝트는 시작 단계에서 충돌로 실패하게 된다. 전용 포트 격리(Task 1/3)가 선행되지 않으면 오히려 더 많은 실패를 부른다 → 권장하지 않음.

---

## Self-Review

**1. Spec coverage(요청: 원인 파악 + 개선):**
- 원인 파악 → "근본 원인" 섹션에서 증거(32/33 SCM 스냅샷, scm `next start` 고아, `reuseExistingServer:!CI` + 3000 공유)로 규명. ✅
- 개선 → Task 1(find-parts 전용 포트 + reuse:false + health 게이팅 + 회귀 가드 테스트). ✅
- 검증 → Task 2(3000 점유 상황에서 격리 행위 증명). ✅
- 재발 방지/확산 차단 → Task 3(선택, scm 하드닝) + Notes(스케줄러 보강). ✅

**2. Placeholder scan:** "TBD/적절히 처리" 류 없음. 모든 코드 단계에 실제 코드/명령/기대 출력 포함. Task 3는 scm 저장소 규칙(vitest include, health 유무)이 미확인이라 Step 1에서 먼저 확인하도록 명시(추측 금지). ✅

**3. Type/이름 일관성:** `E2E_PORT`(env), `E2E_BASE_URL`, `reuseExistingServer: false`, 가드 테스트 정규식(`/reuseExistingServer:\s*false/`, `/localhost:3000/`, `/E2E_PORT/`)이 Task 1↔3에서 동일. 기본 포트: find-parts=3011(fp-part-quote 3010 옆), scm=3020(충돌 회피). ✅

**4. 안전성:** 포트 변경의 CORS 영향 없음(전 스펙이 `**/api/**` 모킹)을 사전 확인 섹션에 명시. ✅
