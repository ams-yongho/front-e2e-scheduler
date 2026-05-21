# E2E 자동화 스케줄러 프로젝트

## 목표

여러 프로젝트의 E2E 테스트를 매일 자동으로 실행하고, 결과를 Slack으로 받고, 웹 대시보드에서 팀이 함께 확인할 수 있는 시스템.

## 아키텍처

**Mac 호스트 cron + 도커 nginx 대시보드**

- 로컬 Mac의 cron이 주중 12:00 KST에 `scripts/run-all.sh` 실행 → 등록된 모든 프로젝트 E2E 테스트 순회
- 결과는 `results/[project]/YYYY-MM-DD.json`에 저장하고 Slack `#qa-alerts`로 전송
- 도커 nginx(포트 8080)가 `dashboard/dist/` + `results/` 볼륨을 서빙

## 환경 정보

- 패키지 매니저: pnpm
- E2E 프레임워크: Playwright
- 테스트 대상: 회사 내부망 스테이징 서버 (Mac이 내부망 또는 VPN 연결 상태여야 함)
- 대시보드 접근: `http://localhost:8080`

## 참고 문서

- 데이터 형식 / 대시보드 / 새 프로젝트 추가 방법 → [docs/spec.md](docs/spec.md)
- 아키텍처 의사결정 기록 → [docs/decisions.md](docs/decisions.md)
- 사용자 가이드 → [README.md](README.md)
