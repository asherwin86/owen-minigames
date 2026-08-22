MimiGames.register({
  id: "maze-runner",
  title: "Maze Runner",
  emoji: "🌀",
  category: "Puzzle",
  players: "1P",
  howTo: "Move with arrow keys/WASD or the on-screen buttons. Get from the top-left start to the bottom-right goal.",
  init(root, ctx) {
    const N = 15;
    const CELL = 19;

    const state = {
      cells: [],
      player: { r: 0, c: 0 },
      goal: { r: N - 1, c: N - 1 },
      moves: 0,
      startTime: 0,
      elapsed: 0,
      over: false,
      timerId: null,
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "8px";

    const info = document.createElement("div");
    info.style.fontWeight = "700";

    const newBtn = document.createElement("button");
    newBtn.className = "btn primary";
    newBtn.textContent = "New Maze";
    newBtn.onclick = newMaze;

    const boardEl = document.createElement("div");
    boardEl.style.display = "grid";
    boardEl.style.gridTemplateColumns = `repeat(${N}, ${CELL}px)`;
    boardEl.style.gridTemplateRows = `repeat(${N}, ${CELL}px)`;
    boardEl.style.background = "var(--bg-alt)";

    const padWrap = document.createElement("div");
    padWrap.style.display = "grid";
    padWrap.style.gridTemplateColumns = "repeat(3, 36px)";
    padWrap.style.gridTemplateRows = "repeat(3, 36px)";
    padWrap.style.gap = "4px";

    function padBtn(label, gridArea, dr, dc) {
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = label;
      b.style.gridArea = gridArea;
      b.onclick = () => attemptMove(dr, dc);
      return b;
    }
    padWrap.appendChild(padBtn("▲", "1 / 2 / 2 / 3", -1, 0));
    padWrap.appendChild(padBtn("◀", "2 / 1 / 3 / 2", 0, -1));
    padWrap.appendChild(padBtn("▼", "2 / 2 / 3 / 3", 1, 0));
    padWrap.appendChild(padBtn("▶", "2 / 3 / 3 / 4", 0, 1));

    wrap.appendChild(info);
    wrap.appendChild(newBtn);
    wrap.appendChild(boardEl);
    wrap.appendChild(padWrap);
    root.appendChild(wrap);

    function bfsPath() {
      const startKey = `${state.player.r},${state.player.c}`;
      const goalKey = `${state.goal.r},${state.goal.c}`;
      const queue = [startKey];
      const prev = { [startKey]: null };
      while (queue.length) {
        const key = queue.shift();
        if (key === goalKey) break;
        const [r, c] = key.split(",").map(Number);
        const cell = state.cells[r][c];
        const neighbors = [];
        if (!cell.top) neighbors.push([r - 1, c]);
        if (!cell.bottom) neighbors.push([r + 1, c]);
        if (!cell.left) neighbors.push([r, c - 1]);
        if (!cell.right) neighbors.push([r, c + 1]);
        for (const [nr, nc] of neighbors) {
          const nkey = `${nr},${nc}`;
          if (!(nkey in prev)) {
            prev[nkey] = key;
            queue.push(nkey);
          }
        }
      }
      if (!(goalKey in prev)) return [];
      const path = [];
      let cur = goalKey;
      while (cur) {
        const [r, c] = cur.split(",").map(Number);
        path.push([r, c]);
        cur = prev[cur];
      }
      return path.reverse();
    }

    ctx.devCheatPanel(root, [
      {
        label: "Reveal Path",
        run: () => {
          if (state.over) return;
          const path = bfsPath();
          path.forEach(([r, c]) => { cellEls[r][c].style.background = "rgba(0,210,255,0.35)"; });
          setTimeout(() => { if (!state.over) render(); }, 1500);
        },
      },
      {
        label: "Teleport to Goal",
        run: () => {
          if (state.over) return;
          state.player = { r: state.goal.r, c: state.goal.c };
          state.moves++;
          render();
          finishMaze();
        },
      },
    ]);

    const cellEls = [];
    for (let r = 0; r < N; r++) {
      const row = [];
      for (let c = 0; c < N; c++) {
        const el = document.createElement("div");
        el.style.width = CELL + "px";
        el.style.height = CELL + "px";
        el.style.boxSizing = "border-box";
        el.style.display = "flex";
        el.style.alignItems = "center";
        el.style.justifyContent = "center";
        el.style.fontSize = "13px";
        boardEl.appendChild(el);
        row.push(el);
      }
      cellEls.push(row);
    }

    function generateMaze() {
      const cells = [];
      for (let r = 0; r < N; r++) {
        const row = [];
        for (let c = 0; c < N; c++) row.push({ top: true, right: true, bottom: true, left: true, visited: false });
        cells.push(row);
      }
      const stack = [[0, 0]];
      cells[0][0].visited = true;
      while (stack.length) {
        const [r, c] = stack[stack.length - 1];
        const neighbors = [];
        if (r > 0 && !cells[r - 1][c].visited) neighbors.push([r - 1, c, "top"]);
        if (r < N - 1 && !cells[r + 1][c].visited) neighbors.push([r + 1, c, "bottom"]);
        if (c > 0 && !cells[r][c - 1].visited) neighbors.push([r, c - 1, "left"]);
        if (c < N - 1 && !cells[r][c + 1].visited) neighbors.push([r, c + 1, "right"]);
        if (neighbors.length === 0) {
          stack.pop();
          continue;
        }
        const [nr, nc, dir] = ctx.shuffle(neighbors)[0];
        if (dir === "top") { cells[r][c].top = false; cells[nr][nc].bottom = false; }
        else if (dir === "bottom") { cells[r][c].bottom = false; cells[nr][nc].top = false; }
        else if (dir === "left") { cells[r][c].left = false; cells[nr][nc].right = false; }
        else if (dir === "right") { cells[r][c].right = false; cells[nr][nc].left = false; }
        cells[nr][nc].visited = true;
        stack.push([nr, nc]);
      }
      return cells;
    }

    function attemptMove(dr, dc) {
      if (state.over) return;
      const { r, c } = state.player;
      const cell = state.cells[r][c];
      if (dr === -1 && cell.top) return;
      if (dr === 1 && cell.bottom) return;
      if (dc === -1 && cell.left) return;
      if (dc === 1 && cell.right) return;
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= N || nc < 0 || nc >= N) return;
      state.player = { r: nr, c: nc };
      state.moves++;
      ctx.playSound("click");
      render();
      if (nr === state.goal.r && nc === state.goal.c) {
        finishMaze();
      }
    }

    function finishMaze() {
      state.over = true;
      stopTimer();
      ctx.playSound("success");
      setTimeout(() => {
        ctx.showOverlay({
          title: "You made it!",
          subtitle: `Time: ${formatTime(state.elapsed)}  •  Moves: ${state.moves}`,
          buttonText: "New Maze",
          onButton: newMaze,
        });
      }, 200);
    }

    function formatTime(sec) {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m}:${String(s).padStart(2, "0")}`;
    }

    function stopTimer() {
      if (state.timerId !== null) {
        clearInterval(state.timerId);
        state.timerId = null;
      }
    }

    function startTimer() {
      stopTimer();
      state.startTime = Date.now();
      state.elapsed = 0;
      state.timerId = setInterval(() => {
        state.elapsed = Math.floor((Date.now() - state.startTime) / 1000);
        updateInfo();
      }, 1000);
    }

    function updateInfo() {
      const text = `Time: ${formatTime(state.elapsed)}  •  Moves: ${state.moves}`;
      info.textContent = text;
      ctx.setStatus(state.over ? "Solved!" : text);
    }

    function render() {
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = state.cells[r][c];
          const el = cellEls[r][c];
          el.style.borderTop = cell.top ? "2px solid var(--border)" : "2px solid transparent";
          el.style.borderLeft = cell.left ? "2px solid var(--border)" : "2px solid transparent";
          el.style.borderRight = cell.right ? "2px solid var(--border)" : "2px solid transparent";
          el.style.borderBottom = cell.bottom ? "2px solid var(--border)" : "2px solid transparent";
          el.style.background = "transparent";
          el.textContent = "";
        }
      }
      cellEls[state.goal.r][state.goal.c].textContent = "🏁";
      cellEls[state.player.r][state.player.c].textContent = "🧑";
      updateInfo();
    }

    function newMaze() {
      state.cells = generateMaze();
      state.player = { r: 0, c: 0 };
      state.moves = 0;
      state.over = false;
      startTimer();
      render();
    }

    function onKeydown(e) {
      const map = {
        ArrowUp: [-1, 0], w: [-1, 0], W: [-1, 0],
        ArrowDown: [1, 0], s: [1, 0], S: [1, 0],
        ArrowLeft: [0, -1], a: [0, -1], A: [0, -1],
        ArrowRight: [0, 1], d: [0, 1], D: [0, 1],
      };
      const dir = map[e.key];
      if (!dir) return;
      e.preventDefault();
      attemptMove(dir[0], dir[1]);
    }
    document.addEventListener("keydown", onKeydown);

    newMaze();

    return () => {
      document.removeEventListener("keydown", onKeydown);
      stopTimer();
    };
  },
});
