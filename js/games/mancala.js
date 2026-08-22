MimiGames.register({
  id: "mancala",
  title: "Mancala",
  emoji: "🌰",
  category: "Board",
  players: "2P",
  howTo: "Click one of your own pits to sow its stones counter-clockwise. Land your last stone in your store for another turn, or in an empty pit of yours to capture it plus the opposite pit.",
  init(root, ctx) {
    // board index layout: 0-5 = Player 1 pits, 6 = Player 1 store,
    // 7-12 = Player 2 pits, 13 = Player 2 store
    const A_STORE = 6;
    const B_STORE = 13;

    const state = {
      board: [],
      turn: "A",
      over: false,
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "16px";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "10px";
    const resetBtn = document.createElement("button");
    resetBtn.className = "btn";
    resetBtn.textContent = "Restart";
    resetBtn.onclick = reset;
    controls.appendChild(resetBtn);

    const pitSize = 60;
    const storeWidth = 70;

    const boardEl = document.createElement("div");
    boardEl.style.display = "grid";
    boardEl.style.gridTemplateColumns = `${storeWidth}px repeat(6, ${pitSize}px) ${storeWidth}px`;
    boardEl.style.gridTemplateRows = `${pitSize}px ${pitSize}px`;
    boardEl.style.gap = "8px";
    boardEl.style.background = "#5b3a1e";
    boardEl.style.padding = "14px";
    boardEl.style.borderRadius = "16px";

    wrap.appendChild(controls);
    wrap.appendChild(boardEl);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Add 10 to My Store",
        run: () => {
          if (state.over) return;
          const store = state.turn === "A" ? A_STORE : B_STORE;
          state.board[store] += 10;
          render();
        },
      },
      {
        label: "Force Win",
        run: () => {
          if (state.over) return;
          const aPits = [0, 1, 2, 3, 4, 5];
          const bPits = [7, 8, 9, 10, 11, 12];
          const store = state.turn === "A" ? A_STORE : B_STORE;
          const otherStore = state.turn === "A" ? B_STORE : A_STORE;
          const otherPits = state.turn === "A" ? bPits : aPits;
          const myPits = state.turn === "A" ? aPits : bPits;
          state.board[store] += pitsSum(myPits) + pitsSum(otherPits) + 1;
          myPits.forEach((i) => (state.board[i] = 0));
          otherPits.forEach((i) => (state.board[i] = 0));
          checkEnd();
        },
      },
    ]);

    // B store spans both rows, col 1
    const bStoreEl = makeCell(true);
    bStoreEl.style.gridColumn = "1";
    bStoreEl.style.gridRow = "1 / 3";
    boardEl.appendChild(bStoreEl);

    // top row: B12..B7 in columns 2..7
    const topPitEls = {}; // index -> el
    for (let col = 0; col < 6; col++) {
      const idx = 12 - col; // 12,11,10,9,8,7
      const el = makeCell(false);
      el.style.gridColumn = String(col + 2);
      el.style.gridRow = "1";
      el.onclick = () => sow("B", idx);
      boardEl.appendChild(el);
      topPitEls[idx] = el;
    }

    // bottom row: A0..A5 in columns 2..7
    const bottomPitEls = {};
    for (let col = 0; col < 6; col++) {
      const idx = col; // 0..5
      const el = makeCell(false);
      el.style.gridColumn = String(col + 2);
      el.style.gridRow = "2";
      el.onclick = () => sow("A", idx);
      boardEl.appendChild(el);
      bottomPitEls[idx] = el;
    }

    // A store spans both rows, col 8
    const aStoreEl = makeCell(true);
    aStoreEl.style.gridColumn = "8";
    aStoreEl.style.gridRow = "1 / 3";
    boardEl.appendChild(aStoreEl);

    function makeCell(isStore) {
      const el = document.createElement("div");
      el.style.display = "flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      el.style.borderRadius = isStore ? "14px" : "50%";
      el.style.background = isStore ? "#3d2712" : "#8a5a2e";
      el.style.color = "white";
      el.style.fontWeight = "700";
      el.style.fontSize = isStore ? "1.3rem" : "1.1rem";
      el.style.border = "2px solid #2b1a0c";
      if (!isStore) {
        el.style.cursor = "pointer";
      }
      return el;
    }

    function isOwnPit(player, idx) {
      if (player === "A") return idx >= 0 && idx <= 5;
      return idx >= 7 && idx <= 12;
    }

    function sow(player, pitIndex) {
      if (state.over) return;
      if (player !== state.turn) return;
      if (!isOwnPit(player, pitIndex)) return;
      let stones = state.board[pitIndex];
      if (!stones) return;

      state.board[pitIndex] = 0;
      let idx = pitIndex;
      while (stones > 0) {
        idx = (idx + 1) % 14;
        if (player === "A" && idx === B_STORE) continue;
        if (player === "B" && idx === A_STORE) continue;
        state.board[idx]++;
        stones--;
      }

      ctx.playSound("click");

      const ownStore = player === "A" ? A_STORE : B_STORE;
      let extraTurn = idx === ownStore;

      // capture check: landed in own empty pit (now has exactly 1 stone)
      if (!extraTurn && isOwnPit(player, idx) && state.board[idx] === 1) {
        const opposite = 12 - idx;
        if (state.board[opposite] > 0) {
          const captured = state.board[idx] + state.board[opposite];
          state.board[idx] = 0;
          state.board[opposite] = 0;
          state.board[ownStore] += captured;
          ctx.playSound("pop");
        }
      }

      render();

      if (checkEnd()) return;

      if (extraTurn) {
        ctx.setStatus(`${playerName(state.turn)} goes again!`);
      } else {
        state.turn = state.turn === "A" ? "B" : "A";
        ctx.setStatus(`${playerName(state.turn)}'s turn`);
      }
    }

    function pitsSum(range) {
      return range.reduce((s, i) => s + state.board[i], 0);
    }

    function checkEnd() {
      const aPits = [0, 1, 2, 3, 4, 5];
      const bPits = [7, 8, 9, 10, 11, 12];
      const aEmpty = pitsSum(aPits) === 0;
      const bEmpty = pitsSum(bPits) === 0;
      if (!aEmpty && !bEmpty) return false;

      if (!aEmpty) {
        state.board[A_STORE] += pitsSum(aPits);
        aPits.forEach((i) => (state.board[i] = 0));
      }
      if (!bEmpty) {
        state.board[B_STORE] += pitsSum(bPits);
        bPits.forEach((i) => (state.board[i] = 0));
      }
      state.over = true;
      render();

      const aScore = state.board[A_STORE];
      const bScore = state.board[B_STORE];
      let title, subtitle;
      if (aScore === bScore) {
        title = "Draw!";
        subtitle = `${aScore} - ${bScore}`;
      } else {
        const winner = aScore > bScore ? "A" : "B";
        title = `${playerName(winner)} Wins!`;
        subtitle = `${aScore} - ${bScore}`;
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
      return true;
    }

    function playerName(p) {
      return p === "A" ? "Player 1" : "Player 2";
    }

    function render() {
      for (let idx = 0; idx <= 5; idx++) {
        bottomPitEls[idx].textContent = state.board[idx];
        const clickable = !state.over && state.turn === "A" && state.board[idx] > 0;
        bottomPitEls[idx].style.opacity = state.over || state.board[idx] === 0 ? "0.55" : "1";
        bottomPitEls[idx].style.cursor = clickable ? "pointer" : "default";
        bottomPitEls[idx].style.boxShadow = clickable ? "0 0 0 2px var(--accent2)" : "none";
      }
      for (let idx = 7; idx <= 12; idx++) {
        topPitEls[idx].textContent = state.board[idx];
        const clickable = !state.over && state.turn === "B" && state.board[idx] > 0;
        topPitEls[idx].style.opacity = state.over || state.board[idx] === 0 ? "0.55" : "1";
        topPitEls[idx].style.cursor = clickable ? "pointer" : "default";
        topPitEls[idx].style.boxShadow = clickable ? "0 0 0 2px var(--accent2)" : "none";
      }
      aStoreEl.textContent = state.board[A_STORE];
      bStoreEl.textContent = state.board[B_STORE];
    }

    function reset() {
      state.board = [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0];
      state.turn = "A";
      state.over = false;
      ctx.setStatus(`${playerName("A")}'s turn`);
      render();
    }

    reset();

    return () => {};
  },
});
