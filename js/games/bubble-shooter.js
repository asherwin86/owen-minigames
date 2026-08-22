MimiGames.register({
  id: "bubble-shooter",
  title: "Bubble Shooter",
  emoji: "🫧",
  category: "Action",
  players: "1P",
  howTo: "Move your mouse/finger to aim, then click/tap to shoot a bubble. Match 3+ same-colored bubbles to pop them before they stack down to the line.",
  init(root, ctx) {
    const COLS = 9;
    const CELL = 42;
    const W = COLS * CELL;
    const ROWS = 12;
    const TOP = 20;
    const R = CELL / 2 - 2;
    const H = TOP + ROWS * CELL + 70;
    const SHOOTER_Y = H - 40;
    const DANGER_ROW = ROWS - 2;
    const COLORS = ["#ff4757", "#00d2ff", "#35d07f", "#ffd93d", "#a55eea", "#ff9f43"];
    const SPEED = 9;

    function randColor() {
      return COLORS[Math.floor(Math.random() * COLORS.length)];
    }

    const state = {
      grid: [], // grid[row][col] = color or null
      score: 0,
      over: false,
      current: randColor(),
      next: randColor(),
      aim: { x: W / 2, y: 0 },
      traveling: null, // {x,y,vx,vy,color}
    };

    function cellX(col) {
      return col * CELL + CELL / 2;
    }
    function cellY(row) {
      return TOP + row * CELL + CELL / 2;
    }

    function initGrid() {
      state.grid = [];
      for (let r = 0; r < ROWS; r++) {
        state.grid.push(Array(COLS).fill(null));
      }
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < COLS; c++) {
          state.grid[r][c] = randColor();
        }
      }
    }

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "10px";

    const topRow = document.createElement("div");
    topRow.style.display = "flex";
    topRow.style.alignItems = "center";
    topRow.style.gap = "10px";
    topRow.style.fontSize = ".85rem";
    topRow.style.color = "var(--text-dim)";
    const nextLabel = document.createElement("span");
    nextLabel.textContent = "Next:";
    const nextSwatch = document.createElement("span");
    nextSwatch.style.display = "inline-block";
    nextSwatch.style.width = "22px";
    nextSwatch.style.height = "22px";
    nextSwatch.style.borderRadius = "50%";
    nextSwatch.style.border = "2px solid #fff";
    topRow.appendChild(nextLabel);
    topRow.appendChild(nextSwatch);

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.style.background = "#10142a";
    canvas.style.border = "2px solid var(--border)";
    canvas.style.borderRadius = "10px";
    canvas.style.touchAction = "none";
    canvas.style.cursor = "crosshair";
    const g = canvas.getContext("2d");

    const restartBtn = document.createElement("button");
    restartBtn.className = "btn primary";
    restartBtn.textContent = "Restart";
    restartBtn.onclick = reset;

    wrap.appendChild(topRow);
    wrap.appendChild(canvas);
    wrap.appendChild(restartBtn);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      { label: "Add Score +50", run: () => { state.score += 50; ctx.setStatus(`Score: ${state.score}`); } },
      {
        label: "Clear Board",
        run: () => {
          if (state.over) return;
          for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) state.grid[r][c] = null;
          checkGameEnd();
        },
      },
    ]);

    function onPointerMove(e) {
      const rect = canvas.getBoundingClientRect();
      state.aim.x = (e.clientX - rect.left) * (W / rect.width);
      state.aim.y = (e.clientY - rect.top) * (H / rect.height);
    }
    function onPointerDown(e) {
      onPointerMove(e);
      fire();
    }
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);

    function aimVector() {
      let dx = state.aim.x - W / 2;
      let dy = state.aim.y - SHOOTER_Y;
      if (dy > -60) dy = -60; // clamp so shots always point upward
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len };
    }

    function fire() {
      if (state.over || state.traveling) return;
      const dir = aimVector();
      state.traveling = {
        x: W / 2,
        y: SHOOTER_Y,
        vx: dir.x * SPEED,
        vy: dir.y * SPEED,
        color: state.current,
      };
    }

    function nearestCell(x, y) {
      let row = Math.round((y - TOP - CELL / 2) / CELL);
      let col = Math.round((x - CELL / 2) / CELL);
      row = Math.max(0, Math.min(ROWS - 1, row));
      col = Math.max(0, Math.min(COLS - 1, col));
      return { row, col };
    }

    function findOpenCell(row, col) {
      if (row >= 0 && row < ROWS && col >= 0 && col < COLS && !state.grid[row][col]) {
        return { row, col };
      }
      for (let radius = 1; radius < ROWS + COLS; radius++) {
        for (let dr = -radius; dr <= radius; dr++) {
          for (let dc = -radius; dc <= radius; dc++) {
            const r = row + dr,
              c = col + dc;
            if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
            if (!state.grid[r][c]) return { row: r, col: c };
          }
        }
      }
      return { row: 0, col: 0 };
    }

    function neighbors(row, col) {
      return [
        [row - 1, col],
        [row + 1, col],
        [row, col - 1],
        [row, col + 1],
      ].filter(([r, c]) => r >= 0 && r < ROWS && c >= 0 && c < COLS);
    }

    function floodSameColor(row, col) {
      const color = state.grid[row][col];
      const seen = new Set();
      const stack = [[row, col]];
      const group = [];
      while (stack.length) {
        const [r, c] = stack.pop();
        const key = r + "," + c;
        if (seen.has(key)) continue;
        seen.add(key);
        if (state.grid[r][c] !== color) continue;
        group.push([r, c]);
        neighbors(r, c).forEach(([nr, nc]) => {
          if (!seen.has(nr + "," + nc)) stack.push([nr, nc]);
        });
      }
      return group;
    }

    function removeFloating() {
      const reachable = new Set();
      const stack = [];
      for (let c = 0; c < COLS; c++) {
        if (state.grid[0][c]) stack.push([0, c]);
      }
      while (stack.length) {
        const [r, c] = stack.pop();
        const key = r + "," + c;
        if (reachable.has(key)) continue;
        reachable.add(key);
        neighbors(r, c).forEach(([nr, nc]) => {
          if (state.grid[nr][nc] && !reachable.has(nr + "," + nc)) stack.push([nr, nc]);
        });
      }
      let removed = 0;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (state.grid[r][c] && !reachable.has(r + "," + c)) {
            state.grid[r][c] = null;
            removed++;
          }
        }
      }
      return removed;
    }

    function updateNextSwatch() {
      nextSwatch.style.background = state.next;
    }

    function checkGameEnd() {
      let cleared = true;
      let maxRow = -1;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (state.grid[r][c]) {
            cleared = false;
            maxRow = Math.max(maxRow, r);
          }
        }
      }
      if (cleared) {
        endGame(true);
        return;
      }
      if (maxRow >= DANGER_ROW) endGame(false);
    }

    function settleBubble() {
      const t = state.traveling;
      const approx = nearestCell(t.x, t.y);
      const spot = findOpenCell(approx.row, approx.col);
      state.grid[spot.row][spot.col] = t.color;
      state.traveling = null;

      const group = floodSameColor(spot.row, spot.col);
      if (group.length >= 3) {
        group.forEach(([r, c]) => {
          state.grid[r][c] = null;
        });
        state.score += group.length * 10;
        ctx.playSound("pop");
        const dropped = removeFloating();
        if (dropped) state.score += dropped * 15;
        ctx.vibrate(20);
      } else {
        ctx.playSound("click");
      }

      ctx.setStatus(`Score: ${state.score}`);

      state.current = state.next;
      state.next = randColor();
      updateNextSwatch();

      checkGameEnd();
    }

    let rafId = null;

    function update() {
      if (!state.over && state.traveling) {
        const t = state.traveling;
        t.x += t.vx;
        t.y += t.vy;
        if (t.x - R < 0) {
          t.x = R;
          t.vx *= -1;
        }
        if (t.x + R > W) {
          t.x = W - R;
          t.vx *= -1;
        }

        let collided = t.y - R <= TOP;
        if (!collided) {
          outer: for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
              if (!state.grid[r][c]) continue;
              const dx = t.x - cellX(c),
                dy = t.y - cellY(r);
              if (Math.hypot(dx, dy) < CELL * 0.92) {
                collided = true;
                break outer;
              }
            }
          }
        }
        if (collided) settleBubble();
      }

      draw();
      rafId = requestAnimationFrame(update);
    }

    function drawBubble(x, y, color) {
      g.beginPath();
      g.fillStyle = color;
      g.arc(x, y, R, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(255,255,255,.4)";
      g.stroke();
    }

    function draw() {
      g.clearRect(0, 0, W, H);
      g.fillStyle = "#10142a";
      g.fillRect(0, 0, W, H);

      g.strokeStyle = "rgba(255,90,90,.4)";
      g.setLineDash([5, 5]);
      g.beginPath();
      g.moveTo(0, cellY(DANGER_ROW) + CELL / 2);
      g.lineTo(W, cellY(DANGER_ROW) + CELL / 2);
      g.stroke();
      g.setLineDash([]);

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const color = state.grid[r][c];
          if (!color) continue;
          drawBubble(cellX(c), cellY(r), color);
        }
      }

      if (!state.over && !state.traveling) {
        const dir = aimVector();
        g.strokeStyle = "rgba(255,255,255,.3)";
        g.beginPath();
        g.moveTo(W / 2, SHOOTER_Y);
        g.lineTo(W / 2 + dir.x * 400, SHOOTER_Y + dir.y * 400);
        g.stroke();
      }

      drawBubble(W / 2, SHOOTER_Y, state.current);

      if (state.traveling) {
        drawBubble(state.traveling.x, state.traveling.y, state.traveling.color);
      }
    }

    function endGame(won) {
      state.over = true;
      const best = ctx.storage.get("best", 0);
      const newBest = Math.max(best, state.score);
      ctx.storage.set("best", newBest);
      ctx.playSound(won ? "success" : "fail");
      ctx.setStatus(won ? `Board cleared! Score: ${state.score}` : `Game Over — Score: ${state.score}`);
      ctx.showOverlay({
        title: won ? "Board Cleared!" : "Game Over",
        subtitle: `Score: ${state.score} · Best: ${newBest}`,
        buttonText: "Play Again",
        onButton: reset,
      });
    }

    function reset() {
      state.score = 0;
      state.over = false;
      state.traveling = null;
      state.current = randColor();
      state.next = randColor();
      initGrid();
      updateNextSwatch();
      ctx.setStatus(`Score: ${state.score}`);
    }

    reset();
    rafId = requestAnimationFrame(update);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
    };
  },
});
