MimiGames.register({
  id: "minesweeper",
  title: "Minesweeper",
  emoji: "💣",
  category: "Puzzle",
  players: "1P",
  howTo: "Click to reveal a cell. Toggle Flag Mode (or right-click) to mark mines. Clear every safe cell to win.",
  init(root, ctx) {
    const ROWS = 9, COLS = 9, MINES = 10;
    const state = {
      cells: [],
      started: false,
      over: false,
      flagMode: false,
      revealedCount: 0,
      flagCount: 0,
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "12px";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "10px";
    controls.style.alignItems = "center";

    const counter = document.createElement("div");
    counter.style.fontWeight = "700";
    counter.style.minWidth = "110px";

    const flagBtn = document.createElement("button");
    flagBtn.className = "btn";
    flagBtn.textContent = "🚩 Flag Mode: Off";
    flagBtn.onclick = () => {
      state.flagMode = !state.flagMode;
      flagBtn.textContent = "🚩 Flag Mode: " + (state.flagMode ? "On" : "Off");
      flagBtn.classList.toggle("primary", state.flagMode);
    };

    const resetBtn = document.createElement("button");
    resetBtn.className = "btn primary";
    resetBtn.textContent = "New Game";
    resetBtn.onclick = newGame;

    controls.appendChild(counter);
    controls.appendChild(flagBtn);
    controls.appendChild(resetBtn);

    const boardEl = document.createElement("div");
    boardEl.className = "cell-grid";
    boardEl.style.gridTemplateColumns = `repeat(${COLS}, 34px)`;
    boardEl.style.gridTemplateRows = `repeat(${ROWS}, 34px)`;
    boardEl.style.gap = "2px";

    wrap.appendChild(controls);
    wrap.appendChild(boardEl);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Reveal Mines",
        run: () => {
          if (state.over || !state.started) { ctx.setStatus("Click a cell first to start the board."); return; }
          state.cells.forEach((c) => { if (c.mine) c.revealed = true; });
          render();
        },
      },
      {
        label: "Auto-Clear Safe Cells",
        run: () => {
          if (state.over || !state.started) { ctx.setStatus("Click a cell first to start the board."); return; }
          state.cells.forEach((c) => {
            if (!c.mine && !c.revealed) {
              c.revealed = true;
              state.revealedCount++;
            }
          });
          render();
          checkWin();
        },
      },
    ]);

    const NUM_COLORS = ["", "#4da6ff", "#35d07f", "#ff5c5c", "#a55eea", "#ffb347", "#00d2ff", "#f1f3f9", "#9aa1bd"];

    function idx(r, c) { return r * COLS + c; }

    function makeEmptyCells() {
      const cells = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          cells.push({ r, c, mine: false, revealed: false, flagged: false, adjacent: 0, el: null });
        }
      }
      return cells;
    }

    function placeMines(excludeIdx) {
      const forbidden = new Set([excludeIdx]);
      let placed = 0;
      while (placed < MINES) {
        const i = Math.floor(Math.random() * ROWS * COLS);
        if (forbidden.has(i) || state.cells[i].mine) continue;
        state.cells[i].mine = true;
        placed++;
      }
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          let count = 0;
          forEachNeighbor(r, c, (nr, nc) => {
            if (state.cells[idx(nr, nc)].mine) count++;
          });
          state.cells[idx(r, c)].adjacent = count;
        }
      }
    }

    function forEachNeighbor(r, c, fn) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) fn(nr, nc);
        }
      }
    }

    function floodReveal(startIdx) {
      const stack = [startIdx];
      const seen = new Set();
      while (stack.length) {
        const i = stack.pop();
        if (seen.has(i)) continue;
        seen.add(i);
        const cell = state.cells[i];
        if (cell.flagged || cell.revealed) continue;
        cell.revealed = true;
        state.revealedCount++;
        if (cell.adjacent === 0 && !cell.mine) {
          forEachNeighbor(cell.r, cell.c, (nr, nc) => {
            const ni = idx(nr, nc);
            if (!state.cells[ni].revealed) stack.push(ni);
          });
        }
      }
    }

    function revealCell(i) {
      if (state.over) return;
      const cell = state.cells[i];
      if (cell.flagged || cell.revealed) return;

      if (!state.started) {
        state.started = true;
        placeMines(i);
      }

      if (cell.mine) {
        cell.revealed = true;
        state.over = true;
        ctx.playSound("fail");
        ctx.vibrate(200);
        state.cells.forEach((c) => { if (c.mine) c.revealed = true; });
        render();
        ctx.setStatus("Boom! You hit a mine.");
        setTimeout(() => {
          ctx.showOverlay({
            title: "Boom!",
            subtitle: "You hit a mine.",
            buttonText: "Try Again",
            onButton: newGame,
          });
        }, 200);
        return;
      }

      floodReveal(i);
      ctx.playSound("click");
      render();
      checkWin();
    }

    function toggleFlag(i) {
      if (state.over) return;
      const cell = state.cells[i];
      if (cell.revealed) return;
      cell.flagged = !cell.flagged;
      state.flagCount += cell.flagged ? 1 : -1;
      ctx.playSound("click");
      render();
    }

    function checkWin() {
      const total = ROWS * COLS;
      if (state.revealedCount === total - MINES) {
        state.over = true;
        ctx.playSound("success");
        setTimeout(() => {
          ctx.showOverlay({
            title: "You win!",
            subtitle: "All safe cells cleared.",
            buttonText: "Play Again",
            onButton: newGame,
          });
        }, 200);
      }
    }

    function render() {
      state.cells.forEach((cell, i) => {
        const el = cell.el;
        el.disabled = cell.revealed && !state.over;
        if (cell.revealed) {
          el.style.background = cell.mine ? "var(--lose)" : "var(--panel)";
          el.style.border = "1px solid var(--border)";
          if (cell.mine) {
            el.textContent = "💣";
          } else if (cell.adjacent > 0) {
            el.textContent = String(cell.adjacent);
            el.style.color = NUM_COLORS[cell.adjacent];
          } else {
            el.textContent = "";
          }
        } else {
          el.style.background = "var(--panel-light)";
          el.style.border = "1px solid var(--border)";
          el.textContent = cell.flagged ? "🚩" : "";
        }
      });
      counter.textContent = `💣 ${MINES - state.flagCount} left`;
      if (!state.over) ctx.setStatus(`Mines: ${MINES}  •  Flags: ${state.flagCount}`);
    }

    function buildBoard() {
      boardEl.innerHTML = "";
      state.cells.forEach((cell, i) => {
        const btn = document.createElement("button");
        btn.className = "btn";
        btn.style.width = "34px";
        btn.style.height = "34px";
        btn.style.padding = "0";
        btn.style.fontSize = ".9rem";
        btn.style.fontWeight = "800";
        btn.onclick = () => {
          if (state.flagMode) toggleFlag(i);
          else revealCell(i);
        };
        btn.oncontextmenu = (e) => {
          e.preventDefault();
          toggleFlag(i);
        };
        cell.el = btn;
        boardEl.appendChild(btn);
      });
    }

    function newGame() {
      state.cells = makeEmptyCells();
      state.started = false;
      state.over = false;
      state.revealedCount = 0;
      state.flagCount = 0;
      buildBoard();
      render();
      ctx.setStatus(`Mines: ${MINES}`);
    }

    newGame();

    return () => {};
  },
});
