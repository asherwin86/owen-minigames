MimiGames.register({
  id: "billiards",
  title: "Billiards",
  emoji: "🎱",
  category: "Sports",
  players: "1P",
  howTo: "Click-drag from the cue ball and release — the ball flies the opposite way, slingshot-style. Pot all the colored balls.",
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

    const W = 560, H = 320;
    const RAIL = 20;
    const BALL_R = 9;
    const POCKET_R = 15;
    const FRICTION = 0.988;
    const MIN_SPEED = 0.06;
    const MAX_SPEED = 15;
    const POWER_SCALE = 0.14;

    const POCKETS = [
      { x: RAIL, y: RAIL },
      { x: W / 2, y: RAIL - 2 },
      { x: W - RAIL, y: RAIL },
      { x: RAIL, y: H - RAIL },
      { x: W / 2, y: H - RAIL + 2 },
      { x: W - RAIL, y: H - RAIL },
    ];

    const CUE_SPAWN = { x: 130, y: H / 2 };
    const OBJECT_COLORS = ["#ff4757", "#00d2ff", "#35d07f", "#ffd93d", "#a55eea", "#e67e22"];

    function makeBalls() {
      const balls = [];
      balls.push({ id: "cue", isCue: true, x: CUE_SPAWN.x, y: CUE_SPAWN.y, vx: 0, vy: 0, color: "#f1f3f9", potted: false });
      // small triangle cluster
      const baseX = 400, baseY = H / 2;
      const rows = [1, 2, 3];
      let idx = 0;
      let rx = baseX;
      for (let r = 0; r < rows.length; r++) {
        const count = rows[r];
        const colX = baseX + r * (BALL_R * 1.9);
        for (let i = 0; i < count; i++) {
          const y = baseY - (count - 1) * (BALL_R * 1.1) + i * (BALL_R * 2.2);
          balls.push({ id: "o" + idx, isCue: false, x: colX, y, vx: 0, vy: 0, color: OBJECT_COLORS[idx % OBJECT_COLORS.length], potted: false });
          idx++;
        }
      }
      return balls;
    }

    const state = {
      balls: makeBalls(),
      score: 0,
      shots: 0,
      dragging: false,
      dragX: 0,
      dragY: 0,
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
    canvas.style.cursor = "pointer";

    const hint = document.createElement("div");
    hint.style.color = COLORS.textDim;
    hint.style.fontSize = ".8rem";
    hint.textContent = "Drag away from the cue ball and release to shoot toward the opposite side.";

    wrap.appendChild(controls);
    wrap.appendChild(canvas);
    wrap.appendChild(hint);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      { label: "Add Score +50", run: () => { state.score += 50; updateStatus(); } },
      {
        label: "Clear Table",
        run: () => {
          if (state.over) return;
          objectBalls().forEach((b) => { if (!b.potted) potBall(b); });
        },
      },
    ]);

    const g = canvas.getContext("2d");

    function cueBall() {
      return state.balls.find((b) => b.isCue);
    }

    function objectBalls() {
      return state.balls.filter((b) => !b.isCue);
    }

    function anyMoving() {
      return state.balls.some((b) => !b.potted && (Math.abs(b.vx) > 0.001 || Math.abs(b.vy) > 0.001));
    }

    function canvasPos(evt) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((evt.clientX - rect.left) / rect.width) * W,
        y: ((evt.clientY - rect.top) / rect.height) * H,
      };
    }

    function onPointerDown(evt) {
      if (state.over || anyMoving()) return;
      const p = canvasPos(evt);
      const cue = cueBall();
      if (!cue || cue.potted) return;
      const d = Math.hypot(p.x - cue.x, p.y - cue.y);
      if (d < 40) {
        state.dragging = true;
        state.dragX = p.x;
        state.dragY = p.y;
        canvas.setPointerCapture && canvas.setPointerCapture(evt.pointerId);
      }
    }

    function onPointerMove(evt) {
      if (!state.dragging) return;
      const p = canvasPos(evt);
      state.dragX = p.x;
      state.dragY = p.y;
    }

    function onPointerUp(evt) {
      if (!state.dragging) return;
      state.dragging = false;
      const cue = cueBall();
      const p = canvasPos(evt);
      const dx = p.x - cue.x;
      const dy = p.y - cue.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 8) return; // too small, no shot
      const power = Math.min(dist, 140) * POWER_SCALE;
      const nx = -dx / dist;
      const ny = -dy / dist;
      cue.vx = nx * Math.min(power, MAX_SPEED);
      cue.vy = ny * Math.min(power, MAX_SPEED);
      state.shots++;
      ctx.playSound("click");
      updateStatus();
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    function potBall(ball) {
      ball.potted = true;
      ball.vx = 0;
      ball.vy = 0;
      if (ball.isCue) {
        ctx.playSound("fail");
      } else {
        state.score += 10;
        ctx.playSound("success");
        ctx.vibrate(20);
      }
      updateStatus();
    }

    function physicsStep() {
      const active = state.balls.filter((b) => !b.potted);
      for (const b of active) {
        b.x += b.vx;
        b.y += b.vy;
        b.vx *= FRICTION;
        b.vy *= FRICTION;
        if (Math.abs(b.vx) < MIN_SPEED) b.vx = 0;
        if (Math.abs(b.vy) < MIN_SPEED) b.vy = 0;

        // pocket check
        let pocketed = false;
        for (const pk of POCKETS) {
          if (Math.hypot(b.x - pk.x, b.y - pk.y) < POCKET_R) {
            potBall(b);
            pocketed = true;
            break;
          }
        }
        if (pocketed) continue;

        // rail bounce
        if (b.x - BALL_R < RAIL) {
          b.x = RAIL + BALL_R;
          b.vx = -b.vx * 0.92;
        } else if (b.x + BALL_R > W - RAIL) {
          b.x = W - RAIL - BALL_R;
          b.vx = -b.vx * 0.92;
        }
        if (b.y - BALL_R < RAIL) {
          b.y = RAIL + BALL_R;
          b.vy = -b.vy * 0.92;
        } else if (b.y + BALL_R > H - RAIL) {
          b.y = H - RAIL - BALL_R;
          b.vy = -b.vy * 0.92;
        }
      }

      // ball-ball collisions
      for (let i = 0; i < active.length; i++) {
        for (let j = i + 1; j < active.length; j++) {
          const a = active[i], b = active[j];
          if (a.potted || b.potted) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);
          if (dist === 0 || dist >= BALL_R * 2) continue;
          const nx = dx / dist, ny = dy / dist;
          const overlap = BALL_R * 2 - dist;
          a.x -= nx * overlap / 2;
          a.y -= ny * overlap / 2;
          b.x += nx * overlap / 2;
          b.y += ny * overlap / 2;
          const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
          const velAlongNormal = rvx * nx + rvy * ny;
          if (velAlongNormal > 0) continue;
          const restitution = 0.96;
          const impulse = (-(1 + restitution) * velAlongNormal) / 2;
          a.vx -= impulse * nx;
          a.vy -= impulse * ny;
          b.vx += impulse * nx;
          b.vy += impulse * ny;
          ctx.playSound("pop");
        }
      }

      // respawn cue if it settled while potted
      const cue = cueBall();
      if (cue.potted && !anyMoving()) {
        cue.x = CUE_SPAWN.x;
        cue.y = CUE_SPAWN.y;
        cue.vx = 0;
        cue.vy = 0;
        cue.potted = false;
      }

      // win check
      const remaining = objectBalls().filter((b) => !b.potted);
      if (remaining.length === 0 && !state.over && !anyMoving()) {
        finishGame();
      }
    }

    function finishGame() {
      state.over = true;
      const best = ctx.storage.get("bestShots", Infinity);
      const isBest = state.shots < best;
      if (isBest) ctx.storage.set("bestShots", state.shots);
      ctx.playSound("success");
      delay(() => {
        ctx.showOverlay({
          title: "Table Cleared!",
          subtitle: `Score: ${state.score} in ${state.shots} shots  •  Best: ${isBest ? state.shots : best} shots${isBest ? " (new best!)" : ""}`,
          buttonText: "Play Again",
          onButton: resetGame,
        });
      }, 400);
    }

    function updateStatus() {
      const remaining = objectBalls().filter((b) => !b.potted).length;
      ctx.setStatus(`Balls remaining: ${remaining} — Score: ${state.score} — Shots: ${state.shots}`);
    }

    function resetGame() {
      timeouts.forEach(clearTimeout);
      timeouts.length = 0;
      state.balls = makeBalls();
      state.score = 0;
      state.shots = 0;
      state.dragging = false;
      state.over = false;
      updateStatus();
    }

    function draw() {
      g.clearRect(0, 0, W, H);
      g.fillStyle = COLORS.panel;
      g.fillRect(0, 0, W, H);

      // table felt
      g.fillStyle = "#0e5c3a";
      g.fillRect(RAIL, RAIL, W - RAIL * 2, H - RAIL * 2);
      g.strokeStyle = "#6b3e17";
      g.lineWidth = RAIL;
      g.strokeRect(RAIL / 2, RAIL / 2, W - RAIL, H - RAIL);

      // pockets
      for (const pk of POCKETS) {
        g.beginPath();
        g.arc(pk.x, pk.y, POCKET_R, 0, Math.PI * 2);
        g.fillStyle = "#000";
        g.fill();
      }

      // aim line
      const cue = cueBall();
      if (state.dragging && cue && !cue.potted) {
        g.setLineDash([6, 5]);
        g.strokeStyle = "rgba(241,243,249,.5)";
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(cue.x, cue.y);
        g.lineTo(state.dragX, state.dragY);
        g.stroke();
        g.setLineDash([]);

        const dx = state.dragX - cue.x, dy = state.dragY - cue.y;
        const dist = Math.hypot(dx, dy);
        const power = Math.min(dist, 140) * POWER_SCALE;
        const nx = -dx / (dist || 1), ny = -dy / (dist || 1);
        g.strokeStyle = COLORS.accent2;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(cue.x, cue.y);
        g.lineTo(cue.x + nx * power * 6, cue.y + ny * power * 6);
        g.stroke();
      }

      // balls
      for (const b of state.balls) {
        if (b.potted) continue;
        g.beginPath();
        g.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
        g.fillStyle = b.color;
        g.fill();
        g.strokeStyle = "rgba(0,0,0,.4)";
        g.lineWidth = 1;
        g.stroke();
        if (b.isCue) {
          g.fillStyle = "rgba(0,0,0,.15)";
          g.beginPath();
          g.arc(b.x - 2, b.y - 2, 2, 0, Math.PI * 2);
          g.fill();
        }
      }
    }

    let rafId = null;
    function loop() {
      if (!state.over) physicsStep();
      draw();
      rafId = requestAnimationFrame(loop);
    }

    updateStatus();
    rafId = requestAnimationFrame(loop);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      timeouts.forEach(clearTimeout);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    };
  },
});
