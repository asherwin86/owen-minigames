MimiGames.register({
  id: "balloon-pop",
  title: "Balloon Pop",
  emoji: "🎈",
  category: "Action",
  players: "1P",
  howTo: "Click or tap balloons to pop them for points before they float away. Watch out for bomb balloons — they cost you points!",
  init(root, ctx) {
    const ROUND_SECONDS = 50;
    const W = 480,
      H = 420;

    const state = {
      score: 0,
      timeLeft: ROUND_SECONDS,
      running: false,
      balloons: [], // {el, y, vy, isBomb, popped}
      slowMo: false,
    };

    let countdownId = null;
    let spawnTimeoutId = null;
    let rafId = null;
    const popTimeouts = [];

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "12px";

    const playArea = document.createElement("div");
    playArea.style.position = "relative";
    playArea.style.width = W + "px";
    playArea.style.maxWidth = "100%";
    playArea.style.height = H + "px";
    playArea.style.overflow = "hidden";
    playArea.style.borderRadius = "12px";
    playArea.style.background = "linear-gradient(180deg, #1b2a4a, #0f1220)";
    playArea.style.border = "2px solid var(--border)";

    const startBtn = document.createElement("button");
    startBtn.className = "btn primary";
    startBtn.textContent = "Start Round";
    startBtn.onclick = startRound;

    wrap.appendChild(playArea);
    wrap.appendChild(startBtn);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Slow Motion: Off",
        run(e) {
          state.slowMo = !state.slowMo;
          e.target.textContent = `Slow Motion: ${state.slowMo ? "On" : "Off"}`;
        },
      },
      { label: "Add Score +50", run: () => { state.score += 50; updateStatus(); } },
    ]);

    function spawnBalloon() {
      const isBomb = Math.random() < 0.12;
      const el = document.createElement("div");
      el.style.position = "absolute";
      el.style.fontSize = (isBomb ? 34 : 38 + Math.random() * 10) + "px";
      el.style.left = 10 + Math.random() * (W - 50) + "px";
      el.style.top = H + "px";
      el.style.cursor = "pointer";
      el.style.userSelect = "none";
      el.style.filter = isBomb ? "none" : `hue-rotate(${Math.floor(Math.random() * 360)}deg)`;
      el.style.transition = "opacity .15s, transform .15s";
      el.textContent = isBomb ? "💣" : "🎈";

      const balloon = { el, y: H, vy: (0.9 + Math.random() * 1.4) * (state.slowMo ? 0.35 : 1), isBomb, popped: false };
      el.onclick = () => popBalloon(balloon);
      playArea.appendChild(el);
      state.balloons.push(balloon);
    }

    function popBalloon(balloon) {
      if (balloon.popped || !state.running) return;
      balloon.popped = true;
      if (balloon.isBomb) {
        state.score = Math.max(0, state.score - 15);
        ctx.playSound("fail");
        ctx.vibrate(40);
      } else {
        state.score += 10;
        ctx.playSound("pop");
        ctx.vibrate(15);
      }
      balloon.el.style.opacity = "0";
      balloon.el.style.transform = "scale(1.6)";
      updateStatus();
      const tId = setTimeout(() => {
        balloon.el.remove();
        const idx = popTimeouts.indexOf(tId);
        if (idx !== -1) popTimeouts.splice(idx, 1);
      }, 150);
      popTimeouts.push(tId);
    }

    function scheduleSpawn() {
      const elapsed = ROUND_SECONDS - state.timeLeft;
      const difficulty = Math.min(1, elapsed / ROUND_SECONDS);
      const delay = 500 + Math.random() * (700 - difficulty * 300);
      spawnTimeoutId = setTimeout(() => {
        if (state.running) spawnBalloon();
        scheduleSpawn();
      }, delay);
    }

    function updateStatus() {
      ctx.setStatus(`Score: ${state.score} | Time: ${state.timeLeft}s`);
    }

    function update() {
      state.balloons.forEach((b) => {
        if (b.popped) return;
        b.y -= b.vy;
        b.el.style.top = b.y + "px";
        if (b.y < -60) {
          b.popped = true;
          b.el.remove();
        }
      });
      state.balloons = state.balloons.filter((b) => !b.popped);
      rafId = requestAnimationFrame(update);
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
      popTimeouts.forEach((id) => clearTimeout(id));
      popTimeouts.length = 0;
    }

    function startRound() {
      clearAllTimers();
      state.balloons.forEach((b) => b.el.remove());
      state.balloons = [];
      state.score = 0;
      state.timeLeft = ROUND_SECONDS;
      state.running = true;
      startBtn.style.display = "none";
      updateStatus();
      countdownId = setInterval(() => {
        state.timeLeft--;
        updateStatus();
        if (state.timeLeft <= 0) endRound();
      }, 1000);
      scheduleSpawn();
      if (!rafId) rafId = requestAnimationFrame(update);
    }

    function endRound() {
      state.running = false;
      clearAllTimers();
      state.balloons.forEach((b) => b.el.remove());
      state.balloons = [];
      const best = ctx.storage.get("best", 0);
      const newBest = Math.max(best, state.score);
      ctx.storage.set("best", newBest);
      ctx.playSound(state.score > best ? "success" : "click");
      ctx.setStatus(`Final Score: ${state.score}`);
      startBtn.style.display = "";
      startBtn.textContent = "Play Again";
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
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
  },
});
