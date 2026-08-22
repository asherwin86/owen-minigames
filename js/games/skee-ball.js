MimiGames.register({
  id: "skee-ball",
  title: "Skee-Ball",
  emoji: "🎳",
  category: "Sports",
  players: "1P",
  howTo: "Click to lock power (reach up the ramp), click again to lock your aim — a well-timed roll lands in a higher-value hole. 9 balls.",
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

    const W = 560, H = 460;
    const LAUNCH = { x: 280, y: 420 };
    const ROW_Y = 92;
    const RAMP_LEFT = 40, RAMP_RIGHT = 520;
    const SUCCESS_THRESHOLD = 0.3;

    // Radii widened so the holes cover almost the whole ramp width — a shot
    // that's "in the neighborhood" of a hole still scores something instead
    // of sailing through to a hard zero.
    const HOLES = [
      { x: 110, value: 10, r: 46 },
      { x: 220, value: 30, r: 40 },
      { x: 315, value: 50, r: 30 },
      { x: 410, value: 40, r: 36 },
      { x: 495, value: 20, r: 44 },
    ];

    const state = {
      ball: 1,
      totalBalls: 9,
      total: 0,
      phase: "power", // power | accuracy | anim | done
      power: 0,
      acc: 0,
      shots: [],
      animT: 0,
      animTo: null,
      animScore: 0,
      lastResult: "",
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
    canvas.width = W;
    canvas.height = H;
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
    hint.textContent = "Almost any decent power reaches the holes now — focus on timing your aim for the higher-value ones.";

    wrap.appendChild(controls);
    wrap.appendChild(canvas);
    wrap.appendChild(actionBtn);
    wrap.appendChild(hint);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Perfect Shot (50)",
        run() {
          if (state.phase !== "power" && state.phase !== "accuracy") return;
          state.power = 1;
          state.acc = (HOLES[2].x - (RAMP_LEFT + 30)) / (RAMP_RIGHT - RAMP_LEFT - 60);
          state.phase = "anim";
          actionBtn.disabled = true;
          rollBall();
        },
      },
      {
        label: "Add Score +50",
        run: () => { state.total += 50; updateStatus(); },
      },
    ]);

    const g = canvas.getContext("2d");

    function triWave(t, period) {
      const x = (t % period) / period;
      return x < 0.5 ? x * 2 : 2 - x * 2;
    }

    let meterT = 0;
    const POWER_PERIOD = 1800;
    const ACC_PERIOD = 1500;

    function onAction() {
      if (state.phase === "power") {
        state.power = triWave(meterT, POWER_PERIOD);
        state.phase = "accuracy";
        meterT = 0;
        actionBtn.textContent = "Lock Aim";
      } else if (state.phase === "accuracy") {
        state.acc = triWave(meterT, ACC_PERIOD);
        state.phase = "anim";
        actionBtn.disabled = true;
        rollBall();
      }
    }

    function rollBall() {
      const reached = state.power >= SUCCESS_THRESHOLD;
      const targetY = reached ? ROW_Y : 420 - state.power / SUCCESS_THRESHOLD * (420 - ROW_Y);
      let score = 0;
      let landX = LAUNCH.x;
      let resultText = "Short roll!";

      if (reached) {
        const aimX = RAMP_LEFT + 30 + state.acc * (RAMP_RIGHT - RAMP_LEFT - 60);
        const timing = (state.power + state.acc) / 2;
        const wobble = (1 - timing) * 26;
        landX = aimX + (Math.random() - 0.5) * 2 * wobble;
        landX = Math.max(RAMP_LEFT + 10, Math.min(RAMP_RIGHT - 10, landX));
        let hit = null;
        for (const h of HOLES) {
          if (Math.abs(landX - h.x) < h.r) { hit = h; break; }
        }
        if (hit) {
          score = hit.value;
          resultText = `${hit.value} points!`;
        } else {
          resultText = "Missed the holes!";
        }
      } else {
        landX = LAUNCH.x + (Math.random() - 0.5) * 30;
      }

      state.animTo = { x: landX, y: targetY };
      state.animT = 0;
      state.animScore = score;
      state.lastResult = resultText;
    }

    function landBall(x, y, score) {
      state.shots.push({ x, y, score });
      state.total += score;
      ctx.playSound(score >= 40 ? "success" : score > 0 ? "pop" : "fail");
      ctx.vibrate(score > 0 ? 25 : 10);
      updateStatus();

      if (state.ball >= state.totalBalls) {
        delay(finishGame, 550);
      } else {
        delay(() => {
          state.ball++;
          state.phase = "power";
          meterT = 0;
          actionBtn.disabled = false;
          actionBtn.textContent = "Lock Power";
          updateStatus();
        }, 600);
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
          title: "Game Over!",
          subtitle: `Final score: ${state.total}  •  Best: ${Math.max(best, state.total)}${isBest ? " (new best!)" : ""}`,
          buttonText: "Play Again",
          onButton: resetGame,
        });
      }, 300);
    }

    function updateStatus() {
      ctx.setStatus(`Ball ${state.ball}/${state.totalBalls} — Total: ${state.total}` + (state.lastResult ? `  (${state.lastResult})` : ""));
    }

    function resetGame() {
      timeouts.forEach(clearTimeout);
      timeouts.length = 0;
      state.ball = 1;
      state.total = 0;
      state.phase = "power";
      state.shots = [];
      state.lastResult = "";
      state.over = false;
      meterT = 0;
      actionBtn.disabled = false;
      actionBtn.textContent = "Lock Power";
      updateStatus();
    }

    function drawRamp() {
      g.clearRect(0, 0, W, H);
      g.fillStyle = COLORS.panel;
      g.fillRect(0, 0, W, H);

      // ramp surface
      g.fillStyle = "#4a3421";
      g.fillRect(RAMP_LEFT, ROW_Y, RAMP_RIGHT - RAMP_LEFT, 420 - ROW_Y);
      g.strokeStyle = COLORS.border;
      g.lineWidth = 3;
      g.strokeRect(RAMP_LEFT, ROW_Y, RAMP_RIGHT - RAMP_LEFT, 420 - ROW_Y);

      // ramp guide lines
      g.strokeStyle = "rgba(255,255,255,.07)";
      for (let i = 1; i < 6; i++) {
        const x = RAMP_LEFT + (i * (RAMP_RIGHT - RAMP_LEFT)) / 6;
        g.beginPath();
        g.moveTo(x, ROW_Y);
        g.lineTo(x, 420);
        g.stroke();
      }

      // holes
      for (const h of HOLES) {
        g.beginPath();
        g.ellipse(h.x, ROW_Y, h.r, h.r * 0.45, 0, 0, Math.PI * 2);
        g.fillStyle = "#08090f";
        g.fill();
        g.strokeStyle = COLORS.accent2;
        g.lineWidth = 1.5;
        g.stroke();
        g.fillStyle = COLORS.text;
        g.font = "11px sans-serif";
        g.textAlign = "center";
        g.fillText(h.value, h.x, ROW_Y - h.r * 0.45 - 6);
      }

      // launch marker
      g.beginPath();
      g.arc(LAUNCH.x, LAUNCH.y, 4, 0, Math.PI * 2);
      g.fillStyle = COLORS.textDim;
      g.fill();

      // previous shots (faint)
      for (const s of state.shots) {
        g.beginPath();
        g.arc(s.x, s.y, 4, 0, Math.PI * 2);
        g.fillStyle = "rgba(241,243,249,.35)";
        g.fill();
      }

      // rolling ball
      if (state.phase === "anim" && state.animTo) {
        const t = state.animT;
        const bx = LAUNCH.x + (state.animTo.x - LAUNCH.x) * t;
        const by = LAUNCH.y + (state.animTo.y - LAUNCH.y) * t;
        g.beginPath();
        g.arc(bx, by, 8 - t * 3, 0, Math.PI * 2);
        g.fillStyle = COLORS.accent;
        g.fill();
        g.strokeStyle = "#000";
        g.lineWidth = 1;
        g.stroke();
      }

      // meters
      drawMeter(60, 440, 170, 14, state.phase === "power" ? triWave(meterT, POWER_PERIOD) : state.power, "POWER", state.phase === "power");
      drawMeter(270, 440, 170, 14, state.phase === "accuracy" ? triWave(meterT, ACC_PERIOD) : state.acc, "AIM", state.phase === "accuracy");
    }

    function drawMeter(x, y, w, h, value, label, active) {
      g.fillStyle = COLORS.textDim;
      g.font = "11px sans-serif";
      g.textAlign = "left";
      g.fillText(label, x, y - 5);
      g.fillStyle = COLORS.panelLight;
      g.fillRect(x, y, w, h);
      g.strokeStyle = active ? COLORS.accent2 : COLORS.border;
      g.lineWidth = 2;
      g.strokeRect(x, y, w, h);
      if (label === "POWER") {
        g.strokeStyle = "rgba(53,208,127,.6)";
        const threshX = x + SUCCESS_THRESHOLD * w;
        g.beginPath();
        g.moveTo(threshX, y - 2);
        g.lineTo(threshX, y + h + 2);
        g.stroke();
      }
      const markerX = x + value * w;
      g.fillStyle = active ? COLORS.accent2 : COLORS.win;
      g.fillRect(markerX - 3, y - 3, 6, h + 6);
    }

    let rafId = null;
    function loop() {
      if (state.phase === "power" || state.phase === "accuracy") {
        meterT += 16;
      } else if (state.phase === "anim" && state.animTo) {
        state.animT += 1 / 26;
        if (state.animT >= 1) {
          state.animT = 1;
          const { x, y } = state.animTo;
          const score = state.animScore;
          state.animTo = null;
          landBall(x, y, score);
        }
      }
      drawRamp();
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
