MimiGames.register({
  id: "sprint-race",
  title: "Sprint Race",
  emoji: "🏃",
  category: "Action",
  players: "1P",
  howTo: "Click/tap the GO! button (or mash spacebar) as fast as you can to sprint ahead of the CPU racers to the finish line. Gamepad: mash any face button (Start un-hides the controller cursor if you need it).",
  init(root, ctx) {
    const CLICK_INCREMENT = 2.2;
    const CPU_TICK_MS = 150;
    const SAFETY_MS = 20000; // hard cap so a race can never hang forever

    const RACERS = [
      { id: "player", name: "You", emoji: "🏃", isPlayer: true },
      { id: "cpu1", name: "CPU 1", emoji: "🤖", isPlayer: false },
      { id: "cpu2", name: "CPU 2", emoji: "🐢", isPlayer: false },
      { id: "cpu3", name: "CPU 3", emoji: "🐇", isPlayer: false },
    ];

    let racers = [];
    let raceState = "idle"; // idle | countdown | running | over
    let cpuInterval = null;
    let paceInterval = null;
    let safetyTimeout = null;
    let countdownTimers = [];
    let clickTimestamps = [];
    let raceStartTime = 0;

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "14px";
    wrap.style.width = "100%";

    const statusEl = document.createElement("div");
    statusEl.style.fontSize = "1.1rem";
    statusEl.style.fontWeight = "700";
    statusEl.style.color = "var(--accent2)";
    statusEl.style.minHeight = "1.6em";

    const trackWrap = document.createElement("div");
    trackWrap.style.display = "flex";
    trackWrap.style.flexDirection = "column";
    trackWrap.style.gap = "10px";
    trackWrap.style.width = "100%";
    trackWrap.style.maxWidth = "820px";

    const laneEls = {};
    RACERS.forEach((r) => {
      const laneRow = document.createElement("div");
      laneRow.style.display = "flex";
      laneRow.style.alignItems = "center";
      laneRow.style.gap = "8px";

      const label = document.createElement("div");
      label.textContent = r.name;
      label.style.width = "60px";
      label.style.fontSize = ".8rem";
      label.style.color = r.isPlayer ? "var(--accent2)" : "var(--text-dim)";

      const track = document.createElement("div");
      track.style.position = "relative";
      track.style.flex = "1";
      track.style.height = "34px";
      track.style.background = "var(--panel-light)";
      track.style.border = "1px solid var(--border)";
      track.style.borderRadius = "8px";
      track.style.overflow = "hidden";

      const finishFlag = document.createElement("div");
      finishFlag.textContent = "🏁";
      finishFlag.style.position = "absolute";
      finishFlag.style.right = "2px";
      finishFlag.style.top = "50%";
      finishFlag.style.transform = "translateY(-50%)";
      finishFlag.style.fontSize = "1.1rem";

      const runner = document.createElement("div");
      runner.textContent = r.emoji;
      runner.style.position = "absolute";
      runner.style.left = "0%";
      runner.style.top = "50%";
      runner.style.transform = "translate(0, -50%)";
      runner.style.fontSize = "1.4rem";
      runner.style.transition = "left 0.1s linear";

      track.appendChild(finishFlag);
      track.appendChild(runner);
      laneRow.appendChild(label);
      laneRow.appendChild(track);
      trackWrap.appendChild(laneRow);
      laneEls[r.id] = { runner, track };
    });

    const paceEl = document.createElement("div");
    paceEl.style.fontSize = ".85rem";
    paceEl.style.color = "var(--text-dim)";
    paceEl.textContent = "Pace: 0.0 clicks/sec";

    const goBtn = document.createElement("button");
    goBtn.className = "btn primary";
    goBtn.textContent = "GO!";
    goBtn.style.fontSize = "1.5rem";
    goBtn.style.padding = "20px 60px";
    goBtn.disabled = true;
    goBtn.onclick = playerClick;

    const restartBtn = document.createElement("button");
    restartBtn.className = "btn";
    restartBtn.textContent = "Race Again";
    restartBtn.onclick = newRace;

    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.gap = "10px";
    btnRow.appendChild(goBtn);
    btnRow.appendChild(restartBtn);

    wrap.appendChild(statusEl);
    wrap.appendChild(trackWrap);
    wrap.appendChild(paceEl);
    wrap.appendChild(btnRow);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Force Win",
        run() {
          if (raceState !== "running") return;
          const player = racers.find((r) => r.isPlayer);
          if (!player || player.finished) return;
          player.pos = 100;
          renderPositions();
          finishRacer(player);
        },
      },
      {
        label: "Speed Boost +20",
        run() {
          if (raceState !== "running") return;
          const player = racers.find((r) => r.isPlayer);
          if (!player || player.finished) return;
          player.pos = Math.min(100, player.pos + 20);
          renderPositions();
          if (player.pos >= 100) finishRacer(player);
        },
      },
    ]);

    function onKeydown(e) {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        // e.repeat is true for the OS auto-repeat events fired while a key is
        // held down — without this check, just holding Space (no mashing at
        // all) floods playerClick() far faster than the capped CPU pace and
        // wins every race automatically
        if (e.repeat) return;
        playerClick();
      }
    }
    document.addEventListener("keydown", onKeydown);

    // Gamepad: any face button mashes GO!, edge-triggered per button so a
    // held button doesn't auto-mash (the same anti-cheese reason Space
    // ignores e.repeat above). Buttons 0 (B) and 9 (Start) are excluded:
    // the hub's site-wide gamepad cursor (js/pad-cursor.js) reserves them
    // everywhere as "back to the game grid" and "un-hide the cursor" — and
    // that same bridge needs telling when a race is actually underway so it
    // knows to keep its own cursor out of the way.
    const gamepadPrevPressed = new Set();
    function pollGamepad() {
      window.MimiPadCursor?.setSuppressed(raceState === "running");
      if (typeof navigator.getGamepads !== "function") return;
      const pad = Array.from(navigator.getGamepads()).find((p) => p?.connected);
      if (!pad) { gamepadPrevPressed.clear(); return; }
      pad.buttons.forEach((button, index) => {
        if (index === 0 || index === 9) return;
        const pressed = Boolean(button?.pressed);
        if (pressed && !gamepadPrevPressed.has(index)) playerClick();
        if (pressed) gamepadPrevPressed.add(index);
        else gamepadPrevPressed.delete(index);
      });
    }
    const gamepadPollId = setInterval(pollGamepad, 50);

    function clearAllTimers() {
      if (cpuInterval) {
        clearInterval(cpuInterval);
        cpuInterval = null;
      }
      if (paceInterval) {
        clearInterval(paceInterval);
        paceInterval = null;
      }
      if (safetyTimeout) {
        clearTimeout(safetyTimeout);
        safetyTimeout = null;
      }
      countdownTimers.forEach((t) => clearTimeout(t));
      countdownTimers = [];
    }

    function newRace() {
      clearAllTimers();
      racers = RACERS.map((r) => ({
        ...r,
        pos: 0,
        finished: false,
        paceMultiplier: 0.85 + Math.random() * 0.3,
      }));
      clickTimestamps = [];
      raceState = "countdown";
      goBtn.disabled = true;
      renderPositions();
      paceEl.textContent = "Pace: 0.0 clicks/sec";
      runCountdown();
    }

    function runCountdown() {
      const steps = ["Get ready...", "Ready...", "Set...", "GO!"];
      steps.forEach((label, i) => {
        countdownTimers.push(
          setTimeout(() => {
            statusEl.textContent = label;
            ctx.playSound(i === steps.length - 1 ? "swoosh" : "tick");
            if (i === steps.length - 1) startRace();
          }, i * 550)
        );
      });
    }

    function startRace() {
      raceState = "running";
      goBtn.disabled = false;
      raceStartTime = performance.now();
      statusEl.textContent = "Mash GO! (or spacebar) to sprint!";
      cpuInterval = setInterval(cpuTick, CPU_TICK_MS);
      paceInterval = setInterval(updatePace, 300);
      safetyTimeout = setTimeout(() => forceFinish(), SAFETY_MS);
    }

    function cpuTick() {
      if (raceState !== "running") return;
      let changed = false;
      racers.forEach((r) => {
        if (r.isPlayer || r.finished) return;
        const inc = (1.0 + Math.random() * 0.8) * r.paceMultiplier;
        r.pos = Math.min(100, r.pos + inc);
        changed = true;
        if (r.pos >= 100) finishRacer(r);
      });
      if (changed) renderPositions();
    }

    function playerClick() {
      if (raceState !== "running") return;
      const player = racers.find((r) => r.isPlayer);
      if (!player || player.finished) return;
      player.pos = Math.min(100, player.pos + CLICK_INCREMENT);
      clickTimestamps.push(performance.now());
      ctx.playSound("tick");
      renderPositions();
      if (player.pos >= 100) finishRacer(player);
    }

    function updatePace() {
      if (raceState !== "running") return;
      const now = performance.now();
      clickTimestamps = clickTimestamps.filter((t) => now - t <= 1000);
      paceEl.textContent = `Pace: ${clickTimestamps.length.toFixed(1)} clicks/sec`;
    }

    function finishRacer(racer) {
      if (raceState !== "running" || racer.finished) return;
      racer.finished = true;
      racer.pos = 100;
      endRace(racer);
    }

    function forceFinish() {
      if (raceState !== "running") return;
      // Nobody reached the line in time — whoever is furthest ahead wins,
      // so the race always resolves instead of hanging.
      const leader = racers.slice().sort((a, b) => b.pos - a.pos)[0];
      endRace(leader);
    }

    function endRace(winner) {
      raceState = "over";
      clearAllTimers();
      goBtn.disabled = true;
      renderPositions();

      const ranking = racers.slice().sort((a, b) => b.pos - a.pos);
      const playerPlace = ranking.findIndex((r) => r.isPlayer) + 1;
      const isPlayerWin = winner.isPlayer;

      statusEl.textContent = isPlayerWin ? "You win the race!" : `${winner.name} wins the race!`;
      ctx.playSound(isPlayerWin ? "win" : "lose");
      if (isPlayerWin) ctx.confetti(wrap);
      ctx.setStatus(statusEl.textContent);

      setTimeout(() => {
        ctx.showOverlay({
          title: isPlayerWin ? "You Win!" : `${winner.name} Wins`,
          subtitle: `You finished in ${ordinal(playerPlace)} place.`,
          buttonText: "Race Again",
          onButton: newRace,
        });
      }, 500);
    }

    function ordinal(n) {
      const s = ["th", "st", "nd", "rd"];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }

    function renderPositions() {
      racers.forEach((r) => {
        const el = laneEls[r.id];
        if (!el) return;
        const pct = Math.min(96, r.pos); // keep runner emoji inside the track visually
        el.runner.style.left = pct + "%";
      });
    }

    newRace();

    return () => {
      clearAllTimers();
      clearInterval(gamepadPollId);
      window.MimiPadCursor?.setSuppressed(false);
      document.removeEventListener("keydown", onKeydown);
    };
  },
});
