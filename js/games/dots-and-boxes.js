MimiGames.register({
  id: "dots-and-boxes",
  title: "Dots and Boxes",
  emoji: "📦",
  category: "Board",
  players: "2P",
  howTo: "Take turns clicking a line between two dots. Complete the 4th side of a box to claim it and go again. Most boxes wins.",
  init(root, ctx) {
    const DOTS = 5; // 5x5 dots = 4x4 boxes
    const BOXES = DOTS - 1;
    const cellSize = 74;
    const dotR = 7;
    const pad = 20;
    const size = BOXES * cellSize + pad * 2;

    const COLORS = { A: "#ff4757", B: "#00d2ff" };
    const NAMES = { A: "Player 1", B: "Player 2" };

    const state = {
      horiz: [], // horiz[row][col] bool, row 0..DOTS-1, col 0..BOXES-1
      vert: [], // vert[row][col] bool, row 0..BOXES-1, col 0..DOTS-1
      boxOwner: [], // boxOwner[row][col]
      turn: "A",
      scoreA: 0,
      scoreB: 0,
      over: false,
      edgesDrawn: 0,
    };

    const totalEdges = DOTS * BOXES * 2;

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

    const boardEl = document.createElement("div");
    boardEl.style.position = "relative";
    boardEl.style.width = size + "px";
    boardEl.style.height = size + "px";
    boardEl.style.background = "var(--bg-alt)";
    boardEl.style.borderRadius = "10px";
    boardEl.style.border = "1px solid var(--border)";

    wrap.appendChild(controls);
    wrap.appendChild(boardEl);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Force Win",
        run() {
          if (state.over) return;
          for (let r = 0; r < BOXES; r++) {
            for (let c = 0; c < BOXES; c++) {
              if (!state.boxOwner[r][c]) {
                state.boxOwner[r][c] = state.turn;
                if (state.turn === "A") state.scoreA++;
                else state.scoreB++;
              }
            }
          }
          for (let r = 0; r < DOTS; r++) for (let c = 0; c < BOXES; c++) state.horiz[r][c] = true;
          for (let r = 0; r < BOXES; r++) for (let c = 0; c < DOTS; c++) state.vert[r][c] = true;
          state.edgesDrawn = totalEdges;
          render();
          endGame();
        },
      },
      {
        label: "Add Score +3",
        run() {
          if (state.over) return;
          if (state.turn === "A") state.scoreA += 3;
          else state.scoreB += 3;
          render();
        },
      },
    ]);

    // build box fill elements
    const boxEls = [];
    for (let r = 0; r < BOXES; r++) {
      boxEls.push([]);
      for (let c = 0; c < BOXES; c++) {
        const b = document.createElement("div");
        b.style.position = "absolute";
        b.style.left = pad + c * cellSize + 8 + "px";
        b.style.top = pad + r * cellSize + 8 + "px";
        b.style.width = cellSize - 16 + "px";
        b.style.height = cellSize - 16 + "px";
        b.style.display = "flex";
        b.style.alignItems = "center";
        b.style.justifyContent = "center";
        b.style.fontWeight = "700";
        b.style.fontSize = "1.1rem";
        b.style.borderRadius = "4px";
        b.style.transition = "background .15s";
        boardEl.appendChild(b);
        boxEls[r].push(b);
      }
    }

    // build horizontal edge elements: horiz[row][col], row 0..DOTS-1, col 0..BOXES-1
    const horizEls = [];
    for (let r = 0; r < DOTS; r++) {
      horizEls.push([]);
      for (let c = 0; c < BOXES; c++) {
        const e = document.createElement("div");
        e.style.position = "absolute";
        e.style.left = pad + c * cellSize + 10 + "px";
        e.style.top = pad + r * cellSize - 5 + "px";
        e.style.width = cellSize - 20 + "px";
        e.style.height = "10px";
        e.style.borderRadius = "4px";
        e.style.background = "var(--panel-light)";
        e.style.cursor = "pointer";
        e.onclick = () => handleHoriz(r, c);
        boardEl.appendChild(e);
        horizEls[r].push(e);
      }
    }

    // build vertical edge elements: vert[row][col], row 0..BOXES-1, col 0..DOTS-1
    const vertEls = [];
    for (let r = 0; r < BOXES; r++) {
      vertEls.push([]);
      for (let c = 0; c < DOTS; c++) {
        const e = document.createElement("div");
        e.style.position = "absolute";
        e.style.left = pad + c * cellSize - 5 + "px";
        e.style.top = pad + r * cellSize + 10 + "px";
        e.style.width = "10px";
        e.style.height = cellSize - 20 + "px";
        e.style.borderRadius = "4px";
        e.style.background = "var(--panel-light)";
        e.style.cursor = "pointer";
        e.onclick = () => handleVert(r, c);
        boardEl.appendChild(e);
        vertEls[r].push(e);
      }
    }

    // dots on top
    for (let r = 0; r < DOTS; r++) {
      for (let c = 0; c < DOTS; c++) {
        const d = document.createElement("div");
        d.style.position = "absolute";
        d.style.left = pad + c * cellSize - dotR + "px";
        d.style.top = pad + r * cellSize - dotR + "px";
        d.style.width = dotR * 2 + "px";
        d.style.height = dotR * 2 + "px";
        d.style.borderRadius = "50%";
        d.style.background = "var(--text)";
        d.style.pointerEvents = "none";
        boardEl.appendChild(d);
      }
    }

    function boxComplete(r, c) {
      if (r < 0 || r >= BOXES || c < 0 || c >= BOXES) return false;
      return state.horiz[r][c] && state.horiz[r + 1][c] && state.vert[r][c] && state.vert[r][c + 1];
    }

    function checkBoxesAround(affected) {
      let claimed = 0;
      for (const [r, c] of affected) {
        if (r < 0 || r >= BOXES || c < 0 || c >= BOXES) continue;
        if (!state.boxOwner[r][c] && boxComplete(r, c)) {
          state.boxOwner[r][c] = state.turn;
          if (state.turn === "A") state.scoreA++;
          else state.scoreB++;
          claimed++;
        }
      }
      return claimed;
    }

    function handleHoriz(r, c) {
      if (state.over || state.horiz[r][c]) return;
      state.horiz[r][c] = true;
      state.edgesDrawn++;
      const claimed = checkBoxesAround([[r - 1, c], [r, c]]);
      afterMove(claimed);
    }

    function handleVert(r, c) {
      if (state.over || state.vert[r][c]) return;
      state.vert[r][c] = true;
      state.edgesDrawn++;
      const claimed = checkBoxesAround([[r, c - 1], [r, c]]);
      afterMove(claimed);
    }

    function afterMove(claimed) {
      ctx.playSound(claimed ? "success" : "click");
      render();
      if (state.edgesDrawn >= totalEdges) {
        endGame();
        return;
      }
      if (!claimed) {
        state.turn = state.turn === "A" ? "B" : "A";
      }
      ctx.setStatus(`${NAMES[state.turn]}'s turn` + (claimed ? " (goes again!)" : ""));
    }

    function endGame() {
      state.over = true;
      let title, subtitle;
      if (state.scoreA === state.scoreB) {
        title = "Draw!";
        subtitle = `${state.scoreA} - ${state.scoreB}`;
      } else {
        const winner = state.scoreA > state.scoreB ? "A" : "B";
        title = `${NAMES[winner]} Wins!`;
        subtitle = `${state.scoreA} - ${state.scoreB}`;
      }
      ctx.playSound("success");
      ctx.setStatus(title);
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
      for (let r = 0; r < DOTS; r++) {
        for (let c = 0; c < BOXES; c++) {
          horizEls[r][c].style.background = state.horiz[r][c] ? "var(--text)" : "var(--panel-light)";
        }
      }
      for (let r = 0; r < BOXES; r++) {
        for (let c = 0; c < DOTS; c++) {
          vertEls[r][c].style.background = state.vert[r][c] ? "var(--text)" : "var(--panel-light)";
        }
      }
      for (let r = 0; r < BOXES; r++) {
        for (let c = 0; c < BOXES; c++) {
          const owner = state.boxOwner[r][c];
          const b = boxEls[r][c];
          if (owner) {
            b.style.background = COLORS[owner] + "33";
            b.style.color = COLORS[owner];
            b.textContent = owner;
          } else {
            b.style.background = "transparent";
            b.textContent = "";
          }
        }
      }
      scoreEl.textContent = `${NAMES.A}: ${state.scoreA}   ${NAMES.B}: ${state.scoreB}`;
    }

    function reset() {
      state.horiz = [];
      for (let r = 0; r < DOTS; r++) state.horiz.push(Array(BOXES).fill(false));
      state.vert = [];
      for (let r = 0; r < BOXES; r++) state.vert.push(Array(DOTS).fill(false));
      state.boxOwner = [];
      for (let r = 0; r < BOXES; r++) state.boxOwner.push(Array(BOXES).fill(null));
      state.turn = "A";
      state.scoreA = 0;
      state.scoreB = 0;
      state.over = false;
      state.edgesDrawn = 0;
      ctx.setStatus(`${NAMES.A}'s turn`);
      render();
    }

    reset();

    return () => {};
  },
});
