MimiGames.register({
  id: "bowling",
  title: "Bowling",
  emoji: "🎳",
  category: "Sports",
  players: "1P",
  howTo: "Click to lock power, click again to lock your aim near the center of the lane — closer to center knocks down more pins. 5 frames.",
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

    const W = 500, H = 460;
    const LANE_TOP_Y = 60, LANE_BOTTOM_Y = 400;
    const LANE_TOP_HALFW = 90, LANE_BOTTOM_HALFW = 150;
    const CENTER_X = W / 2;

    // 10 pins in standard triangle, rows from back to front
    function buildPins() {
      const positions = [];
      const rowSpacing = 22;
      const pinSpacing = 26;
      const rows = [1, 2, 3, 4];
      let rowY = LANE_TOP_Y + 18;
      for (const count of rows) {
        const totalW = (count - 1) * pinSpacing;
        for (let i = 0; i < count; i++) {
          positions.push({ x: CENTER_X - totalW / 2 + i * pinSpacing, y: rowY });
        }
        rowY += rowSpacing;
      }
      return positions;
    }
    const PIN_POS = buildPins();

    const state = {
      frame: 1,
      totalFrames: 5,
      roll: 1,
      standing: [],
      total: 0,
      frameScore: 0,
      roll1Pins: 0,
      phase: "power", // power | aim | anim | done
      power: 0,
      aim: 0,
      over: false,
      ballX: CENTER_X,
      ballY: LANE_BOTTOM_Y,
      animT: 0,
      pendingKnock: 0,
      forcePerfect: false,
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

    const actionBtn = document.createElement("button");
    actionBtn.className = "btn primary";
    actionBtn.style.fontSize = "1rem";
    actionBtn.style.padding = "10px 26px";
    actionBtn.textContent = "Lock Power";
    actionBtn.onclick = onAction;

    const hint = document.createElement("div");
    hint.style.color = COLORS.textDim;
    hint.style.fontSize = ".8rem";
    hint.textContent = "Aim for dead-center to knock down the most pins.";

    wrap.appendChild(controls);
    wrap.appendChild(canvas);
    wrap.appendChild(actionBtn);
    wrap.appendChild(hint);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Perfect Roll: Off",
        run(e) {
          state.forcePerfect = !state.forcePerfect;
          e.target.textContent = `Perfect Roll: ${state.forcePerfect ? "On" : "Off"}`;
        },
      },
      { label: "Add Score +20", run: () => { state.total += 20; updateStatus(); } },
    ]);

    const g = canvas.getContext("2d");

    function triWave(t, period) {
      const x = (t % period) / period;
      return x < 0.5 ? x * 2 : 2 - x * 2;
    }

    let meterT = 0;
    const POWER_PERIOD = 1900;
    const AIM_PERIOD = 1700;

    function onAction() {
      if (state.phase === "power") {
        state.power = triWave(meterT, POWER_PERIOD);
        state.phase = "aim";
        meterT = 0;
        actionBtn.textContent = "Lock Aim";
      } else if (state.phase === "aim") {
        state.aim = triWave(meterT, AIM_PERIOD);
        state.phase = "anim";
        actionBtn.disabled = true;
        rollBall();
      }
    }

    function standingCount() {
      return state.standing.filter(Boolean).length;
    }

    function rollBall() {
      const offsetNorm = (state.aim - 0.5) * 2; // -1..1, 0 = center
      // Forgiving accuracy curve: a wide "sweet zone" near center still scores
      // close to max, only the outer edges of the meter really punish you.
      const accuracy = Math.max(0, 1 - Math.pow(Math.abs(offsetNorm), 1.6));
      const combined = Math.max(0, Math.min(1, accuracy * (0.78 + 0.22 * state.power)));
      const noise = (Math.random() - 0.3) * 0.15;
      const remain = standingCount();
      let computed = Math.round(remain * Math.max(0, Math.min(1, combined + noise)));
      computed = Math.max(0, Math.min(remain, computed));
      if (state.forcePerfect) {
        computed = remain;
        state.forcePerfect = false;
      }
      state.pendingKnock = computed;
      state.animT = 0;
      state.ballOffsetNorm = offsetNorm;
    }

    function finishRoll() {
      const remain = standingCount();
      const knock = state.pendingKnock;
      // knock down `knock` random standing pins
      const standingIdx = state.standing.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
      for (let i = standingIdx.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [standingIdx[i], standingIdx[j]] = [standingIdx[j], standingIdx[i]];
      }
      for (let i = 0; i < knock; i++) state.standing[standingIdx[i]] = false;

      ctx.playSound(knock >= remain && remain > 0 ? "success" : knock > 0 ? "pop" : "fail");
      ctx.vibrate(knock > 0 ? 20 : 8);

      if (state.roll === 1) {
        state.roll1Pins = knock;
        if (knock >= 10) {
          // strike
          state.frameScore = 10;
          state.total += 10;
          updateStatus("STRIKE!");
          nextFrameAfterDelay();
        } else {
          state.roll = 2;
          state.phase = "power";
          meterT = 0;
          actionBtn.disabled = false;
          actionBtn.textContent = "Lock Power";
          updateStatus();
        }
      } else {
        const frameTotal = state.roll1Pins + knock;
        state.frameScore = frameTotal;
        state.total += knock;
        updateStatus(frameTotal >= 10 ? "SPARE!" : undefined);
        nextFrameAfterDelay();
      }
    }

    function nextFrameAfterDelay() {
      delay(() => {
        if (state.frame >= state.totalFrames) {
          finishGame();
        } else {
          delay(() => {
            state.frame++;
            state.roll = 1;
            state.standing = state.standing.map(() => true);
            state.roll1Pins = 0;
            state.frameScore = 0;
            state.phase = "power";
            meterT = 0;
            actionBtn.disabled = false;
            actionBtn.textContent = "Lock Power";
            updateStatus();
          }, 250);
        }
      }, 650);
    }

    function finishGame() {
      state.over = true;
      const best = ctx.storage.get("best", 0);
      const isBest = state.total > best;
      if (isBest) { ctx.storage.set("best", state.total); ctx.reportScore(state.total, { sortDir: "desc" }); }
      ctx.playSound(isBest ? "success" : "click");
      delay(() => {
        ctx.showOverlay({
          title: "Game Over!",
          subtitle: `Total pins: ${state.total}  •  Best: ${Math.max(best, state.total)}${isBest ? " (new best!)" : ""}`,
          buttonText: "Play Again",
          onButton: resetGame,
        });
      }, 300);
    }

    function updateStatus(note) {
      const s = `Frame ${state.frame}/${state.totalFrames} — Roll ${state.roll} — Standing: ${standingCount()} — Total: ${state.total}` + (note ? `  (${note})` : "");
      ctx.setStatus(s);
    }

    function resetGame() {
      timeouts.forEach(clearTimeout);
      timeouts.length = 0;
      state.frame = 1;
      state.roll = 1;
      state.standing = PIN_POS.map(() => true);
      state.total = 0;
      state.frameScore = 0;
      state.roll1Pins = 0;
      state.phase = "power";
      state.over = false;
      state.ballX = CENTER_X;
      state.ballY = LANE_BOTTOM_Y;
      meterT = 0;
      actionBtn.disabled = false;
      actionBtn.textContent = "Lock Power";
      updateStatus();
    }

    function laneHalfWidthAt(y) {
      const t = (y - LANE_TOP_Y) / (LANE_BOTTOM_Y - LANE_TOP_Y);
      return LANE_TOP_HALFW + (LANE_BOTTOM_HALFW - LANE_TOP_HALFW) * t;
    }

    function drawLane() {
      g.clearRect(0, 0, W, H);
      g.fillStyle = COLORS.panel;
      g.fillRect(0, 0, W, H);

      // lane trapezoid
      g.beginPath();
      g.moveTo(CENTER_X - LANE_TOP_HALFW, LANE_TOP_Y);
      g.lineTo(CENTER_X + LANE_TOP_HALFW, LANE_TOP_Y);
      g.lineTo(CENTER_X + LANE_BOTTOM_HALFW, LANE_BOTTOM_Y);
      g.lineTo(CENTER_X - LANE_BOTTOM_HALFW, LANE_BOTTOM_Y);
      g.closePath();
      g.fillStyle = "#3d2b1f";
      g.fill();
      g.strokeStyle = COLORS.border;
      g.lineWidth = 2;
      g.stroke();

      // lane boards (guide lines)
      g.strokeStyle = "rgba(255,255,255,.08)";
      g.lineWidth = 1;
      for (let i = -3; i <= 3; i++) {
        g.beginPath();
        g.moveTo(CENTER_X + i * (LANE_TOP_HALFW / 4), LANE_TOP_Y);
        g.lineTo(CENTER_X + i * (LANE_BOTTOM_HALFW / 4), LANE_BOTTOM_Y);
        g.stroke();
      }
      // center guide
      g.strokeStyle = "rgba(0,210,255,.35)";
      g.beginPath();
      g.moveTo(CENTER_X, LANE_TOP_Y);
      g.lineTo(CENTER_X, LANE_BOTTOM_Y);
      g.stroke();

      // pins
      PIN_POS.forEach((p, i) => {
        if (!state.standing[i]) return;
        g.beginPath();
        g.ellipse(p.x, p.y, 6, 10, 0, 0, Math.PI * 2);
        g.fillStyle = COLORS.text;
        g.fill();
        g.strokeStyle = COLORS.accent;
        g.lineWidth = 1.5;
        g.stroke();
      });

      // ball
      if (state.phase === "anim") {
        const t = state.animT;
        const y = LANE_BOTTOM_Y + (LANE_TOP_Y + 20 - LANE_BOTTOM_Y) * t;
        const curveX = CENTER_X + state.ballOffsetNorm * laneHalfWidthAt(y) * 0.9;
        state.ballX = curveX;
        state.ballY = y;
        g.beginPath();
        g.arc(state.ballX, state.ballY, 9 - t * 3, 0, Math.PI * 2);
        g.fillStyle = COLORS.accent2;
        g.fill();
      }

      // meters
      drawMeter(60, 415, 170, 20, state.phase === "power" ? triWave(meterT, POWER_PERIOD) : state.power, "POWER", state.phase === "power");
      drawMeter(270, 415, 170, 20, state.phase === "aim" ? triWave(meterT, AIM_PERIOD) : state.aim, "AIM", state.phase === "aim");
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
      if (label === "AIM") {
        // wide green "sweet zone" band around center — landing anywhere in here scores well
        const zoneW = w * 0.5;
        g.fillStyle = "rgba(53,208,127,.22)";
        g.fillRect(x + w / 2 - zoneW / 2, y, zoneW, h);
        g.strokeStyle = "rgba(53,208,127,.6)";
        g.beginPath();
        g.moveTo(x + w / 2, y - 2);
        g.lineTo(x + w / 2, y + h + 2);
        g.stroke();
      }
      const markerX = x + value * w;
      g.fillStyle = active ? COLORS.accent2 : COLORS.win;
      g.fillRect(markerX - 3, y - 3, 6, h + 6);
    }

    let rafId = null;
    function loop() {
      if (state.phase === "power" || state.phase === "aim") {
        meterT += 16;
      } else if (state.phase === "anim") {
        state.animT += 1 / 40;
        if (state.animT >= 1) {
          state.animT = 1;
          state.phase = "resolved";
          finishRoll();
        }
      }
      drawLane();
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
