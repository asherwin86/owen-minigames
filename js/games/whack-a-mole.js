MimiGames.register({
  id: "whack-a-mole",
  title: "Whack-a-Mole",
  emoji: "🔨",
  category: "Action",
  players: "1P",
  howTo: "Click or tap a mole as soon as it pops up to score points before the 40-second timer runs out.",
  init(root, ctx) {
    const ROUND_SECONDS = 40;
    const GRID = 3;

    const state = {
      score: 0,
      timeLeft: ROUND_SECONDS,
      running: false,
    };

    let countdownId = null;
    let spawnTimeoutId = null;
    const holeTimers = new Map(); // holeIndex -> hide timeoutId

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "14px";

    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = `repeat(${GRID}, 110px)`;
    grid.style.gridTemplateRows = `repeat(${GRID}, 110px)`;
    grid.style.gap = "14px";

    const holes = [];
    for (let i = 0; i < GRID * GRID; i++) {
      const hole = document.createElement("button");
      hole.className = "btn";
      hole.style.width = "110px";
      hole.style.height = "110px";
      hole.style.borderRadius = "50%";
      hole.style.background = "radial-gradient(circle at 50% 40%, #3a2a1a, #1a1208 70%)";
      hole.style.border = "3px solid #26190c";
      hole.style.fontSize = "3rem";
      hole.style.display = "flex";
      hole.style.alignItems = "flex-end";
      hole.style.justifyContent = "center";
      hole.style.overflow = "hidden";
      hole.style.cursor = "pointer";
      hole.style.padding = "0";
      hole.textContent = "";
      hole.onclick = () => whack(i);
      grid.appendChild(hole);
      holes.push({ el: hole, up: false });
    }

    const restartBtn = document.createElement("button");
    restartBtn.className = "btn primary";
    restartBtn.textContent = "Start / Restart";
    restartBtn.onclick = startRound;

    wrap.appendChild(grid);
    wrap.appendChild(restartBtn);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Add Score +10",
        run: () => { state.score += 10; updateStatus(); },
      },
      {
        label: "Extra Time +15s",
        run: () => { state.timeLeft += 15; updateStatus(); },
      },
    ]);

    function randDelay(min, max) {
      return min + Math.random() * (max - min);
    }

    function scheduleSpawn() {
      const elapsed = ROUND_SECONDS - state.timeLeft;
      const difficulty = Math.min(1, elapsed / ROUND_SECONDS); // 0..1
      const delay = randDelay(700 - difficulty * 300, 1000 - difficulty * 400);
      spawnTimeoutId = setTimeout(() => {
        if (!state.running) return;
        spawnMole();
        scheduleSpawn();
      }, delay);
    }

    function spawnMole() {
      const downHoles = holes.map((h, i) => (h.up ? null : i)).filter((v) => v !== null);
      if (!downHoles.length) return;
      const i = downHoles[Math.floor(Math.random() * downHoles.length)];
      const h = holes[i];
      h.up = true;
      h.el.textContent = "🐹";
      const elapsed = ROUND_SECONDS - state.timeLeft;
      const difficulty = Math.min(1, elapsed / ROUND_SECONDS);
      const upTime = randDelay(900 - difficulty * 400, 1300 - difficulty * 500);
      const hideId = setTimeout(() => {
        h.up = false;
        h.el.textContent = "";
        holeTimers.delete(i);
      }, upTime);
      holeTimers.set(i, hideId);
    }

    function whack(i) {
      if (!state.running) return;
      const h = holes[i];
      if (!h.up) return;
      h.up = false;
      h.el.textContent = "";
      const t = holeTimers.get(i);
      if (t) {
        clearTimeout(t);
        holeTimers.delete(i);
      }
      state.score++;
      ctx.playSound("pop");
      ctx.vibrate(20);
      updateStatus();
    }

    function updateStatus() {
      ctx.setStatus(`Score: ${state.score} | Time: ${state.timeLeft}s`);
    }

    function startRound() {
      clearAllTimers();
      state.score = 0;
      state.timeLeft = ROUND_SECONDS;
      state.running = true;
      holes.forEach((h) => {
        h.up = false;
        h.el.textContent = "";
      });
      updateStatus();
      countdownId = setInterval(() => {
        state.timeLeft--;
        updateStatus();
        if (state.timeLeft <= 0) endRound();
      }, 1000);
      scheduleSpawn();
    }

    function clearAllTimers() {
      if (countdownId) {
        clearInterval(countdownId);
        countdownId = null;
      }
      if (spawnTimeoutId) {
        clearTimeout(spawnTimeoutId);
        spawnTimeoutId = null;
      }
      holeTimers.forEach((id) => clearTimeout(id));
      holeTimers.clear();
    }

    function endRound() {
      state.running = false;
      clearAllTimers();
      holes.forEach((h) => {
        h.up = false;
        h.el.textContent = "";
      });
      const best = ctx.storage.get("best", 0);
      const newBest = Math.max(best, state.score);
      ctx.storage.set("best", newBest);
      ctx.playSound(state.score > best ? "success" : "click");
      ctx.setStatus(`Final Score: ${state.score}`);
      ctx.showOverlay({
        title: "Time's Up!",
        subtitle: `Score: ${state.score} · Best: ${newBest}`,
        buttonText: "Play Again",
        onButton: startRound,
      });
    }

    updateStatus();

    return () => {
      clearAllTimers();
    };
  },
});
