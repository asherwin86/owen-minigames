MimiGames.register({
  id: "crazy-eights",
  title: "Crazy Eights",
  emoji: "8️⃣",
  category: "Cards",
  players: "1P",
  howTo: "Play a card matching the discard's suit or rank. 8s are wild — pick the next suit. No legal card? Draw until you can play or the pile runs out.",
  init(root, ctx) {
    const SUITS = ["♠", "♥", "♦", "♣"];
    const state = {
      playerHand: [],
      cpuHand: [],
      drawPile: [],
      discardPile: [],
      currentSuit: null,
      turn: "player",
      over: false,
      revealCpu: false,
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "16px";
    wrap.style.width = "100%";
    wrap.style.position = "relative";

    const cpuLabel = document.createElement("div");
    cpuLabel.style.color = "var(--text-dim)";
    cpuLabel.style.fontSize = ".85rem";
    const cpuRow = document.createElement("div");
    cpuRow.style.display = "flex";
    cpuRow.style.gap = "4px";
    cpuRow.style.minHeight = "84px";

    const midRow = document.createElement("div");
    midRow.style.display = "flex";
    midRow.style.gap = "24px";
    midRow.style.alignItems = "center";

    const drawPileEl = document.createElement("div");
    drawPileEl.style.width = "60px";
    drawPileEl.style.height = "84px";

    const discardEl = document.createElement("div");
    discardEl.style.width = "60px";
    discardEl.style.height = "84px";

    const suitIndicator = document.createElement("div");
    suitIndicator.style.fontSize = "1.6rem";

    midRow.appendChild(drawPileEl);
    midRow.appendChild(discardEl);
    midRow.appendChild(suitIndicator);

    const actionRow = document.createElement("div");
    actionRow.style.display = "flex";
    actionRow.style.gap = "10px";
    const drawBtn = document.createElement("button");
    drawBtn.className = "btn";
    drawBtn.textContent = "Draw Card";
    drawBtn.onclick = playerDraw;
    const newBtn = document.createElement("button");
    newBtn.className = "btn primary";
    newBtn.textContent = "New Game";
    newBtn.onclick = newGame;
    actionRow.appendChild(drawBtn);
    actionRow.appendChild(newBtn);

    const playerLabel = document.createElement("div");
    playerLabel.style.color = "var(--text-dim)";
    playerLabel.style.fontSize = ".85rem";
    const playerRow = document.createElement("div");
    playerRow.style.display = "flex";
    playerRow.style.gap = "6px";
    playerRow.style.flexWrap = "wrap";
    playerRow.style.justifyContent = "center";
    playerRow.style.minHeight = "84px";

    wrap.appendChild(cpuLabel);
    wrap.appendChild(cpuRow);
    wrap.appendChild(midRow);
    wrap.appendChild(actionRow);
    wrap.appendChild(playerLabel);
    wrap.appendChild(playerRow);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Force Win",
        run() {
          if (state.over) return;
          state.playerHand = [];
          render();
          endGame("player");
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
      const firstDiscard = deck.pop();
      state.discardPile = [firstDiscard];
      state.drawPile = deck;
      state.currentSuit = firstDiscard.suit;
      state.turn = "player";
      state.over = false;
      ctx.setStatus("Your turn — play a card or draw.");
      render();
    }

    function discardTop() {
      return state.discardPile[state.discardPile.length - 1];
    }

    function isPlayable(card) {
      if (card.rank === "8") return true;
      return card.suit === state.currentSuit || card.rank === discardTop().rank;
    }

    function ensureDrawPile() {
      if (state.drawPile.length === 0 && state.discardPile.length > 1) {
        const top = state.discardPile.pop();
        state.drawPile = ctx.shuffle(state.discardPile);
        state.discardPile = [top];
      }
    }

    function pickBestSuit(hand) {
      const counts = { "♠": 0, "♥": 0, "♦": 0, "♣": 0 };
      hand.forEach((c) => {
        if (c.rank !== "8") counts[c.suit]++;
      });
      let best = SUITS[0];
      SUITS.forEach((s) => {
        if (counts[s] > counts[best]) best = s;
      });
      return best;
    }

    function playerClickCard(index) {
      if (state.turn !== "player" || state.over) return;
      const card = state.playerHand[index];
      if (card.rank === "8") {
        showSuitPicker(index);
        return;
      }
      if (!isPlayable(card)) {
        ctx.playSound("fail");
        return;
      }
      state.playerHand.splice(index, 1);
      state.discardPile.push(card);
      state.currentSuit = card.suit;
      ctx.playSound("pop");
      render();
      if (state.playerHand.length === 0) {
        endGame("player");
        return;
      }
      endPlayerTurn();
    }

    function showSuitPicker(index) {
      const picker = document.createElement("div");
      picker.style.position = "absolute";
      picker.style.inset = "0";
      picker.style.background = "rgba(5,6,15,.85)";
      picker.style.display = "flex";
      picker.style.flexDirection = "column";
      picker.style.alignItems = "center";
      picker.style.justifyContent = "center";
      picker.style.gap = "14px";
      picker.style.zIndex = "10";
      picker.style.borderRadius = "16px";

      const label = document.createElement("div");
      label.textContent = "Choose a suit";
      label.style.color = "var(--text)";
      label.style.fontSize = "1rem";
      picker.appendChild(label);

      const btnRow = document.createElement("div");
      btnRow.style.display = "flex";
      btnRow.style.gap = "14px";
      SUITS.forEach((s) => {
        const b = document.createElement("button");
        b.className = "btn primary";
        b.style.fontSize = "1.6rem";
        b.style.width = "56px";
        b.style.height = "56px";
        if (s === "♥" || s === "♦") b.style.color = "#ffd6d6";
        b.textContent = s;
        b.onclick = () => {
          picker.remove();
          executeEightPlay(index, s);
        };
        btnRow.appendChild(b);
      });
      picker.appendChild(btnRow);
      wrap.appendChild(picker);
    }

    function executeEightPlay(index, chosenSuit) {
      const card = state.playerHand.splice(index, 1)[0];
      state.discardPile.push(card);
      state.currentSuit = chosenSuit;
      ctx.playSound("pop");
      render();
      if (state.playerHand.length === 0) {
        endGame("player");
        return;
      }
      endPlayerTurn();
    }

    function playerDraw() {
      if (state.turn !== "player" || state.over) return;
      let drewPlayable = false;
      while (true) {
        ensureDrawPile();
        if (state.drawPile.length === 0) break;
        const c = state.drawPile.pop();
        state.playerHand.push(c);
        if (isPlayable(c)) {
          drewPlayable = true;
          break;
        }
      }
      render();
      const anyPlayable = state.playerHand.some(isPlayable);
      if (!anyPlayable) {
        ctx.setStatus("No playable cards — passing turn.");
        setTimeout(endPlayerTurn, 700);
      } else {
        ctx.setStatus(drewPlayable ? "Drew a playable card!" : "Play a card.");
      }
    }

    function endPlayerTurn() {
      if (state.over) return;
      state.turn = "cpu";
      ctx.setStatus("CPU's turn...");
      render();
      setTimeout(cpuTurn, 700);
    }

    function cpuTurn() {
      if (state.over || state.turn !== "cpu") return;
      let idx = state.cpuHand.findIndex((c) => c.rank !== "8" && isPlayable(c));
      if (idx === -1) idx = state.cpuHand.findIndex((c) => c.rank === "8");

      if (idx === -1) {
        while (true) {
          ensureDrawPile();
          if (state.drawPile.length === 0) break;
          const c = state.drawPile.pop();
          state.cpuHand.push(c);
          if (isPlayable(c)) break;
        }
        render();
        idx = state.cpuHand.findIndex((c) => isPlayable(c));
        if (idx === -1) {
          ctx.setStatus("CPU passes. Your turn.");
          state.turn = "player";
          render();
          return;
        }
      }

      const card = state.cpuHand.splice(idx, 1)[0];
      state.discardPile.push(card);
      state.currentSuit = card.rank === "8" ? pickBestSuit(state.cpuHand) : card.suit;
      ctx.playSound("pop");
      render();
      if (state.cpuHand.length === 0) {
        endGame("cpu");
        return;
      }
      state.turn = "player";
      ctx.setStatus("Your turn.");
      render();
    }

    function endGame(winner) {
      state.over = true;
      ctx.playSound(winner === "player" ? "success" : "fail");
      ctx.setStatus(winner === "player" ? "You win!" : "CPU wins!");
      render();
      if (winner === "player") ctx.confetti(wrap);
      setTimeout(() => {
        ctx.showOverlay({
          title: winner === "player" ? "You Win!" : "CPU Wins",
          subtitle: winner === "player" ? "You played all your cards!" : "The CPU emptied its hand first.",
          buttonText: "Play Again",
          onButton: newGame,
        });
      }, 400);
    }

    function render() {
      cpuLabel.textContent = `CPU hand (${state.cpuHand.length})`;
      cpuRow.innerHTML = "";
      state.cpuHand.forEach((card) => cpuRow.appendChild(state.revealCpu ? ctx.cardEl(card, {}) : ctx.cardEl({ color: "black" }, { faceDown: true })));

      drawPileEl.innerHTML = "";
      if (state.drawPile.length) drawPileEl.appendChild(ctx.cardEl({ color: "black" }, { faceDown: true }));

      discardEl.innerHTML = "";
      if (state.discardPile.length) discardEl.appendChild(ctx.cardEl(discardTop(), {}));

      suitIndicator.textContent = "Suit: " + (state.currentSuit || "");
      suitIndicator.style.color = state.currentSuit === "♥" || state.currentSuit === "♦" ? "#ff6b6b" : "var(--text)";

      drawBtn.disabled = state.turn !== "player" || state.over;

      playerLabel.textContent = `Your hand (${state.playerHand.length})`;
      playerRow.innerHTML = "";
      state.playerHand.forEach((card, i) => {
        const el = ctx.cardEl(card, { disabled: state.turn !== "player" || state.over });
        el.onclick = () => playerClickCard(i);
        playerRow.appendChild(el);
      });
    }

    newGame();

    return () => {};
  },
});
