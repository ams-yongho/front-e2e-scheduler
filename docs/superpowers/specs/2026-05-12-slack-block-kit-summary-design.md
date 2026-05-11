# Slack Block Kit 전체 요약 알림 설계

## 배경

현재 Slack 전체 요약 알림은 Incoming Webhook에 단일 `text` 문자열만 전송한다. 이 방식은 구현은 단순하지만 프로젝트 수가 늘어나면 상태, 수치, 링크가 한 덩어리로 보여 가시성이 떨어진다.

이번 변경의 목표는 전체 프로젝트 결과를 모두 유지하면서 Slack 안에서 읽기 쉬운 카드형 요약으로 개선하는 것이다. 실패 상세 목록은 기존 정책대로 Slack에 포함하지 않고 대시보드에서 확인하도록 한다.

## 범위

- 전체 요약 알림만 Block Kit 기반 payload로 개선한다.
- 단일 프로젝트 결과 알림은 이번 변경 범위에서 유지한다.
- `DASHBOARD_URL` 검증 정책은 유지한다.
- 실패 테스트 상세는 Slack 요약에 포함하지 않는다.
- 등록된 모든 프로젝트는 Slack 요약 안에 표시한다.

## 메시지 디자인

요약 알림은 Slack Incoming Webhook에 `{ text, blocks }` 형태로 전송한다.

- `text`: Slack 알림 미리보기와 접근성 fallback으로 사용하는 짧은 요약 문장
- `blocks`: 실제 화면에 표시되는 Block Kit 메시지

Block 구성은 다음 순서를 따른다.

1. `header`
   - `E2E 테스트 전체 결과 · YYYY-MM-DD`
2. `section`
   - 전체 상태 문구
   - 예: `❌ 일부 실패` 또는 `✅ 전체 통과`
3. `section.fields`
   - `프로젝트 통과`: `5 / 8`
   - `테스트 통과`: `107 / 412`
   - `실패`: `137건`
   - `총 소요시간`: `2분 50초`
4. `divider`
5. 프로젝트별 결과 목록
   - 모든 프로젝트를 표시한다.
   - 각 프로젝트는 상태와 이름, 통과 수, 실패 수, 소요 시간을 한 줄로 요약한다.
   - 예: `✅ ca-admin` / `19/21 통과 · 실패 0건 · 29초`
6. `divider`
7. `actions`
   - `대시보드 열기` 버튼
   - 버튼 URL은 검증된 `DASHBOARD_URL`을 사용한다.

## 데이터 흐름

현재 `run-all.sh` 흐름은 유지한다.

1. 모든 프로젝트 E2E 테스트 실행
2. `results/[project]/YYYY-MM-DD.json` 저장
3. `results/manifest.json` 갱신
4. `scripts/slack-notify.js --summary <date> <projects_dir> <results_dir>` 실행
5. `slack-notify.js`가 프로젝트 목록과 결과 JSON을 읽어 Slack payload 생성
6. Incoming Webhook으로 payload 전송

## 코드 구조

`scripts/slack-notify.js`의 책임을 다음처럼 나눈다.

- 요약 수치 계산
  - 프로젝트 통과 수
  - 전체 passed/total/failed
  - 전체 duration 합산
- fallback 텍스트 생성
  - Slack 알림 목록과 스크린리더를 위한 요약
- Block Kit payload 생성
  - header, summary fields, project fields, button blocks
- Webhook 전송
  - 기존 `sendSlackMessage`는 문자열 대신 payload 객체를 받을 수 있게 변경한다.

프로젝트별 결과가 없거나 읽을 수 없으면 해당 프로젝트는 `❌ project-name`과 `결과 없음`으로 표시한다. 결과 없음은 전체 프로젝트 통과 수에 포함하지 않는다.

## Slack 제약 대응

Slack 메시지는 block 개수 제한이 있으므로 프로젝트 하나당 block 하나를 만들지 않는다. 프로젝트 결과는 `section.fields` 배열에 여러 항목으로 묶는다.

각 프로젝트는 2개 field를 사용한다.

- 첫 번째 field: 상태 아이콘과 프로젝트 이름
- 두 번째 field: 결과 요약

Slack `section.fields`는 한 section에 최대 10개 field를 넣을 수 있으므로 프로젝트 5개 단위로 section을 나눈다. 현재 8개 프로젝트는 프로젝트 목록 section 2개로 표시된다.

## 오류 처리

- `DASHBOARD_URL`이 없거나 `localhost`, `127.0.0.1`, `::1`이면 기존처럼 Slack 전송을 실패 처리한다.
- 결과 JSON이 없거나 파싱 실패하면 전체 전송은 계속하고 해당 프로젝트만 `결과 없음`으로 표시한다.
- Slack이 200이 아닌 상태를 반환하면 기존처럼 실패로 처리한다.

## 테스트 계획

`scripts/__tests__/slack-notify.test.js`를 Block Kit payload 기준으로 갱신한다.

검증 항목:

- fallback `text`에 날짜, 프로젝트 통과 수, 전체 통과 수, 실패 수가 포함된다.
- `blocks`에 header가 포함된다.
- summary fields에 프로젝트 통과, 테스트 통과, 실패, 총 소요시간이 포함된다.
- 모든 프로젝트가 blocks 안에 표시된다.
- 결과가 없는 프로젝트는 `결과 없음`으로 표시된다.
- 대시보드 버튼 URL이 `DASHBOARD_URL`과 일치한다.
- 실패 상세 정보 파일명과 테스트명은 요약 payload에 포함되지 않는다.
- `DASHBOARD_URL` 검증 테스트는 기존 정책을 유지한다.

## 완료 기준

- Slack 전체 요약 알림이 `{ text, blocks }` payload로 생성된다.
- 현재 캡처처럼 긴 텍스트 덩어리로 보이지 않고, 상단 요약과 프로젝트별 결과가 구분되어 보인다.
- 전체 프로젝트가 모두 표시된다.
- 대시보드 링크는 버튼으로 제공된다.
- 기존 테스트와 Slack 알림 테스트가 통과한다.
