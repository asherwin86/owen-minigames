MimiGames.register({
  id: "2048",
  title: "2048",
  emoji: "🔢",
  category: "Puzzle",
  players: "1P",
  howTo: "Slide tiles with arrow keys, on-screen buttons, or swipe. Matching tiles merge — reach 2048!",
  init(root, ctx) {
    const SIZE = 4;
    const state = {
      grid: [],
      score: 0,
      best: ctx.storage.get("best", 0),
      over: false,
      won: false,
      keepPlaying: false,
    };

    const TILE_BG = {
      0: "rgba(255,255,255,0.04)",
      2: "#eee4da",
      4: "#ede0c8",
      8: "#f2b179",
      16: "#f59563",
      32: "#f67c5f",
      64: "#f65e3b",
      128: "#edcf72",
      256: "#edcc61",
      512: "#edc850",
      1024: "#edc53f",
      2048: "#edc22e",
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "8px";

    const scoreRow = document.createElement("div");
    scoreRow.style.display = "flex";
    scoreRow.style.gap = "16px";
    scoreRow.style.fontWeight = "700";
    const scoreBox = document.createElement("div");
    const bestBox = document.createElement("div");
    scoreRow.appendChild(scoreBox);
    scoreRow.appendChild(bestBox);

    const newBtn = document.createElement("button");
    newBtn.className = "btn primary";
    newBtn.textContent = "New Game";
    newBtn.onclick = newGame;

    const boardWrap = document.createElement("div");
    boardWrap.style.position = "relative";
    boardWrap.style.touchAction = "none";

    const boardEl = document.createElement("div");
    boardEl.className = "cell-grid";
    boardEl.style.gridTemplateColumns = `repeat(${SIZE}, 64px)`;
    boardEl.style.gridTemplateRows = `repeat(${SIZE}, 64px)`;
    boardEl.style.background = "var(--panel-light)";
    boardEl.style.padding = "6px";
    boardEl.style.borderRadius = "10px";
    boardWrap.appendChild(boardEl);

    const cellEls = [];
    for (let i = 0; i < SIZE * SIZE; i++) {
      const c = document.createElement("div");
      c.style.width = "64px";
      c.style.height = "64px";
      c.style.borderRadius = "8px";
      c.style.display = "flex";
      c.style.alignItems = "center";
      c.style.justifyContent = "center";
      c.style.fontSize = "1.3rem";
      c.style.fontWeight = "800";
      c.style.transition = "background .1s";
      boardEl.appendChild(c);
      cellEls.push(c);
    }

    const padWrap = document.createElement("div");
    padWrap.style.display = "grid";
    padWrap.style.gridTemplateColumns = "repeat(3, 36px)";
    padWrap.style.gridTemplateRows = "repeat(3, 36px)";
    padWrap.style.gap = "4px";
    padWrap.style.justifyContent = "center";

    function padBtn(label, gridArea, dir) {
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = label;
      b.style.gridArea = gridArea;
      b.onclick = () => move(dir);
      return b;
    }
    const upBtn = padBtn("▲", "1 / 2 / 2 / 3", "up");
    const leftBtn = padBtn("◀", "2 / 1 / 3 / 2", "left");
    const downBtn = padBtn("▼", "2 / 2 / 3 / 3", "down");
    const rightBtn = padBtn("▶", "2 / 3 / 3 / 4", "right");
    padWrap.appendChild(upBtn);
    padWrap.appendChild(leftBtn);
    padWrap.appendChild(downBtn);
    padWrap.appendChild(rightBtn);

    wrap.appendChild(scoreRow);
    wrap.appendChild(newBtn);
    wrap.appendChild(boardWrap);
    wrap.appendChild(padWrap);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Add Score +100",
        run: () => {
          state.score += 100;
          if (state.score > state.best) {
            state.best = state.score;
            ctx.storage.set("best", state.best);
          }
          render();
        },
      },
      {
        label: "Spawn 2048 Tile",
        run: () => {
          const cells = emptyCells();
          if (cells.length) {
            const [r, c] = cells[0];
            state.grid[r][c] = 2048;
          } else {
            state.grid[0][0] = 2048;
          }
          render();
        },
      },
    ]);

    function emptyGrid() {
      const g = [];
      for (let r = 0; r < SIZE; r++) g.push(new Array(SIZE).fill(0));
      return g;
    }

    function emptyCells() {
      const cells = [];
      for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++) if (state.grid[r][c] === 0) cells.push([r, c]);
      return cells;
    }

    function spawnTile() {
      const cells = emptyCells();
      if (cells.length === 0) return;
      const [r, c] = cells[Math.floor(Math.random() * cells.length)];
      state.grid[r][c] = Math.random() < 0.9 ? 2 : 4;
    }

    function mergeLine(line) {
      const arr = line.filter((v) => v !== 0);
      let gained = 0;
      for (let i = 0; i < arr.length - 1; i++) {
        if (arr[i] !== -1 && arr[i] === arr[i + 1]) {
          arr[i] = arr[i] * 2;
          gained += arr[i];
          arr[i + 1] = -1;
        }
      }
      const final = arr.filter((v) => v !== -1);
      while (final.length < SIZE) final.push(0);
      return { line: final, gained };
    }

    function moveGrid(dir) {
      let changed = false;
      let gained = 0;
      for (let i = 0; i < SIZE; i++) {
        const line = [];
        for (let j = 0; j < SIZE; j++) {
          if (dir === "left") line.push(state.grid[i][j]);
          else if (dir === "right") line.push(state.grid[i][SIZE - 1 - j]);
          else if (dir === "up") line.push(state.grid[j][i]);
          else if (dir === "down") line.push(state.grid[SIZE - 1 - j][i]);
        }
        const result = mergeLine(line);
        gained += result.gained;
        for (let j = 0; j < SIZE; j++) {
          const val = result.line[j];
          let r, c;
          if (dir === "left") { r = i; c = j; }
          else if (dir === "right") { r = i; c = SIZE - 1 - j; }
          else if (dir === "up") { r = j; c = i; }
          else if (dir === "down") { r = SIZE - 1 - j; c = i; }
          if (state.grid[r][c] !== val) changed = true;
          state.grid[r][c] = val;
        }
      }
      return { changed, gained };
    }

    function canMoveAnywhere() {
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (state.grid[r][c] === 0) return true;
          if (c < SIZE - 1 && state.grid[r][c] === state.grid[r][c + 1]) return true;
          if (r < SIZE - 1 && state.grid[r][c] === state.grid[r + 1][c]) return true;
        }
      }
      return false;
    }

    function move(dir) {
      if (state.over) return;
      const { changed, gained } = moveGrid(dir);
      if (!changed) return;
      state.score += gained;
      if (state.score > state.best) {
        state.best = state.score;
        ctx.storage.set("best", state.best);
        ctx.reportScore(state.best, { sortDir: "desc" });
      }
      spawnTile();
      ctx.playSound(gained > 0 ? "pop" : "click");
      render();

      if (!state.won && !state.keepPlaying) {
        for (let r = 0; r < SIZE; r++) {
          for (let c = 0; c < SIZE; c++) {
            if (state.grid[r][c] >= 2048) {
              state.won = true;
              ctx.playSound("success");
              setTimeout(() => {
                ctx.showOverlay({
                  title: "You win!",
                  subtitle: `Score: ${state.score}. Keep playing to go further.`,
                  buttonText: "Keep Playing",
                  onButton: () => {
                    state.keepPlaying = true;
                  },
                });
              }, 200);
              return;
            }
          }
        }
      }

      if (!canMoveAnywhere()) {
        state.over = true;
        ctx.playSound("fail");
        setTimeout(() => {
          ctx.showOverlay({
            title: "Game Over",
            subtitle: `Final score: ${state.score}`,
            buttonText: "Try Again",
            onButton: newGame,
          });
        }, 200);
      }
    }

    function render() {
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const v = state.grid[r][c];
          const el = cellEls[r * SIZE + c];
          el.textContent = v === 0 ? "" : String(v);
          el.style.background = TILE_BG[v] || "#3c3a32";
          el.style.color = v <= 4 ? "#5d4b3a" : v <= 64 ? "#fff" : "#fbf6f0";
        }
      }
      scoreBox.textContent = `Score: ${state.score}`;
      bestBox.textContent = `Best: ${state.best}`;
      ctx.setStatus(state.over ? "Game over" : `Score: ${state.score}  Best: ${state.best}`);
    }

    function newGame() {
      state.grid = emptyGrid();
      state.score = 0;
      state.over = false;
      state.won = false;
      state.keepPlaying = false;
      spawnTile();
      spawnTile();
      render();
    }

    function onKeydown(e) {
      const map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
      const dir = map[e.key];
      if (!dir) return;
      e.preventDefault();
      move(dir);
    }
    document.addEventListener("keydown", onKeydown);

    let touchStart = null;
    boardWrap.addEventListener("pointerdown", (e) => {
      touchStart = { x: e.clientX, y: e.clientY };
    });
    boardWrap.addEventListener("pointerup", (e) => {
      if (!touchStart) return;
      const dx = e.clientX - touchStart.x;
      const dy = e.clientY - touchStart.y;
      touchStart = null;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (Math.max(absX, absY) < 24) return;
      if (absX > absY) move(dx > 0 ? "right" : "left");
      else move(dy > 0 ? "down" : "up");
    });

    newGame();

    return () => {
      document.removeEventListener("keydown", onKeydown);
    };
  },
});
