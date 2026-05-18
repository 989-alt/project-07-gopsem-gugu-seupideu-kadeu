# Day 7 — 곱셈구구 스피드 카드 (Multiplication Speed Cards)

## 토픽 정보 (100-vibecoding-topics.md #007)
- **카테고리**: 수학
- **대상**: 3~4학년 · **환경**: 1:1
- **목표**: 2~9단 곱셈구구 무작위 출제 → 학생이 답 입력 → 즉시 채점 + 평균 응답시간 측정. 곱셈구구 자동화 정도를 "수치"로 보여주기.

## 포함 기능 (요구사항)
- 단 선택(2~9, 전체, 어려운 단만)
- 무작위 출제, 즉시 채점
- 응답시간 측정, 정답률·평균 시간 그래프
- 오답 카드 재출제 모드
- 결과 PNG/인쇄

## 배제 기능 (요구사항)
- 학생별 누적 점수 서버 저장
- 학급 랭킹·등수 비교
- 사진·식별 정보

## 기술 결정
- **스택**: 단일 `index.html` + vanilla CSS + Chart.js CDN
  - 단순 토픽이고 CDN 의존이 Chart.js 1개로 제한됨 → 단일 HTML이 적합.
  - Tailwind 등 빌드 단계 없음.
- **저장**: localStorage(직전 세션 결과만) + JSON export
- **AI**: 사용 안 함 (Gemini API 미사용 — 100-topics 문서에서 `AI 옵션: ✕`)
- **DESIGN.md**: Vercel (흑백 정밀 · `#171717` / `#ffffff` · Geist 계열 · shadow-as-border)

## 환경 제약
- Pages 정적 호스팅 (root에 `index.html`)
- Chart.js CDN 차단 시 fallback: SVG 그래프로 자체 렌더 (Phase 2 후보 — 차단 확인되면 적용)
- 개인정보 외부 전송 금지 — localStorage 단독 저장
