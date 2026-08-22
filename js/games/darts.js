MimiGames.register({
  id: "darts",
  title: "Darts",
  emoji: "🎯",
  category: "Sports",
  players: "1P",
  howTo: "Click to lock the power bar, click again to lock accuracy — better timing means a dart closer to the bullseye. 3 rounds of 3 darts.",
  init(root, ctx) {
    const COLORS = {
      bg: "#171b2e",
      panel: "#1e2338",
      panelLight: "#262c47",
      accent: "#ff4757",
      accent2: "#00d2ff",
      text: "#f1f3f9",
      textDim: "#9aa1bd",
      border: "#333a5c",
      win: "#35d07f",
      lose: "#ff5c5c",
    };

    const RINGS = [
      { r: 14, score: 50, color: "#c0392b" },
      { r: 34, score: 25, color: "#f1f3f9" },
      { r: 76, score: 20, color: COLORS.win },
      { r: 118, score: 15, color: COLORS.accent },
      { r: 160, score: 10, color: COLORS.win },
      { r: 200, score: 5, color: COLORS.accent },
    ];
    const BOARD_R = 200;
    const CX = 250, CY = 220;

    const state = {
      round: 1,
      totalRounds: 3,
      dartInRound: 1,
      dartsPerRound: 3,
      total: 0,
      roundScore: 0,
      phase: "power", // power | accuracy | anim | done
      power: 0,
      acc: 0,
      darts: [], // landed darts on current round {x,y,score}
      animT: 0,
      animFrom: null,
      animTo: null,
      lastLanded: null,
      lastScore: null,
      over: false,
    };

    const timeouts = [];
    function delay(fn, ms) {
      const id = setTimeout(fn, ms);
      timeouts.push(id);
      return id;
    }

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "10px";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "10px";
    const restartBtn = document.createElement("button");
    restartBtn.className = "btn";
    restartBtn.textContent = "Restart";
    restartBtn.onclick = resetGame;
    controls.appendChild(restartBtn);

    const canvas = document.createElement("canvas");
    canvas.width = 500;
    canvas.height = 460;
    canvas.style.background = COLORS.panel;
    canvas.style.borderRadius = "14px";
    canvas.style.touchAction = "none";

    const actionBtn = document.createElement("button");
    actionBtn.className = "btn primary";
    actionBtn.style.fontSize = "1rem";
    actionBtn.style.padding = "10px 26px";
    actionBtn.textContent = "Lock Power";
    actionBtn.onclick = onAction;

    const hint = document.createElement("div");
    hint.style.color = COLORS.textDim;
    hint.style.fontSize = ".8rem";
    hint.textContent = "Time your click near the top of the bar for the best throw.";

    wrap.appendChild(controls);
    wrap.appendChild(canvas);
    wrap.appendChild(actionBtn);
    wrap.appendChild(hint);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Perfect Shot",
        run() {
          if (state.phase !== "power" && state.phase !== "accuracy") return;
          state.power = 1;
          state.acc = 1;
          state.phase = "anim";
          actionBtn.disabled = true;
          state.animFrom = { x: 250, y: 460 };
          state.animTo = { x: CX, y: CY };
          state.animT = 0;
          state.animScore = 50;
          state.lastLanded = { x: CX, y: CY };
          state.lastScore = 50;
        },
      },
      {
        label: "Add Score +50",
        run() {
          state.total += 50;
          state.roundScore += 50;
          updateStatus();
        },
      },
    ]);

    const g = canvas.getContext("2d");

    function triWave(t, period) {
      const x = (t % period) / period;
      return x < 0.5 ? x * 2 : 2 - x * 2;
    }

    function scoreForDist(d) {
      for (const ring of RINGS) if (d <= ring.r) return ring.score;
      return 0;
    }

    let meterT = 0;
    const POWER_PERIOD = 1100;
    const ACC_PERIOD = 850;

    function onAction() {
      if (state.phase === "power") {
        state.power = triWave(meterT, POWER_PERIOD);
        state.phase = "accuracy";
        meterT = 0;
        actionBtn.textContent = "Lock Accuracy";
      } else if (state.phase === "accuracy") {
        state.acc = triWave(meterT, ACC_PERIOD);
        state.phase = "anim";
        actionBtn.disabled = true;
        throwDart();
      }
    }

    function throwDart() {
      const timing = (state.power + state.acc) / 2; // 1 = perfect
      const wobble = 1 - timing;
      const maxOffset = 260;
      const angle = Math.random() * Math.PI * 2;
      const dist = wobble * maxOffset * (0.35 + Math.random() * 0.85);
      const lx = CX + Math.cos(angle) * dist;
      const ly = CY + Math.sin(angle) * dist;
      const d = Math.hypot(lx - CX, ly - CY);
      const score = d <= BOARD_R ? scoreForDist(d) : 0;
      state.animFrom = { x: 250, y: 460 };
      state.animTo = { x: lx, y: ly };
      state.animT = 0;
      state.animScore = score;
      state.lastLanded = { x: lx, y: ly };
      state.lastScore = score;
    }

    function landDart(x, y, score) {
      state.darts.push({ x, y, score });
      state.roundScore += score;
      state.total += score;
      ctx.playSound(score >= 25 ? "success" : score > 0 ? "pop" : "fail");
      ctx.vibrate(score > 0 ? 25 : 10);
      updateStatus();

      if (state.dartInRound >= state.dartsPerRound) {
        // round complete
        delay(() => {
          if (state.round >= state.totalRounds) {
            finishGame();
          } else {
            delay(() => {
              state.round++;
              state.dartInRound = 1;
              state.roundScore = 0;
              state.darts = [];
              state.phase = "power";
              meterT = 0;
              actionBtn.disabled = false;
              actionBtn.textContent = "Lock Power";
              updateStatus();
            }, 200);
          }
        }, 500);
      } else {
        delay(() => {
          state.dartInRound++;
          state.phase = "power";
          meterT = 0;
          actionBtn.disabled = false;
          actionBtn.textContent = "Lock Power";
          updateStatus();
        }, 550);
      }
    }

    function finishGame() {
      state.over = true;
      const best = ctx.storage.get("best", 0);
      const isBest = state.total > best;
      if (isBest) { ctx.storage.set("best", state.total); ctx.reportScore(state.total, { sortDir: "desc" }); }
      ctx.playSound(isBest ? "success" : "click");
      ctx.setStatus(`Final score: ${state.total}`);
      delay(() => {
        ctx.showOverlay({
          title: "Game Over!",
          subtitle: `Final score: ${state.total}  •  Best: ${Math.max(best, state.total)}${isBest ? " (new best!)" : ""}`,
          buttonText: "Play Again",
          onButton: resetGame,
        });
      }, 300);
    }

    function updateStatus() {
      ctx.setStatus(`Round ${state.round}/${state.totalRounds} — Dart ${state.dartInRound}/${state.dartsPerRound} — Round: ${state.roundScore} — Total: ${state.total}`);
    }

    function resetGame() {
      timeouts.forEach(clearTimeout);
      timeouts.length = 0;
      state.round = 1;
      state.dartInRound = 1;
      state.total = 0;
      state.roundScore = 0;
      state.phase = "power";
      state.darts = [];
      state.lastLanded = null;
      state.lastScore = null;
      state.over = false;
      meterT = 0;
      actionBtn.disabled = false;
      actionBtn.textContent = "Lock Power";
      updateStatus();
    }

    function drawBoard() {
      g.clearRect(0, 0, canvas.width, canvas.height);
      // backdrop
      g.fillStyle = COLORS.panel;
      g.fillRect(0, 0, canvas.width, canvas.height);
      // rings, outer to inner
      for (let i = RINGS.length - 1; i >= 0; i--) {
        g.beginPath();
        g.arc(CX, CY, RINGS[i].r, 0, Math.PI * 2);
        g.fillStyle = RINGS[i].color;
        g.globalAlpha = 0.9;
        g.fill();
      }
      g.globalAlpha = 1;
      g.strokeStyle = COLORS.border;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(CX, CY, BOARD_R, 0, Math.PI * 2);
      g.stroke();

      // previously landed darts this round
      for (const dt of state.darts) {
        drawDartMark(dt.x, dt.y);
      }
      // flying dart
      if (state.phase === "anim" && state.animFrom) {
        const t = state.animT;
        const ex = state.animFrom.x + (state.animTo.x - state.animFrom.x) * t;
        const ey = state.animFrom.y + (state.animTo.y - state.animFrom.y) * t;
        const scale = 1 - 0.4 * t;
        g.save();
        g.translate(ex, ey);
        g.scale(scale, scale);
        drawDartShape();
        g.restore();
      }

      // meters
      drawMeter(60, 400, 170, 22, state.phase === "power" ? triWave(meterT, POWER_PERIOD) : state.power, "POWER", state.phase === "power");
      drawMeter(270, 400, 170, 22, state.phase === "accuracy" ? triWave(meterT, ACC_PERIOD) : state.acc, "ACCURACY", state.phase === "accuracy");
    }

    function drawDartMark(x, y) {
      g.beginPath();
      g.arc(x, y, 5, 0, Math.PI * 2);
      g.fillStyle = COLORS.text;
      g.fill();
      g.strokeStyle = "#000";
      g.lineWidth = 1;
      g.stroke();
    }

    function drawDartShape() {
      g.fillStyle = COLORS.text;
      g.beginPath();
      g.moveTo(0, -8);
      g.lineTo(3, 4);
      g.lineTo(-3, 4);
      g.closePath();
      g.fill();
      g.strokeStyle = COLORS.accent;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, 4);
      g.lineTo(0, 14);
      g.stroke();
    }

    function drawMeter(x, y, w, h, value, label, active) {
      g.fillStyle = COLORS.textDim;
      g.font = "12px sans-serif";
      g.textAlign = "left";
      g.fillText(label, x, y - 6);
      g.fillStyle = COLORS.panelLight;
      g.fillRect(x, y, w, h);
      g.strokeStyle = active ? COLORS.accent2 : COLORS.border;
      g.lineWidth = 2;
      g.strokeRect(x, y, w, h);
      const markerX = x + value * w;
      g.fillStyle = active ? COLORS.accent2 : COLORS.win;
      g.fillRect(markerX - 3, y - 3, 6, h + 6);
    }

    let rafId = null;
    function loop() {
      if (state.phase === "power" || state.phase === "accuracy") {
        meterT += 16;
      } else if (state.phase === "anim" && state.animFrom) {
        state.animT += 1 / 22;
        if (state.animT >= 1) {
          state.animT = 1;
          const { x, y } = state.animTo;
          const score = state.animScore;
          state.animFrom = null;
          landDart(x, y, score);
        }
      }
      drawBoard();
      rafId = requestAnimationFrame(loop);
    }

    resetGame();
    rafId = requestAnimationFrame(loop);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      timeouts.forEach(clearTimeout);
    };
  },
});
