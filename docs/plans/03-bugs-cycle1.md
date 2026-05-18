# Bug list — Cycle 1

## P3: focus outline 검증 실패 (테스트 결함)
- **재현**: 테스트 12 단계, `page.locator(".chip").first.focus()` → 계산된 outline-style `none`.
- **분석**: CSS가 `:focus-visible` 만 outline 설정. 이건 W3C 표준 동작 — JS `.focus()` 는 `:focus` 만 트리거하고 `:focus-visible` 은 키보드 입력 직후에만 활성.
- **결정**: 코드 수정 안 함. 테스트를 **Tab 키 시뮬레이트**로 변경 — 키보드 사용자 시나리오를 정확히 재현해야 함.
- **변경 파일**: `tests/e2e.py` 단계 12.

## 그 외
- console.error 0건
- pageerror 0건
- network failure 0건
- 12 단계 모든 기능 시나리오 PASS
- 모바일 360px 가로 스크롤 없음
- localStorage 직전 기록 정상 동작

## P0 / P1 / P2 버그
- 없음.

→ Cycle 2: 테스트만 수정 후 재실행.
