"""
e2e 테스트 — 곱셈구구 스피드 카드
실행: python3 -m playwright run 형태 아님. with_server.py 헬퍼로 호출.
  python3 /home/user/1-day-1-code-project/webapp-testing/scripts/with_server.py \
    --server "python3 -m http.server 5180 --bind 127.0.0.1 --directory ." --port 5180 \
    -- python3 tests/e2e.py
"""

import os
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

BASE = "http://127.0.0.1:5180"
SHOTS_DIR = Path(__file__).parent / "screenshots"
SHOTS_DIR.mkdir(exist_ok=True)

# console/page error 가 누적되는 곳 — CDN 차단류는 노이즈로 필터링
console_errors = []
page_errors = []
network_failures = []

NOISE_PATTERNS = (
    "cdn.tailwindcss.com",
    "Failed to load resource: net::ERR_CERT",
    "favicon.ico",
)


def is_noise(text: str) -> bool:
    return any(p in text for p in NOISE_PATTERNS)


def step(name: str):
    print(f"\n→ {name}")


def shot(page, name: str):
    path = SHOTS_DIR / f"{name}.png"
    page.screenshot(path=str(path), full_page=True)
    print(f"   📸 {path}")


def main() -> int:
    failures: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()

        page.on("console", lambda m: (
            console_errors.append(m.text)
            if m.type == "error" and not is_noise(m.text) else None
        ))
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        page.on("requestfailed", lambda r: (
            network_failures.append(f"{r.url} ({r.failure})")
            if not is_noise(r.url) else None
        ))

        # ----------------------------------------
        step("1. 랜딩 로드")
        page.goto(BASE)
        page.wait_for_load_state("networkidle")
        shot(page, "01-landing")

        # 설정 화면이 보이고 카드 화면은 hidden인지
        try:
            expect(page.locator("#screen-setup")).to_be_visible()
            expect(page.locator("#screen-card")).to_be_hidden()
            expect(page.locator("#screen-result")).to_be_hidden()
            print("   ✓ 설정 화면만 보임")
        except Exception as e:
            failures.append(f"initial-visibility: {e}")

        # 단 칩 8개 존재
        chips = page.locator(".chip")
        cnt = chips.count()
        if cnt != 8:
            failures.append(f"chip-count: 기대 8, 실제 {cnt}")
        else:
            print(f"   ✓ 단 칩 {cnt}개")

        # 시작 버튼 enabled (기본 전체 선택)
        if page.locator("#btn-start").is_disabled():
            failures.append("start-disabled-on-default")
        else:
            print("   ✓ 시작 버튼 활성")

        # ----------------------------------------
        step("2. 프리셋 — 어려운 단(6·7·8) 클릭 → 6/7/8만 pressed")
        page.locator('button[data-preset="hard"]').click()
        pressed = [int(c.get_attribute("data-dan")) for c in page.locator('.chip[aria-pressed="true"]').all()]
        if sorted(pressed) != [6, 7, 8]:
            failures.append(f"preset-hard: 기대 [6,7,8], 실제 {pressed}")
        else:
            print(f"   ✓ 어려운 단 프리셋 {pressed}")
        shot(page, "02-preset-hard")

        # ----------------------------------------
        step("3. 전체 프리셋 → 8개 모두 pressed")
        page.locator('button[data-preset="all"]').click()
        pressed_all = page.locator('.chip[aria-pressed="true"]').count()
        if pressed_all != 8:
            failures.append(f"preset-all: 기대 8, 실제 {pressed_all}")
        else:
            print(f"   ✓ 전체 프리셋 {pressed_all}개 active")

        # ----------------------------------------
        step("4. 칩 1개만 남기고 다 해제 → 최소 1개 유지 검증")
        # 9단부터 8단,7단... 까지 7개 해제 → 2단만 남음
        for n in [9, 8, 7, 6, 5, 4, 3]:
            page.locator(f'.chip[data-dan="{n}"]').click()
        # 2단까지 해제 시도 → 무시되어야
        page.locator('.chip[data-dan="2"]').click()
        left = page.locator('.chip[aria-pressed="true"]').count()
        if left != 1:
            failures.append(f"min-one-dan: 기대 1, 실제 {left}")
        else:
            print("   ✓ 최소 1단 유지 가드 작동")

        # ----------------------------------------
        step("5. 짝수 프리셋 + 10문항 라디오")
        page.locator('button[data-preset="even"]').click()
        page.locator('input[name="count"][value="10"]').check()
        even_pressed = sorted([int(c.get_attribute("data-dan")) for c in page.locator('.chip[aria-pressed="true"]').all()])
        if even_pressed != [2, 4, 6, 8]:
            failures.append(f"preset-even: 기대 [2,4,6,8], 실제 {even_pressed}")

        # ----------------------------------------
        step("6. 시작 → 카드 화면 전환 + 진행률 1/10")
        page.locator("#btn-start").click()
        page.wait_for_selector("#screen-card:not([hidden])")
        expect(page.locator("#screen-card")).to_be_visible()
        expect(page.locator("#screen-setup")).to_be_hidden()
        prog = page.locator("#progress-text").text_content().strip()
        if prog != "1 / 10":
            failures.append(f"progress-start: 기대 '1 / 10', 실제 '{prog}'")
        else:
            print(f"   ✓ 진행률 {prog}")

        # 입력 box 자동 focus
        focused_id = page.evaluate("() => document.activeElement && document.activeElement.id")
        if focused_id != "answer":
            failures.append(f"autofocus: 기대 'answer', 실제 '{focused_id}'")
        else:
            print("   ✓ 답 입력 자동 포커스")
        shot(page, "03-card")

        # ----------------------------------------
        step("7. 정답 풀이 — 10문항 모두 푼다")
        # 정답률 70% 정도가 되도록 — 일부 의도적 오답
        for i in range(10):
            # 현재 문제 파싱
            q = page.locator("#question").text_content().strip()
            m = re.match(r"(\d+)\s*×\s*(\d+)\s*=\s*\?", q)
            if not m:
                failures.append(f"question-parse: '{q}'")
                break
            a, b = int(m.group(1)), int(m.group(2))
            correct = a * b
            # i==2, i==6 두 문제는 일부러 오답 (오답 모드 검증용)
            ans = correct + 1 if i in (2, 6) else correct
            page.locator("#answer").fill(str(ans))
            # 자동 채점이 자리수 차야 작동 → Enter로 트리거 (자리수 모자라도 마무리)
            page.locator("#answer").press("Enter")
            # 다음 카드 대기
            page.wait_for_function(
                """expected => {
                    const t = document.getElementById('progress-text').textContent.trim();
                    return t === expected;
                }""",
                arg=f"{min(i+2, 10)} / 10" if i < 9 else "10 / 10",
                timeout=3000,
            ) if False else page.wait_for_timeout(450 if i in (2, 6) else 0)
            # 마지막 카드 후엔 결과 화면 자동
            if i < 9:
                page.wait_for_selector(f'#progress-text:has-text("{i+2} / 10")', timeout=3000)

        # ----------------------------------------
        step("8. 결과 화면 검증")
        page.wait_for_selector("#screen-result:not([hidden])", timeout=4000)
        expect(page.locator("#screen-result")).to_be_visible()
        expect(page.locator("#screen-card")).to_be_hidden()

        accuracy = page.locator("#m-accuracy").text_content().strip()
        avg = page.locator("#m-avg").text_content().strip()
        wcount = page.locator("#wrong-count").text_content().strip()
        print(f"   정답률 {accuracy}% / 평균 {avg}초 / 오답 {wcount}")

        if int(accuracy) != 80:
            failures.append(f"accuracy: 기대 80, 실제 {accuracy}")

        if "(2)" not in wcount:
            failures.append(f"wrong-count: 기대 '(2)', 실제 '{wcount}'")

        wrong_items = page.locator("#wrong-list li").count()
        if wrong_items != 2:
            failures.append(f"wrong-list-items: 기대 2, 실제 {wrong_items}")
        else:
            print(f"   ✓ 오답 목록 {wrong_items}개")

        # 차트 캔버스 크기 검증
        canvas_w = page.evaluate("() => document.getElementById('chart-dan').width")
        if canvas_w == 0:
            failures.append("chart-canvas-empty")
        else:
            print(f"   ✓ 차트 캔버스 width={canvas_w}px (devicePixelRatio 반영)")
        shot(page, "04-result")

        # ----------------------------------------
        step("9. 오답만 다시 → 2문항 카드 세션 시작")
        page.locator("#btn-retry-wrong").click()
        page.wait_for_selector("#screen-card:not([hidden])")
        prog2 = page.locator("#progress-text").text_content().strip()
        if prog2 != "1 / 2":
            failures.append(f"retry-wrong-deck: 기대 '1 / 2', 실제 '{prog2}'")
        else:
            print(f"   ✓ 오답만 재출제 {prog2}")
        shot(page, "05-retry-wrong")

        # 둘 다 정답 풀어 100%
        for i in range(2):
            q = page.locator("#question").text_content().strip()
            m = re.match(r"(\d+)\s*×\s*(\d+)\s*=\s*\?", q)
            a, b = int(m.group(1)), int(m.group(2))
            page.locator("#answer").fill(str(a * b))
            page.locator("#answer").press("Enter")
            if i == 0:
                page.wait_for_selector('#progress-text:has-text("2 / 2")', timeout=3000)

        page.wait_for_selector("#screen-result:not([hidden])", timeout=4000)
        acc2 = page.locator("#m-accuracy").text_content().strip()
        if int(acc2) != 100:
            failures.append(f"retry-wrong-accuracy: 기대 100, 실제 {acc2}")
        else:
            print("   ✓ 오답 모드 100% 정답률")
        shot(page, "06-retry-result")

        # ----------------------------------------
        step("10. 처음으로 → 직전 기록 표시")
        page.locator("#btn-home").click()
        page.wait_for_selector("#screen-setup:not([hidden])")
        # localStorage 에 저장됐는지 + 표시되는지
        last_hidden = page.locator("#last-summary").is_hidden()
        if last_hidden:
            failures.append("last-summary-hidden")
        else:
            print(f"   ✓ 직전 기록 표시: {page.locator('#last-summary').text_content().strip()}")
        shot(page, "07-back-with-history")

        # ----------------------------------------
        step("11. 한 단만 선택 + 그만두기 도중")
        # 6단만 남기기
        for n in [2, 3, 4, 5, 7, 8, 9]:
            chip = page.locator(f'.chip[data-dan="{n}"]')
            if chip.get_attribute("aria-pressed") == "true":
                chip.click()
        # 단 1개로 시작
        page.locator('input[name="count"][value="20"]').check()
        page.locator("#btn-start").click()
        page.wait_for_selector("#screen-card:not([hidden])")
        # 1문항만 풀고 그만두기
        q = page.locator("#question").text_content().strip()
        m = re.match(r"(\d+)\s*×\s*(\d+)\s*=\s*\?", q)
        a, b = int(m.group(1)), int(m.group(2))
        page.locator("#answer").fill(str(a * b))
        page.locator("#answer").press("Enter")
        # 진행률이 2/20으로 가는 걸 기다림
        page.wait_for_selector('#progress-text:has-text("2 / 20")', timeout=3000)
        # confirm 자동 수락 후 그만두기
        page.once("dialog", lambda d: d.accept())
        page.locator("#btn-quit").click()
        page.wait_for_selector("#screen-result:not([hidden])", timeout=3000)
        print("   ✓ 도중 그만두기 → 결과 화면 표시")

        # ----------------------------------------
        step("12. 접근성 — aria-pressed, focus ring, viewport meta")
        # 다시 home 으로
        page.locator("#btn-home").click()
        page.wait_for_selector("#screen-setup:not([hidden])")

        # 키보드 Tab으로 focus → :focus-visible 트리거
        # body 클릭으로 focus 해제 후 Tab 4회 (h1, p, h2, 첫 chip)
        page.locator("body").click(position={"x": 5, "y": 5})
        # focus를 setup 영역으로 보내고 Tab으로 첫 interactive 요소까지 이동
        for _ in range(6):
            page.keyboard.press("Tab")
            tag = page.evaluate("() => document.activeElement && document.activeElement.tagName")
            if tag == "BUTTON":
                break
        outline = page.evaluate("""
            () => {
                const el = document.activeElement;
                const s = window.getComputedStyle(el);
                return s.outlineStyle + '|' + s.outlineWidth + '|' + s.outlineColor + '|' + el.className;
            }
        """)
        if "solid" not in outline:
            failures.append(f"focus-outline-missing: {outline}")
        else:
            print(f"   ✓ focus outline (kb Tab): {outline}")

        # viewport meta
        vp = page.locator('meta[name="viewport"]').get_attribute("content")
        if not vp or "width=device-width" not in vp:
            failures.append(f"viewport-meta: {vp}")
        else:
            print(f"   ✓ viewport meta")

        # ----------------------------------------
        step("13. 모바일 뷰포트 (360px) 가독성")
        page.set_viewport_size({"width": 360, "height": 740})
        page.reload()
        page.wait_for_load_state("networkidle")
        shot(page, "08-mobile-setup")
        # 가로 스크롤 없는지
        sw, vw = page.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
        if sw > vw + 1:
            failures.append(f"mobile-horizontal-scroll: scrollW={sw}, viewportW={vw}")
        else:
            print(f"   ✓ 360px 가로 스크롤 없음 ({sw}/{vw})")

        browser.close()

    # ---------- 환경 노이즈 필터 ----------
    real_console = [e for e in console_errors if not is_noise(e)]
    real_page = [e for e in page_errors if not is_noise(e)]
    real_net = [e for e in network_failures if not is_noise(e)]

    print("\n" + "=" * 50)
    if real_console:
        print(f"❌ console.error {len(real_console)}건:")
        for e in real_console: print(f"   - {e}")
        failures.append(f"console.error x{len(real_console)}")
    else:
        print("✓ console.error 0건")

    if real_page:
        print(f"❌ pageerror {len(real_page)}건:")
        for e in real_page: print(f"   - {e}")
        failures.append(f"pageerror x{len(real_page)}")
    else:
        print("✓ pageerror 0건")

    if real_net:
        print(f"❌ networkfailed {len(real_net)}건:")
        for e in real_net: print(f"   - {e}")
        failures.append(f"networkfailed x{len(real_net)}")
    else:
        print("✓ networkfailed 0건")

    print("=" * 50)

    if failures:
        print(f"\n❌ FAIL {len(failures)}건")
        for f in failures:
            print(f"   - {f}")
        return 1

    print("\n✅ ALL PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
