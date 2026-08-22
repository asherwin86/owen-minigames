MimiGames.register({
  id: "sliding-puzzle",
  title: "Sliding Puzzle",
  emoji: "🧩",
  category: "Puzzle",
  players: "1P",
  howTo: "Click a tile next to the blank space to slide it. Arrange 1-15 in order to win.",
  init(root, ctx) {
    const SIZE = 4;
    const state = {
      tiles: [],
      blank: SIZE * SIZE - 1,
      moves: 0,
      over: false,
      best: ctx.storage.get("bestMoves", null),
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "12px";

    const info = document.createElement("div");
    info.style.fontWeight = "700";

    const shuffleBtn = document.createElement("button");
    shuffleBtn.className = "btn primary";
    shuffleBtn.textContent = "Shuffle";
    shuffleBtn.onclick = newGame;

    const boardEl = document.createElement("div");
    boardEl.className = "cell-grid";
    boardEl.style.gridTemplateColumns = `repeat(${SIZE}, 78px)`;
    boardEl.style.gridTemplateRows = `repeat(${SIZE}, 78px)`;

    const tileEls = [];
    for (let i = 0; i < SIZE * SIZE; i++) {
      const b = document.createElement("button");
      b.className = "btn";
      b.style.width = "78px";
      b.style.height = "78px";
      b.style.fontSize = "1.4rem";
      b.style.fontWeight = "700";
      b.onclick = () => attemptMove(i);
      boardEl.appendChild(b);
      tileEls.push(b);
    }

    wrap.appendChild(info);
    wrap.appendChild(shuffleBtn);
    wrap.appendChild(boardEl);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Auto-Solve",
        run() {
          if (state.over) return;
          state.tiles = solvedTiles();
          state.blank = SIZE * SIZE - 1;
          checkWin();
        },
      },
      {
        label: "Skip to Nearly Solved",
        run() {
          if (state.over) return;
          state.tiles = solvedTiles();
          state.blank = SIZE * SIZE - 1;
          const pick = neighborsOf(state.blank)[0];
          [state.tiles[state.blank], state.tiles[pick]] = [state.tiles[pick], state.tiles[state.blank]];
          state.blank = pick;
          state.moves = 0;
          render();
        },
      },
    ]);

    function solvedTiles() {
      const arr = [];
      for (let i = 1; i < SIZE * SIZE; i++) arr.push(i);
      arr.push(0);
      return arr;
    }

    function neighborsOf(idx) {
      const r = Math.floor(idx / SIZE);
      const c = idx % SIZE;
      const list = [];
      if (r > 0) list.push(idx - SIZE);
      if (r < SIZE - 1) list.push(idx + SIZE);
      if (c > 0) list.push(idx - 1);
      if (c < SIZE - 1) list.push(idx + 1);
      return list;
    }

    function shuffleBoard() {
      state.tiles = solvedTiles();
      state.blank = SIZE * SIZE - 1;
      let lastBlank = -1;
      const steps = 300;
      for (let i = 0; i < steps; i++) {
        const options = neighborsOf(state.blank).filter((n) => n !== lastBlank);
        const pick = options[Math.floor(Math.random() * options.length)];
        lastBlank = state.blank;
        [state.tiles[state.blank], state.tiles[pick]] = [state.tiles[pick], state.tiles[state.blank]];
        state.blank = pick;
      }
    }

    function attemptMove(idx) {
      if (state.over) return;
      if (!neighborsOf(state.blank).includes(idx)) return;
      [state.tiles[state.blank], state.tiles[idx]] = [state.tiles[idx], state.tiles[state.blank]];
      state.blank = idx;
      state.moves++;
      ctx.playSound("click");
      render();
      checkWin();
    }

    function checkWin() {
      const solved = solvedTiles();
      const isSolved = state.tiles.every((v, i) => v === solved[i]);
      if (isSolved) {
        state.over = true;
        ctx.playSound("success");
        if (state.best === null || state.moves < state.best) {
          state.best = state.moves;
          ctx.storage.set("bestMoves", state.best);
        }
        setTimeout(() => {
          ctx.showOverlay({
            title: "Solved!",
            subtitle: `Moves: ${state.moves}  •  Best: ${state.best}`,
            buttonText: "Shuffle Again",
            onButton: newGame,
          });
        }, 200);
      }
      render();
    }

    function render() {
      state.tiles.forEach((v, i) => {
        const el = tileEls[i];
        if (v === 0) {
          el.textContent = "";
          el.style.background = "transparent";
          el.style.border = "1px solid transparent";
          el.disabled = true;
        } else {
          el.textContent = String(v);
          el.style.background = "";
          el.style.border = "";
          el.disabled = state.over;
        }
      });
      info.textContent = `Moves: ${state.moves}${state.best !== null ? "  •  Best: " + state.best : ""}`;
      ctx.setStatus(state.over ? "Solved!" : `Moves: ${state.moves}`);
    }

    function newGame() {
      state.moves = 0;
      state.over = false;
      shuffleBoard();
      render();
    }

    newGame();

    return () => {};
  },
});
