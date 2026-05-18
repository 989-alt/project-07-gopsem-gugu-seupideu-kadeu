# Fixes — Cycle 1 → 2

## 변경 사항

### tests/e2e.py 단계 12 (접근성 focus outline 검증)
- **Before**: `page.locator(".chip").first.focus()` — JS `.focus()` 만 호출 → `:focus-visible` 트리거 안 됨.
- **After**: `body` 5px 위치 클릭으로 active element 초기화 → `keyboard.press("Tab")` 을 BUTTON 만날 때까지 반복. 키보드 navigation 시나리오를 정확히 재현.
- **이유**: `:focus-visible` 은 W3C 표준상 키보드 입력 직후에만 활성. 마우스 클릭/JS focus 에선 outline 보이지 않는 것이 의도된 동작. Vercel 디자인 의도와도 일치 (마우스 사용자에겐 시각적 노이즈 없음, 키보드 사용자에겐 명확한 ring).

## 앱 코드 변경
- 없음. P0/P1/P2 버그가 없었으므로.

## Cycle 2 결과
- 13 시나리오 ALL PASS
- console.error / pageerror / network failure 모두 0건
- Ralph loop 종료 — 배포 단계로 진행
