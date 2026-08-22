MimiGames.register({
  id: "dot-muncher",
  title: "Dot Muncher",
  emoji: "🟡",
  category: "Action",
  players: "1P",
  howTo: "Steer with arrow keys / WASD or the on-screen ▲▼◀▶ buttons. Eat every dot without touching a ghost.",
  init(root, ctx) {
    const COLS = 15,
      ROWS = 11,
      CELL = 30;
    const W = COLS * CELL,
      H = ROWS * CELL;
    const TICK_MS = 200;

    // Hand-built maze: a bordered room with a handful of small, isolated
    // pillar blocks scattered inside. Because no pillar touches the border
    // or another pillar, the open floor always stays a single connected
    // region — so the maze can never trap the player, a ghost, or a dot.
    const PILLARS = [
      [2, 3], [2, 4], [2, 10], [2, 11],
      [4, 6], [4, 7], [5, 6], [5, 7],
      [7, 3], [7, 4], [7, 10], [7, 11],
    ]; // [row, col]

    const grid = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        const isBorder = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
        row.push(isBorder ? "#" : ".");
      }
      grid.push(row);
    }
    PILLARS.forEach(([r, c]) => {
      grid[r][c] = "#";
    });

    function isOpen(x, y) {
      if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
      return grid[y][x] !== "#";
    }

    const DIRS = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
    ];

    const state = {
      dotGrid: [],
      dotsLeft: 0,
      score: 0,
      over: false,
      won: false,
      running: false,
      godMode: false,
    };

    let player, ghosts, tickInterval;

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "8px";

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.style.background = "#0b0e1c";
    canvas.style.borderRadius = "10px";
    canvas.style.border = "2px solid var(--border)";
    const g = canvas.getContext("2d");

    const dpad = document.createElement("div");
    dpad.style.display = "grid";
    dpad.style.gridTemplateColumns = "repeat(3, 42px)";
    dpad.style.gridTemplateRows = "repeat(3, 42px)";
    dpad.style.gap = "4px";
    dpad.style.marginTop = "4px";

    function dBtn(label, dx, dy) {
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = label;
      b.style.fontSize = "1.2rem";
      b.style.padding = "0";
      b.onclick = () => setDir(dx, dy);
      return b;
    }
    function blank() {
      return document.createElement("div");
    }

    dpad.appendChild(blank());
    dpad.appendChild(dBtn("▲", 0, -1));
    dpad.appendChild(blank());
    dpad.appendChild(dBtn("◀", -1, 0));
    dpad.appendChild(blank());
    dpad.appendChild(dBtn("▶", 1, 0));
    dpad.appendChild(blank());
    dpad.appendChild(dBtn("▼", 0, 1));
    dpad.appendChild(blank());

    const restartBtn = document.createElement("button");
    restartBtn.className = "btn primary";
    restartBtn.textContent = "New Game";
    restartBtn.onclick = reset;

    wrap.appendChild(canvas);
    wrap.appendChild(dpad);
    wrap.appendChild(restartBtn);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "God Mode: Off",
        run(e) {
          state.godMode = !state.godMode;
          e.target.textContent = `God Mode: ${state.godMode ? "On" : "Off"}`;
        },
      },
      {
        label: "Force Win",
        run() {
          if (!state.running || state.over) return;
          for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) state.dotGrid[r][c] = false;
          }
          state.dotsLeft = 0;
          draw();
          winGame();
        },
      },
    ]);

    function setDir(dx, dy) {
      if (!state.running || state.over) return;
      player.pendingDir = { dx, dy };
    }

    function onKeydown(e) {
      const k = e.key.toLowerCase();
      if (k === "arrowup" || k === "w") setDir(0, -1);
      else if (k === "arrowdown" || k === "s") setDir(0, 1);
      else if (k === "arrowleft" || k === "a") setDir(-1, 0);
      else if (k === "arrowright" || k === "d") setDir(1, 0);
      else return;
      e.preventDefault();
    }
    document.addEventListener("keydown", onKeydown);

    function reset() {
      if (tickInterval) {
        clearInterval(tickInterval);
        tickInterval = null;
      }
      state.dotGrid = [];
      state.dotsLeft = 0;
      for (let r = 0; r < ROWS; r++) {
        const row = [];
        for (let c = 0; c < COLS; c++) {
          const has = grid[r][c] === ".";
          row.push(has);
          if (has) state.dotsLeft++;
        }
        state.dotGrid.push(row);
      }
      state.score = 0;
      state.over = false;
      state.won = false;
      state.running = true;

      player = { x: 1, y: 1, dir: { dx: 0, dy: 0 }, pendingDir: { dx: 0, dy: 0 } };
      ghosts = [
        { x: COLS - 2, y: ROWS - 2, dir: null, color: "#ff5c5c" },
        { x: COLS - 2, y: 1, dir: null, color: "#ff8cf0" },
      ];

      ctx.setStatus(`Score: ${state.score}`);
      draw();
      startTicking();
    }

    function startTicking() {
      if (tickInterval) clearInterval(tickInterval);
      tickInterval = setInterval(tick, TICK_MS);
    }

    function moveGhost(ghost) {
      const valid = DIRS.filter((d) => isOpen(ghost.x + d.dx, ghost.y + d.dy));
      if (valid.length === 0) return; // shouldn't happen on this maze
      let options = valid;
      if (ghost.dir) {
        const nonReverse = valid.filter((d) => !(d.dx === -ghost.dir.dx && d.dy === -ghost.dir.dy));
        if (nonReverse.length > 0) options = nonReverse;
      }
      let chosen;
      if (Math.random() < 0.65) {
        let best = null,
          bestDist = Infinity;
        options.forEach((d) => {
          const nx = ghost.x + d.dx,
            ny = ghost.y + d.dy;
          const dist = Math.abs(nx - player.x) + Math.abs(ny - player.y);
          if (dist < bestDist) {
            bestDist = dist;
            best = d;
          }
        });
        chosen = best;
      } else {
        chosen = options[Math.floor(Math.random() * options.length)];
      }
      ghost.dir = chosen;
      ghost.x += chosen.dx;
      ghost.y += chosen.dy;
    }

    function checkCollision() {
      return ghosts.some((gh) => gh.x === player.x && gh.y === player.y);
    }

    function tick() {
      if (!state.running || state.over) return;

      if (isOpen(player.x + player.pendingDir.dx, player.y + player.pendingDir.dy)) {
        player.dir = player.pendingDir;
      }
      if (isOpen(player.x + player.dir.dx, player.y + player.dir.dy)) {
        player.x += player.dir.dx;
        player.y += player.dir.dy;
      }

      if (state.dotGrid[player.y][player.x]) {
        state.dotGrid[player.y][player.x] = false;
        state.dotsLeft--;
        state.score += 10;
        ctx.playSound("pop");
        ctx.setStatus(`Score: ${state.score}`);
      }

      if (checkCollision() && !state.godMode) {
        loseGame();
        return;
      }

      ghosts.forEach(moveGhost);

      if (checkCollision() && !state.godMode) {
        loseGame();
        return;
      }

      if (state.dotsLeft <= 0) {
        winGame();
        return;
      }

      draw();
    }

    function saveBestIfNeeded() {
      const best = ctx.storage.get("best", 0);
      const newBest = Math.max(best, state.score);
      ctx.storage.set("best", newBest);
      return newBest;
    }

    function loseGame() {
      state.over = true;
      state.running = false;
      if (tickInterval) {
        clearInterval(tickInterval);
        tickInterval = null;
      }
      draw();
      ctx.playSound("fail");
      const best = saveBestIfNeeded();
      ctx.setStatus(`Game Over — Score: ${state.score}`);
      ctx.showOverlay({
        title: "Game Over!",
        subtitle: `A ghost got you — Score: ${state.score} · Best: ${best}`,
        buttonText: "New Game",
        onButton: reset,
      });
    }

    function winGame() {
      state.over = true;
      state.won = true;
      state.running = false;
      if (tickInterval) {
        clearInterval(tickInterval);
        tickInterval = null;
      }
      draw();
      ctx.playSound("win");
      ctx.confetti(wrap);
      const best = saveBestIfNeeded();
      ctx.setStatus(`You cleared the maze! Score: ${state.score}`);
      ctx.showOverlay({
        title: "All Dots Eaten!",
        subtitle: `Score: ${state.score} · Best: ${best}`,
        buttonText: "New Game",
        onButton: reset,
      });
    }

    function draw() {
      g.clearRect(0, 0, W, H);
      g.fillStyle = "#0b0e1c";
      g.fillRect(0, 0, W, H);

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (grid[r][c] === "#") {
            g.fillStyle = "#26305a";
            g.fillRect(c * CELL, r * CELL, CELL, CELL);
          }
        }
      }

      g.fillStyle = "#ffd93d";
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (state.dotGrid[r] && state.dotGrid[r][c]) {
            g.beginPath();
            g.arc(c * CELL + CELL / 2, r * CELL + CELL / 2, 3, 0, Math.PI * 2);
            g.fill();
          }
        }
      }

      g.font = `${CELL - 6}px sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      ghosts.forEach((gh) => {
        g.fillStyle = gh.color;
        g.beginPath();
        g.arc(gh.x * CELL + CELL / 2, gh.y * CELL + CELL / 2, CELL / 2 - 4, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#fff";
        g.font = `${CELL - 12}px sans-serif`;
        g.fillText("👻", gh.x * CELL + CELL / 2, gh.y * CELL + CELL / 2 + 1);
      });

      g.font = `${CELL - 4}px sans-serif`;
      g.fillText("🟡", player.x * CELL + CELL / 2, player.y * CELL + CELL / 2 + 1);
    }

    reset();

    return () => {
      if (tickInterval) clearInterval(tickInterval);
      document.removeEventListener("keydown", onKeydown);
    };
  },
});
