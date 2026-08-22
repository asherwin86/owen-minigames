MimiGames.register({
  id: "peg-solitaire",
  title: "Peg Solitaire",
  emoji: "⚪",
  category: "Puzzle",
  players: "1P",
  howTo: "Click a peg, then click an empty hole two spaces away to jump and capture the peg in between.",
  init(root, ctx) {
    const VALID = [
      [0, 0, 1, 1, 1, 0, 0],
      [0, 0, 1, 1, 1, 0, 0],
      [1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1],
      [0, 0, 1, 1, 1, 0, 0],
      [0, 0, 1, 1, 1, 0, 0],
    ];
    const N = 7;
    const CENTER = { r: 3, c: 3 };

    const state = {
      pegs: [],
      selected: null,
      over: false,
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
    newBtn.textContent = "New Game";
    newBtn.onclick = newGame;

    const boardEl = document.createElement("div");
    boardEl.style.display = "grid";
    boardEl.style.gridTemplateColumns = `repeat(${N}, 44px)`;
    boardEl.style.gridTemplateRows = `repeat(${N}, 44px)`;
    boardEl.style.gap = "3px";

    wrap.appendChild(info);
    wrap.appendChild(newBtn);
    wrap.appendChild(boardEl);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Auto Jump",
        run: () => {
          if (state.over) return;
          const dirs = [[0, 2], [0, -2], [2, 0], [-2, 0]];
          for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
              if (!VALID[r][c] || !state.pegs[r][c]) continue;
              for (const [dr, dc] of dirs) {
                const mr = r + dr / 2, mc = c + dc / 2, tr = r + dr, tc = c + dc;
                if (tr < 0 || tr >= N || tc < 0 || tc >= N) continue;
                if (!VALID[tr][tc] || state.pegs[tr][tc]) continue;
                if (!VALID[mr][mc] || !state.pegs[mr][mc]) continue;
                state.pegs[r][c] = false;
                state.pegs[mr][mc] = false;
                state.pegs[tr][tc] = true;
                state.selected = null;
                ctx.playSound("pop");
                render();
                checkEnd();
                return;
              }
            }
          }
        },
      },
      {
        label: "Win Instantly",
        run: () => {
          if (state.over) return;
          for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) state.pegs[r][c] = false;
          state.pegs[CENTER.r][CENTER.c] = true;
          state.selected = null;
          render();
          checkEnd();
        },
      },
    ]);

    const cellEls = [];
    for (let r = 0; r < N; r++) {
      const row = [];
      for (let c = 0; c < N; c++) {
        const el = document.createElement("div");
        el.style.width = "44px";
        el.style.height = "44px";
        if (VALID[r][c]) {
          el.style.display = "flex";
          el.style.alignItems = "center";
          el.style.justifyContent = "center";
          el.style.borderRadius = "50%";
          el.style.background = "var(--panel-light)";
          el.style.border = "1px solid var(--border)";
          el.style.fontSize = "1.5rem";
          el.style.cursor = "pointer";
          el.onclick = () => handleClick(r, c);
        } else {
          el.style.background = "transparent";
        }
        boardEl.appendChild(el);
        row.push(el);
      }
      cellEls.push(row);
    }

    function newPegs() {
      const pegs = [];
      for (let r = 0; r < N; r++) {
        const row = [];
        for (let c = 0; c < N; c++) {
          row.push(!!VALID[r][c] && !(r === CENTER.r && c === CENTER.c));
        }
        pegs.push(row);
      }
      return pegs;
    }

    function countPegs() {
      let n = 0;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (state.pegs[r][c]) n++;
      return n;
    }

    function hasAnyMoves() {
      const dirs = [[0, 2], [0, -2], [2, 0], [-2, 0]];
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (!VALID[r][c] || !state.pegs[r][c]) continue;
          for (const [dr, dc] of dirs) {
            const mr = r + dr / 2, mc = c + dc / 2, tr = r + dr, tc = c + dc;
            if (tr < 0 || tr >= N || tc < 0 || tc >= N) continue;
            if (!VALID[tr][tc] || state.pegs[tr][tc]) continue;
            if (!VALID[mr][mc] || !state.pegs[mr][mc]) continue;
            return true;
          }
        }
      }
      return false;
    }

    function handleClick(r, c) {
      if (state.over) return;
      if (!VALID[r][c]) return;

      if (state.selected && state.selected.r === r && state.selected.c === c) {
        state.selected = null;
        render();
        return;
      }

      if (state.pegs[r][c]) {
        state.selected = { r, c };
        ctx.playSound("click");
        render();
        return;
      }

      // clicked an empty hole - try to jump if something is selected
      if (state.selected) {
        const sr = state.selected.r, sc = state.selected.c;
        const dr = r - sr, dc = c - sc;
        const validJump =
          ((Math.abs(dr) === 2 && dc === 0) || (Math.abs(dc) === 2 && dr === 0));
        if (validJump) {
          const mr = sr + dr / 2, mc = sc + dc / 2;
          if (VALID[mr][mc] && state.pegs[mr][mc]) {
            state.pegs[sr][sc] = false;
            state.pegs[mr][mc] = false;
            state.pegs[r][c] = true;
            state.selected = null;
            ctx.playSound("pop");
            render();
            checkEnd();
            return;
          }
        }
        ctx.playSound("fail");
        state.selected = null;
        render();
      }
    }

    function checkEnd() {
      if (!hasAnyMoves()) {
        state.over = true;
        const count = countPegs();
        if (count === 1) {
          const centerLeft = state.pegs[CENTER.r][CENTER.c];
          ctx.playSound("success");
          setTimeout(() => {
            ctx.showOverlay({
              title: "Perfect Solve!",
              subtitle: centerLeft
                ? "Just one peg left — and it's dead center! Flawless."
                : "Just one peg left! Amazing work.",
              buttonText: "Play Again",
              onButton: newGame,
            });
          }, 200);
        } else {
          ctx.playSound(count <= 3 ? "success" : "fail");
          setTimeout(() => {
            ctx.showOverlay({
              title: "No More Moves",
              subtitle: `You finished with ${count} pegs remaining.`,
              buttonText: "Play Again",
              onButton: newGame,
            });
          }, 200);
        }
      }
    }

    function render() {
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (!VALID[r][c]) continue;
          const el = cellEls[r][c];
          const isSelected = state.selected && state.selected.r === r && state.selected.c === c;
          el.textContent = state.pegs[r][c] ? "⚪" : "";
          el.style.outline = isSelected ? "3px solid var(--accent2)" : "none";
          el.style.background = state.pegs[r][c] ? "var(--panel-light)" : "var(--bg-alt)";
        }
      }
      info.textContent = state.over ? "Game over" : `Pegs remaining: ${countPegs()}`;
      ctx.setStatus(info.textContent);
    }

    function newGame() {
      state.pegs = newPegs();
      state.selected = null;
      state.over = false;
      render();
    }

    newGame();

    return () => {};
  },
});
