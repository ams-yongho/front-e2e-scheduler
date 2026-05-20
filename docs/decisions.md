# 의사결정 기록

## 시도했다가 실패한 방식들

| 방식           | 실패 이유                                                                               |
| -------------- | --------------------------------------------------------------------------------------- |
| Cloud Routines | Anthropic 클라우드 환경에서 `cdn.playwright.dev` 네트워크 차단 → Chromium 다운로드 불가 |
| Cowork 스케줄  | 동일하게 Playwright 실행 불가                                                           |
| GitHub Actions | 유료 과금 발생                                                                          |

## 최종 선택: Mac LaunchAgent + Docker nginx 대시보드

- 로컬 Mac의 LaunchAgent가 매일 오전 10시에 등록된 모든 프로젝트 E2E 테스트를 순회 실행
- 결과를 JSON으로 저장하고 Slack `#qa-alerts` 채널로 전송
- Docker 컨테이너는 E2E 테스트를 실행하지 않고 nginx로 웹 대시보드와 `results/`를 서빙
- 테스트 대상이 회사 내부망 스테이징 서버이므로, Mac이 내부망 또는 VPN에 연결된 상태에서 호스트 환경의 프로젝트 경로와 Playwright 의존성을 그대로 사용한다
- macOS에서는 `crontab`보다 launchd LaunchAgent가 권장되는 스케줄링 방식이므로, 운영 등록 절차는 LaunchAgent 기준으로 관리한다
