MimiGames.register({
  id: "curling",
  title: "Curling",
  emoji: "🥌",
  category: "Sports",
  players: "1-2P",
  howTo: "Drag back from the stone and release toward the house — take turns, closest stones to the button score. 4 stones each, best of 3 ends.",
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

    const W = 600, H = 300;
    const RAIL = 14;
    const STONE_R = 10;
    const HOUSE_X = W - 100, HOUSE_Y = H / 2;
    const HOUSE_R = 68;
    const THROW_X = 80, THROW_Y = H / 2;
    const FRICTION = 0.99;
    const MIN_SPEED = 0.035;
    const DRAG_SCALE = 0.1;
    const MAX_SPEED = 9;
    const STONES_PER_PLAYER = 4;
    const TOTAL_ENDS = 3;

    const PLAYER_COLOR = { 1: COLORS.accent, 2: COLORS.accent2 };

    const state = {
      end: 1,
      scores: { 1: 0, 2: 0 },
      stones: [], // thrown/resting stones {x,y,vx,vy,player,outOfPlay}
      thrownThisEnd: 0,
      turn: 1,
      active: null, // the stone currently being aimed (not yet released)
      dragging: false,
      dragX: 0,
      dragY: 0,
      endResolved: false,
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
    const nextEndBtn = document.createElement("button");
    nextEndBtn.className = "btn primary";
    nextEndBtn.textContent = "New End";
    nextEndBtn.style.display = "none";
    nextEndBtn.onclick = nextEnd;
    controls.appendChild(restartBtn);
    controls.appendChild(nextEndBtn);

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
    hint.textContent = "Drag away from the stone and release toward the house. You can knock other stones out!";

    wrap.appendChild(controls);
    wrap.appendChild(canvas);
    wrap.appendChild(hint);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Perfect Shot",
        run() {
          if (state.over || state.endResolved || anyMoving() || !state.active) return;
          const stone = state.active;
          stone.x = HOUSE_X;
          stone.y = HOUSE_Y;
          stone.vx = 0;
          stone.vy = 0;
          state.stones.push(stone);
          state.active = null;
          state.thrownThisEnd++;
          ctx.playSound("click");
          updateStatus();
        },
      },
      {
        label: "Add Score +2",
        run() {
          state.scores[state.turn] += 2;
          updateStatus();
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

    function anyMoving() {
      return state.stones.some((s) => !s.outOfPlay && (Math.abs(s.vx) > 0.001 || Math.abs(s.vy) > 0.001));
    }

    function spawnActiveStone() {
      state.active = { x: THROW_X, y: THROW_Y, vx: 0, vy: 0, player: state.turn, outOfPlay: false, resting: false };
    }

    function onPointerDown(evt) {
      if (state.over || state.endResolved || anyMoving() || !state.active) return;
      const p = canvasPos(evt);
      const d = Math.hypot(p.x - state.active.x, p.y - state.active.y);
      if (d < 36) {
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
      const dx = p.x - state.active.x;
      const dy = p.y - state.active.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 8) return;
      const power = Math.min(dist, 160) * DRAG_SCALE;
      const nx = -dx / dist, ny = -dy / dist;
      const speed = Math.min(power, MAX_SPEED);
      state.active.vx = nx * speed;
      state.active.vy = ny * speed;
      state.stones.push(state.active);
      state.active = null;
      state.thrownThisEnd++;
      ctx.playSound("click");
      updateStatus();
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    function physicsStep() {
      const active = state.stones.filter((s) => !s.outOfPlay);
      for (const s of active) {
        if (Math.abs(s.vx) < 0.001 && Math.abs(s.vy) < 0.001) continue;
        s.x += s.vx;
        s.y += s.vy;
        s.vx *= FRICTION;
        s.vy *= FRICTION;
        if (Math.abs(s.vx) < MIN_SPEED) s.vx = 0;
        if (Math.abs(s.vy) < MIN_SPEED) s.vy = 0;

        if (s.y - STONE_R < RAIL) { s.y = RAIL + STONE_R; s.vy = -s.vy * 0.85; }
        else if (s.y + STONE_R > H - RAIL) { s.y = H - RAIL - STONE_R; s.vy = -s.vy * 0.85; }

        if (s.x > W + 20 || s.x < -20) {
          s.outOfPlay = true;
        }
      }
      // collisions
      for (let i = 0; i < active.length; i++) {
        for (let j = i + 1; j < active.length; j++) {
          const a = active[i], b = active[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);
          if (dist === 0 || dist >= STONE_R * 2) continue;
          const nx = dx / dist, ny = dy / dist;
          const overlap = STONE_R * 2 - dist;
          a.x -= nx * overlap / 2;
          a.y -= ny * overlap / 2;
          b.x += nx * overlap / 2;
          b.y += ny * overlap / 2;
          const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
          const vn = rvx * nx + rvy * ny;
          if (vn > 0) continue;
          const restitution = 0.9;
          const impulse = (-(1 + restitution) * vn) / 2;
          a.vx -= impulse * nx;
          a.vy -= impulse * ny;
          b.vx += impulse * nx;
          b.vy += impulse * ny;
          ctx.playSound("pop");
        }
      }

      if (!state.endResolved && !state.over && !anyMoving() && !state.active && !state.dragging) {
        if (state.thrownThisEnd >= STONES_PER_PLAYER * 2) {
          resolveEnd();
        } else {
          state.turn = (state.thrownThisEnd % 2) + 1;
          spawnActiveStone();
          updateStatus();
        }
      }
    }

    function computeEndScore() {
      const inHouse = state.stones
        .filter((s) => !s.outOfPlay)
        .map((s) => ({ player: s.player, d: Math.hypot(s.x - HOUSE_X, s.y - HOUSE_Y) }))
        .filter((s) => s.d <= HOUSE_R)
        .sort((a, b) => a.d - b.d);
      if (inHouse.length === 0) return { player: null, points: 0 };
      const leader = inHouse[0].player;
      let points = 0;
      for (const s of inHouse) {
        if (s.player === leader) points++;
        else break;
      }
      return { player: leader, points };
    }

    function resolveEnd() {
      state.endResolved = true;
      const result = computeEndScore();
      if (result.player) {
        state.scores[result.player] += result.points;
        ctx.playSound("success");
      } else {
        ctx.playSound("click");
      }
      updateStatus(result.player ? `Player ${result.player} scores ${result.points}!` : "No stones in the house.");
      if (state.end >= TOTAL_ENDS) {
        delay(finishGame, 700);
      } else {
        delay(() => { nextEndBtn.style.display = "inline-block"; }, 500);
      }
    }

    function nextEnd() {
      state.end++;
      state.stones = [];
      state.thrownThisEnd = 0;
      state.turn = 1;
      state.endResolved = false;
      nextEndBtn.style.display = "none";
      spawnActiveStone();
      updateStatus();
    }

    function finishGame() {
      state.over = true;
      const p1 = state.scores[1], p2 = state.scores[2];
      const winner = p1 === p2 ? "It's a tie!" : p1 > p2 ? "Player 1 wins!" : "Player 2 wins!";
      ctx.playSound("success");
      delay(() => {
        ctx.showOverlay({
          title: winner,
          subtitle: `Final score — Player 1: ${p1}  •  Player 2: ${p2}`,
          buttonText: "Play Again",
          onButton: resetGame,
        });
      }, 300);
    }

    function updateStatus(note) {
      const s = `End ${state.end}/${TOTAL_ENDS} — Player ${state.turn}'s turn — Stone ${state.thrownThisEnd + 1}/${STONES_PER_PLAYER * 2} — P1: ${state.scores[1]}  P2: ${state.scores[2]}` + (note ? `  (${note})` : "");
      ctx.setStatus(s);
    }

    function resetGame() {
      timeouts.forEach(clearTimeout);
      timeouts.length = 0;
      state.end = 1;
      state.scores = { 1: 0, 2: 0 };
      state.stones = [];
      state.thrownThisEnd = 0;
      state.turn = 1;
      state.endResolved = false;
      state.over = false;
      state.dragging = false;
      nextEndBtn.style.display = "none";
      spawnActiveStone();
      updateStatus();
    }

    function draw() {
      g.clearRect(0, 0, W, H);
      g.fillStyle = COLORS.panel;
      g.fillRect(0, 0, W, H);

      // sheet
      g.fillStyle = "#dfeff7";
      g.fillRect(RAIL, RAIL, W - RAIL * 2, H - RAIL * 2);
      g.strokeStyle = COLORS.border;
      g.lineWidth = RAIL;
      g.strokeRect(RAIL / 2, RAIL / 2, W - RAIL, H - RAIL);

      // house rings
      const rings = [
        { r: HOUSE_R, color: "#2f7dd6" },
        { r: HOUSE_R * 0.72, color: "#f4f7fa" },
        { r: HOUSE_R * 0.42, color: "#d6303c" },
        { r: HOUSE_R * 0.14, color: "#f4f7fa" },
      ];
      for (const ring of rings) {
        g.beginPath();
        g.arc(HOUSE_X, HOUSE_Y, ring.r, 0, Math.PI * 2);
        g.fillStyle = ring.color;
        g.fill();
      }
      g.strokeStyle = "rgba(0,0,0,.2)";
      g.lineWidth = 1;
      g.beginPath();
      g.arc(HOUSE_X, HOUSE_Y, HOUSE_R, 0, Math.PI * 2);
      g.stroke();

      // hog line / throw line
      g.strokeStyle = "rgba(0,0,0,.25)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(THROW_X, RAIL);
      g.lineTo(THROW_X, H - RAIL);
      g.stroke();

      // stones
      for (const s of state.stones) {
        if (s.outOfPlay) continue;
        drawStone(s.x, s.y, PLAYER_COLOR[s.player]);
      }
      if (state.active) drawStone(state.active.x, state.active.y, PLAYER_COLOR[state.active.player]);

      // aim line
      if (state.dragging && state.active) {
        g.setLineDash([6, 5]);
        g.strokeStyle = "rgba(0,0,0,.4)";
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(state.active.x, state.active.y);
        g.lineTo(state.dragX, state.dragY);
        g.stroke();
        g.setLineDash([]);

        const dx = state.dragX - state.active.x, dy = state.dragY - state.active.y;
        const dist = Math.hypot(dx, dy) || 1;
        const power = Math.min(dist, 160) * DRAG_SCALE;
        const nx = -dx / dist, ny = -dy / dist;
        g.strokeStyle = COLORS.accent2;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(state.active.x, state.active.y);
        g.lineTo(state.active.x + nx * power * 9, state.active.y + ny * power * 9);
        g.stroke();
      }
    }

    function drawStone(x, y, color) {
      g.beginPath();
      g.arc(x, y, STONE_R, 0, Math.PI * 2);
      g.fillStyle = color;
      g.fill();
      g.strokeStyle = "rgba(0,0,0,.4)";
      g.lineWidth = 1.5;
      g.stroke();
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fillStyle = "rgba(255,255,255,.7)";
      g.fill();
    }

    let rafId = null;
    function loop() {
      if (!state.over) physicsStep();
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
