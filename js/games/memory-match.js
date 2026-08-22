MimiGames.register({
  id: "memory-match",
  title: "Memory Match",
  emoji: "🧠",
  category: "Cards",
  players: "1P",
  howTo: "Click two cards to flip them. Matching ranks stay face up. Find all 8 pairs in as few moves as possible.",
  init(root, ctx) {
    const state = {
      cards: [], // {card, faceUp, matched}
      flipped: [], // indices
      moves: 0,
      matchedPairs: 0,
      busy: false,
      over: false,
      startTime: 0,
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "16px";

    const statsEl = document.createElement("div");
    statsEl.style.display = "flex";
    statsEl.style.gap = "24px";
    statsEl.style.fontSize = ".9rem";
    statsEl.style.color = "var(--text-dim)";

    const gridEl = document.createElement("div");
    gridEl.className = "cell-grid";
    gridEl.style.gridTemplateColumns = "repeat(4, 60px)";
    gridEl.style.gridTemplateRows = "repeat(4, 84px)";
    gridEl.style.gap = "8px";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "10px";
    const newBtn = document.createElement("button");
    newBtn.className = "btn primary";
    newBtn.textContent = "New Game";
    newBtn.onclick = newGame;
    controls.appendChild(newBtn);

    wrap.appendChild(statsEl);
    wrap.appendChild(gridEl);
    wrap.appendChild(controls);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Auto-Match Pair",
        run: () => {
          if (state.over || state.busy) return;
          const unmatched = state.cards.map((c, i) => i).filter((i) => !state.cards[i].matched);
          for (let i = 0; i < unmatched.length; i++) {
            for (let j = i + 1; j < unmatched.length; j++) {
              const a = unmatched[i], b = unmatched[j];
              if (state.cards[a].card.rank === state.cards[b].card.rank) {
                state.cards[a].faceUp = true;
                state.cards[a].matched = true;
                state.cards[b].faceUp = true;
                state.cards[b].matched = true;
                state.matchedPairs++;
                state.moves++;
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
        label: "Peek All Cards",
        run: () => {
          if (state.over) return;
          const hidden = state.cards.filter((c) => !c.faceUp && !c.matched);
          hidden.forEach((c) => { c.faceUp = true; });
          render();
          setTimeout(() => {
            if (state.over) return;
            hidden.forEach((c) => { if (!c.matched) c.faceUp = false; });
            render();
          }, 1200);
        },
      },
    ]);

    let timer = null;

    function buildDeck() {
      const ranks = ["A", "2", "3", "4", "5", "6", "7", "8"];
      const deck = ctx.newDeck();
      const cards = [];
      ranks.forEach((r) => {
        const matches = deck.filter((c) => c.rank === r).slice(0, 2);
        cards.push(...matches);
      });
      return ctx.shuffle(cards);
    }

    function newGame() {
      const deck = buildDeck();
      state.cards = deck.map((card) => ({ card, faceUp: false, matched: false }));
      state.flipped = [];
      state.moves = 0;
      state.matchedPairs = 0;
      state.busy = false;
      state.over = false;
      state.startTime = Date.now();
      ctx.setStatus("Find all 8 pairs!");
      if (timer) clearInterval(timer);
      timer = setInterval(updateStats, 500);
      render();
      updateStats();
    }

    function updateStats() {
      const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
      const best = ctx.storage.get("bestMoves", null);
      statsEl.textContent = "";
      const movesEl = document.createElement("div");
      movesEl.textContent = `Moves: ${state.moves}`;
      const timeEl = document.createElement("div");
      timeEl.textContent = `Time: ${elapsed}s`;
      const bestEl = document.createElement("div");
      bestEl.textContent = `Best: ${best === null ? "—" : best + " moves"}`;
      statsEl.appendChild(movesEl);
      statsEl.appendChild(timeEl);
      statsEl.appendChild(bestEl);
    }

    function flip(i) {
      if (state.over || state.busy) return;
      const entry = state.cards[i];
      if (entry.faceUp || entry.matched) return;
      if (state.flipped.length >= 2) return;

      entry.faceUp = true;
      state.flipped.push(i);
      ctx.playSound("pop");
      render();

      if (state.flipped.length === 2) {
        state.moves++;
        state.busy = true;
        const [a, b] = state.flipped;
        const match = state.cards[a].card.rank === state.cards[b].card.rank;
        setTimeout(() => {
          if (match) {
            state.cards[a].matched = true;
            state.cards[b].matched = true;
            state.matchedPairs++;
            ctx.playSound("success");
            ctx.vibrate(15);
          } else {
            state.cards[a].faceUp = false;
            state.cards[b].faceUp = false;
            ctx.playSound("fail");
          }
          state.flipped = [];
          state.busy = false;
          render();
          updateStats();
          checkWin();
        }, 700);
      }
    }

    function checkWin() {
      if (state.matchedPairs === 8 && !state.over) {
        state.over = true;
        if (timer) clearInterval(timer);
        const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
        const best = ctx.storage.get("bestMoves", null);
        let newRecord = false;
        if (best === null || state.moves < best) {
          ctx.storage.set("bestMoves", state.moves);
          newRecord = true;
        }
        ctx.setStatus(`Solved in ${state.moves} moves, ${elapsed}s!`);
        ctx.playSound("success");
        ctx.confetti(wrap);
        setTimeout(() => {
          ctx.showOverlay({
            title: "All Matched!",
            subtitle: newRecord
              ? `New best: ${state.moves} moves in ${elapsed}s!`
              : `${state.moves} moves in ${elapsed}s.`,
            buttonText: "Play Again",
            onButton: newGame,
          });
        }, 400);
      }
    }

    function render() {
      gridEl.innerHTML = "";
      state.cards.forEach((entry, i) => {
        const el = ctx.cardEl(entry.card, { faceDown: !entry.faceUp && !entry.matched, disabled: entry.matched });
        if (entry.matched) el.style.opacity = ".55";
        el.onclick = () => flip(i);
        gridEl.appendChild(el);
      });
    }

    newGame();

    return () => {
      if (timer) clearInterval(timer);
    };
  },
});
