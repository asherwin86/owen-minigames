MimiGames.register({
  id: "mini-golf",
  title: "Mini Golf",
  emoji: "⛳",
  category: "Sports",
  players: "1P",
  howTo: "Drag back from the ball and release to putt the opposite way — bounce off walls to sink it in as few strokes as possible. 3 holes.",
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

    const W = 560, H = 340;
    const RAIL = 14;
    const BALL_R = 8;
    const HOLE_R = 12;
    const FRICTION = 0.984;
    const MIN_SPEED = 0.05;
    const DRAG_SCALE = 0.11;
    const MAX_SPEED = 13;

    const LAYOUTS = [
      { start: { x: 55, y: 170 }, hole: { x: 500, y: 170 }, par: 2, walls: [
        { x: 260, y: 60, w: 22, h: 150 },
        { x: 400, y: 130, w: 22, h: 150 },
      ] },
      { start: { x: 55, y: 55 }, hole: { x: 500, y: 285 }, par: 3, walls: [
        { x: 210, y: 0, w: 22, h: 230 },
        { x: 370, y: 110, w: 22, h: 230 },
      ] },
      { start: { x: 55, y: 285 }, hole: { x: 500, y: 55 }, par: 3, walls: [
        { x: 170, y: 130, w: 220, h: 22 },
        { x: 400, y: 60, w: 22, h: 160 },
      ] },
    ];

    function shuffledLayoutOrder() {
      const idx = [0, 1, 2];
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
      return idx;
    }

    const state = {
      order: shuffledLayoutOrder(),
      holeIndex: 0, // 0..2
      layout: null,
      strokes: 0,
      totalStrokes: 0,
      ball: { x: 0, y: 0, vx: 0, vy: 0 },
      holed: false,
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
    const nextBtn = document.createElement("button");
    nextBtn.className = "btn primary";
    nextBtn.textContent = "Next Hole";
    nextBtn.style.display = "none";
    nextBtn.onclick = advanceHole;
    controls.appendChild(restartBtn);
    controls.appendChild(nextBtn);

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
    hint.textContent = "Drag away from the ball and release to putt — plan your bounce off the walls.";

    wrap.appendChild(controls);
    wrap.appendChild(canvas);
    wrap.appendChild(hint);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Hole It",
        run: () => {
          if (state.over || state.holed || !state.layout) return;
          state.dragging = false;
          state.ball.x = state.layout.hole.x;
          state.ball.y = state.layout.hole.y;
          state.ball.vx = 0;
          state.ball.vy = 0;
          state.holed = true;
          state.strokes = Math.max(1, state.strokes);
          state.totalStrokes += state.strokes;
          ctx.playSound("success");
          updateStatus();
          if (state.holeIndex >= LAYOUTS.length - 1) {
            delay(finishGame, 500);
          } else {
            nextBtn.style.display = "inline-block";
          }
        },
      },
      {
        label: "Skip Hole",
        run: () => {
          if (state.over || !state.layout) return;
          if (state.holeIndex >= LAYOUTS.length - 1) {
            state.holed = true;
            finishGame();
          } else {
            state.holed = true;
            advanceHole();
          }
        },
      },
    ]);

    const g = canvas.getContext("2d");

    function canvasPos(evt) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((evt.clientX - rect.left) / rect.width) * W,
        y: ((evt.clientY - rect.top) / rect.height) * H,
      };
    }

    function ballMoving() {
      return Math.abs(state.ball.vx) > 0.001 || Math.abs(state.ball.vy) > 0.001;
    }

    function onPointerDown(evt) {
      if (state.over || state.holed || ballMoving()) return;
      const p = canvasPos(evt);
      const d = Math.hypot(p.x - state.ball.x, p.y - state.ball.y);
      if (d < 34) {
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
      const p = canvasPos(evt);
      const dx = p.x - state.ball.x;
      const dy = p.y - state.ball.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 8) return;
      const power = Math.min(dist, 150) * DRAG_SCALE;
      const nx = -dx / dist, ny = -dy / dist;
      const speed = Math.min(power, MAX_SPEED);
      state.ball.vx = nx * speed;
      state.ball.vy = ny * speed;
      state.strokes++;
      ctx.playSound("click");
      updateStatus();
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    function clamp(v, lo, hi) {
      return Math.max(lo, Math.min(hi, v));
    }

    function collideRect(ball, rect) {
      const closestX = clamp(ball.x, rect.x, rect.x + rect.w);
      const closestY = clamp(ball.y, rect.y, rect.y + rect.h);
      const dx = ball.x - closestX, dy = ball.y - closestY;
      const dist = Math.hypot(dx, dy);
      if (dist < BALL_R && dist > 0.0001) {
        const nx = dx / dist, ny = dy / dist;
        const overlap = BALL_R - dist;
        ball.x += nx * overlap;
        ball.y += ny * overlap;
        const vn = ball.vx * nx + ball.vy * ny;
        ball.vx -= 2 * vn * nx;
        ball.vy -= 2 * vn * ny;
        ball.vx *= 0.92;
        ball.vy *= 0.92;
        ctx.playSound("pop");
      }
    }

    function physicsStep() {
      if (state.holed || state.over) return;
      const b = state.ball;
      if (!ballMoving()) return;
      b.x += b.vx;
      b.y += b.vy;
      b.vx *= FRICTION;
      b.vy *= FRICTION;
      if (Math.abs(b.vx) < MIN_SPEED) b.vx = 0;
      if (Math.abs(b.vy) < MIN_SPEED) b.vy = 0;

      if (b.x - BALL_R < RAIL) { b.x = RAIL + BALL_R; b.vx = -b.vx * 0.85; }
      else if (b.x + BALL_R > W - RAIL) { b.x = W - RAIL - BALL_R; b.vx = -b.vx * 0.85; }
      if (b.y - BALL_R < RAIL) { b.y = RAIL + BALL_R; b.vy = -b.vy * 0.85; }
      else if (b.y + BALL_R > H - RAIL) { b.y = H - RAIL - BALL_R; b.vy = -b.vy * 0.85; }

      for (const wall of state.layout.walls) collideRect(b, wall);

      const dHole = Math.hypot(b.x - state.layout.hole.x, b.y - state.layout.hole.y);
      if (dHole < HOLE_R) {
        state.holed = true;
        b.x = state.layout.hole.x;
        b.y = state.layout.hole.y;
        b.vx = 0;
        b.vy = 0;
        state.totalStrokes += state.strokes;
        ctx.playSound("success");
        ctx.vibrate(30);
        updateStatus();
        if (state.holeIndex >= LAYOUTS.length - 1) {
          delay(finishGame, 500);
        } else {
          nextBtn.style.display = "inline-block";
        }
      }
    }

    function loadHole() {
      state.layout = LAYOUTS[state.order[state.holeIndex]];
      state.ball.x = state.layout.start.x;
      state.ball.y = state.layout.start.y;
      state.ball.vx = 0;
      state.ball.vy = 0;
      state.strokes = 0;
      state.holed = false;
      nextBtn.style.display = "none";
      updateStatus();
    }

    function advanceHole() {
      if (state.holeIndex >= LAYOUTS.length - 1) return;
      state.holeIndex++;
      loadHole();
    }

    function finishGame() {
      state.over = true;
      const best = ctx.storage.get("bestTotal", Infinity);
      const isBest = state.totalStrokes < best;
      if (isBest) ctx.storage.set("bestTotal", state.totalStrokes);
      ctx.playSound(isBest ? "success" : "click");
      delay(() => {
        ctx.showOverlay({
          title: "Round Complete!",
          subtitle: `Total strokes: ${state.totalStrokes}  •  Best: ${isBest ? state.totalStrokes : best}${isBest ? " (new best!)" : ""}`,
          buttonText: "Play Again",
          onButton: resetGame,
        });
      }, 300);
    }

    function updateStatus() {
      const parSum = LAYOUTS.reduce((s, l) => s + l.par, 0);
      const runningTotal = state.holed ? state.totalStrokes : state.totalStrokes + state.strokes;
      ctx.setStatus(
        `Hole ${state.holeIndex + 1}/${LAYOUTS.length} (Par ${state.layout ? state.layout.par : "-"}) — Strokes: ${state.strokes} — Total: ${runningTotal}/${parSum}`
      );
    }

    function resetGame() {
      timeouts.forEach(clearTimeout);
      timeouts.length = 0;
      state.order = shuffledLayoutOrder();
      state.holeIndex = 0;
      state.totalStrokes = 0;
      state.over = false;
      state.dragging = false;
      loadHole();
    }

    function draw() {
      g.clearRect(0, 0, W, H);
      g.fillStyle = COLORS.panel;
      g.fillRect(0, 0, W, H);

      g.fillStyle = "#1e5e34";
      g.fillRect(RAIL, RAIL, W - RAIL * 2, H - RAIL * 2);
      g.strokeStyle = COLORS.border;
      g.lineWidth = RAIL;
      g.strokeRect(RAIL / 2, RAIL / 2, W - RAIL, H - RAIL);

      if (state.layout) {
        // hole
        g.beginPath();
        g.arc(state.layout.hole.x, state.layout.hole.y, HOLE_R, 0, Math.PI * 2);
        g.fillStyle = "#08130c";
        g.fill();
        // flag
        g.strokeStyle = COLORS.textDim;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(state.layout.hole.x, state.layout.hole.y);
        g.lineTo(state.layout.hole.x, state.layout.hole.y - 34);
        g.stroke();
        g.fillStyle = COLORS.accent;
        g.beginPath();
        g.moveTo(state.layout.hole.x, state.layout.hole.y - 34);
        g.lineTo(state.layout.hole.x + 16, state.layout.hole.y - 28);
        g.lineTo(state.layout.hole.x, state.layout.hole.y - 22);
        g.closePath();
        g.fill();

        // walls
        for (const wall of state.layout.walls) {
          g.fillStyle = COLORS.panelLight;
          g.fillRect(wall.x, wall.y, wall.w, wall.h);
          g.strokeStyle = COLORS.border;
          g.lineWidth = 2;
          g.strokeRect(wall.x, wall.y, wall.w, wall.h);
        }
      }

      // aim line
      if (state.dragging) {
        g.setLineDash([6, 5]);
        g.strokeStyle = "rgba(241,243,249,.5)";
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(state.ball.x, state.ball.y);
        g.lineTo(state.dragX, state.dragY);
        g.stroke();
        g.setLineDash([]);

        const dx = state.dragX - state.ball.x, dy = state.dragY - state.ball.y;
        const dist = Math.hypot(dx, dy) || 1;
        const power = Math.min(dist, 150) * DRAG_SCALE;
        const nx = -dx / dist, ny = -dy / dist;
        g.strokeStyle = COLORS.accent2;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(state.ball.x, state.ball.y);
        g.lineTo(state.ball.x + nx * power * 8, state.ball.y + ny * power * 8);
        g.stroke();
      }

      // ball
      if (!state.holed) {
        g.beginPath();
        g.arc(state.ball.x, state.ball.y, BALL_R, 0, Math.PI * 2);
        g.fillStyle = COLORS.text;
        g.fill();
        g.strokeStyle = "rgba(0,0,0,.4)";
        g.lineWidth = 1;
        g.stroke();
      }

      if (state.holed && state.holeIndex < LAYOUTS.length - 1) {
        g.fillStyle = COLORS.win;
        g.font = "bold 20px sans-serif";
        g.textAlign = "center";
        g.fillText(`Holed in ${state.strokes}!`, W / 2, H / 2);
      }
    }

    let rafId = null;
    function loop() {
      physicsStep();
      draw();
      rafId = requestAnimationFrame(loop);
    }

    resetGame();
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
