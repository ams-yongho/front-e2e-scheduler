# 의사결정 기록

## 시도했다가 실패한 방식들

| 방식           | 실패 이유                                                                               |
| -------------- | --------------------------------------------------------------------------------------- |
| Cloud Routines | Anthropic 클라우드 환경에서 `cdn.playwright.dev` 네트워크 차단 → Chromium 다운로드 불가 |
| Cowork 스케줄  | 동일하게 Playwright 실행 불가                                                           |
| GitHub Actions | 유료 과금 발생                                                                          |

## 최종 선택: Mac 호스트 cron + Docker nginx 대시보드

- 로컬 Mac의 cron이 주중 12:00 KST에 등록된 모든 프로젝트 E2E 테스트를 순회 실행
- 결과를 JSON으로 저장하고 Slack `#qa-alerts` 채널로 전송
- Docker 컨테이너는 E2E 테스트를 실행하지 않고 nginx로 웹 대시보드와 `results/`를 서빙
- 테스트 대상이 회사 내부망 스테이징 서버이므로, Mac이 내부망 또는 VPN에 연결된 상태에서 호스트 환경의 프로젝트 경로와 Playwright 의존성을 그대로 사용한다
- launchd LaunchAgent를 한 차례 도입했으나 macOS Background Task Management 차단(`posix_spawn` Operation not permitted)으로 시스템 설정 토글 부담이 커서 cron으로 회귀. cron은 시스템 데몬이라 BTM 대상이 아니며, `/usr/sbin/cron`에 한 번만 Full Disk Access를 부여하면 자식 프로세스(bash, node, pnpm)가 권한을 상속받는다
