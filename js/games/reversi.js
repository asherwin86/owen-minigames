MimiGames.register({
  id: "reversi",
  title: "Reversi",
  emoji: "⚫",
  category: "Board",
  players: "2P",
  howTo: "Click a highlighted cell to place your disc and flip the opponent's discs caught between yours. Most discs when no moves remain wins.",
  init(root, ctx) {
    const N = 8;
    const DIRS = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1], [0, 1],
      [1, -1], [1, 0], [1, 1],
    ];

    const state = {
      board: [], // 'B' | 'W' | null
      turn: "B",
      over: false,
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "14px";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "10px";
    controls.style.alignItems = "center";
    const resetBtn = document.createElement("button");
    resetBtn.className = "btn";
    resetBtn.textContent = "Restart";
    resetBtn.onclick = reset;
    const scoreEl = document.createElement("div");
    scoreEl.style.fontSize = ".9rem";
    scoreEl.style.color = "var(--text-dim)";
    controls.appendChild(resetBtn);
    controls.appendChild(scoreEl);

    const cellSize = 46;
    const boardEl = document.createElement("div");
    boardEl.style.display = "grid";
    boardEl.style.gridTemplateColumns = `repeat(${N}, ${cellSize}px)`;
    boardEl.style.gridTemplateRows = `repeat(${N}, ${cellSize}px)`;
    boardEl.style.background = "#0b6b3a";
    boardEl.style.border = "3px solid var(--border)";
    boardEl.style.borderRadius = "8px";
    boardEl.style.overflow = "hidden";
    boardEl.style.gap = "1px";

    const cellEls = [];
    for (let r = 0; r < N; r++) {
      cellEls.push([]);
      for (let c = 0; c < N; c++) {
        const cell = document.createElement("div");
        cell.style.width = cellSize + "px";
        cell.style.height = cellSize + "px";
        cell.style.background = "#0d7d43";
        cell.style.display = "flex";
        cell.style.alignItems = "center";
        cell.style.justifyContent = "center";
        cell.style.cursor = "pointer";
        cell.style.position = "relative";
        cell.onclick = () => onCellClick(r, c);
        boardEl.appendChild(cell);
        cellEls[r].push(cell);
      }
    }

    wrap.appendChild(controls);
    wrap.appendChild(boardEl);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Force Win: Black",
        run: () => {
          if (state.over) return;
          for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (state.board[r][c]) state.board[r][c] = "B";
          endGame();
        },
      },
      {
        label: "Force Win: White",
        run: () => {
          if (state.over) return;
          for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (state.board[r][c]) state.board[r][c] = "W";
          endGame();
        },
      },
    ]);

    function inBounds(r, c) {
      return r >= 0 && r < N && c >= 0 && c < N;
    }

    function flipsFor(row, col, player) {
      if (state.board[row][col]) return [];
      const opp = player === "B" ? "W" : "B";
      let allFlips = [];
      for (const [dr, dc] of DIRS) {
        let r = row + dr, c = col + dc;
        const line = [];
        while (inBounds(r, c) && state.board[r][c] === opp) {
          line.push([r, c]);
          r += dr;
          c += dc;
        }
        if (line.length && inBounds(r, c) && state.board[r][c] === player) {
          allFlips = allFlips.concat(line);
        }
      }
      return allFlips;
    }

    function legalMoves(player) {
      const moves = [];
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (!state.board[r][c]) {
            const f = flipsFor(r, c, player);
            if (f.length) moves.push([r, c]);
          }
        }
      }
      return moves;
    }

    function onCellClick(row, col) {
      if (state.over) return;
      const flips = flipsFor(row, col, state.turn);
      if (!flips.length) return;
      state.board[row][col] = state.turn;
      for (const [r, c] of flips) state.board[r][c] = state.turn;
      ctx.playSound("click");
      advanceTurn();
    }

    function advanceTurn() {
      const opp = state.turn === "B" ? "W" : "B";
      const oppMoves = legalMoves(opp);
      const myMoves = legalMoves(state.turn);
      if (oppMoves.length) {
        state.turn = opp;
        ctx.setStatus(`${opp === "B" ? "Black" : "White"}'s turn`);
      } else if (myMoves.length) {
        ctx.setStatus(`${opp === "B" ? "Black" : "White"} has no moves — skipped!`);
        // turn stays with current player
      } else {
        endGame();
        return;
      }
      render();
    }

    function endGame() {
      state.over = true;
      let bCount = 0, wCount = 0;
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++) {
          if (state.board[r][c] === "B") bCount++;
          if (state.board[r][c] === "W") wCount++;
        }
      let title, subtitle;
      if (bCount === wCount) {
        title = "Draw!";
        subtitle = `${bCount} - ${wCount}`;
        ctx.setStatus("It's a draw!");
      } else {
        const winner = bCount > wCount ? "Black" : "White";
        title = `${winner} Wins!`;
        subtitle = `${bCount} - ${wCount}`;
        ctx.setStatus(`${winner} wins! ${bCount} - ${wCount}`);
      }
      ctx.playSound("success");
      render();
      setTimeout(() => {
        ctx.showOverlay({
          title,
          subtitle,
          buttonText: "Play Again",
          onButton: reset,
        });
      }, 300);
    }

    function render() {
      let bCount = 0, wCount = 0;
      const moves = state.over ? [] : legalMoves(state.turn);
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = cellEls[r][c];
          cell.innerHTML = "";
          const v = state.board[r][c];
          if (v === "B") bCount++;
          if (v === "W") wCount++;
          if (v) {
            const disc = document.createElement("div");
            disc.style.width = cellSize - 8 + "px";
            disc.style.height = cellSize - 8 + "px";
            disc.style.borderRadius = "50%";
            disc.style.background = v === "B" ? "#181818" : "#f2f2f2";
            disc.style.boxShadow = "0 2px 4px rgba(0,0,0,.5)";
            cell.appendChild(disc);
          } else if (moves.some((m) => m[0] === r && m[1] === c)) {
            const hint = document.createElement("div");
            hint.style.width = "12px";
            hint.style.height = "12px";
            hint.style.borderRadius = "50%";
            hint.style.background = "rgba(255,255,255,.35)";
            cell.appendChild(hint);
          }
        }
      }
      scoreEl.textContent = `Black: ${bCount}  White: ${wCount}`;
    }

    function reset() {
      state.board = [];
      for (let r = 0; r < N; r++) state.board.push(Array(N).fill(null));
      const mid = N / 2;
      state.board[mid - 1][mid - 1] = "W";
      state.board[mid][mid] = "W";
      state.board[mid - 1][mid] = "B";
      state.board[mid][mid - 1] = "B";
      state.turn = "B";
      state.over = false;
      ctx.setStatus("Black's turn");
      render();
    }

    reset();

    return () => {};
  },
});
