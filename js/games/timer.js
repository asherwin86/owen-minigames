MimiGames.register({
  id: "timer",
  title: "Timer & Stopwatch",
  emoji: "⏱️",
  category: "Apps",
  players: "1P",
  howTo: "Two tools in one. Timer: set minutes/seconds, Start counts down and plays a sound when it hits zero. Stopwatch: Start/Stop, Lap to record a split, Reset to clear.",
  init(root, ctx) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:14px;width:100%;max-width:380px";

    const tabRow = document.createElement("div");
    tabRow.style.cssText = "display:flex;gap:8px";
    const timerTabBtn = document.createElement("button");
    timerTabBtn.className = "btn primary";
    timerTabBtn.textContent = "⏳ Timer";
    const stopwatchTabBtn = document.createElement("button");
    stopwatchTabBtn.className = "btn";
    stopwatchTabBtn.textContent = "⏱️ Stopwatch";
    tabRow.append(timerTabBtn, stopwatchTabBtn);

    const timerPane = document.createElement("div");
    timerPane.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:12px;width:100%";
    const stopwatchPane = document.createElement("div");
    stopwatchPane.style.cssText = "display:none;flex-direction:column;align-items:center;gap:12px;width:100%";

    function showTab(which) {
      const isTimer = which === "timer";
      timerPane.style.display = isTimer ? "flex" : "none";
      stopwatchPane.style.display = isTimer ? "none" : "flex";
      timerTabBtn.className = "btn" + (isTimer ? " primary" : "");
      stopwatchTabBtn.className = "btn" + (isTimer ? "" : " primary");
    }
    timerTabBtn.onclick = () => showTab("timer");
    stopwatchTabBtn.onclick = () => showTab("stopwatch");

    function bigDisplay() {
      const el = document.createElement("div");
      el.style.cssText = "font-family:'Space Grotesk',monospace;font-size:3rem;font-weight:700;color:var(--text);letter-spacing:1px";
      el.textContent = "00:00";
      return el;
    }

    // ============ Timer ============
    const timerDisplay = bigDisplay();
    const timerInputRow = document.createElement("div");
    timerInputRow.style.cssText = "display:flex;align-items:center;gap:8px";
    function numberInput(placeholder, max) {
      const inp = document.createElement("input");
      inp.type = "number";
      inp.min = "0";
      inp.max = String(max);
      inp.placeholder = placeholder;
      inp.style.cssText = "width:70px;padding:8px;text-align:center;border-radius:8px;border:1px solid var(--border);background:var(--bg-alt);color:var(--text);font:inherit";
      return inp;
    }
    const minutesInput = numberInput("min", 999);
    const secondsInput = numberInput("sec", 59);
    timerInputRow.append(minutesInput, document.createElement("span"), secondsInput);
    timerInputRow.children[1].textContent = ":";

    const timerBtnRow = document.createElement("div");
    timerBtnRow.style.cssText = "display:flex;gap:8px";
    const timerStartBtn = document.createElement("button");
    timerStartBtn.className = "btn primary";
    timerStartBtn.textContent = "▶ Start";
    const timerResetBtn = document.createElement("button");
    timerResetBtn.className = "btn";
    timerResetBtn.textContent = "↺ Reset";
    timerBtnRow.append(timerStartBtn, timerResetBtn);

    timerPane.append(timerDisplay, timerInputRow, timerBtnRow);

    let timerRemainingMs = 0;
    let timerRunning = false;
    let timerLastTick = 0;
    let timerRaf = null;

    function formatMs(ms) {
      const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
      const m = Math.floor(totalSeconds / 60);
      const s = totalSeconds % 60;
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }

    function timerTick(now) {
      if (!timerRunning) return;
      const dt = now - timerLastTick;
      timerLastTick = now;
      timerRemainingMs -= dt;
      if (timerRemainingMs <= 0) {
        timerRemainingMs = 0;
        timerDisplay.textContent = formatMs(0);
        stopTimer();
        ctx.playSound("win");
        ctx.setStatus("Time's up!");
        return;
      }
      timerDisplay.textContent = formatMs(timerRemainingMs);
      timerRaf = requestAnimationFrame(timerTick);
    }

    function startTimer() {
      if (timerRunning) return;
      if (timerRemainingMs <= 0) {
        const mins = Math.max(0, parseInt(minutesInput.value, 10) || 0);
        const secs = Math.max(0, Math.min(59, parseInt(secondsInput.value, 10) || 0));
        timerRemainingMs = (mins * 60 + secs) * 1000;
        if (timerRemainingMs <= 0) { ctx.setStatus("Set a time first."); return; }
      }
      timerRunning = true;
      timerLastTick = performance.now();
      timerStartBtn.textContent = "⏸ Pause";
      timerRaf = requestAnimationFrame(timerTick);
      ctx.playSound("click");
    }
    function stopTimer() {
      timerRunning = false;
      timerStartBtn.textContent = "▶ Start";
      if (timerRaf) cancelAnimationFrame(timerRaf);
    }
    function resetTimer() {
      stopTimer();
      timerRemainingMs = 0;
      timerDisplay.textContent = "00:00";
      ctx.setStatus("Timer reset.");
    }
    timerStartBtn.onclick = () => (timerRunning ? stopTimer() : startTimer());
    timerResetBtn.onclick = resetTimer;

    // ============ Stopwatch ============
    const stopwatchDisplay = bigDisplay();
    stopwatchDisplay.textContent = "00:00.0";
    const stopwatchBtnRow = document.createElement("div");
    stopwatchBtnRow.style.cssText = "display:flex;gap:8px";
    const swStartBtn = document.createElement("button");
    swStartBtn.className = "btn primary";
    swStartBtn.textContent = "▶ Start";
    const swLapBtn = document.createElement("button");
    swLapBtn.className = "btn";
    swLapBtn.textContent = "🚩 Lap";
    const swResetBtn = document.createElement("button");
    swResetBtn.className = "btn";
    swResetBtn.textContent = "↺ Reset";
    stopwatchBtnRow.append(swStartBtn, swLapBtn, swResetBtn);

    const lapList = document.createElement("div");
    lapList.style.cssText = "display:flex;flex-direction:column;gap:4px;width:100%;max-height:200px;overflow-y:auto;font-family:'Space Grotesk',monospace;font-size:.85rem";

    stopwatchPane.append(stopwatchDisplay, stopwatchBtnRow, lapList);

    let swElapsedMs = 0;
    let swRunning = false;
    let swLastTick = 0;
    let swRaf = null;
    let laps = [];

    function formatStopwatch(ms) {
      const centis = Math.floor((ms % 1000) / 100);
      const totalSeconds = Math.floor(ms / 1000);
      const m = Math.floor(totalSeconds / 60);
      const s = totalSeconds % 60;
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${centis}`;
    }

    function swTick(now) {
      if (!swRunning) return;
      swElapsedMs += now - swLastTick;
      swLastTick = now;
      stopwatchDisplay.textContent = formatStopwatch(swElapsedMs);
      swRaf = requestAnimationFrame(swTick);
    }
    function startStopwatch() {
      swRunning = true;
      swLastTick = performance.now();
      swStartBtn.textContent = "⏸ Stop";
      swRaf = requestAnimationFrame(swTick);
      ctx.playSound("click");
    }
    function stopStopwatch() {
      swRunning = false;
      swStartBtn.textContent = "▶ Start";
      if (swRaf) cancelAnimationFrame(swRaf);
    }
    function resetStopwatch() {
      stopStopwatch();
      swElapsedMs = 0;
      laps = [];
      stopwatchDisplay.textContent = "00:00.0";
      lapList.innerHTML = "";
    }
    function addLap() {
      if (!swRunning) return;
      laps.unshift(swElapsedMs);
      const row = document.createElement("div");
      row.textContent = `Lap ${laps.length}: ${formatStopwatch(swElapsedMs)}`;
      lapList.prepend(row);
      ctx.playSound("tick");
    }
    swStartBtn.onclick = () => (swRunning ? stopStopwatch() : startStopwatch());
    swLapBtn.onclick = addLap;
    swResetBtn.onclick = resetStopwatch;

    wrap.append(tabRow, timerPane, stopwatchPane);
    root.appendChild(wrap);
    ctx.setStatus("Pick a tool.");

    return () => {
      if (timerRaf) cancelAnimationFrame(timerRaf);
      if (swRaf) cancelAnimationFrame(swRaf);
    };
  },
});
