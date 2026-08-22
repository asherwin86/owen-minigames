MimiGames.register({
  id: "bingo",
  title: "Bingo",
  emoji: "🔵",
  category: "Party",
  players: "1P",
  howTo: "Click Call Number to draw a number. Matches on your card auto-mark. Complete any row, column, or diagonal to win.",
  init(root, ctx) {
    const COLS = ["B", "I", "N", "G", "O"];
    const RANGES = [[1, 15], [16, 30], [31, 45], [46, 60], [61, 75]];

    const state = {
      card: [], // 5x5 of {num, marked} (center is free)
      called: [], // ordered list of numbers called
      calledSet: new Set(),
      over: false,
      won: false,
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "14px";
    wrap.style.width = "100%";
    wrap.style.maxWidth = "560px";

    const statsEl = document.createElement("div");
    statsEl.style.display = "flex";
    statsEl.style.gap = "18px";
    statsEl.style.fontSize = ".85rem";
    statsEl.style.color = "var(--text-dim)";

    const callDisplay = document.createElement("div");
    callDisplay.style.fontSize = "1.8rem";
    callDisplay.style.fontWeight = "800";
    callDisplay.style.color = "var(--accent2)";
    callDisplay.style.minHeight = "2.2rem";
    callDisplay.textContent = "—";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "10px";
    const callBtn = document.createElement("button");
    callBtn.className = "btn primary";
    callBtn.textContent = "Call Number";
    callBtn.onclick = callNumber;
    const newBtn = document.createElement("button");
    newBtn.className = "btn";
    newBtn.textContent = "New Card";
    newBtn.onclick = newGame;
    controls.appendChild(callBtn);
    controls.appendChild(newBtn);

    const mainRow = document.createElement("div");
    mainRow.style.display = "flex";
    mainRow.style.gap = "18px";
    mainRow.style.flexWrap = "wrap";
    mainRow.style.justifyContent = "center";
    mainRow.style.alignItems = "flex-start";

    const cardWrap = document.createElement("div");
    cardWrap.style.display = "flex";
    cardWrap.style.flexDirection = "column";
    cardWrap.style.alignItems = "center";
    cardWrap.style.gap = "4px";

    const headerRow = document.createElement("div");
    headerRow.style.display = "grid";
    headerRow.style.gridTemplateColumns = "repeat(5, 54px)";
    headerRow.style.gap = "4px";
    COLS.forEach((letter) => {
      const h = document.createElement("div");
      h.textContent = letter;
      h.style.textAlign = "center";
      h.style.fontWeight = "800";
      h.style.color = "var(--accent)";
      h.style.fontSize = "1.1rem";
      headerRow.appendChild(h);
    });

    const gridEl = document.createElement("div");
    gridEl.style.display = "grid";
    gridEl.style.gridTemplateColumns = "repeat(5, 54px)";
    gridEl.style.gridTemplateRows = "repeat(5, 54px)";
    gridEl.style.gap = "4px";

    cardWrap.appendChild(headerRow);
    cardWrap.appendChild(gridEl);

    const historyPanel = document.createElement("div");
    historyPanel.style.display = "flex";
    historyPanel.style.flexDirection = "column";
    historyPanel.style.gap = "6px";
    historyPanel.style.minWidth = "160px";
    const historyLabel = document.createElement("div");
    historyLabel.textContent = "Called Numbers";
    historyLabel.style.fontSize = ".8rem";
    historyLabel.style.color = "var(--text-dim)";
    const historyList = document.createElement("div");
    historyList.style.display = "flex";
    historyList.style.flexWrap = "wrap";
    historyList.style.gap = "4px";
    historyList.style.maxHeight = "270px";
    historyList.style.overflowY = "auto";
    historyList.style.padding = "6px";
    historyList.style.background = "var(--bg-alt)";
    historyList.style.border = "1px solid var(--border)";
    historyList.style.borderRadius = "8px";
    historyPanel.appendChild(historyLabel);
    historyPanel.appendChild(historyList);

    mainRow.appendChild(cardWrap);
    mainRow.appendChild(historyPanel);

    wrap.appendChild(statsEl);
    wrap.appendChild(callDisplay);
    wrap.appendChild(controls);
    wrap.appendChild(mainRow);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Force Win",
        run: () => {
          if (state.over) return;
          state.card[0].forEach((cell) => { cell.marked = true; });
          renderCard();
          checkWin();
        },
      },
      {
        label: "Call 5 Numbers",
        run: () => {
          for (let i = 0; i < 5 && !state.over; i++) callNumber();
        },
      },
    ]);

    function buildCard() {
      const cols = RANGES.map(([lo, hi]) => {
        const pool = [];
        for (let n = lo; n <= hi; n++) pool.push(n);
        ctx.shuffle(pool);
        return pool.slice(0, 5);
      });
      const grid = [];
      for (let r = 0; r < 5; r++) {
        const row = [];
        for (let c = 0; c < 5; c++) {
          const isFree = r === 2 && c === 2;
          row.push({ num: isFree ? null : cols[c][r], marked: isFree });
        }
        grid.push(row);
      }
      return grid;
    }

    function newGame() {
      state.card = buildCard();
      state.called = [];
      state.calledSet = new Set();
      state.over = false;
      state.won = false;
      callDisplay.textContent = "—";
      callBtn.disabled = false;
      ctx.setStatus("Click Call Number to start!");
      renderCard();
      renderHistory();
      updateStats();
    }

    function letterFor(num) {
      for (let i = 0; i < RANGES.length; i++) {
        if (num >= RANGES[i][0] && num <= RANGES[i][1]) return COLS[i];
      }
      return "";
    }

    function callNumber() {
      if (state.over) return;
      if (state.called.length >= 75) return;
      const remaining = [];
      for (let n = 1; n <= 75; n++) if (!state.calledSet.has(n)) remaining.push(n);
      if (remaining.length === 0) return;
      const num = remaining[Math.floor(Math.random() * remaining.length)];
      state.called.push(num);
      state.calledSet.add(num);
      callDisplay.textContent = `${letterFor(num)}-${num}`;
      ctx.playSound("notify");

      let matched = false;
      state.card.forEach((row) => {
        row.forEach((cell) => {
          if (cell.num === num) {
            cell.marked = true;
            matched = true;
          }
        });
      });
      if (matched) {
        ctx.playSound("pop");
        ctx.vibrate(15);
      }

      renderCard();
      renderHistory();
      updateStats();
      checkWin();

      if (state.called.length >= 75 && !state.over) {
        callBtn.disabled = true;
        ctx.setStatus("All numbers called!");
      }
    }

    function checkWin() {
      if (state.over) return;
      const g = state.card;
      let win = false;
      for (let r = 0; r < 5; r++) {
        if (g[r].every((cell) => cell.marked)) win = true;
      }
      for (let c = 0; c < 5; c++) {
        if (g.every((row) => row[c].marked)) win = true;
      }
      if ([0, 1, 2, 3, 4].every((i) => g[i][i].marked)) win = true;
      if ([0, 1, 2, 3, 4].every((i) => g[i][4 - i].marked)) win = true;

      if (win) {
        state.over = true;
        state.won = true;
        callBtn.disabled = true;
        const callsUsed = state.called.length;
        const best = ctx.storage.get("bestCalls", null);
        let newRecord = false;
        if (best === null || callsUsed < best) {
          ctx.storage.set("bestCalls", callsUsed);
          newRecord = true;
        }
        ctx.setStatus(`BINGO! Won in ${callsUsed} calls.`);
        ctx.playSound("win");
        ctx.confetti(wrap);
        setTimeout(() => {
          ctx.showOverlay({
            title: "BINGO!",
            subtitle: newRecord
              ? `New best: won in ${callsUsed} calls!`
              : `You won in ${callsUsed} calls.`,
            buttonText: "New Card",
            onButton: newGame,
          });
        }, 350);
      }
    }

    function renderCard() {
      gridEl.innerHTML = "";
      state.card.forEach((row) => {
        row.forEach((cell) => {
          const el = document.createElement("div");
          el.style.width = "54px";
          el.style.height = "54px";
          el.style.display = "flex";
          el.style.alignItems = "center";
          el.style.justifyContent = "center";
          el.style.borderRadius = "8px";
          el.style.fontWeight = "700";
          el.style.fontSize = cell.num === null ? "1.3rem" : "1rem";
          el.style.border = "1px solid var(--border)";
          el.style.background = cell.marked ? "var(--win)" : "var(--panel-light)";
          el.style.color = cell.marked ? "#06210f" : "var(--text)";
          el.textContent = cell.num === null ? "★" : String(cell.num);
          gridEl.appendChild(el);
        });
      });
    }

    function renderHistory() {
      historyList.innerHTML = "";
      if (state.called.length === 0) {
        const empty = document.createElement("div");
        empty.style.color = "var(--text-dim)";
        empty.style.fontSize = ".78rem";
        empty.textContent = "No numbers called yet.";
        historyList.appendChild(empty);
        return;
      }
      state.called.forEach((num) => {
        const chip = document.createElement("div");
        chip.textContent = `${letterFor(num)}${num}`;
        chip.style.fontSize = ".72rem";
        chip.style.padding = "3px 6px";
        chip.style.borderRadius = "6px";
        chip.style.background = "var(--panel-light)";
        chip.style.border = "1px solid var(--border)";
        historyList.appendChild(chip);
      });
      historyList.scrollTop = historyList.scrollHeight;
    }

    function updateStats() {
      const best = ctx.storage.get("bestCalls", null);
      statsEl.textContent = "";
      const calledEl = document.createElement("div");
      calledEl.textContent = `Called: ${state.called.length}/75`;
      const bestEl = document.createElement("div");
      bestEl.textContent = `Best: ${best === null ? "—" : best + " calls"}`;
      statsEl.appendChild(calledEl);
      statsEl.appendChild(bestEl);
    }

    newGame();

    return () => {};
  },
});
