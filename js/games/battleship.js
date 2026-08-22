MimiGames.register({
  id: "battleship",
  title: "Battleship",
  emoji: "🚢",
  category: "Board",
  players: "1P",
  howTo: "Click a cell on the enemy grid to fire. Sink all 5 enemy ships before the CPU sinks yours.",
  init(root, ctx) {
    const SIZE = 10;
    const SHIP_SIZES = [5, 4, 3, 3, 2];
    const cellSize = 28;

    const state = {
      playerBoard: [], // shipIndex | null
      cpuBoard: [], // shipIndex | null
      playerShips: [], // {size, cells, hits, sunk}
      cpuShips: [],
      playerShots: [], // null | 'hit' | 'miss' -- shots the player made on cpuBoard
      cpuShots: [], // null | 'hit' | 'miss' -- shots the cpu made on playerBoard
      cpuCandidates: [],
      over: false,
      awaitingCpu: false,
      revealCpu: false,
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "16px";
    wrap.style.width = "100%";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "10px";
    const resetBtn = document.createElement("button");
    resetBtn.className = "btn";
    resetBtn.textContent = "Restart";
    resetBtn.onclick = reset;
    controls.appendChild(resetBtn);

    const boardsRow = document.createElement("div");
    boardsRow.style.display = "flex";
    boardsRow.style.gap = "28px";
    boardsRow.style.flexWrap = "wrap";
    boardsRow.style.justifyContent = "center";

    const enemyPanel = document.createElement("div");
    enemyPanel.style.display = "flex";
    enemyPanel.style.flexDirection = "column";
    enemyPanel.style.alignItems = "center";
    enemyPanel.style.gap = "8px";
    const enemyLabel = document.createElement("div");
    enemyLabel.textContent = "Enemy Waters — fire here";
    enemyLabel.style.fontSize = ".85rem";
    enemyLabel.style.color = "var(--text-dim)";
    enemyPanel.appendChild(enemyLabel);

    const ownPanel = document.createElement("div");
    ownPanel.style.display = "flex";
    ownPanel.style.flexDirection = "column";
    ownPanel.style.alignItems = "center";
    ownPanel.style.gap = "8px";
    const ownLabel = document.createElement("div");
    ownLabel.textContent = "Your Fleet";
    ownLabel.style.fontSize = ".85rem";
    ownLabel.style.color = "var(--text-dim)";
    ownPanel.appendChild(ownLabel);

    function makeGrid() {
      const g = document.createElement("div");
      g.style.display = "grid";
      g.style.gridTemplateColumns = `repeat(${SIZE}, ${cellSize}px)`;
      g.style.gridTemplateRows = `repeat(${SIZE}, ${cellSize}px)`;
      g.style.gap = "2px";
      g.style.background = "#0a1f3d";
      g.style.padding = "6px";
      g.style.borderRadius = "8px";
      return g;
    }

    const enemyGrid = makeGrid();
    const ownGrid = makeGrid();
    enemyPanel.appendChild(enemyGrid);
    ownPanel.appendChild(ownGrid);

    boardsRow.appendChild(enemyPanel);
    boardsRow.appendChild(ownPanel);

    wrap.appendChild(controls);
    wrap.appendChild(boardsRow);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Reveal Enemy Fleet: Off",
        run(e) {
          state.revealCpu = !state.revealCpu;
          e.target.textContent = `Reveal Enemy Fleet: ${state.revealCpu ? "On" : "Off"}`;
          render();
        },
      },
      {
        label: "Force Win",
        run: () => {
          if (state.over) return;
          state.cpuShips.forEach((s) => { s.hits = s.size; s.sunk = true; });
          endGame(true);
        },
      },
    ]);

    const enemyCellEls = [];
    const ownCellEls = [];
    for (let r = 0; r < SIZE; r++) {
      enemyCellEls.push([]);
      ownCellEls.push([]);
      for (let c = 0; c < SIZE; c++) {
        const ec = document.createElement("div");
        ec.style.width = cellSize + "px";
        ec.style.height = cellSize + "px";
        ec.style.background = "#134876";
        ec.style.borderRadius = "3px";
        ec.style.cursor = "pointer";
        ec.style.display = "flex";
        ec.style.alignItems = "center";
        ec.style.justifyContent = "center";
        ec.style.fontSize = ".95rem";
        ec.onclick = () => playerFire(r, c);
        enemyGrid.appendChild(ec);
        enemyCellEls[r].push(ec);

        const oc = document.createElement("div");
        oc.style.width = cellSize + "px";
        oc.style.height = cellSize + "px";
        oc.style.background = "#134876";
        oc.style.borderRadius = "3px";
        oc.style.display = "flex";
        oc.style.alignItems = "center";
        oc.style.justifyContent = "center";
        oc.style.fontSize = ".95rem";
        ownGrid.appendChild(oc);
        ownCellEls[r].push(oc);
      }
    }

    function inBounds(r, c) {
      return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
    }

    function placeShips() {
      const board = [];
      for (let r = 0; r < SIZE; r++) board.push(Array(SIZE).fill(null));
      const ships = [];
      SHIP_SIZES.forEach((size, shipIdx) => {
        let placed = false;
        let attempts = 0;
        while (!placed && attempts < 500) {
          attempts++;
          const horiz = Math.random() < 0.5;
          let r, c, cells;
          if (horiz) {
            r = Math.floor(Math.random() * SIZE);
            c = Math.floor(Math.random() * (SIZE - size + 1));
            cells = [];
            for (let i = 0; i < size; i++) cells.push([r, c + i]);
          } else {
            r = Math.floor(Math.random() * (SIZE - size + 1));
            c = Math.floor(Math.random() * SIZE);
            cells = [];
            for (let i = 0; i < size; i++) cells.push([r + i, c]);
          }
          if (cells.every(([rr, cc]) => board[rr][cc] === null)) {
            cells.forEach(([rr, cc]) => (board[rr][cc] = shipIdx));
            ships.push({ size, cells, hits: 0, sunk: false });
            placed = true;
          }
        }
      });
      return { board, ships };
    }

    function allSunk(ships) {
      return ships.every((s) => s.sunk);
    }

    function playerFire(row, col) {
      if (state.over || state.awaitingCpu) return;
      if (state.playerShots[row][col]) return;
      const shipIdx = state.cpuBoard[row][col];
      if (shipIdx !== null) {
        state.playerShots[row][col] = "hit";
        const ship = state.cpuShips[shipIdx];
        ship.hits++;
        if (ship.hits >= ship.size) {
          ship.sunk = true;
          ctx.playSound("success");
          ctx.setStatus("You sank a ship!");
        } else {
          ctx.playSound("pop");
          ctx.setStatus("Hit!");
        }
      } else {
        state.playerShots[row][col] = "miss";
        ctx.playSound("click");
        ctx.setStatus("Miss.");
      }
      render();

      if (allSunk(state.cpuShips)) {
        endGame(true);
        return;
      }

      state.awaitingCpu = true;
      setTimeout(cpuFire, 550);
    }

    function cpuFire() {
      if (state.over) return;
      let row, col;
      while (state.cpuCandidates.length) {
        const cand = state.cpuCandidates.shift();
        if (inBounds(cand.r, cand.c) && !state.cpuShots[cand.r][cand.c]) {
          row = cand.r;
          col = cand.c;
          break;
        }
      }
      if (row === undefined) {
        do {
          row = Math.floor(Math.random() * SIZE);
          col = Math.floor(Math.random() * SIZE);
        } while (state.cpuShots[row][col]);
      }

      const shipIdx = state.playerBoard[row][col];
      if (shipIdx !== null) {
        state.cpuShots[row][col] = "hit";
        const ship = state.playerShips[shipIdx];
        ship.hits++;
        if (ship.hits >= ship.size) {
          ship.sunk = true;
        } else {
          const neighbors = [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]];
          for (const [nr, nc] of neighbors) {
            if (inBounds(nr, nc) && !state.cpuShots[nr][nc]) state.cpuCandidates.push({ r: nr, c: nc });
          }
        }
      } else {
        state.cpuShots[row][col] = "miss";
      }

      render();

      if (allSunk(state.playerShips)) {
        endGame(false);
        return;
      }

      state.awaitingCpu = false;
      ctx.setStatus("Your turn — fire!");
    }

    function endGame(playerWon) {
      state.over = true;
      state.awaitingCpu = false;
      ctx.playSound(playerWon ? "success" : "fail");
      ctx.setStatus(playerWon ? "You win! All enemy ships sunk." : "CPU wins! Your fleet is destroyed.");
      render();
      setTimeout(() => {
        ctx.showOverlay({
          title: playerWon ? "Victory!" : "Defeat!",
          subtitle: playerWon ? "You sank the enemy fleet." : "Your fleet was destroyed.",
          buttonText: "Play Again",
          onButton: reset,
        });
      }, 300);
    }

    function render() {
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          // enemy grid: shows only player's shots on cpu board
          const es = state.playerShots[r][c];
          const ec = enemyCellEls[r][c];
          if (es === "hit") {
            ec.style.background = "var(--lose)";
            ec.textContent = "🔥";
          } else if (es === "miss") {
            ec.style.background = "#0a3a5c";
            ec.textContent = "•";
          } else if (state.revealCpu && state.cpuBoard[r][c] !== null) {
            ec.style.background = "#5a3a3a";
            ec.textContent = "👁";
          } else {
            ec.style.background = "#134876";
            ec.textContent = "";
          }

          // own grid: show ships + cpu's shots
          const cs = state.cpuShots[r][c];
          const oc = ownCellEls[r][c];
          const hasShip = state.playerBoard[r][c] !== null;
          if (cs === "hit") {
            oc.style.background = "var(--lose)";
            oc.textContent = "🔥";
          } else if (cs === "miss") {
            oc.style.background = "#0a3a5c";
            oc.textContent = "•";
          } else if (hasShip) {
            oc.style.background = "#3a7a3a";
            oc.textContent = "";
          } else {
            oc.style.background = "#134876";
            oc.textContent = "";
          }
        }
      }
    }

    function reset() {
      const p = placeShips();
      const cpu = placeShips();
      state.playerBoard = p.board;
      state.playerShips = p.ships;
      state.cpuBoard = cpu.board;
      state.cpuShips = cpu.ships;
      state.playerShots = [];
      state.cpuShots = [];
      for (let r = 0; r < SIZE; r++) {
        state.playerShots.push(Array(SIZE).fill(null));
        state.cpuShots.push(Array(SIZE).fill(null));
      }
      state.cpuCandidates = [];
      state.over = false;
      state.awaitingCpu = false;
      ctx.setStatus("Your turn — fire!");
      render();
    }

    reset();

    return () => {};
  },
});
