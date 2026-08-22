MimiGames.register({
  id: "checkers",
  title: "Checkers",
  emoji: "⛀",
  category: "Board",
  players: "2P",
  howTo: "Click a piece then a highlighted square to move. Jump over an adjacent enemy piece to capture it. Reach the far row to king a piece.",
  init(root, ctx) {
    const N = 8;
    const R_DIRS = [[1, -1], [1, 1]];
    const B_DIRS = [[-1, -1], [-1, 1]];
    const ALL_DIRS = [[1, -1], [1, 1], [-1, -1], [-1, 1]];

    const state = {
      board: [], // board[row][col] = {player:'R'|'B', king:bool} | null
      turn: "R",
      over: false,
      selected: null, // {row,col}
      legalDests: [], // [{row,col,capRow,capCol}]
      mustContinue: null, // {row,col}
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

    const cellSize = 48;
    const boardEl = document.createElement("div");
    boardEl.style.display = "grid";
    boardEl.style.gridTemplateColumns = `repeat(${N}, ${cellSize}px)`;
    boardEl.style.gridTemplateRows = `repeat(${N}, ${cellSize}px)`;
    boardEl.style.border = "3px solid var(--border)";
    boardEl.style.borderRadius = "8px";
    boardEl.style.overflow = "hidden";

    const cellEls = [];
    for (let row = 0; row < N; row++) {
      cellEls.push([]);
      for (let col = 0; col < N; col++) {
        const cell = document.createElement("div");
        cell.style.width = cellSize + "px";
        cell.style.height = cellSize + "px";
        cell.style.display = "flex";
        cell.style.alignItems = "center";
        cell.style.justifyContent = "center";
        cell.style.position = "relative";
        cell.style.cursor = "pointer";
        cell.onclick = () => onCellClick(row, col);
        boardEl.appendChild(cell);
        cellEls[row].push(cell);
      }
    }

    wrap.appendChild(controls);
    wrap.appendChild(boardEl);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Force Win",
        run() {
          if (state.over) return;
          const winner = state.turn;
          for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
              const p = state.board[r][c];
              if (p && p.player !== winner) state.board[r][c] = null;
            }
          }
          state.over = true;
          const winnerName = winner === "R" ? "Red" : "Black";
          ctx.playSound("success");
          ctx.setStatus(`${winnerName} wins!`);
          render();
          setTimeout(() => {
            ctx.showOverlay({
              title: `${winnerName} Wins!`,
              subtitle: "Opponent has no pieces or moves left.",
              buttonText: "Play Again",
              onButton: reset,
            });
          }, 300);
        },
      },
      {
        label: "King My Pieces",
        run() {
          for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
              const p = state.board[r][c];
              if (p && p.player === state.turn) p.king = true;
            }
          }
          render();
        },
      },
    ]);

    function inBounds(r, c) {
      return r >= 0 && r < N && c >= 0 && c < N;
    }

    function isDark(row, col) {
      return (row + col) % 2 === 1;
    }

    function pieceMoves(row, col) {
      const p = state.board[row][col];
      const simple = [];
      const capture = [];
      if (!p) return { simple, capture };
      const dirs = p.king ? ALL_DIRS : p.player === "R" ? R_DIRS : B_DIRS;
      for (const [dr, dc] of dirs) {
        const mr = row + dr, mc = col + dc;
        if (!inBounds(mr, mc)) continue;
        const mid = state.board[mr][mc];
        if (!mid) {
          simple.push({ row: mr, col: mc });
        } else if (mid.player !== p.player) {
          const lr = row + 2 * dr, lc = col + 2 * dc;
          if (inBounds(lr, lc) && !state.board[lr][lc]) {
            capture.push({ row: lr, col: lc, capRow: mr, capCol: mc });
          }
        }
      }
      return { simple, capture };
    }

    function countPieces(player) {
      let n = 0;
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++)
          if (state.board[r][c] && state.board[r][c].player === player) n++;
      return n;
    }

    function hasAnyMoves(player) {
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const p = state.board[r][c];
          if (p && p.player === player) {
            const m = pieceMoves(r, c);
            if (m.simple.length || m.capture.length) return true;
          }
        }
      }
      return false;
    }

    function onCellClick(row, col) {
      if (state.over) return;
      // check if clicking a legal destination
      if (state.selected) {
        const dest = state.legalDests.find((d) => d.row === row && d.col === col);
        if (dest) {
          doMove(state.selected, dest);
          return;
        }
      }
      const p = state.board[row][col];
      if (p && p.player === state.turn) {
        if (state.mustContinue && (state.mustContinue.row !== row || state.mustContinue.col !== col)) {
          return; // must finish the forced jump chain
        }
        selectPiece(row, col);
      } else {
        if (!state.mustContinue) deselect();
      }
    }

    function selectPiece(row, col) {
      const moves = pieceMoves(row, col);
      state.selected = { row, col };
      // Captures are not forced overall: this piece may move simply or capture.
      state.legalDests = state.mustContinue ? moves.capture : moves.simple.concat(moves.capture);
      render();
    }

    function deselect() {
      state.selected = null;
      state.legalDests = [];
      render();
    }

    function doMove(from, dest) {
      const p = state.board[from.row][from.col];
      state.board[from.row][from.col] = null;
      const wasCapture = dest.capRow !== undefined;
      if (wasCapture) {
        state.board[dest.capRow][dest.capCol] = null;
      }
      state.board[dest.row][dest.col] = p;
      if (!p.king) {
        if (p.player === "R" && dest.row === N - 1) p.king = true;
        if (p.player === "B" && dest.row === 0) p.king = true;
      }
      ctx.playSound(wasCapture ? "pop" : "click");

      if (wasCapture) {
        const further = pieceMoves(dest.row, dest.col).capture;
        if (further.length) {
          state.mustContinue = { row: dest.row, col: dest.col };
          state.selected = { row: dest.row, col: dest.col };
          state.legalDests = further;
          render();
          return;
        }
      }

      state.mustContinue = null;
      deselect();
      finishTurn();
    }

    function finishTurn() {
      const next = state.turn === "R" ? "B" : "R";
      if (countPieces(next) === 0 || !hasAnyMoves(next)) {
        state.over = true;
        const winnerName = state.turn === "R" ? "Red" : "Black";
        ctx.playSound("success");
        ctx.setStatus(`${winnerName} wins!`);
        setTimeout(() => {
          ctx.showOverlay({
            title: `${winnerName} Wins!`,
            subtitle: "Opponent has no pieces or moves left.",
            buttonText: "Play Again",
            onButton: reset,
          });
        }, 300);
        render();
        return;
      }
      state.turn = next;
      ctx.setStatus(`${state.turn === "R" ? "Red" : "Black"}'s turn`);
      render();
    }

    function render() {
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = cellEls[r][c];
          cell.style.background = isDark(r, c) ? "#4a3728" : "#d8c39d";
          cell.innerHTML = "";

          const isSelected = state.selected && state.selected.row === r && state.selected.col === c;
          if (isSelected) {
            cell.style.boxShadow = "inset 0 0 0 3px var(--accent2)";
          } else {
            cell.style.boxShadow = "none";
          }

          const p = state.board[r][c];
          if (p) {
            const piece = document.createElement("div");
            piece.style.width = cellSize - 10 + "px";
            piece.style.height = cellSize - 10 + "px";
            piece.style.borderRadius = "50%";
            piece.style.display = "flex";
            piece.style.alignItems = "center";
            piece.style.justifyContent = "center";
            piece.style.fontSize = "1.1rem";
            piece.style.fontWeight = "700";
            piece.style.boxShadow = "0 2px 4px rgba(0,0,0,.5)";
            if (p.player === "R") {
              piece.style.background = "var(--accent)";
              piece.style.border = "2px solid #8a1c26";
              piece.style.color = "white";
            } else {
              piece.style.background = "#22242f";
              piece.style.border = "2px solid #555";
              piece.style.color = "#f1d97a";
            }
            piece.textContent = p.king ? "♛" : "";
            cell.appendChild(piece);
          }

          const isDest = state.legalDests.some((d) => d.row === r && d.col === c);
          if (isDest) {
            const dot = document.createElement("div");
            dot.style.position = "absolute";
            dot.style.width = "16px";
            dot.style.height = "16px";
            dot.style.borderRadius = "50%";
            dot.style.background = "var(--win)";
            dot.style.opacity = "0.85";
            cell.appendChild(dot);
          }
        }
      }
    }

    function reset() {
      state.board = [];
      for (let r = 0; r < N; r++) state.board.push(Array(N).fill(null));
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < N; c++) {
          if (isDark(r, c)) state.board[r][c] = { player: "R", king: false };
        }
      }
      for (let r = N - 3; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (isDark(r, c)) state.board[r][c] = { player: "B", king: false };
        }
      }
      state.turn = "R";
      state.over = false;
      state.selected = null;
      state.legalDests = [];
      state.mustContinue = null;
      ctx.setStatus("Red's turn");
      render();
    }

    reset();

    return () => {};
  },
});
