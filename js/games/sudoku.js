MimiGames.register({
  id: "sudoku",
  title: "Sudoku",
  emoji: "🔢",
  category: "Puzzle",
  players: "1P",
  howTo: "Click an empty cell, then pick a number below to fill it in. Fill the whole grid with no conflicts to win.",
  init(root, ctx) {
    const PUZZLES = [
      {
        puzzle: [
          [5, 3, 0, 0, 7, 0, 0, 0, 0],
          [6, 0, 0, 1, 9, 5, 0, 0, 0],
          [0, 9, 8, 0, 0, 0, 0, 6, 0],
          [8, 0, 0, 0, 6, 0, 0, 0, 3],
          [4, 0, 0, 8, 0, 3, 0, 0, 1],
          [7, 0, 0, 0, 2, 0, 0, 0, 6],
          [0, 6, 0, 0, 0, 0, 2, 8, 0],
          [0, 0, 0, 4, 1, 9, 0, 0, 5],
          [0, 0, 0, 0, 8, 0, 0, 7, 9],
        ],
        solution: [
          [5, 3, 4, 6, 7, 8, 9, 1, 2],
          [6, 7, 2, 1, 9, 5, 3, 4, 8],
          [1, 9, 8, 3, 4, 2, 5, 6, 7],
          [8, 5, 9, 7, 6, 1, 4, 2, 3],
          [4, 2, 6, 8, 5, 3, 7, 9, 1],
          [7, 1, 3, 9, 2, 4, 8, 5, 6],
          [9, 6, 1, 5, 3, 7, 2, 8, 4],
          [2, 8, 7, 4, 1, 9, 6, 3, 5],
          [3, 4, 5, 2, 8, 6, 1, 7, 9],
        ],
      },
      {
        puzzle: [
          [0, 0, 0, 2, 6, 0, 7, 0, 1],
          [6, 8, 0, 0, 7, 0, 0, 9, 0],
          [1, 9, 0, 0, 0, 4, 5, 0, 0],
          [8, 2, 0, 1, 0, 0, 0, 4, 0],
          [0, 0, 4, 6, 0, 2, 9, 0, 0],
          [0, 5, 0, 0, 0, 3, 0, 2, 8],
          [0, 0, 9, 3, 0, 0, 0, 7, 4],
          [0, 4, 0, 0, 5, 0, 0, 3, 6],
          [7, 0, 3, 0, 1, 8, 0, 0, 0],
        ],
        solution: [
          [4, 3, 5, 2, 6, 9, 7, 8, 1],
          [6, 8, 2, 5, 7, 1, 4, 9, 3],
          [1, 9, 7, 8, 3, 4, 5, 6, 2],
          [8, 2, 6, 1, 9, 5, 3, 4, 7],
          [3, 7, 4, 6, 8, 2, 9, 1, 5],
          [9, 5, 1, 7, 4, 3, 6, 2, 8],
          [5, 1, 9, 3, 2, 6, 8, 7, 4],
          [2, 4, 8, 9, 5, 7, 1, 3, 6],
          [7, 6, 3, 4, 1, 8, 2, 5, 9],
        ],
      },
      {
        puzzle: [
          [0, 2, 0, 6, 0, 8, 0, 0, 0],
          [5, 8, 0, 0, 0, 9, 7, 0, 0],
          [0, 0, 0, 0, 4, 0, 0, 0, 0],
          [3, 7, 0, 0, 0, 0, 5, 0, 0],
          [6, 0, 0, 0, 0, 0, 0, 0, 4],
          [0, 0, 8, 0, 0, 0, 0, 1, 3],
          [0, 0, 0, 0, 2, 0, 0, 0, 0],
          [0, 0, 9, 8, 0, 0, 0, 3, 6],
          [0, 0, 0, 3, 0, 6, 0, 9, 0],
        ],
        solution: [
          [1, 2, 3, 6, 7, 8, 9, 4, 5],
          [5, 8, 4, 2, 3, 9, 7, 6, 1],
          [9, 6, 7, 1, 4, 5, 3, 2, 8],
          [3, 7, 2, 4, 6, 1, 5, 8, 9],
          [6, 9, 1, 5, 8, 3, 2, 7, 4],
          [4, 5, 8, 7, 9, 2, 6, 1, 3],
          [8, 3, 6, 9, 2, 4, 1, 5, 7],
          [2, 1, 9, 8, 5, 7, 4, 3, 6],
          [7, 4, 5, 3, 1, 6, 8, 9, 2],
        ],
      },
    ];

    const state = {
      grid: [],
      given: [],
      solution: null,
      selected: null,
      over: false,
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "12px";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "10px";

    const checkBtn = document.createElement("button");
    checkBtn.className = "btn primary";
    checkBtn.textContent = "Check";
    checkBtn.onclick = () => checkWin(true);

    const newBtn = document.createElement("button");
    newBtn.className = "btn";
    newBtn.textContent = "New Puzzle";
    newBtn.onclick = newGame;

    controls.appendChild(checkBtn);
    controls.appendChild(newBtn);

    const boardEl = document.createElement("div");
    boardEl.style.display = "grid";
    boardEl.style.gridTemplateColumns = "repeat(9, 34px)";
    boardEl.style.gridTemplateRows = "repeat(9, 34px)";
    boardEl.style.gap = "0";
    boardEl.style.border = "2px solid var(--border)";
    boardEl.style.borderRadius = "8px";
    boardEl.style.overflow = "hidden";

    const padEl = document.createElement("div");
    padEl.style.display = "grid";
    padEl.style.gridTemplateColumns = "repeat(5, 44px)";
    padEl.style.gap = "6px";

    wrap.appendChild(controls);
    wrap.appendChild(boardEl);
    wrap.appendChild(padEl);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Auto-Solve",
        run() {
          if (state.over || !state.solution) return;
          state.grid = state.solution.map((row) => row.slice());
          render();
          checkWin(true);
        },
      },
      {
        label: "Reveal Selected Cell",
        run() {
          if (state.over || !state.selected) return;
          const { r, c } = state.selected;
          if (state.given[r][c]) return;
          state.grid[r][c] = state.solution[r][c];
          render();
          checkWin(false);
        },
      },
    ]);

    const cellEls = [];
    for (let r = 0; r < 9; r++) {
      const row = [];
      for (let c = 0; c < 9; c++) {
        const cell = document.createElement("div");
        cell.style.width = "34px";
        cell.style.height = "34px";
        cell.style.display = "flex";
        cell.style.alignItems = "center";
        cell.style.justifyContent = "center";
        cell.style.fontSize = "1.05rem";
        cell.style.fontWeight = "700";
        cell.style.cursor = "pointer";
        cell.style.background = "var(--panel)";
        cell.style.borderRight = (c % 3 === 2 && c !== 8) ? "2px solid var(--border)" : "1px solid var(--bg-alt)";
        cell.style.borderBottom = (r % 3 === 2 && r !== 8) ? "2px solid var(--border)" : "1px solid var(--bg-alt)";
        cell.onclick = () => selectCell(r, c);
        boardEl.appendChild(cell);
        row.push(cell);
      }
      cellEls.push(row);
    }

    for (let n = 1; n <= 9; n++) {
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = String(n);
      b.style.width = "44px";
      b.onclick = () => fillSelected(n);
      padEl.appendChild(b);
    }
    const clearBtn = document.createElement("button");
    clearBtn.className = "btn";
    clearBtn.textContent = "Clear";
    clearBtn.style.gridColumn = "span 5";
    clearBtn.onclick = () => fillSelected(0);
    padEl.appendChild(clearBtn);

    function selectCell(r, c) {
      if (state.over) return;
      if (state.given[r][c]) return;
      state.selected = { r, c };
      render();
    }

    function fillSelected(n) {
      if (state.over || !state.selected) return;
      const { r, c } = state.selected;
      if (state.given[r][c]) return;
      state.grid[r][c] = n;
      ctx.playSound("click");
      render();
      checkWin(false);
    }

    function computeConflicts() {
      const conflicts = new Set();
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const v = state.grid[r][c];
          if (v === 0) continue;
          for (let cc = 0; cc < 9; cc++) {
            if (cc !== c && state.grid[r][cc] === v) { conflicts.add(r + "," + c); conflicts.add(r + "," + cc); }
          }
          for (let rr = 0; rr < 9; rr++) {
            if (rr !== r && state.grid[rr][c] === v) { conflicts.add(r + "," + c); conflicts.add(rr + "," + c); }
          }
          const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
          for (let rr = br; rr < br + 3; rr++) {
            for (let cc = bc; cc < bc + 3; cc++) {
              if ((rr !== r || cc !== c) && state.grid[rr][cc] === v) {
                conflicts.add(r + "," + c);
                conflicts.add(rr + "," + cc);
              }
            }
          }
        }
      }
      return conflicts;
    }

    function checkWin(manual) {
      const full = state.grid.every((row) => row.every((v) => v !== 0));
      if (!full) {
        if (manual) ctx.setStatus("Grid isn't full yet.");
        return;
      }
      const conflicts = computeConflicts();
      const correct = conflicts.size === 0 && state.grid.every((row, r) => row.every((v, c) => v === state.solution[r][c]));
      if (correct) {
        state.over = true;
        ctx.playSound("success");
        setTimeout(() => {
          ctx.showOverlay({
            title: "Solved!",
            subtitle: "Great sudoku work.",
            buttonText: "New Puzzle",
            onButton: newGame,
          });
        }, 200);
      } else if (manual) {
        ctx.playSound("fail");
        ctx.setStatus("Not quite right yet — check the highlighted conflicts.");
      }
    }

    function render() {
      const conflicts = computeConflicts();
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const el = cellEls[r][c];
          const v = state.grid[r][c];
          el.textContent = v === 0 ? "" : String(v);
          const isGiven = state.given[r][c];
          const isSelected = state.selected && state.selected.r === r && state.selected.c === c;
          const isConflict = conflicts.has(r + "," + c);
          el.style.color = isGiven ? "var(--text-dim)" : "var(--text)";
          if (isConflict) {
            el.style.background = "rgba(255,92,92,0.35)";
          } else if (isSelected) {
            el.style.background = "rgba(0,210,255,0.25)";
          } else {
            el.style.background = "var(--panel)";
          }
        }
      }
      ctx.setStatus(state.over ? "Solved!" : "Fill the grid — click a cell, then a number.");
    }

    function newGame() {
      const pick = PUZZLES[Math.floor(Math.random() * PUZZLES.length)];
      state.grid = pick.puzzle.map((row) => row.slice());
      state.given = pick.puzzle.map((row) => row.map((v) => v !== 0));
      state.solution = pick.solution;
      state.selected = null;
      state.over = false;
      render();
    }

    newGame();

    return () => {};
  },
});
