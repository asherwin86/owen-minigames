MimiGames.register({
  id: "match-three",
  title: "Match Three",
  emoji: "🍬",
  category: "Puzzle",
  players: "1P",
  howTo: "Click a gem, then click a neighbor to swap. Line up 3+ matching gems to clear them and score points.",
  init(root, ctx) {
    const SIZE = 7;
    const GEMS = ["🍎", "🍋", "🍇", "🍊", "🍓", "🍉"];
    const MAX_MOVES = 20;

    const state = {
      board: [],
      selected: null,
      score: 0,
      best: ctx.storage.get("best", 0),
      movesLeft: MAX_MOVES,
      over: false,
      busy: false,
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "12px";

    const info = document.createElement("div");
    info.style.fontWeight = "700";

    const newBtn = document.createElement("button");
    newBtn.className = "btn primary";
    newBtn.textContent = "New Round";
    newBtn.onclick = newGame;

    const boardEl = document.createElement("div");
    boardEl.className = "cell-grid";
    boardEl.style.gridTemplateColumns = `repeat(${SIZE}, 44px)`;
    boardEl.style.gridTemplateRows = `repeat(${SIZE}, 44px)`;
    boardEl.style.gap = "3px";

    wrap.appendChild(info);
    wrap.appendChild(newBtn);
    wrap.appendChild(boardEl);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      { label: "Add Score +100", run: () => { if (state.over) return; state.score += 100; render(); } },
      { label: "Add 5 Moves", run: () => { if (state.over) return; state.movesLeft += 5; render(); } },
    ]);

    const cellEls = [];
    for (let r = 0; r < SIZE; r++) {
      const row = [];
      for (let c = 0; c < SIZE; c++) {
        const b = document.createElement("button");
        b.className = "btn";
        b.style.width = "44px";
        b.style.height = "44px";
        b.style.padding = "0";
        b.style.fontSize = "1.4rem";
        b.onclick = () => handleCellClick(r, c);
        boardEl.appendChild(b);
        row.push(b);
      }
      cellEls.push(row);
    }

    function randGem() {
      return Math.floor(Math.random() * GEMS.length);
    }

    function makeBoard() {
      const board = [];
      for (let r = 0; r < SIZE; r++) {
        board.push([]);
        for (let c = 0; c < SIZE; c++) {
          let v;
          do {
            v = randGem();
          } while (
            (c >= 2 && board[r][c - 1] === v && board[r][c - 2] === v) ||
            (r >= 2 && board[r - 1][c] === v && board[r - 2][c] === v)
          );
          board[r].push(v);
        }
      }
      return board;
    }

    function findMatches(board) {
      const matched = new Set();
      for (let r = 0; r < SIZE; r++) {
        let start = 0;
        for (let c = 1; c <= SIZE; c++) {
          const prevVal = board[r][c - 1];
          const curVal = c < SIZE ? board[r][c] : null;
          if (curVal !== prevVal) {
            if (c - start >= 3 && prevVal !== null) {
              for (let k = start; k < c; k++) matched.add(r + "," + k);
            }
            start = c;
          }
        }
      }
      for (let c = 0; c < SIZE; c++) {
        let start = 0;
        for (let r = 1; r <= SIZE; r++) {
          const prevVal = board[r - 1][c];
          const curVal = r < SIZE ? board[r][c] : null;
          if (curVal !== prevVal) {
            if (r - start >= 3 && prevVal !== null) {
              for (let k = start; k < r; k++) matched.add(k + "," + c);
            }
            start = r;
          }
        }
      }
      return matched;
    }

    function collapseAndRefill(board) {
      for (let c = 0; c < SIZE; c++) {
        const colVals = [];
        for (let r = 0; r < SIZE; r++) {
          if (board[r][c] !== null) colVals.push(board[r][c]);
        }
        const missing = SIZE - colVals.length;
        const merged = [];
        for (let i = 0; i < missing; i++) merged.push(randGem());
        for (const v of colVals) merged.push(v);
        for (let r = 0; r < SIZE; r++) board[r][c] = merged[r];
      }
    }

    function swapCells(a, b) {
      const tmp = state.board[a.r][a.c];
      state.board[a.r][a.c] = state.board[b.r][b.c];
      state.board[b.r][b.c] = tmp;
    }

    function handleCellClick(r, c) {
      if (state.over || state.busy) return;
      if (!state.selected) {
        state.selected = { r, c };
        render();
        return;
      }
      if (state.selected.r === r && state.selected.c === c) {
        state.selected = null;
        render();
        return;
      }
      const a = state.selected;
      const b = { r, c };
      const adjacent = Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
      state.selected = null;
      if (adjacent) {
        trySwap(a, b);
      } else {
        state.selected = { r, c };
        render();
      }
    }

    function trySwap(a, b) {
      state.busy = true;
      swapCells(a, b);
      render();
      const matches = findMatches(state.board);
      state.movesLeft--;
      if (matches.size === 0) {
        ctx.playSound("fail");
        setTimeout(() => {
          swapCells(a, b);
          state.busy = false;
          afterMove();
        }, 220);
      } else {
        ctx.playSound("pop");
        setTimeout(() => resolveCascade(), 180);
      }
    }

    function resolveCascade() {
      const matches = findMatches(state.board);
      if (matches.size === 0) {
        state.busy = false;
        afterMove();
        return;
      }
      state.score += matches.size * 10;
      matches.forEach((key) => {
        const [r, c] = key.split(",").map(Number);
        state.board[r][c] = null;
      });
      render();
      setTimeout(() => {
        collapseAndRefill(state.board);
        render();
        setTimeout(resolveCascade, 160);
      }, 160);
    }

    function afterMove() {
      render();
      if (state.movesLeft <= 0) {
        state.over = true;
        if (state.score > state.best) {
          state.best = state.score;
          ctx.storage.set("best", state.best);
        }
        ctx.playSound("success");
        setTimeout(() => {
          ctx.showOverlay({
            title: "Round Over",
            subtitle: `Score: ${state.score}  •  Best: ${state.best}`,
            buttonText: "Play Again",
            onButton: newGame,
          });
        }, 200);
      }
    }

    function render() {
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const v = state.board[r][c];
          const el = cellEls[r][c];
          el.textContent = v === null || v === undefined ? "" : GEMS[v];
          const isSelected = state.selected && state.selected.r === r && state.selected.c === c;
          el.style.background = isSelected ? "rgba(0,210,255,0.3)" : "";
          el.style.border = isSelected ? "2px solid var(--accent2)" : "";
        }
      }
      info.textContent = `Score: ${state.score}  •  Best: ${state.best}  •  Moves left: ${Math.max(0, state.movesLeft)}`;
      ctx.setStatus(state.over ? `Round over — score ${state.score}` : info.textContent);
    }

    function newGame() {
      state.board = makeBoard();
      state.selected = null;
      state.score = 0;
      state.movesLeft = MAX_MOVES;
      state.over = false;
      state.busy = false;
      render();
    }

    newGame();

    return () => {};
  },
});
