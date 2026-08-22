MimiGames.register({
  id: "mahjong-solitaire",
  title: "Mahjong Solitaire",
  emoji: "🀄",
  category: "Puzzle",
  players: "1P",
  howTo: "Click two free matching tiles to remove them. Tiles under others aren't free until uncovered. Clear the board to win.",
  init(root, ctx) {
    const SYMBOLS = [
      "🀄", "🎋", "🌸", "🍁", "🌙", "☀️", "⭐", "🔥",
      "💧", "🌿", "🍀", "🎴", "🐉", "🀇",
    ];
    const COLS = 6;
    const ROWS = 4;

    const state = {
      tiles: [], // {id, symbol, layer, col, row, removed, key(col,row,layer)}
      selected: null,
      matches: 0,
      totalPairs: 0,
      moves: 0,
      startTime: 0,
      over: false,
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "12px";
    wrap.style.width = "100%";

    const statsEl = document.createElement("div");
    statsEl.style.display = "flex";
    statsEl.style.gap = "22px";
    statsEl.style.fontSize = ".9rem";
    statsEl.style.color = "var(--text-dim)";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "10px";
    const shuffleBtn = document.createElement("button");
    shuffleBtn.className = "btn";
    shuffleBtn.textContent = "Shuffle Remaining";
    shuffleBtn.onclick = shuffleRemaining;
    const newBtn = document.createElement("button");
    newBtn.className = "btn primary";
    newBtn.textContent = "New Board";
    newBtn.onclick = newGame;
    controls.appendChild(shuffleBtn);
    controls.appendChild(newBtn);

    const boardWrap = document.createElement("div");
    boardWrap.style.position = "relative";
    boardWrap.style.width = COLS * 48 + 40 + "px";
    boardWrap.style.height = ROWS * 60 + 40 + "px";
    boardWrap.style.margin = "0 auto";

    wrap.appendChild(statsEl);
    wrap.appendChild(controls);
    wrap.appendChild(boardWrap);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Auto-Match Pair",
        run: () => {
          if (state.over) return;
          const free = state.tiles.filter((t) => !t.removed && isFree(t));
          for (let i = 0; i < free.length; i++) {
            for (let j = i + 1; j < free.length; j++) {
              if (free[i].symbol === free[j].symbol) {
                free[i].removed = true;
                free[j].removed = true;
                state.matches++;
                state.moves++;
                state.selected = null;
                render();
                updateStats();
                checkWin();
                return;
              }
            }
          }
        },
      },
      {
        label: "Clear Board",
        run: () => {
          if (state.over) return;
          state.tiles.forEach((t) => (t.removed = true));
          state.matches = state.totalPairs;
          state.selected = null;
          render();
          updateStats();
          checkWin();
        },
      },
    ]);

    function buildLayout() {
      // Layer 0: full grid of ROWS x COLS positions.
      // Layer 1: a smaller offset block of tiles sitting "on top" of a sub-region.
      const positions = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          positions.push({ col: c, row: r, layer: 0 });
        }
      }
      // Top layer: 2 rows x 4 cols placed over the middle, offset by half a tile.
      const topCols = 4;
      const topRows = 2;
      const offsetCol = Math.floor((COLS - topCols) / 2);
      const offsetRow = Math.floor((ROWS - topRows) / 2);
      for (let r = 0; r < topRows; r++) {
        for (let c = 0; c < topCols; c++) {
          positions.push({ col: offsetCol + c + 0.5, row: offsetRow + r + 0.5, layer: 1 });
        }
      }
      return positions;
    }

    function newGame() {
      const positions = buildLayout();
      const count = positions.length;
      const pairCount = Math.ceil(count / 2);
      const symbolPool = [];
      let si = 0;
      while (symbolPool.length < pairCount) {
        symbolPool.push(SYMBOLS[si % SYMBOLS.length]);
        si++;
      }
      let deck = [];
      symbolPool.slice(0, pairCount).forEach((sym) => {
        deck.push(sym, sym);
      });
      deck = deck.slice(0, count);
      // If count is odd (shouldn't be, but guard), pad
      while (deck.length < count) deck.push(symbolPool[0]);
      ctx.shuffle(deck);

      state.tiles = positions.map((p, i) => ({
        uid: i,
        symbol: deck[i],
        layer: p.layer,
        col: p.col,
        row: p.row,
        removed: false,
      }));
      state.selected = null;
      state.matches = 0;
      state.totalPairs = count / 2;
      state.moves = 0;
      state.startTime = Date.now();
      state.over = false;
      ctx.setStatus(`Match all ${state.totalPairs} pairs!`);
      render();
      updateStats();
    }

    function isFree(tile) {
      if (tile.removed) return false;
      // A tile is free if no non-removed tile in a strictly higher layer overlaps its position.
      return !state.tiles.some((t) => {
        if (t.removed || t === tile) return false;
        if (t.layer <= tile.layer) return false;
        const dx = Math.abs(t.col - tile.col);
        const dy = Math.abs(t.row - tile.row);
        return dx < 1 && dy < 1;
      });
    }

    function tileEl(tile) {
      const el = document.createElement("div");
      el.className = "btn";
      const free = isFree(tile);
      el.style.position = "absolute";
      el.style.left = tile.col * 48 + tile.layer * 10 + "px";
      el.style.top = tile.row * 60 + tile.layer * 10 + "px";
      el.style.width = "46px";
      el.style.height = "58px";
      el.style.display = "flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      el.style.fontSize = "1.6rem";
      el.style.padding = "0";
      el.style.zIndex = String(tile.layer * 10 + (free ? 1 : 0));
      el.style.background = free ? "var(--panel-light)" : "#3a3f5c";
      el.style.opacity = free ? "1" : ".55";
      el.style.cursor = free ? "pointer" : "default";
      el.style.boxShadow = free ? "0 3px 8px rgba(0,0,0,.5)" : "none";
      if (tile.uid === (state.selected && state.selected.uid)) {
        el.style.borderColor = "var(--accent2)";
        el.style.boxShadow = "0 0 0 3px var(--accent2)";
      }
      el.textContent = tile.symbol;
      if (free) el.onclick = () => handleClick(tile);
      return el;
    }

    function render() {
      boardWrap.innerHTML = "";
      state.tiles.forEach((tile) => {
        if (tile.removed) return;
        boardWrap.appendChild(tileEl(tile));
      });
    }

    function handleClick(tile) {
      if (state.over) return;
      if (!state.selected) {
        state.selected = tile;
        ctx.playSound("select");
        render();
        return;
      }
      if (state.selected.uid === tile.uid) {
        state.selected = null;
        render();
        return;
      }
      if (state.selected.symbol === tile.symbol) {
        state.moves++;
        tile.removed = true;
        state.selected.removed = true;
        state.selected = null;
        state.matches++;
        ctx.playSound("success");
        ctx.vibrate(15);
        render();
        updateStats();
        checkWin();
      } else {
        ctx.playSound("fail");
        state.selected = tile;
        render();
      }
    }

    function checkWin() {
      if (state.matches >= state.totalPairs && !state.over) {
        state.over = true;
        const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
        const best = ctx.storage.get("bestTime", null);
        let newRecord = false;
        if (best === null || elapsed < best) {
          ctx.storage.set("bestTime", elapsed);
          newRecord = true;
        }
        ctx.setStatus(`Cleared in ${elapsed}s!`);
        ctx.playSound("win");
        ctx.confetti(wrap);
        setTimeout(() => {
          ctx.showOverlay({
            title: "Board Cleared!",
            subtitle: newRecord ? `New best time: ${elapsed}s!` : `Cleared in ${elapsed}s.`,
            buttonText: "Play Again",
            onButton: newGame,
          });
        }, 400);
      }
    }

    function shuffleRemaining() {
      if (state.over) return;
      const remaining = state.tiles.filter((t) => !t.removed);
      const symbols = remaining.map((t) => t.symbol);
      ctx.shuffle(symbols);
      remaining.forEach((t, i) => (t.symbol = symbols[i]));
      state.selected = null;
      ctx.playSound("swoosh");
      render();
    }

    function updateStats() {
      const best = ctx.storage.get("bestTime", null);
      statsEl.textContent = "";
      const pairsEl = document.createElement("div");
      pairsEl.textContent = `Pairs: ${state.matches}/${state.totalPairs}`;
      const movesEl = document.createElement("div");
      movesEl.textContent = `Moves: ${state.moves}`;
      const bestEl = document.createElement("div");
      bestEl.textContent = `Best: ${best === null ? "—" : best + "s"}`;
      statsEl.appendChild(pairsEl);
      statsEl.appendChild(movesEl);
      statsEl.appendChild(bestEl);
    }

    newGame();

    return () => {};
  },
});
