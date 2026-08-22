MimiGames.register({
  id: "snake",
  title: "Snake",
  emoji: "🐍",
  category: "Action",
  players: "1P",
  howTo: "Use arrow keys / WASD or the on-screen ▲▼◀▶ buttons to steer the snake into the food. Don't hit the walls or yourself.",
  init(root, ctx) {
    const COLS = 20,
      ROWS = 20,
      CELL = 20;
    const W = COLS * CELL,
      H = ROWS * CELL;

    const state = {
      snake: [],
      dir: { x: 1, y: 0 },
      pendingDir: { x: 1, y: 0 },
      food: null,
      score: 0,
      over: false,
      running: false,
      tickMs: 150,
      noClip: false,
    };

    let tickInterval = null;

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "8px";

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.style.background = "#0a1f14";
    canvas.style.borderRadius = "10px";
    canvas.style.border = "2px solid var(--border)";
    const g = canvas.getContext("2d");

    const dpad = document.createElement("div");
    dpad.style.display = "grid";
    dpad.style.gridTemplateColumns = "repeat(3, 42px)";
    dpad.style.gridTemplateRows = "repeat(3, 42px)";
    dpad.style.gap = "4px";

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
    restartBtn.textContent = "Restart";
    restartBtn.onclick = reset;

    wrap.appendChild(canvas);
    wrap.appendChild(dpad);
    wrap.appendChild(restartBtn);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "No-Clip: Off",
        run(e) {
          state.noClip = !state.noClip;
          e.target.textContent = `No-Clip: ${state.noClip ? "On" : "Off"}`;
        },
      },
      { label: "Add Score +10", run: () => { state.score += 10; ctx.setStatus(`Score: ${state.score}`); } },
    ]);

    function setDir(dx, dy) {
      if (!state.running || state.over) return;
      // prevent reversing directly into itself
      if (state.dir.x === -dx && state.dir.y === -dy) return;
      state.pendingDir = { x: dx, y: dy };
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

    function randCell() {
      return { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    }

    function placeFood() {
      let f;
      do {
        f = randCell();
      } while (state.snake.some((s) => s.x === f.x && s.y === f.y));
      state.food = f;
    }

    function reset() {
      if (tickInterval) {
        clearInterval(tickInterval);
        tickInterval = null;
      }
      state.snake = [
        { x: 10, y: 10 },
        { x: 9, y: 10 },
        { x: 8, y: 10 },
      ];
      state.dir = { x: 1, y: 0 };
      state.pendingDir = { x: 1, y: 0 };
      state.score = 0;
      state.over = false;
      state.running = true;
      state.tickMs = 150;
      placeFood();
      ctx.setStatus(`Score: ${state.score}`);
      draw();
      startTicking();
    }

    function startTicking() {
      if (tickInterval) clearInterval(tickInterval);
      tickInterval = setInterval(tick, state.tickMs);
    }

    function tick() {
      if (!state.running || state.over) return;
      state.dir = state.pendingDir;
      const head = state.snake[0];
      const newHead = { x: head.x + state.dir.x, y: head.y + state.dir.y };
      if (state.noClip) {
        newHead.x = (newHead.x + COLS) % COLS;
        newHead.y = (newHead.y + ROWS) % ROWS;
      }

      if (
        !state.noClip &&
        (newHead.x < 0 ||
          newHead.x >= COLS ||
          newHead.y < 0 ||
          newHead.y >= ROWS ||
          state.snake.some((s) => s.x === newHead.x && s.y === newHead.y))
      ) {
        gameOver();
        return;
      }

      state.snake.unshift(newHead);

      if (newHead.x === state.food.x && newHead.y === state.food.y) {
        state.score++;
        ctx.playSound("pop");
        ctx.setStatus(`Score: ${state.score}`);
        placeFood();
        if (state.tickMs > 70 && state.score % 3 === 0) {
          state.tickMs -= 5;
          startTicking();
        }
      } else {
        state.snake.pop();
      }

      draw();
    }

    function draw() {
      g.clearRect(0, 0, W, H);
      g.fillStyle = "#0a1f14";
      g.fillRect(0, 0, W, H);

      g.font = `${CELL}px sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      if (state.food) {
        g.fillText("🍎", state.food.x * CELL + CELL / 2, state.food.y * CELL + CELL / 2 + 1);
      }

      state.snake.forEach((s, i) => {
        g.fillStyle = i === 0 ? "#35d07f" : "#1f9e5c";
        g.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
      });
    }

    function gameOver() {
      state.over = true;
      state.running = false;
      if (tickInterval) {
        clearInterval(tickInterval);
        tickInterval = null;
      }
      ctx.playSound("fail");
      const best = ctx.storage.get("best", 0);
      const newBest = Math.max(best, state.score);
      ctx.storage.set("best", newBest);
      if (state.score > best) ctx.reportScore(newBest, { sortDir: "desc" });
      ctx.setStatus(`Game Over — Score: ${state.score}`);
      ctx.showOverlay({
        title: "Game Over!",
        subtitle: `Score: ${state.score} · Best: ${newBest}`,
        buttonText: "Play Again",
        onButton: reset,
      });
    }

    reset();

    return () => {
      if (tickInterval) clearInterval(tickInterval);
      document.removeEventListener("keydown", onKeydown);
    };
  },
});
