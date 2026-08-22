MimiGames.register({
  id: "reaction-test",
  title: "Reaction Test",
  emoji: "⚡",
  category: "Action",
  players: "1P",
  howTo: "Click the box as soon as it turns green. Clicking too early makes you retry. Complete 5 rounds for your average.",
  init(root, ctx) {
    const ATTEMPTS = 5;
    const state = {
      phase: "idle", // idle | waiting | ready | tooSoon | result | done
      readyAt: 0,
      times: [],
    };

    const timeouts = [];
    function later(fn, delay) {
      const id = setTimeout(() => {
        const idx = timeouts.indexOf(id);
        if (idx !== -1) timeouts.splice(idx, 1);
        fn();
      }, delay);
      timeouts.push(id);
      return id;
    }
    function clearAllTimeouts() {
      timeouts.forEach((id) => clearTimeout(id));
      timeouts.length = 0;
    }

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "16px";

    const box = document.createElement("div");
    box.style.width = "360px";
    box.style.maxWidth = "100%";
    box.style.height = "260px";
    box.style.borderRadius = "18px";
    box.style.display = "flex";
    box.style.alignItems = "center";
    box.style.justifyContent = "center";
    box.style.textAlign = "center";
    box.style.padding = "16px";
    box.style.fontSize = "1.3rem";
    box.style.fontWeight = "700";
    box.style.cursor = "pointer";
    box.style.userSelect = "none";
    box.style.background = "var(--panel-light)";
    box.style.border = "2px solid var(--border)";
    box.textContent = "Click Start to begin";

    const startBtn = document.createElement("button");
    startBtn.className = "btn primary";
    startBtn.textContent = "Start Test";
    startBtn.onclick = beginTest;

    box.onclick = onBoxClick;

    wrap.appendChild(box);
    wrap.appendChild(startBtn);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Skip Wait",
        run: () => {
          if (state.phase !== "waiting") return;
          clearAllTimeouts();
          state.phase = "ready";
          state.readyAt = performance.now();
          box.style.background = "var(--win)";
          box.textContent = "Click!";
        },
      },
      {
        label: "Force Perfect Click",
        run: () => {
          if (state.phase !== "ready") return;
          state.readyAt = performance.now();
          onBoxClick();
        },
      },
    ]);

    function beginTest() {
      clearAllTimeouts();
      state.times = [];
      startBtn.style.display = "none";
      nextAttempt();
    }

    function nextAttempt() {
      state.phase = "waiting";
      box.style.background = "var(--lose)";
      box.textContent = `Wait for green... (${state.times.length + 1}/${ATTEMPTS})`;
      const delay = 1500 + Math.random() * 2500;
      later(() => {
        state.phase = "ready";
        state.readyAt = performance.now();
        box.style.background = "var(--win)";
        box.textContent = "Click!";
      }, delay);
    }

    function onBoxClick() {
      if (state.phase === "waiting") {
        state.phase = "tooSoon";
        box.style.background = "var(--panel-light)";
        box.textContent = "Too soon! Click to try again.";
        ctx.playSound("fail");
        return;
      }
      if (state.phase === "tooSoon") {
        nextAttempt();
        return;
      }
      if (state.phase === "ready") {
        const reaction = Math.round(performance.now() - state.readyAt);
        state.times.push(reaction);
        ctx.playSound("pop");
        state.phase = "result";
        box.style.background = "var(--panel-light)";
        box.textContent = `${reaction} ms`;
        ctx.setStatus(`Attempt ${state.times.length}/${ATTEMPTS}: ${reaction} ms`);

        const best = ctx.storage.get("best", null);
        if (best === null || reaction < best) {
          ctx.storage.set("best", reaction);
          ctx.reportScore(reaction, { sortDir: "asc" });
        }

        if (state.times.length >= ATTEMPTS) {
          later(() => finish(), 900);
        } else {
          later(() => nextAttempt(), 900);
        }
        return;
      }
      // idle or done -> ignore
    }

    function finish() {
      state.phase = "done";
      const avg = Math.round(state.times.reduce((a, b) => a + b, 0) / state.times.length);
      const best = ctx.storage.get("best", avg);
      box.textContent = `Average: ${avg} ms`;
      ctx.setStatus(`Average reaction time: ${avg} ms · Best single: ${best} ms`);
      startBtn.style.display = "";
      startBtn.textContent = "Try Again";
      ctx.showOverlay({
        title: "Test Complete!",
        subtitle: `Average: ${avg} ms · Best ever: ${best} ms`,
        buttonText: "Try Again",
        onButton: beginTest,
      });
    }

    ctx.setStatus("Click Start Test to begin.");

    return () => {
      clearAllTimeouts();
    };
  },
});
