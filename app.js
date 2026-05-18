/* ----------------------------------------
   곱셈구구 스피드 카드 — vanilla JS
   - 단일 HTML / CDN 의존 0 / localStorage 직전 1세션만
---------------------------------------- */

(() => {
  "use strict";

  // ---------- 상태 ----------
  const state = {
    selectedDan: new Set([2, 3, 4, 5, 6, 7, 8, 9]),
    count: 20,
    deck: [],            // [{a, b, answer}]
    index: 0,
    results: [],         // [{a, b, answer, input, correct, ms}]
    startTs: 0,
    locked: false,       // 채점 애니메이션 중
    quitting: false,
  };

  const LS_KEY = "speedmul:last-session";

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const screens = {
    setup: $("screen-setup"),
    card: $("screen-card"),
    result: $("screen-result"),
  };

  function showScreen(name) {
    Object.entries(screens).forEach(([k, el]) => {
      el.hidden = (k !== name);
    });
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  // ---------- 설정 화면 ----------
  function renderChips() {
    const grid = document.querySelector(".chip-grid");
    grid.innerHTML = "";
    for (let n = 2; n <= 9; n++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.dataset.dan = String(n);
      b.textContent = `${n}단`;
      const isOn = state.selectedDan.has(n);
      b.setAttribute("aria-pressed", isOn ? "true" : "false");
      b.setAttribute("aria-label", `${n}단 ${isOn ? "선택됨" : "해제됨"}`);
      b.addEventListener("click", () => toggleDan(n));
      grid.appendChild(b);
    }
  }

  function toggleDan(n) {
    if (state.selectedDan.has(n)) {
      if (state.selectedDan.size === 1) return; // 최소 1개 보장
      state.selectedDan.delete(n);
    } else {
      state.selectedDan.add(n);
    }
    updateChipState();
    updateStartButton();
  }

  function updateChipState() {
    document.querySelectorAll(".chip").forEach((b) => {
      const n = Number(b.dataset.dan);
      const on = state.selectedDan.has(n);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.setAttribute("aria-label", `${n}단 ${on ? "선택됨" : "해제됨"}`);
    });
  }

  function applyPreset(name) {
    let next;
    switch (name) {
      case "all":  next = [2, 3, 4, 5, 6, 7, 8, 9]; break;
      case "hard": next = [6, 7, 8]; break;
      case "even": next = [2, 4, 6, 8]; break;
      case "odd":  next = [3, 5, 7, 9]; break;
      default: return;
    }
    state.selectedDan = new Set(next);
    updateChipState();
    updateStartButton();
  }

  function updateStartButton() {
    $("btn-start").disabled = state.selectedDan.size === 0;
  }

  function loadLastSummary() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const last = JSON.parse(raw);
      if (!last || typeof last.accuracy !== "number") return;
      const el = $("last-summary");
      el.hidden = false;
      el.textContent = `직전 기록 · 정답률 ${last.accuracy}% · 평균 ${last.avg.toFixed(1)}초`;
    } catch { /* ignore */ }
  }

  // ---------- 덱 생성 ----------
  function buildDeck(dans, count) {
    const pool = [];
    for (const a of dans) {
      for (let b = 1; b <= 9; b++) {
        pool.push({ a, b, answer: a * b });
      }
    }
    // Fisher–Yates 셔플로 count만큼 추출. 부족하면 pool을 반복하며 다른 인덱스 보장.
    const shuffled = shuffle([...pool]);
    const deck = [];
    while (deck.length < count) {
      const need = count - deck.length;
      const next = shuffle([...pool]).slice(0, need);
      // 직전 카드와 연속 같은 문제 회피
      for (const item of next) {
        if (deck.length && deck[deck.length - 1].a === item.a && deck[deck.length - 1].b === item.b) continue;
        deck.push(item);
      }
      if (next.length === 0) break;
    }
    return deck.slice(0, count);
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ---------- 세션 시작 ----------
  function startSession(customDeck) {
    state.deck = customDeck || buildDeck([...state.selectedDan].sort((a, b) => a - b), state.count);
    state.index = 0;
    state.results = [];
    state.locked = false;
    state.quitting = false;
    showScreen("card");
    renderCard();
  }

  function renderCard() {
    const total = state.deck.length;
    const cur = state.index;
    const card = state.deck[cur];

    $("progress-text").textContent = `${cur + 1} / ${total}`;
    const track = document.querySelector(".progress-track");
    track.setAttribute("aria-valuemax", String(total));
    track.setAttribute("aria-valuenow", String(cur + 1));
    $("progress-fill").style.width = `${((cur + 1) / total) * 100}%`;

    $("question").textContent = `${card.a} × ${card.b} = ?`;
    const input = $("answer");
    input.value = "";
    input.classList.remove("is-correct", "is-wrong");
    input.disabled = false;
    $("feedback").textContent = " ";
    $("feedback").className = "feedback";

    // 다음 frame 까지 기다리고 focus + 시작 시각
    requestAnimationFrame(() => {
      input.focus();
      state.startTs = performance.now();
    });
  }

  // ---------- 답 처리 ----------
  function evaluateInput() {
    if (state.locked) return;
    const input = $("answer");
    const raw = input.value.trim();
    if (raw === "") return;
    if (!/^\d{1,3}$/.test(raw)) {
      // 비숫자 제거
      input.value = raw.replace(/\D/g, "").slice(0, 3);
      return;
    }
    const card = state.deck[state.index];
    const ansLen = String(card.answer).length;

    // 자동 채점 trigger: 길이가 정답 자리수 이상이거나 Enter 호출시
    if (raw.length < ansLen) return;

    commitAnswer(Number(raw));
  }

  function commitAnswer(num) {
    if (state.locked) return;
    state.locked = true;
    const card = state.deck[state.index];
    const ms = Math.max(0, performance.now() - state.startTs);
    const correct = num === card.answer;

    state.results.push({
      a: card.a,
      b: card.b,
      answer: card.answer,
      input: num,
      correct,
      ms,
    });

    const input = $("answer");
    const fb = $("feedback");
    input.disabled = true;

    if (correct) {
      input.classList.add("is-correct");
      fb.className = "feedback is-correct";
      fb.textContent = `✓ ${(ms / 1000).toFixed(2)}초`;
      setTimeout(advance, 360);
    } else {
      input.classList.add("is-wrong");
      fb.className = "feedback is-wrong";
      fb.textContent = `정답: ${card.answer}`;
      setTimeout(advance, 900);
    }
  }

  function advance() {
    state.index += 1;
    if (state.index >= state.deck.length) {
      finishSession();
    } else {
      state.locked = false;
      renderCard();
    }
  }

  // ---------- 결과 ----------
  function finishSession() {
    showScreen("result");
    const r = state.results;
    const correctCount = r.filter((x) => x.correct).length;
    const total = r.length;
    const accuracy = total ? Math.round((correctCount / total) * 100) : 0;
    const correctTimes = r.filter((x) => x.correct).map((x) => x.ms);
    const avg = correctTimes.length ? correctTimes.reduce((a, b) => a + b, 0) / correctTimes.length / 1000 : 0;
    const min = correctTimes.length ? Math.min(...correctTimes) / 1000 : 0;

    $("m-accuracy").textContent = String(accuracy);
    $("m-avg").textContent = avg.toFixed(1);
    $("m-min").textContent = min.toFixed(1);

    // 격려 한 줄
    let praise = "잘했어요!";
    if (accuracy === 100) praise = "완벽해요! 🎯";
    else if (accuracy >= 90) praise = "정말 잘했어요!";
    else if (accuracy >= 70) praise = "좋아요. 오답을 다시 풀어볼까요?";
    else praise = "괜찮아요. 천천히 다시 도전해요.";
    $("result-subtitle").textContent = praise;

    drawChart(r);
    renderWrongList(r);

    // 직전 세션 저장
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ accuracy, avg, total, when: Date.now() }));
    } catch { /* ignore */ }
  }

  // ---------- 단별 정답률 차트 (vanilla canvas) ----------
  function drawChart(results) {
    const canvas = $("chart-dan");
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || canvas.width;
    const cssH = 280;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.height = cssH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    // 단별 통계
    const stats = new Map(); // dan -> {total, correct}
    for (const r of results) {
      const s = stats.get(r.a) || { total: 0, correct: 0 };
      s.total += 1;
      if (r.correct) s.correct += 1;
      stats.set(r.a, s);
    }
    const dans = [...stats.keys()].sort((a, b) => a - b);
    if (dans.length === 0) return;

    const padL = 40, padR = 16, padT = 20, padB = 36;
    const plotW = cssW - padL - padR;
    const plotH = cssH - padT - padB;

    // 격자 + Y 라벨 (0 / 50 / 100)
    ctx.strokeStyle = "#ebebeb";
    ctx.lineWidth = 1;
    ctx.font = '12px "Geist", system-ui, sans-serif';
    ctx.fillStyle = "#666666";
    ctx.textBaseline = "middle";
    [0, 50, 100].forEach((pct) => {
      const y = padT + plotH - (pct / 100) * plotH;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillText(String(pct), padL - 8, y);
    });

    // 막대
    const slot = plotW / dans.length;
    const barW = Math.min(48, slot * 0.6);
    dans.forEach((dan, i) => {
      const s = stats.get(dan);
      const pct = s.total ? (s.correct / s.total) * 100 : 0;
      const x = padL + slot * i + (slot - barW) / 2;
      const h = (pct / 100) * plotH;
      const y = padT + plotH - h;
      let color = "#171717";
      if (pct < 50) color = "#ff5b4f";
      else if (pct < 70) color = "#666666";
      ctx.fillStyle = color;
      // 라운드 사각형
      roundRect(ctx, x, y, barW, h, 4);
      ctx.fill();

      // X 라벨
      ctx.fillStyle = "#171717";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = '13px "Geist", system-ui, sans-serif';
      ctx.fillText(`${dan}단`, x + barW / 2, padT + plotH + 8);

      // 값
      ctx.fillStyle = "#4d4d4d";
      ctx.font = '11px "Geist Mono", ui-monospace, monospace';
      ctx.textBaseline = "bottom";
      ctx.fillText(`${Math.round(pct)}%`, x + barW / 2, y - 4);
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (h < r * 2) r = h / 2;
    if (h <= 0) { ctx.beginPath(); return; }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ---------- 오답 목록 ----------
  function renderWrongList(results) {
    const wrongs = results.filter((r) => !r.correct);
    $("wrong-count").textContent = wrongs.length ? `(${wrongs.length})` : "(0)";
    const ul = $("wrong-list");
    ul.innerHTML = "";
    if (wrongs.length === 0) {
      const li = document.createElement("li");
      li.textContent = "오답이 없어요. 완벽!";
      ul.appendChild(li);
      $("btn-retry-wrong").disabled = true;
      return;
    }
    $("btn-retry-wrong").disabled = false;
    for (const w of wrongs) {
      const li = document.createElement("li");
      const left = document.createElement("span");
      left.innerHTML = `${w.a} × ${w.b} = <strong>${w.answer}</strong>`;
      const right = document.createElement("span");
      right.className = "input-wrong";
      right.textContent = `입력: ${w.input}`;
      li.appendChild(left);
      li.appendChild(right);
      ul.appendChild(li);
    }
  }

  // ---------- 액션 ----------
  function retryWrong() {
    const wrongs = state.results.filter((r) => !r.correct);
    if (wrongs.length === 0) return;
    const deck = shuffle(wrongs.map((w) => ({ a: w.a, b: w.b, answer: w.answer })));
    startSession(deck);
  }

  function retryAll() {
    startSession(); // 새 덱
  }

  function goHome() {
    showScreen("setup");
    loadLastSummary();
  }

  function exportPng() {
    const result = screens.result;
    // html2canvas 없이 결과 화면을 캡쳐할 방법이 없으므로
    // 차트 + 메트릭을 자체 canvas로 합쳐 export
    const w = 900, h = 560;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    // 제목
    ctx.fillStyle = "#171717";
    ctx.font = '600 28px "Geist", system-ui, sans-serif';
    ctx.fillText("곱셈구구 스피드 카드 — 결과", 32, 56);

    // 날짜
    const d = new Date();
    const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    ctx.fillStyle = "#666666";
    ctx.font = '14px "Geist Mono", ui-monospace, monospace';
    ctx.fillText(dStr, 32, 80);

    // 메트릭
    const m = [
      { label: "정답률", value: $("m-accuracy").textContent + "%" },
      { label: "평균 시간", value: $("m-avg").textContent + "초" },
      { label: "최단 시간", value: $("m-min").textContent + "초" },
    ];
    let mx = 32;
    m.forEach((it) => {
      ctx.strokeStyle = "rgba(0,0,0,0.12)";
      ctx.lineWidth = 1;
      ctx.strokeRect(mx, 110, 260, 110);
      ctx.fillStyle = "#4d4d4d";
      ctx.font = '500 14px "Geist", system-ui, sans-serif';
      ctx.fillText(it.label, mx + 18, 138);
      ctx.fillStyle = "#171717";
      ctx.font = '600 40px "Geist", system-ui, sans-serif';
      ctx.fillText(it.value, mx + 18, 188);
      mx += 280;
    });

    // 차트 복사
    const src = $("chart-dan");
    if (src && src.width > 0) {
      const dh = 260;
      const dw = w - 64;
      ctx.drawImage(src, 32, 250, dw, dh);
    }

    const link = document.createElement("a");
    link.download = `gopsem-result-${Date.now()}.png`;
    link.href = c.toDataURL("image/png");
    link.click();
  }

  function quitSession() {
    if (state.results.length === 0) {
      showScreen("setup");
      return;
    }
    if (!confirm("이번 세션을 중단할까요? 지금까지 푼 문제로 결과를 봅니다.")) return;
    finishSession();
  }

  // ---------- 이벤트 ----------
  function bindEvents() {
    // 설정
    document.querySelectorAll(".preset").forEach((b) => {
      b.addEventListener("click", () => applyPreset(b.dataset.preset));
    });
    document.querySelectorAll('input[name="count"]').forEach((r) => {
      r.addEventListener("change", (e) => {
        state.count = Number(e.target.value);
      });
    });
    $("btn-start").addEventListener("click", () => startSession());

    // 카드
    const inp = $("answer");
    inp.addEventListener("input", () => {
      // 숫자만 허용
      const cleaned = inp.value.replace(/\D/g, "").slice(0, 3);
      if (cleaned !== inp.value) inp.value = cleaned;
      evaluateInput();
    });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const v = inp.value.replace(/\D/g, "");
        if (v.length === 0) return;
        commitAnswer(Number(v));
      }
    });
    $("btn-quit").addEventListener("click", quitSession);

    // 결과
    $("btn-retry-wrong").addEventListener("click", retryWrong);
    $("btn-retry-all").addEventListener("click", retryAll);
    $("btn-png").addEventListener("click", exportPng);
    $("btn-print").addEventListener("click", () => window.print());
    $("btn-home").addEventListener("click", goHome);
  }

  // ---------- init ----------
  function init() {
    renderChips();
    bindEvents();
    updateStartButton();
    loadLastSummary();
    showScreen("setup");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
