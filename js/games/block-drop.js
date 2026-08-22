MimiGames.register({
  id: "block-drop",
  title: "Block Drop",
  emoji: "🟦",
  category: "Puzzle",
  players: "1P",
  howTo: "Arrow keys or buttons: ◀▶ move, ⟳ rotate, ▼ soft drop, Space/Drop for hard drop. Gamepad: D-pad to move/rotate/soft-drop, any face button to hard drop (Start un-hides the controller cursor if you need it). Clear full rows to score.",
  init(root, ctx) {
    const COLS = 10;
    const ROWS = 18;
    const CELL = 19;

    const SHAPES = {
      I: { size: 4, cells: [[1, 0], [1, 1], [1, 2], [1, 3]], color: "#00d2ff" },
      O: { size: 2, cells: [[0, 0], [0, 1], [1, 0], [1, 1]], color: "#ffd93d" },
      T: { size: 3, cells: [[0, 1], [1, 0], [1, 1], [1, 2]], color: "#a55eea" },
      S: { size: 3, cells: [[0, 1], [0, 2], [1, 0], [1, 1]], color: "#35d07f" },
      Z: { size: 3, cells: [[0, 0], [0, 1], [1, 1], [1, 2]], color: "#ff4757" },
      J: { size: 3, cells: [[0, 0], [1, 0], [1, 1], [1, 2]], color: "#4d7dff" },
      L: { size: 3, cells: [[0, 2], [1, 0], [1, 1], [1, 2]], color: "#ff9f43" },
    };
    const TYPES = Object.keys(SHAPES);

    const state = {
      grid: [],
      piece: null,
      nextType: null,
      score: 0,
      best: ctx.storage.get("bestScore", 0),
      lines: 0,
      level: 1,
      over: false,
      paused: false,
    };

    let fallTimer = null;

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "12px";

    const statsEl = document.createElement("div");
    statsEl.style.display = "flex";
    statsEl.style.gap = "18px";
    statsEl.style.fontSize = ".85rem";
    statsEl.style.color = "var(--text-dim)";
    statsEl.style.flexWrap = "wrap";
    statsEl.style.justifyContent = "center";

    const newBtn = document.createElement("button");
    newBtn.className = "btn primary";
    newBtn.textContent = "New Game";
    newBtn.onclick = newGame;

    const mainRow = document.createElement("div");
    mainRow.style.display = "flex";
    mainRow.style.gap = "16px";
    mainRow.style.alignItems = "flex-start";

    const boardEl = document.createElement("div");
    boardEl.style.position = "relative";
    boardEl.style.width = COLS * CELL + "px";
    boardEl.style.height = ROWS * CELL + "px";
    boardEl.style.background = "var(--panel-light)";
    boardEl.style.border = "1px solid var(--border)";
    boardEl.style.borderRadius = "8px";
    boardEl.style.display = "grid";
    boardEl.style.gridTemplateColumns = `repeat(${COLS}, ${CELL}px)`;
    boardEl.style.gridTemplateRows = `repeat(${ROWS}, ${CELL}px)`;

    const cellEls = [];
    for (let i = 0; i < ROWS * COLS; i++) {
      const c = document.createElement("div");
      c.style.width = CELL + "px";
      c.style.height = CELL + "px";
      c.style.boxSizing = "border-box";
      c.style.border = "1px solid rgba(255,255,255,0.03)";
      boardEl.appendChild(c);
      cellEls.push(c);
    }

    const sidePanel = document.createElement("div");
    sidePanel.style.display = "flex";
    sidePanel.style.flexDirection = "column";
    sidePanel.style.alignItems = "center";
    sidePanel.style.gap = "8px";

    const nextLabel = document.createElement("div");
    nextLabel.textContent = "Next";
    nextLabel.style.fontSize = ".78rem";
    nextLabel.style.color = "var(--text-dim)";

    const nextEl = document.createElement("div");
    nextEl.style.width = "4 * " + CELL + "px";
    nextEl.style.display = "grid";
    nextEl.style.gridTemplateColumns = `repeat(4, ${CELL - 4}px)`;
    nextEl.style.gridTemplateRows = `repeat(4, ${CELL - 4}px)`;
    nextEl.style.gap = "1px";
    nextEl.style.background = "var(--bg-alt)";
    nextEl.style.border = "1px solid var(--border)";
    nextEl.style.borderRadius = "6px";
    nextEl.style.padding = "4px";

    const nextCellEls = [];
    for (let i = 0; i < 16; i++) {
      const c = document.createElement("div");
      c.style.width = CELL - 4 + "px";
      c.style.height = CELL - 4 + "px";
      nextEl.appendChild(c);
      nextCellEls.push(c);
    }

    sidePanel.appendChild(nextLabel);
    sidePanel.appendChild(nextEl);

    mainRow.appendChild(boardEl);
    mainRow.appendChild(sidePanel);

    const padWrap = document.createElement("div");
    padWrap.style.display = "flex";
    padWrap.style.gap = "8px";
    padWrap.style.flexWrap = "wrap";
    padWrap.style.justifyContent = "center";

    function padBtn(label, onClick) {
      const b = document.createElement("button");
      b.className = "btn";
      b.style.fontSize = "1.1rem";
      b.style.minWidth = "44px";
      b.textContent = label;
      b.onclick = onClick;
      return b;
    }
    const leftBtn = padBtn("◀", () => { doMove(0, -1); });
    const rotateBtn = padBtn("⟳", () => { doRotate(); });
    const rightBtn = padBtn("▶", () => { doMove(0, 1); });
    const downBtn = padBtn("▼", () => { doSoftDrop(); });
    const dropBtn = padBtn("⤓ Drop", () => { doHardDrop(); });
    padWrap.appendChild(leftBtn);
    padWrap.appendChild(rotateBtn);
    padWrap.appendChild(rightBtn);
    padWrap.appendChild(downBtn);
    padWrap.appendChild(dropBtn);

    wrap.appendChild(statsEl);
    wrap.appendChild(newBtn);
    wrap.appendChild(mainRow);
    wrap.appendChild(padWrap);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Add Score +500",
        run: () => {
          state.score += 500;
          if (state.score > state.best) {
            state.best = state.score;
            ctx.storage.set("bestScore", state.best);
          }
          updateStats();
        },
      },
      {
        label: "Clear Board",
        run: () => {
          if (state.over) return;
          state.grid = emptyGrid();
          render();
        },
      },
    ]);

    function emptyGrid() {
      const g = [];
      for (let r = 0; r < ROWS; r++) g.push(new Array(COLS).fill(null));
      return g;
    }

    function randomType() {
      return TYPES[Math.floor(Math.random() * TYPES.length)];
    }

    function makePiece(type) {
      const shape = SHAPES[type];
      const minRow = Math.min(...shape.cells.map(([r]) => r));
      return {
        type,
        size: shape.size,
        cells: shape.cells.map((c) => c.slice()),
        color: shape.color,
        row: -minRow,
        col: Math.floor((COLS - shape.size) / 2),
      };
    }

    function canPlace(piece, row, col, cells) {
      for (const [r, c] of cells) {
        const gr = row + r;
        const gc = col + c;
        if (gc < 0 || gc >= COLS || gr >= ROWS) return false;
        if (gr >= 0 && state.grid[gr][gc]) return false;
      }
      return true;
    }

    function tryMove(dr, dc) {
      const nr = state.piece.row + dr;
      const nc = state.piece.col + dc;
      if (canPlace(state.piece, nr, nc, state.piece.cells)) {
        state.piece.row = nr;
        state.piece.col = nc;
        return true;
      }
      return false;
    }

    function tryRotate() {
      const n = state.piece.size;
      const newCells = state.piece.cells.map(([r, c]) => [c, n - 1 - r]);
      if (canPlace(state.piece, state.piece.row, state.piece.col, newCells)) {
        state.piece.cells = newCells;
        return true;
      }
      return false;
    }

    function ghostRow() {
      let r = state.piece.row;
      while (canPlace(state.piece, r + 1, state.piece.col, state.piece.cells)) r++;
      return r;
    }

    function lockPiece() {
      let aboveTop = false;
      state.piece.cells.forEach(([r, c]) => {
        const gr = state.piece.row + r;
        const gc = state.piece.col + c;
        if (gr < 0) {
          aboveTop = true;
          return;
        }
        state.grid[gr][gc] = state.piece.color;
      });
      if (aboveTop) {
        endGame();
        return;
      }
      ctx.playSound("hit");
      clearLines();
      spawnPiece();
    }

    function clearLines() {
      let cleared = 0;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (state.grid[r].every((cell) => cell)) {
          state.grid.splice(r, 1);
          state.grid.unshift(new Array(COLS).fill(null));
          cleared++;
          r++;
        }
      }
      if (cleared > 0) {
        const pointsTable = [0, 100, 300, 500, 800];
        state.score += (pointsTable[cleared] || 800) * state.level;
        state.lines += cleared;
        const newLevel = Math.floor(state.lines / 10) + 1;
        const levelUp = newLevel !== state.level;
        state.level = newLevel;
        ctx.playSound(cleared >= 4 ? "win" : "success");
        ctx.vibrate(20);
        if (state.score > state.best) {
          state.best = state.score;
          ctx.storage.set("bestScore", state.best);
        }
        if (levelUp) scheduleFall();
      }
    }

    function spawnPiece() {
      state.piece = makePiece(state.nextType || randomType());
      state.nextType = randomType();
      renderNext();
      if (!canPlace(state.piece, state.piece.row, state.piece.col, state.piece.cells)) {
        endGame();
      }
    }

    function doMove(dr, dc) {
      if (state.over) return;
      if (tryMove(dr, dc)) {
        ctx.playSound("click");
        render();
      }
    }

    function doRotate() {
      if (state.over) return;
      if (tryRotate()) {
        ctx.playSound("tick");
        render();
      }
    }

    function doSoftDrop() {
      if (state.over) return;
      if (tryMove(1, 0)) {
        state.score += 1;
        render();
        updateStats();
      } else {
        lockPiece();
        render();
        updateStats();
      }
    }

    function doHardDrop() {
      if (state.over) return;
      let dist = 0;
      while (tryMove(1, 0)) dist++;
      state.score += dist * 2;
      ctx.playSound("swoosh");
      lockPiece();
      render();
      updateStats();
    }

    function tick() {
      if (state.over) return;
      if (tryMove(1, 0)) {
        render();
      } else {
        lockPiece();
        render();
        updateStats();
      }
    }

    function scheduleFall() {
      if (fallTimer) clearInterval(fallTimer);
      const intervalMs = Math.max(120, 800 - (state.level - 1) * 60);
      fallTimer = setInterval(tick, intervalMs);
    }

    function endGame() {
      state.over = true;
      if (fallTimer) clearInterval(fallTimer);
      ctx.playSound("lose");
      ctx.setStatus(`Game over — score ${state.score}`);
      setTimeout(() => {
        ctx.showOverlay({
          title: "Game Over",
          subtitle: `Score: ${state.score}${state.score >= state.best && state.score > 0 ? " — new best!" : ""}`,
          buttonText: "Try Again",
          onButton: newGame,
        });
      }, 250);
    }

    function render() {
      // base board
      const painted = new Array(ROWS * COLS).fill(null);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (state.grid[r][c]) painted[r * COLS + c] = state.grid[r][c];
        }
      }
      // ghost
      if (state.piece && !state.over) {
        const gr = ghostRow();
        state.piece.cells.forEach(([r, c]) => {
          const rr = gr + r;
          const cc = state.piece.col + c;
          if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && !painted[rr * COLS + cc]) {
            painted[rr * COLS + cc] = "ghost:" + state.piece.color;
          }
        });
      }
      // current piece
      if (state.piece) {
        state.piece.cells.forEach(([r, c]) => {
          const rr = state.piece.row + r;
          const cc = state.piece.col + c;
          if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
            painted[rr * COLS + cc] = state.piece.color;
          }
        });
      }
      cellEls.forEach((el, i) => {
        const v = painted[i];
        if (!v) {
          el.style.background = "transparent";
          el.style.boxShadow = "none";
        } else if (typeof v === "string" && v.startsWith("ghost:")) {
          el.style.background = "transparent";
          el.style.boxShadow = `inset 0 0 0 2px ${v.slice(6)}55`;
        } else {
          el.style.background = v;
          el.style.boxShadow = "inset 0 0 0 1px rgba(0,0,0,.25)";
        }
      });
    }

    function renderNext() {
      const shape = SHAPES[state.nextType];
      const grid4 = Array(16).fill(null);
      const offset = Math.floor((4 - shape.size) / 2);
      shape.cells.forEach(([r, c]) => {
        const rr = r + offset;
        const cc = c + offset;
        if (rr >= 0 && rr < 4 && cc >= 0 && cc < 4) grid4[rr * 4 + cc] = shape.color;
      });
      nextCellEls.forEach((el, i) => {
        el.style.background = grid4[i] || "transparent";
        el.style.borderRadius = "2px";
      });
    }

    function updateStats() {
      statsEl.textContent = "";
      const rows = [
        ["Score", state.score],
        ["Level", state.level],
        ["Lines", state.lines],
        ["Best", state.best],
      ];
      rows.forEach(([label, val]) => {
        const d = document.createElement("div");
        d.textContent = `${label}: ${val}`;
        statsEl.appendChild(d);
      });
      ctx.setStatus(state.over ? "Game over" : `Score: ${state.score}  Level: ${state.level}`);
    }

    function onKeyDown(e) {
      if (state.over) return;
      const key = e.key;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Spacebar"].includes(key)) {
        e.preventDefault();
      }
      if (key === "ArrowLeft") doMove(0, -1);
      else if (key === "ArrowRight") doMove(0, 1);
      else if (key === "ArrowUp") doRotate();
      else if (key === "ArrowDown") doSoftDrop();
      else if (key === " " || key === "Spacebar") doHardDrop();
    }
    document.addEventListener("keydown", onKeyDown);

    // Gamepad: the hub's site-wide D-pad-to-arrow-keys bridge (js/pad-cursor.js)
    // already gives free move/rotate/soft-drop, so the only thing missing is
    // hard drop — any face button does it, edge-triggered so a held button
    // doesn't spam drops. Buttons 0 (B) and 9 (Start) are excluded: that same
    // site-wide bridge reserves them everywhere as "back to the game grid"
    // and "un-hide the cursor". It also needs to know a piece is actively
    // dropping (not just that a controller is connected) to keep its own
    // cursor out of the way, hence setSuppressed below.
    const gamepadPrevPressed = new Set();
    function pollGamepad() {
      window.MimiPadCursor?.setSuppressed(!state.over);
      if (state.over) return;
      if (typeof navigator.getGamepads !== "function") return;
      const pad = Array.from(navigator.getGamepads()).find((p) => p?.connected);
      if (!pad) { gamepadPrevPressed.clear(); return; }
      pad.buttons.forEach((button, index) => {
        if (index === 0 || index === 9) return;
        const pressed = Boolean(button?.pressed);
        if (pressed && !gamepadPrevPressed.has(index)) doHardDrop();
        if (pressed) gamepadPrevPressed.add(index);
        else gamepadPrevPressed.delete(index);
      });
    }
    const gamepadPollId = setInterval(pollGamepad, 60);

    function newGame() {
      state.grid = emptyGrid();
      state.score = 0;
      state.lines = 0;
      state.level = 1;
      state.over = false;
      state.nextType = randomType();
      spawnPiece();
      ctx.setStatus("Good luck!");
      updateStats();
      render();
      scheduleFall();
    }

    newGame();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (fallTimer) clearInterval(fallTimer);
      clearInterval(gamepadPollId);
      window.MimiPadCursor?.setSuppressed(false);
    };
  },
});
