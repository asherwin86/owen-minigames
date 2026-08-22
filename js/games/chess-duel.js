MimiGames.register({
  id: "chess-duel",
  title: "Chess Duel",
  emoji: "♟️",
  category: "Board",
  players: "2P",
  howTo: "Click a piece then a highlighted square to move. Simplified rules: no check/checkmate, castling, or en passant — capture the enemy king to win. Pawns auto-promote to queens.",
  init(root, ctx) {
    const N = 8;
    const GLYPHS = {
      w: { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙" },
      b: { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟" },
    };

    const state = {
      board: [],
      turn: "w",
      over: false,
      selected: null,
      legalDests: [],
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

    const cellSize = 54;
    const boardEl = document.createElement("div");
    boardEl.style.display = "grid";
    boardEl.style.gridTemplateColumns = `repeat(${N}, ${cellSize}px)`;
    boardEl.style.gridTemplateRows = `repeat(${N}, ${cellSize}px)`;
    boardEl.style.border = "3px solid var(--border)";
    boardEl.style.borderRadius = "8px";
    boardEl.style.overflow = "hidden";

    wrap.appendChild(controls);
    wrap.appendChild(boardEl);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Force Win",
        run() {
          if (state.over) return;
          const winner = state.turn;
          const winnerName = winner === "w" ? "White" : "Black";
          for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
              const p = state.board[r][c];
              if (p && p.type === "K" && p.color !== winner) state.board[r][c] = null;
            }
          }
          state.over = true;
          ctx.playSound("success");
          ctx.setStatus(`${winnerName} wins by capturing the king!`);
          render();
          setTimeout(() => {
            ctx.showOverlay({
              title: `${winnerName} Wins!`,
              subtitle: "Captured the enemy king.",
              buttonText: "Play Again",
              onButton: reset,
            });
          }, 300);
        },
      },
      {
        label: "Queen My Pawns",
        run() {
          for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
              const p = state.board[r][c];
              if (p && p.color === state.turn && p.type === "P") p.type = "Q";
            }
          }
          render();
        },
      },
    ]);

    const cellEls = [];
    for (let r = 0; r < N; r++) {
      cellEls.push([]);
      for (let c = 0; c < N; c++) {
        const cell = document.createElement("div");
        cell.style.width = cellSize + "px";
        cell.style.height = cellSize + "px";
        cell.style.display = "flex";
        cell.style.alignItems = "center";
        cell.style.justifyContent = "center";
        cell.style.position = "relative";
        cell.style.cursor = "pointer";
        cell.style.fontSize = "2.1rem";
        cell.style.userSelect = "none";
        cell.onclick = () => onCellClick(r, c);
        boardEl.appendChild(cell);
        cellEls[r].push(cell);
      }
    }

    function inBounds(r, c) {
      return r >= 0 && r < N && c >= 0 && c < N;
    }

    function isDark(r, c) {
      return (r + c) % 2 === 1;
    }

    const SLIDE_DIRS = {
      B: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
      R: [[-1, 0], [1, 0], [0, -1], [0, 1]],
      Q: [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]],
    };
    const KNIGHT_OFFSETS = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1],
    ];
    const KING_OFFSETS = [
      [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1],
    ];

    function pieceMoves(row, col) {
      const p = state.board[row][col];
      if (!p) return [];
      const moves = [];
      if (p.type === "P") {
        const dir = p.color === "w" ? -1 : 1;
        const startRow = p.color === "w" ? 6 : 1;
        const fr = row + dir;
        if (inBounds(fr, col) && !state.board[fr][col]) {
          moves.push({ row: fr, col });
          const fr2 = row + dir * 2;
          if (row === startRow && !state.board[fr2][col]) {
            moves.push({ row: fr2, col });
          }
        }
        for (const dc of [-1, 1]) {
          const cc = col + dc;
          if (inBounds(fr, cc)) {
            const target = state.board[fr][cc];
            if (target && target.color !== p.color) {
              moves.push({ row: fr, col: cc });
            }
          }
        }
      } else if (p.type === "N") {
        for (const [dr, dc] of KNIGHT_OFFSETS) {
          const rr = row + dr, cc = col + dc;
          if (!inBounds(rr, cc)) continue;
          const target = state.board[rr][cc];
          if (!target || target.color !== p.color) moves.push({ row: rr, col: cc });
        }
      } else if (p.type === "K") {
        for (const [dr, dc] of KING_OFFSETS) {
          const rr = row + dr, cc = col + dc;
          if (!inBounds(rr, cc)) continue;
          const target = state.board[rr][cc];
          if (!target || target.color !== p.color) moves.push({ row: rr, col: cc });
        }
      } else {
        const dirs = SLIDE_DIRS[p.type];
        for (const [dr, dc] of dirs) {
          let rr = row + dr, cc = col + dc;
          while (inBounds(rr, cc)) {
            const target = state.board[rr][cc];
            if (!target) {
              moves.push({ row: rr, col: cc });
            } else {
              if (target.color !== p.color) moves.push({ row: rr, col: cc });
              break;
            }
            rr += dr;
            cc += dc;
          }
        }
      }
      return moves;
    }

    function onCellClick(row, col) {
      if (state.over) return;
      if (state.selected) {
        const dest = state.legalDests.find((d) => d.row === row && d.col === col);
        if (dest) {
          doMove(state.selected, dest);
          return;
        }
      }
      const p = state.board[row][col];
      if (p && p.color === state.turn) {
        state.selected = { row, col };
        state.legalDests = pieceMoves(row, col);
        render();
      } else {
        deselect();
      }
    }

    function deselect() {
      state.selected = null;
      state.legalDests = [];
      render();
    }

    function doMove(from, dest) {
      const p = state.board[from.row][from.col];
      const captured = state.board[dest.row][dest.col];
      state.board[from.row][from.col] = null;
      state.board[dest.row][dest.col] = p;

      // auto-promote pawns reaching the far rank
      if (p.type === "P") {
        if ((p.color === "w" && dest.row === 0) || (p.color === "b" && dest.row === N - 1)) {
          p.type = "Q";
        }
      }

      ctx.playSound(captured ? "pop" : "click");
      deselect();

      if (captured && captured.type === "K") {
        state.over = true;
        const winnerName = p.color === "w" ? "White" : "Black";
        ctx.playSound("success");
        ctx.setStatus(`${winnerName} wins by capturing the king!`);
        render();
        setTimeout(() => {
          ctx.showOverlay({
            title: `${winnerName} Wins!`,
            subtitle: "Captured the enemy king.",
            buttonText: "Play Again",
            onButton: reset,
          });
        }, 300);
        return;
      }

      state.turn = state.turn === "w" ? "b" : "w";
      ctx.setStatus(`${state.turn === "w" ? "White" : "Black"}'s turn`);
      render();
    }

    function render() {
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = cellEls[r][c];
          cell.style.background = isDark(r, c) ? "#769656" : "#eeeed2";
          cell.innerHTML = "";
          cell.textContent = "";

          const isSelected = state.selected && state.selected.row === r && state.selected.col === c;
          cell.style.boxShadow = isSelected ? "inset 0 0 0 3px var(--accent2)" : "none";

          const p = state.board[r][c];
          if (p) {
            const glyph = document.createElement("span");
            glyph.textContent = GLYPHS[p.color][p.type];
            glyph.style.color = p.color === "w" ? "#fbfbfb" : "#111";
            glyph.style.textShadow = p.color === "w" ? "0 0 2px #000, 0 0 1px #000" : "0 0 1px #fff";
            glyph.style.pointerEvents = "none";
            cell.appendChild(glyph);
          }

          const isDest = state.legalDests.some((d) => d.row === r && d.col === c);
          if (isDest) {
            const dot = document.createElement("div");
            dot.style.position = "absolute";
            const hasTarget = !!p;
            if (hasTarget) {
              dot.style.width = cellSize - 8 + "px";
              dot.style.height = cellSize - 8 + "px";
              dot.style.borderRadius = "50%";
              dot.style.boxShadow = "inset 0 0 0 4px var(--lose)";
            } else {
              dot.style.width = "14px";
              dot.style.height = "14px";
              dot.style.borderRadius = "50%";
              dot.style.background = "var(--win)";
              dot.style.opacity = "0.85";
            }
            dot.style.pointerEvents = "none";
            cell.appendChild(dot);
          }
        }
      }
    }

    function reset() {
      state.board = [];
      for (let r = 0; r < N; r++) state.board.push(Array(N).fill(null));
      const backRow = ["R", "N", "B", "Q", "K", "B", "N", "R"];
      for (let c = 0; c < N; c++) {
        state.board[0][c] = { type: backRow[c], color: "b" };
        state.board[1][c] = { type: "P", color: "b" };
        state.board[6][c] = { type: "P", color: "w" };
        state.board[7][c] = { type: backRow[c], color: "w" };
      }
      state.turn = "w";
      state.over = false;
      state.selected = null;
      state.legalDests = [];
      ctx.setStatus("White's turn");
      render();
    }

    reset();

    return () => {};
  },
});
