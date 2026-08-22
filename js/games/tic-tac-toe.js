MimiGames.register({
  id: "tic-tac-toe",
  title: "Tic-Tac-Toe",
  emoji: "❌",
  category: "Board",
  players: "1-2P",
  howTo: "Take turns placing X and O. Get three in a row to win. Play vs a friend, or vs the CPU.",
  init(root, ctx) {
    const state = {
      board: Array(9).fill(null),
      turn: "X",
      vsCpu: true,
      over: false,
      history: [],
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "14px";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "10px";
    const cpuBtn = document.createElement("button");
    cpuBtn.className = "btn primary";
    cpuBtn.textContent = "Mode: vs CPU";
    cpuBtn.onclick = () => {
      state.vsCpu = !state.vsCpu;
      cpuBtn.textContent = state.vsCpu ? "Mode: vs CPU" : "Mode: 2 Player";
      reset();
    };
    const resetBtn = document.createElement("button");
    resetBtn.className = "btn";
    resetBtn.textContent = "Restart";
    resetBtn.onclick = reset;
    controls.appendChild(cpuBtn);
    controls.appendChild(resetBtn);

    const boardEl = document.createElement("div");
    boardEl.className = "cell-grid";
    boardEl.style.gridTemplateColumns = "repeat(3, 90px)";
    boardEl.style.gridTemplateRows = "repeat(3, 90px)";

    const cells = state.board.map((_, i) => {
      const c = document.createElement("button");
      c.className = "btn";
      c.style.fontSize = "2.2rem";
      c.style.width = "90px";
      c.style.height = "90px";
      c.onclick = () => handleMove(i);
      boardEl.appendChild(c);
      return c;
    });

    wrap.appendChild(controls);
    wrap.appendChild(boardEl);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Force Win",
        run() {
          if (state.over) return;
          const mark = state.turn;
          const line = LINES.find((l) => l.every((i) => state.board[i] === null || state.board[i] === mark));
          if (!line) return;
          line.forEach((i) => { state.board[i] = mark; });
          render();
          const w = winner(state.board);
          if (w) {
            state.over = true;
            ctx.playSound(w === "draw" ? "click" : "success");
            ctx.setStatus(w === "draw" ? "It's a draw!" : `${w} wins!`);
            setTimeout(() => {
              ctx.showOverlay({
                title: w === "draw" ? "Draw!" : `${w} Wins!`,
                subtitle: "Nice game.",
                buttonText: "Play Again",
                onButton: reset,
              });
            }, 300);
          }
        },
      },
      {
        label: "Undo Last Move",
        run() {
          const last = state.history.pop();
          if (!last) return;
          state.board[last.i] = null;
          state.over = false;
          state.turn = last.mark;
          render();
          ctx.setStatus(`${state.turn}'s turn`);
        },
      },
    ]);

    const LINES = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6],
    ];

    function winner(board) {
      for (const [a, b, c] of LINES) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
      }
      if (board.every(Boolean)) return "draw";
      return null;
    }

    function handleMove(i) {
      if (state.over || state.board[i]) return;
      place(i, state.turn);
      if (state.over) return;
      if (state.vsCpu && state.turn === "O") {
        setTimeout(cpuMove, 350);
      }
    }

    function place(i, mark) {
      state.history.push({ i, mark });
      state.board[i] = mark;
      render();
      const w = winner(state.board);
      if (w) {
        state.over = true;
        ctx.playSound(w === "draw" ? "click" : "success");
        ctx.setStatus(w === "draw" ? "It's a draw!" : `${w} wins!`);
        setTimeout(() => {
          ctx.showOverlay({
            title: w === "draw" ? "Draw!" : `${w} Wins!`,
            subtitle: "Nice game.",
            buttonText: "Play Again",
            onButton: reset,
          });
        }, 300);
        return;
      }
      state.turn = state.turn === "X" ? "O" : "X";
      ctx.setStatus(`${state.turn}'s turn`);
    }

    function cpuMove() {
      if (state.over) return;
      const empty = state.board.map((v, i) => (v ? null : i)).filter((v) => v !== null);
      // try to win, then block, then random
      let move = findBest("O") ?? findBest("X") ?? empty[Math.floor(Math.random() * empty.length)];
      place(move, "O");
    }

    function findBest(mark) {
      for (const [a, b, c] of LINES) {
        const line = [a, b, c];
        const vals = line.map((idx) => state.board[idx]);
        const emptyIdx = line[vals.indexOf(null)];
        if (vals.filter((v) => v === mark).length === 2 && vals.includes(null)) {
          return emptyIdx;
        }
      }
      return null;
    }

    function render() {
      cells.forEach((c, i) => {
        c.textContent = state.board[i] || "";
        c.disabled = !!state.board[i] || state.over;
      });
    }

    function reset() {
      state.board = Array(9).fill(null);
      state.turn = "X";
      state.over = false;
      state.history = [];
      ctx.setStatus("X's turn");
      render();
    }

    reset();

    return () => {}; // no timers/listeners outside DOM tree to clean up
  },
});
