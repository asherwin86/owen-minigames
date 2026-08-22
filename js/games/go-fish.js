MimiGames.register({
  id: "go-fish",
  title: "Go Fish",
  emoji: "🐟",
  category: "Cards",
  players: "1P",
  howTo: "Click a card in your hand to ask the CPU for that rank. Guess right and go again; guess wrong and you draw from the ocean. Collect all 4 of a rank to score a book.",
  init(root, ctx) {
    const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

    const state = {
      playerHand: [],
      cpuHand: [],
      ocean: [],
      playerBooks: [],
      cpuBooks: [],
      turn: "player",
      over: false,
      busy: false,
      revealCpu: false,
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "14px";
    wrap.style.width = "100%";

    const topRow = document.createElement("div");
    topRow.style.display = "flex";
    topRow.style.justifyContent = "space-between";
    topRow.style.width = "100%";
    topRow.style.maxWidth = "560px";
    topRow.style.fontSize = ".85rem";
    topRow.style.color = "var(--text-dim)";

    const cpuInfo = document.createElement("div");
    const oceanInfo = document.createElement("div");
    const playerInfo = document.createElement("div");
    topRow.appendChild(cpuInfo);
    topRow.appendChild(oceanInfo);
    topRow.appendChild(playerInfo);

    const cpuLabel = document.createElement("div");
    cpuLabel.style.color = "var(--text-dim)";
    cpuLabel.style.fontSize = ".85rem";
    cpuLabel.textContent = "CPU hand";
    const cpuRow = document.createElement("div");
    cpuRow.style.display = "flex";
    cpuRow.style.gap = "4px";
    cpuRow.style.minHeight = "84px";

    const booksRow = document.createElement("div");
    booksRow.style.display = "flex";
    booksRow.style.gap = "20px";
    booksRow.style.fontSize = ".9rem";
    booksRow.style.color = "var(--text)";
    const playerBooksEl = document.createElement("div");
    const cpuBooksEl = document.createElement("div");
    booksRow.appendChild(playerBooksEl);
    booksRow.appendChild(cpuBooksEl);

    const newBtn = document.createElement("button");
    newBtn.className = "btn primary";
    newBtn.textContent = "New Game";
    newBtn.onclick = newGame;

    const playerLabel = document.createElement("div");
    playerLabel.style.color = "var(--text-dim)";
    playerLabel.style.fontSize = ".85rem";
    playerLabel.textContent = "Your hand — click a card to ask for its rank";
    const playerRow = document.createElement("div");
    playerRow.style.display = "flex";
    playerRow.style.gap = "6px";
    playerRow.style.flexWrap = "wrap";
    playerRow.style.justifyContent = "center";
    playerRow.style.minHeight = "84px";
    playerRow.style.maxWidth = "700px";

    wrap.appendChild(topRow);
    wrap.appendChild(cpuLabel);
    wrap.appendChild(cpuRow);
    wrap.appendChild(booksRow);
    wrap.appendChild(newBtn);
    wrap.appendChild(playerLabel);
    wrap.appendChild(playerRow);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Force Win",
        run() {
          if (state.over) return;
          const claimed = new Set([...state.playerBooks, ...state.cpuBooks]);
          RANKS.forEach((r) => { if (!claimed.has(r)) state.playerBooks.push(r); });
          render();
          endGame();
        },
      },
      {
        label: "Reveal CPU Hand: Off",
        run(e) {
          state.revealCpu = !state.revealCpu;
          e.target.textContent = `Reveal CPU Hand: ${state.revealCpu ? "On" : "Off"}`;
          render();
        },
      },
    ]);

    function newGame() {
      const deck = ctx.shuffle(ctx.newDeck());
      state.playerHand = deck.splice(0, 7);
      state.cpuHand = deck.splice(0, 7);
      state.ocean = deck;
      state.playerBooks = [];
      state.cpuBooks = [];
      state.turn = "player";
      state.over = false;
      state.busy = false;
      extractBooks("player");
      extractBooks("cpu");
      ctx.setStatus("Your turn — ask for a rank.");
      render();
    }

    function countRank(hand, rank) {
      return hand.filter((c) => c.rank === rank).length;
    }

    function extractBooks(who) {
      const hand = who === "player" ? state.playerHand : state.cpuHand;
      const books = who === "player" ? state.playerBooks : state.cpuBooks;
      RANKS.forEach((r) => {
        if (countRank(hand, r) === 4) {
          for (let i = hand.length - 1; i >= 0; i--) {
            if (hand[i].rank === r) hand.splice(i, 1);
          }
          books.push(r);
        }
      });
    }

    function checkGameOver() {
      const totalBooks = state.playerBooks.length + state.cpuBooks.length;
      if (totalBooks >= 13) return true;
      if (state.ocean.length === 0 && (state.playerHand.length === 0 || state.cpuHand.length === 0)) return true;
      return false;
    }

    function endGame() {
      state.over = true;
      const p = state.playerBooks.length;
      const c = state.cpuBooks.length;
      let title, subtitle;
      if (p > c) {
        title = "You Win!";
        ctx.playSound("success");
        ctx.confetti(wrap);
      } else if (c > p) {
        title = "CPU Wins";
        ctx.playSound("fail");
      } else {
        title = "It's a Tie!";
        ctx.playSound("click");
      }
      subtitle = `Books — You: ${p} · CPU: ${c}`;
      ctx.setStatus(subtitle);
      render();
      setTimeout(() => {
        ctx.showOverlay({
          title,
          subtitle,
          buttonText: "Play Again",
          onButton: newGame,
        });
      }, 400);
    }

    // Player asks CPU for `rank`. Returns true if player goes again.
    function playerAsk(rank) {
      const got = state.cpuHand.filter((c) => c.rank === rank);
      if (got.length > 0) {
        state.cpuHand = state.cpuHand.filter((c) => c.rank !== rank);
        state.playerHand.push(...got);
        ctx.playSound("pop");
        ctx.setStatus(`CPU had ${got.length} ${rank}(s)! Go again.`);
        extractBooks("player");
        render();
        if (checkGameOver()) {
          setTimeout(endGame, 500);
          return false;
        }
        return true;
      } else {
        ctx.playSound("fail");
        ctx.setStatus("Go Fish! Drawing a card...");
        let matched = false;
        if (state.ocean.length > 0) {
          const drawn = state.ocean.pop();
          state.playerHand.push(drawn);
          matched = drawn.rank === rank;
        }
        extractBooks("player");
        render();
        if (checkGameOver()) {
          setTimeout(endGame, 500);
          return false;
        }
        if (matched) {
          ctx.setStatus(`You drew a ${rank}! Go again.`);
          return true;
        }
        return false;
      }
    }

    function playerClickCard(index) {
      if (state.turn !== "player" || state.over || state.busy) return;
      const card = state.playerHand[index];
      const rank = card.rank;
      state.busy = true;
      const goAgain = playerAsk(rank);
      if (state.over) return;
      if (goAgain) {
        state.busy = false;
        render();
      } else {
        state.turn = "cpu";
        render();
        setTimeout(cpuTurn, 800);
      }
    }

    function cpuTurn() {
      if (state.over || state.turn !== "cpu") return;
      if (state.cpuHand.length === 0) {
        // shouldn't normally happen due to checkGameOver, but guard anyway
        state.turn = "player";
        state.busy = false;
        ctx.setStatus("Your turn — ask for a rank.");
        render();
        return;
      }
      const rank = state.cpuHand[Math.floor(Math.random() * state.cpuHand.length)].rank;
      const got = state.playerHand.filter((c) => c.rank === rank);
      if (got.length > 0) {
        state.playerHand = state.playerHand.filter((c) => c.rank !== rank);
        state.cpuHand.push(...got);
        ctx.playSound("hit");
        ctx.setStatus(`CPU asked for ${rank}s and got ${got.length}! CPU goes again.`);
        extractBooks("cpu");
        render();
        if (checkGameOver()) {
          setTimeout(endGame, 500);
          return;
        }
        setTimeout(cpuTurn, 900);
      } else {
        ctx.setStatus(`CPU asked for ${rank}s — Go Fish for CPU.`);
        let matched = false;
        if (state.ocean.length > 0) {
          const drawn = state.ocean.pop();
          state.cpuHand.push(drawn);
          matched = drawn.rank === rank;
        }
        extractBooks("cpu");
        render();
        if (checkGameOver()) {
          setTimeout(endGame, 500);
          return;
        }
        if (matched) {
          setTimeout(cpuTurn, 900);
        } else {
          state.turn = "player";
          state.busy = false;
          ctx.setStatus("Your turn — ask for a rank.");
          render();
        }
      }
    }

    function render() {
      cpuInfo.textContent = `CPU cards: ${state.cpuHand.length}`;
      oceanInfo.textContent = `Ocean: ${state.ocean.length}`;
      playerInfo.textContent = `Your cards: ${state.playerHand.length}`;

      cpuRow.innerHTML = "";
      state.cpuHand.forEach((card) => cpuRow.appendChild(state.revealCpu ? ctx.cardEl(card, {}) : ctx.cardEl({ color: "black" }, { faceDown: true })));

      playerBooksEl.textContent = "Your books: " + (state.playerBooks.length ? state.playerBooks.join(", ") : "none");
      cpuBooksEl.textContent = "CPU books: " + (state.cpuBooks.length ? state.cpuBooks.join(", ") : "none");

      newBtn.disabled = false;

      const disabled = state.turn !== "player" || state.over || state.busy;
      playerRow.innerHTML = "";
      // sort hand by rank for readability
      const sorted = state.playerHand
        .map((c, i) => ({ c, i }))
        .sort((a, b) => RANKS.indexOf(a.c.rank) - RANKS.indexOf(b.c.rank));
      sorted.forEach(({ c, i }) => {
        const el = ctx.cardEl(c, { disabled });
        el.onclick = () => playerClickCard(i);
        playerRow.appendChild(el);
      });
    }

    newGame();

    return () => {};
  },
});
