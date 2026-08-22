MimiGames.register({
  id: "lights-out",
  title: "Lights Out",
  emoji: "💡",
  category: "Puzzle",
  players: "1P",
  howTo: "Click a light to toggle it and its neighbors. Turn every light off to win.",
  init(root, ctx) {
    const N = 5;

    const state = {
      lights: [],
      moves: 0,
      over: false,
      history: [],
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
    newBtn.textContent = "New Puzzle";
    newBtn.onclick = newGame;

    const boardEl = document.createElement("div");
    boardEl.className = "cell-grid";
    boardEl.style.gridTemplateColumns = `repeat(${N}, 60px)`;
    boardEl.style.gridTemplateRows = `repeat(${N}, 60px)`;
    boardEl.style.gap = "5px";

    wrap.appendChild(info);
    wrap.appendChild(newBtn);
    wrap.appendChild(boardEl);
    root.appendChild(wrap);

    const cellEls = [];
    for (let r = 0; r < N; r++) {
      const row = [];
      for (let c = 0; c < N; c++) {
        const b = document.createElement("button");
        b.className = "btn";
        b.style.width = "60px";
        b.style.height = "60px";
        b.style.borderRadius = "10px";
        b.onclick = () => handleClick(r, c);
        boardEl.appendChild(b);
        row.push(b);
      }
      cellEls.push(row);
    }

    function emptyLights() {
      const g = [];
      for (let r = 0; r < N; r++) g.push(new Array(N).fill(false));
      return g;
    }

    function toggleAt(lights, r, c) {
      const spots = [[r, c], [r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
      for (const [rr, cc] of spots) {
        if (rr >= 0 && rr < N && cc >= 0 && cc < N) lights[rr][cc] = !lights[rr][cc];
      }
    }

    function scramble() {
      const lights = emptyLights();
      const steps = 15 + Math.floor(Math.random() * 6);
      for (let i = 0; i < steps; i++) {
        const r = Math.floor(Math.random() * N);
        const c = Math.floor(Math.random() * N);
        toggleAt(lights, r, c);
      }
      return lights;
    }

    function allOff() {
      return state.lights.every((row) => row.every((v) => !v));
    }

    function handleClick(r, c) {
      if (state.over) return;
      toggleAt(state.lights, r, c);
      state.history.push([r, c]);
      state.moves++;
      ctx.playSound("click");
      render();
      if (allOff()) {
        state.over = true;
        ctx.playSound("success");
        setTimeout(() => {
          ctx.showOverlay({
            title: "Lights Out!",
            subtitle: `Solved in ${state.moves} moves.`,
            buttonText: "New Puzzle",
            onButton: newGame,
          });
        }, 200);
      }
    }

    function render() {
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const on = state.lights[r][c];
          const el = cellEls[r][c];
          el.style.background = on ? "var(--accent2)" : "var(--panel-light)";
          el.style.boxShadow = on ? "0 0 14px var(--accent2)" : "none";
        }
      }
      info.textContent = state.over ? `Solved in ${state.moves} moves!` : `Moves: ${state.moves}`;
      ctx.setStatus(info.textContent);
    }

    function newGame() {
      let lights;
      do {
        lights = scramble();
      } while (lights.every((row) => row.every((v) => !v)));
      state.lights = lights;
      state.moves = 0;
      state.over = false;
      state.history = [];
      render();
    }

    newGame();

    ctx.devCheatPanel(root, [
      {
        label: "Auto-Solve",
        run: () => {
          if (state.over) return;
          for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) state.lights[r][c] = false;
          state.over = true;
          ctx.playSound("success");
          render();
          setTimeout(() => {
            ctx.showOverlay({
              title: "Lights Out!",
              subtitle: `Solved in ${state.moves} moves.`,
              buttonText: "New Puzzle",
              onButton: newGame,
            });
          }, 200);
        },
      },
      {
        label: "Undo Last Move",
        run: () => {
          if (state.over || !state.history.length) return;
          const [r, c] = state.history.pop();
          toggleAt(state.lights, r, c);
          state.moves = Math.max(0, state.moves - 1);
          render();
        },
      },
    ]);

    return () => {};
  },
});
