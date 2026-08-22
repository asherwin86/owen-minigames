MimiGames.register({
  id: "connect-four",
  title: "Connect Four",
  emoji: "🔴",
  category: "Board",
  players: "2P",
  howTo: "Take turns clicking a column to drop your disc. Get 4 in a row (any direction) to win.",
  init(root, ctx) {
    const COLS = 7;
    const ROWS = 6;
    const COLORS = { R: "#ff4757", Y: "#ffd93d" };

    const state = {
      board: [], // board[col][row], row 0 = bottom
      turn: "R",
      over: false,
      moveHistory: [], // {col,row,color}
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

    const boardWrap = document.createElement("div");
    boardWrap.style.background = "#12305c";
    boardWrap.style.padding = "10px";
    boardWrap.style.borderRadius = "12px";
    boardWrap.style.display = "inline-block";

    const colBtns = [];
    const cellSize = 44;

    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = `repeat(${COLS}, ${cellSize}px)`;
    grid.style.gridTemplateRows = `repeat(${ROWS}, ${cellSize}px)`;
    grid.style.gap = "4px";

    // cellEls[col][row]
    const cellEls = [];
    for (let c = 0; c < COLS; c++) {
      cellEls.push([]);
    }

    // We render row 0 (bottom) at the bottom visually, so iterate visual rows top->bottom = ROWS-1 .. 0
    for (let vr = 0; vr < ROWS; vr++) {
      const row = ROWS - 1 - vr;
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement("div");
        cell.style.width = cellSize + "px";
        cell.style.height = cellSize + "px";
        cell.style.borderRadius = "50%";
        cell.style.background = "#0a1f3d";
        cell.style.cursor = "pointer";
        cell.onclick = () => handleClick(c);
        grid.appendChild(cell);
        cellEls[c][row] = cell;
      }
    }

    boardWrap.appendChild(grid);
    wrap.appendChild(controls);
    wrap.appendChild(boardWrap);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Force Win",
        run() {
          if (state.over) return;
          state.over = true;
          ctx.playSound("success");
          const name = state.turn === "R" ? "Red" : "Yellow";
          ctx.setStatus(`${name} wins!`);
          setTimeout(() => {
            ctx.showOverlay({
              title: `${name} Wins!`,
              subtitle: "Four in a row!",
              buttonText: "Play Again",
              onButton: reset,
            });
          }, 300);
        },
      },
      {
        label: "Undo Last Move",
        run() {
          if (state.over || !state.moveHistory.length) return;
          const last = state.moveHistory.pop();
          state.board[last.col][last.row] = null;
          state.turn = last.color;
          render();
          ctx.setStatus(`${state.turn === "R" ? "Red" : "Yellow"}'s turn`);
        },
      },
    ]);

    function handleClick(col) {
      if (state.over) return;
      dropDisc(col);
    }

    function dropDisc(col) {
      const colArr = state.board[col];
      let row = -1;
      for (let r = 0; r < ROWS; r++) {
        if (!colArr[r]) { row = r; break; }
      }
      if (row === -1) return; // column full
      colArr[row] = state.turn;
      state.moveHistory.push({ col, row, color: state.turn });
      ctx.playSound("click");
      render();

      const w = checkWin(col, row);
      if (w) {
        state.over = true;
        ctx.playSound("success");
        const name = w === "R" ? "Red" : "Yellow";
        ctx.setStatus(`${name} wins!`);
        setTimeout(() => {
          ctx.showOverlay({
            title: `${name} Wins!`,
            subtitle: "Four in a row!",
            buttonText: "Play Again",
            onButton: reset,
          });
        }, 300);
        return;
      }

      if (isFull()) {
        state.over = true;
        ctx.playSound("click");
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

      state.turn = state.turn === "R" ? "Y" : "R";
      ctx.setStatus(`${state.turn === "R" ? "Red" : "Yellow"}'s turn`);
    }

    function isFull() {
      return state.board.every((col) => col.every((v) => v));
    }

    function checkWin(col, row) {
      const mark = state.board[col][row];
      const dirs = [
        [1, 0], [0, 1], [1, 1], [1, -1],
      ];
      for (const [dc, dr] of dirs) {
        let count = 1;
        count += countDir(col, row, dc, dr, mark);
        count += countDir(col, row, -dc, -dr, mark);
        if (count >= 4) return mark;
      }
      return null;
    }

    function countDir(col, row, dc, dr, mark) {
      let count = 0;
      let c = col + dc;
      let r = row + dr;
      while (c >= 0 && c < COLS && r >= 0 && r < ROWS && state.board[c][r] === mark) {
        count++;
        c += dc;
        r += dr;
      }
      return count;
    }

    function render() {
      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
          const v = state.board[c][r];
          cellEls[c][r].style.background = v ? COLORS[v] : "#0a1f3d";
        }
      }
    }

    function reset() {
      state.board = [];
      for (let c = 0; c < COLS; c++) state.board.push(Array(ROWS).fill(null));
      state.turn = "R";
      state.over = false;
      state.moveHistory = [];
      ctx.setStatus("Red's turn");
      render();
    }

    reset();

    return () => {};
  },
});
