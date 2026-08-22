MimiGames.register({
  id: "archery",
  title: "Archery",
  emoji: "🏹",
  category: "Sports",
  players: "1P",
  howTo: "Click to lock power, click again to lock accuracy — watch the wind indicator and compensate. 6 arrows total.",
  init(root, ctx) {
    const COLORS = {
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

    const RING_COLORS = ["#f1f3f9", "#f1f3f9", "#00d2ff", "#00d2ff", "#ff4757", "#ff4757", "#35d07f", "#35d07f", "#ffd93d", "#ffd93d"];
    const RINGS = [];
    for (let i = 1; i <= 10; i++) {
      RINGS.push({ r: i * 19, score: 11 - i, color: RING_COLORS[i - 1] });
    }
    const BOARD_R = 190;
    const CX = 250, CY = 220;

    const state = {
      arrow: 1,
      totalArrows: 6,
      total: 0,
      phase: "power", // power | accuracy | anim | done
      power: 0,
      acc: 0,
      wind: 0,
      shots: [],
      animT: 0,
      animFrom: null,
      animTo: null,
      animScore: 0,
      over: false,
      forcePerfect: false,
    };

    const timeouts = [];
    function delay(fn, ms) {
      const id = setTimeout(fn, ms);
      timeouts.push(id);
      return id;
    }

    function rollWind() {
      state.wind = (Math.random() * 2 - 1) * 5; // -5..5
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
    hint.textContent = "Compensate your aim against the wind for a truer shot.";

    wrap.appendChild(controls);
    wrap.appendChild(canvas);
    wrap.appendChild(actionBtn);
    wrap.appendChild(hint);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Perfect Shot: Off",
        run(e) {
          state.forcePerfect = !state.forcePerfect;
          e.target.textContent = `Perfect Shot: ${state.forcePerfect ? "On" : "Off"}`;
        },
      },
      { label: "Add Score +50", run: () => { state.total += 50; updateStatus(); } },
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
    const POWER_PERIOD = 1050;
    const ACC_PERIOD = 800;

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
        shootArrow();
      }
    }

    function shootArrow() {
      const timing = (state.power + state.acc) / 2;
      const wobble = state.forcePerfect ? 0 : 1 - timing;
      const maxOffset = 240;
      const angle = Math.random() * Math.PI * 2;
      const dist = wobble * maxOffset * (0.3 + Math.random() * 0.8);
      let lx = CX + Math.cos(angle) * dist;
      let ly = CY + Math.sin(angle) * dist;
      // wind pushes horizontally, partially compensated by good accuracy timing
      const windEffect = state.forcePerfect ? 0 : state.wind * 7 * (0.5 + 0.5 * (1 - state.acc));
      lx += windEffect;
      if (state.forcePerfect) state.forcePerfect = false;
      const d = Math.hypot(lx - CX, ly - CY);
      const score = d <= BOARD_R ? scoreForDist(d) : 0;
      state.animFrom = { x: 250, y: 460 };
      state.animTo = { x: lx, y: ly };
      state.animT = 0;
      state.animScore = score;
    }

    function landArrow(x, y, score) {
      state.shots.push({ x, y, score });
      state.total += score;
      ctx.playSound(score >= 9 ? "success" : score > 0 ? "pop" : "fail");
      ctx.vibrate(score > 0 ? 25 : 10);
      updateStatus();

      if (state.arrow >= state.totalArrows) {
        delay(finishGame, 500);
      } else {
        delay(() => {
          state.arrow++;
          state.phase = "power";
          meterT = 0;
          rollWind();
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
      if (isBest) ctx.storage.set("best", state.total);
      ctx.playSound(isBest ? "success" : "click");
      delay(() => {
        ctx.showOverlay({
          title: "Round Complete!",
          subtitle: `Final score: ${state.total}  •  Best: ${Math.max(best, state.total)}${isBest ? " (new best!)" : ""}`,
          buttonText: "Play Again",
          onButton: resetGame,
        });
      }, 300);
    }

    function updateStatus() {
      ctx.setStatus(`Arrow ${state.arrow}/${state.totalArrows} — Total: ${state.total}`);
    }

    function resetGame() {
      timeouts.forEach(clearTimeout);
      timeouts.length = 0;
      state.arrow = 1;
      state.total = 0;
      state.phase = "power";
      state.shots = [];
      state.over = false;
      meterT = 0;
      rollWind();
      actionBtn.disabled = false;
      actionBtn.textContent = "Lock Power";
      updateStatus();
    }

    function drawTarget() {
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.fillStyle = COLORS.panel;
      g.fillRect(0, 0, canvas.width, canvas.height);

      for (let i = RINGS.length - 1; i >= 0; i--) {
        g.beginPath();
        g.arc(CX, CY, RINGS[i].r, 0, Math.PI * 2);
        g.fillStyle = RINGS[i].color;
        g.globalAlpha = 0.92;
        g.fill();
      }
      g.globalAlpha = 1;
      g.strokeStyle = COLORS.border;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(CX, CY, BOARD_R, 0, Math.PI * 2);
      g.stroke();

      for (const s of state.shots) drawArrowMark(s.x, s.y);

      if (state.phase === "anim" && state.animFrom) {
        const t = state.animT;
        const ex = state.animFrom.x + (state.animTo.x - state.animFrom.x) * t;
        const ey = state.animFrom.y + (state.animTo.y - state.animFrom.y) * t;
        drawArrowMark(ex, ey, true);
      }

      // wind indicator
      g.fillStyle = COLORS.textDim;
      g.font = "13px sans-serif";
      g.textAlign = "center";
      const windDir = state.wind > 0 ? "→" : state.wind < 0 ? "←" : "";
      g.fillText(`Wind ${windDir} ${Math.abs(state.wind).toFixed(1)}`, CX, 26);

      drawMeter(60, 400, 170, 22, state.phase === "power" ? triWave(meterT, POWER_PERIOD) : state.power, "POWER", state.phase === "power");
      drawMeter(270, 400, 170, 22, state.phase === "accuracy" ? triWave(meterT, ACC_PERIOD) : state.acc, "ACCURACY", state.phase === "accuracy");
    }

    function drawArrowMark(x, y, flying) {
      g.save();
      g.translate(x, y);
      g.fillStyle = flying ? COLORS.accent2 : COLORS.text;
      g.beginPath();
      g.arc(0, 0, flying ? 4 : 4, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#000";
      g.lineWidth = 1;
      g.stroke();
      g.restore();
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
          landArrow(x, y, score);
        }
      }
      drawTarget();
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
