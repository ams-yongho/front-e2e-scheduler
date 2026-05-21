# 유닛테스트 통합 설계

## 목표

기존 E2E 자동화 스케줄러에 **유닛테스트**를 같은 파이프라인으로 통합한다. 매일 12:00 KST 실행 시 등록된 각 프로젝트의 E2E와 유닛테스트가 모두 수행되고, 결과는 타입별로 분리 저장되며, 하나의 Slack 요약과 하나의 대시보드에서 두 타입을 모두 확인할 수 있어야 한다.

## 범위 결정

- E2E와 유닛테스트는 동일 파이프라인이지만 **JSON 스키마와 파서가 다르므로 명시적으로 두 타입을 둔다**. `lint`, `typecheck` 같은 추가 타입을 일반화하는 것은 본 설계 범위 밖이다.
- 유닛테스트 프레임워크는 Vitest와 Jest를 지원한다. 두 프레임워크의 JSON reporter 출력 스키마가 거의 동일하므로 단일 파서로 처리한다.
- 한 프로젝트가 유닛테스트를 등록하지 않은 경우에도 파이프라인은 정상 동작해야 한다. 해당 프로젝트의 유닛테스트는 skip되고, Slack/대시보드에는 `Unit -` 또는 `등록 안 됨`으로 표시된다.

## config.json 변경

기존 `command` 필드를 `e2e_command`로 **리네임**하고 `unit_command`를 새로 추가한다.

```json
{
  "name": "ca-admin",
  "path": "/Users/yongho/.../ca-admin",
  "e2e_command": "pnpm playwright test --reporter=json",
  "unit_command": "pnpm vitest run --reporter=json",
  "slack_channel": "#qa-alerts"
}
```

- `e2e_command`가 없으면 해당 프로젝트의 E2E는 skip한다 (`결과 없음`).
- `unit_command`가 없으면 해당 프로젝트의 유닛테스트는 skip한다 (`Unit -`).
- 모든 12개 기존 `projects/*/config.json` 파일은 일괄 변경한다 (`command` → `e2e_command`). 코드에서 `command` 키 fallback은 두지 않는다.

## 결과 저장 레이아웃

E2E와 유닛테스트 결과는 타입별 디렉토리로 분리한다.

```
results/
├── manifest.json
├── ca-admin/
│   ├── e2e/
│   │   └── 2026-05-21.json
│   └── unit/
│       └── 2026-05-21.json
└── …
```

`manifest.json`은 기존과 동일하게 `{ projects, lastUpdated }` 형식이지만, 대시보드가 두 타입을 모두 인지하도록 각 프로젝트의 `tests` 배열을 추가한다.

```json
{
  "projects": ["ca-admin", "biz-admin", "…"],
  "tests": {
    "ca-admin": ["e2e", "unit"],
    "biz-admin": ["e2e"]
  },
  "lastUpdated": "2026-05-21T03:00:00.000Z"
}
```

`tests`는 각 프로젝트의 `config.json`에서 `e2e_command`/`unit_command` 존재 여부로 채운다.

## 결과 JSON 스키마

### E2E (변경 없음, 위치만 이동)

기존 `parse-pw-results.js`의 출력 그대로. 단 저장 위치가 `results/[project]/e2e/YYYY-MM-DD.json`으로 이동하며, 출력에 `"type": "e2e"` 필드를 추가한다.

### Unit (신규)

```json
{
  "project": "ca-admin",
  "type": "unit",
  "date": "2026-05-21",
  "status": "failed",
  "framework": "vitest",
  "total": 120,
  "passed": 118,
  "failed": 2,
  "skipped": 0,
  "duration": "12초",
  "failures": [
    {
      "test": "formatPrice handles zero",
      "file": "src/utils/price.test.ts",
      "line": 14,
      "error": "Expected '0원' but got '0'"
    }
  ],
  "slowTests": [
    { "test": "…", "file": "…", "durationMs": 850 }
  ]
}
```

- `framework`는 reporter 출력의 마커로 자동 감지한다. 우선 `unit_command` 문자열에 `vitest` 또는 `jest`가 포함되어 있으면 그것을 신뢰한다. 명령에서 감지가 안 되면 출력의 프레임워크별 고유 필드(예: Vitest의 시작 라인 `RUN  v` 또는 Jest의 출력 시그니처)로 보조 식별을 시도하고, 그래도 안 되면 `framework: "unknown"`으로 표기하고 정상 진행한다.
- 유닛테스트는 브라우저 개념이 없으므로 `browsers` 필드를 두지 않는다. `flaky` 개념도 두지 않는다 (Vitest/Jest의 retry는 별도 처리하지 않음).
- `slowTests`는 상위 5개로 제한한다 (E2E와 동일 규칙).

## 스크립트 변경

### `scripts/run-project.sh`

- 인자: `run-project.sh <project> [--only e2e|unit]`. `--only` 미지정 시 두 타입 모두 실행.
- 실행 순서: E2E → Unit (순차). 둘은 독립적으로 실패해도 다른 쪽 진행에 영향을 주지 않는다.
- `config.json`에서 `e2e_command`, `unit_command`를 각각 읽고, 비어 있으면 해당 타입은 skip하고 결과 파일도 생성하지 않는다.
- 결과 저장 경로: `results/[project]/e2e/YYYY-MM-DD.json`, `results/[project]/unit/YYYY-MM-DD.json`.
- E2E 실행 후 `parse-pw-results.js`로 파싱, Unit 실행 후 `parse-unit-results.js`로 파싱.

### `scripts/parse-unit-results.js` (신규)

- 입력: 프레임워크 JSON 출력 파일 경로, 프로젝트명, 날짜.
- 동작: Vitest/Jest 어느 쪽이든 공통 스키마로 정규화. `parsePlaywrightOutputText`와 동일하게 빈 출력/혼합된 stdout 케이스를 방어한다 (라인 시작 `{` 탐색 fallback).
- 출력: 위 "Unit 결과 JSON 스키마" 형식.
- 빈 출력일 경우 exit code 2로 종료하고 stderr 로그 위치를 안내한다.

### `scripts/run-all.sh`

- 첫 동작으로 `scripts/migrate-results-layout.sh`를 호출한다. 마이그레이션 스크립트는 idempotent하게 동작해 이미 새 레이아웃이면 즉시 종료한다.
- 이후 등록된 프로젝트를 순회하며 `run-project.sh`를 호출한다 (기존과 동일).
- `manifest.json` 생성 로직에 `tests` 맵 추가.
- 마지막에 `slack-notify.js --summary`를 1회 호출.

### `scripts/migrate-results-layout.sh` (신규)

- `results/[project]/YYYY-MM-DD.json` 파일을 모두 찾아 `results/[project]/e2e/YYYY-MM-DD.json`으로 이동한다.
- 이미 e2e/ 디렉토리에만 파일이 있고 루트 레벨에 날짜 JSON이 없으면 아무 작업도 하지 않는다 (idempotent).
- 이동 후 비어 있는 임시 파일은 정리하지 않는다 (수동 점검 여지).
- `run-all.sh`에서 자동 호출되지만, 수동 실행도 가능하다.

### `scripts/slack-notify.js`

- 결과 파일 경로 패턴 변경: `results/[project]/e2e/YYYY-MM-DD.json`, `results/[project]/unit/YYYY-MM-DD.json` 두 개 모두 읽는다.
- 한 프로젝트의 전체 상태는 두 타입 결과를 모두 보고 결정한다. 등록되지 않은 타입은 상태 결정에서 제외한다.

## Slack 메시지

Block Kit 구조는 기존 구조를 유지하면서 Summary와 Project 섹션을 확장한다.

```
[Header] 테스트 전체 결과 · 2026-05-21
[Status] ❌ 일부 실패

[Summary 1: E2E]
프로젝트 통과 10 / 12
테스트 통과 380 / 412
실패 12건

[Summary 2: Unit]
프로젝트 통과 11 / 12
테스트 통과 2150 / 2180
실패 8건

[Summary 3: 총 소요시간]
8분 12초

[Projects]
✅ ca-admin       E2E 19/21 · Unit 118/120 · 41초
❌ partsfit-mall  E2E 69/160 · Unit 401/410 · 1분 12초
⚠ typist          E2E 결과 없음 · Unit -

[Action] 대시보드 열기
```

규칙:

- 전체 통합 상태는 E2E와 Unit 모두 통과(또는 미등록)여야 ✅, 어느 쪽이라도 실패가 있으면 ❌.
- 프로젝트 줄은 항상 한 줄에 두 타입을 모두 표시한다. 미등록 타입은 `-`로, 결과 파일이 없으면 `결과 없음`으로 표시한다.
- 프로젝트 라인의 시간 표기는 E2E와 Unit 두 타입의 **합산**이다. 두 타입이 sequential로 실행되므로 합산이 실제 그 프로젝트가 점유한 시간이다.

## 대시보드

### 메인 그리드

기존 프로젝트 타일은 한 가지 상태(E2E)만 표시했으나, 이제 타일 안에 E2E와 Unit 두 줄을 표시한다.

- 타일 헤더: 프로젝트명 + 종합 상태 배지 (둘 다 통과면 `통과`, 어느 쪽이라도 실패면 `실패`, 데이터 전혀 없으면 `데이터 없음`).
- E2E 줄: 통과/총합 · 실패 수 · 시간.
- Unit 줄: 통과/총합 · 실패 수 · 시간. 미등록이면 `등록 안 됨` muted.
- 강조선/tint는 종합 상태에 따른다.

### 프로젝트 상세 페이지

상단에 탭 두 개: `E2E` / `Unit`. 기본 탭은 E2E.

- `E2E` 탭: 기존 콘텐츠 그대로 (브라우저별 결과, 실패 상세, flaky, 느린 테스트, 30일 히스토리).
- `Unit` 탭: framework 배지(vitest/jest), 통과율, 실패 상세, 느린 테스트, 30일 히스토리. 브라우저 섹션과 flaky 섹션은 없음.
- 한 타입이 미등록인 프로젝트는 해당 탭을 비활성화하고 `이 프로젝트는 유닛테스트가 등록되지 않았습니다` 안내를 표시한다.

### 데이터 로딩

대시보드는 `results/manifest.json`을 먼저 읽고, `tests[project]` 배열에 따라 `results/[project]/e2e/...` 또는 `results/[project]/unit/...`에서 결과를 가져온다. 미등록 타입에 대해서는 fetch를 시도하지 않는다.

## 테스트 (TDD)

- `scripts/__tests__/parse-unit-results.test.js` 신규.
  - Vitest JSON 픽스처 → 공통 스키마 출력 검증.
  - Jest JSON 픽스처 → 공통 스키마 출력 검증.
  - 빈 출력 → exit code 2.
  - 혼합 stdout (디버그 로그 + JSON) → JSON만 추출.
  - framework 식별이 안 되는 케이스 → `framework: "unknown"`.
- `scripts/__tests__/slack-notify.test.js` 업데이트.
  - 통합 요약(E2E + Unit) 픽스처에서 두 Summary 섹션이 만들어지는지 검증.
  - 프로젝트 라인이 한 줄에 두 타입 모두 표기하는지 검증.
  - Unit 미등록 프로젝트에서 `Unit -` 표기 검증.
- `scripts/__tests__/migrate-results-layout.test.js` 신규.
  - 기존 루트 레벨 날짜 JSON이 `e2e/` 하위로 이동하는지.
  - 이미 마이그레이션된 상태에서 호출해도 아무 일이 일어나지 않는지.
- 대시보드 변경은 수동 확인 (`docker-compose up` → `http://localhost:8080`).

## 마이그레이션 계획

1. `scripts/migrate-results-layout.sh` 신규 + 자동 호출 추가.
2. 모든 `projects/*/config.json`에서 `command` → `e2e_command` 일괄 리네임.
3. `parse-pw-results.js` 출력에 `"type": "e2e"` 추가.
4. `parse-unit-results.js` 추가.
5. `run-project.sh`, `run-all.sh`, `slack-notify.js`, 대시보드 순서로 작업.
6. 첫 운영 실행 시 `migrate-results-layout.sh`가 자동으로 호출되므로 별도 수동 절차는 없다.

## 비범위

- Vitest/Jest 외 다른 유닛테스트 프레임워크 지원.
- 유닛테스트 retry/flaky 추적.
- 커버리지 정보 수집/표시.
- 유닛테스트만 별도 스케줄로 실행하는 기능.
