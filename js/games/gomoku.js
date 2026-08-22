MimiGames.register({
  id: "gomoku",
  title: "Gomoku (Five in a Row)",
  emoji: "⚪",
  category: "Board",
  players: "2P",
  howTo: "Take turns placing black and white stones on the intersections. First to get 5 in a row (any direction) wins.",
  init(root, ctx) {
    const N = 13;
    const cellSize = 30;

    const state = {
      board: [], // 'B' | 'W' | null
      turn: "B",
      over: false,
      moves: 0,
      history: [], // {row,col,turn}
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "14px";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "10px";
    const resetBtn = document.createElement("button");
    resetBtn.className = "btn";
    resetBtn.textContent = "Restart";
    resetBtn.onclick = reset;
    controls.appendChild(resetBtn);

    const boardSize = (N - 1) * cellSize;
    const pad = cellSize / 2;
    const boardEl = document.createElement("div");
    boardEl.style.position = "relative";
    boardEl.style.width = boardSize + pad * 2 + "px";
    boardEl.style.height = boardSize + pad * 2 + "px";
    boardEl.style.background = "#dcb35c";
    boardEl.style.borderRadius = "6px";
    boardEl.style.border = "2px solid #8a6a2e";

    wrap.appendChild(controls);
    wrap.appendChild(boardEl);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Force Win",
        run() {
          if (state.over) return;
          state.over = true;
          const name = state.turn === "B" ? "Black" : "White";
          ctx.playSound("success");
          ctx.setStatus(`${name} wins!`);
          setTimeout(() => {
            ctx.showOverlay({
              title: `${name} Wins!`,
              subtitle: "Five in a row!",
              buttonText: "Play Again",
              onButton: reset,
            });
          }, 300);
        },
      },
      {
        label: "Undo Last Move",
        run() {
          if (!state.history.length) return;
          const last = state.history.pop();
          state.board[last.row][last.col] = null;
          state.moves--;
          state.turn = last.turn;
          state.over = false;
          render();
          ctx.setStatus(`${state.turn === "B" ? "Black" : "White"}'s turn`);
        },
      },
    ]);

    // grid lines
    for (let i = 0; i < N; i++) {
      const hLine = document.createElement("div");
      hLine.style.position = "absolute";
      hLine.style.left = pad + "px";
      hLine.style.top = pad + i * cellSize + "px";
      hLine.style.width = boardSize + "px";
      hLine.style.height = "1px";
      hLine.style.background = "#5c4620";
      boardEl.appendChild(hLine);

      const vLine = document.createElement("div");
      vLine.style.position = "absolute";
      vLine.style.top = pad + "px";
      vLine.style.left = pad + i * cellSize + "px";
      vLine.style.width = "1px";
      vLine.style.height = boardSize + "px";
      vLine.style.background = "#5c4620";
      boardEl.appendChild(vLine);
    }

    const cellEls = [];
    const stoneEls = [];
    for (let r = 0; r < N; r++) {
      cellEls.push([]);
      stoneEls.push([]);
      for (let c = 0; c < N; c++) {
        const hit = document.createElement("div");
        hit.style.position = "absolute";
        hit.style.width = cellSize + "px";
        hit.style.height = cellSize + "px";
        hit.style.left = pad + c * cellSize - cellSize / 2 + "px";
        hit.style.top = pad + r * cellSize - cellSize / 2 + "px";
        hit.style.cursor = "pointer";
        hit.onclick = () => placeStone(r, c);
        boardEl.appendChild(hit);
        cellEls[r].push(hit);

        const stone = document.createElement("div");
        stone.style.position = "absolute";
        stone.style.width = cellSize - 4 + "px";
        stone.style.height = cellSize - 4 + "px";
        stone.style.left = pad + c * cellSize - (cellSize - 4) / 2 + "px";
        stone.style.top = pad + r * cellSize - (cellSize - 4) / 2 + "px";
        stone.style.borderRadius = "50%";
        stone.style.pointerEvents = "none";
        stone.style.display = "none";
        stone.style.boxShadow = "0 2px 3px rgba(0,0,0,.5)";
        boardEl.appendChild(stone);
        stoneEls[r].push(stone);
      }
    }

    function placeStone(row, col) {
      if (state.over || state.board[row][col]) return;
      state.board[row][col] = state.turn;
      state.history.push({ row, col, turn: state.turn });
      state.moves++;
      ctx.playSound("click");
      render();

      if (checkWin(row, col)) {
        state.over = true;
        const name = state.turn === "B" ? "Black" : "White";
        ctx.playSound("success");
        ctx.setStatus(`${name} wins!`);
        setTimeout(() => {
          ctx.showOverlay({
            title: `${name} Wins!`,
            subtitle: "Five in a row!",
            buttonText: "Play Again",
            onButton: reset,
          });
        }, 300);
        return;
      }

      if (state.moves >= N * N) {
        state.over = true;
        ctx.setStatus("It's a draw!");
        setTimeout(() => {
          ctx.showOverlay({
            title: "Draw!",
            subtitle: "Board is full.",
            buttonText: "Play Again",
            onButton: reset,
          });
        }, 300);
        return;
      }

      state.turn = state.turn === "B" ? "W" : "B";
      ctx.setStatus(`${state.turn === "B" ? "Black" : "White"}'s turn`);
    }

    function checkWin(row, col) {
      const mark = state.board[row][col];
      const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
      for (const [dr, dc] of dirs) {
        let count = 1;
        count += countDir(row, col, dr, dc, mark);
        count += countDir(row, col, -dr, -dc, mark);
        if (count >= 5) return true;
      }
      return false;
    }

    function countDir(row, col, dr, dc, mark) {
      let count = 0;
      let r = row + dr, c = col + dc;
      while (r >= 0 && r < N && c >= 0 && c < N && state.board[r][c] === mark) {
        count++;
        r += dr;
        c += dc;
      }
      return count;
    }

    function render() {
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const v = state.board[r][c];
          const el = stoneEls[r][c];
          if (v) {
            el.style.display = "block";
            el.style.background = v === "B" ? "#181818" : "#f4f4f4";
          } else {
            el.style.display = "none";
          }
        }
      }
    }

    function reset() {
      state.board = [];
      for (let r = 0; r < N; r++) state.board.push(Array(N).fill(null));
      state.turn = "B";
      state.over = false;
      state.moves = 0;
      state.history = [];
      ctx.setStatus("Black's turn");
      render();
    }

    reset();

    return () => {};
  },
});
