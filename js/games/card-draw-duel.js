MimiGames.register({
  id: "card-draw-duel",
  title: "Card Draw Duel",
  emoji: "🃏",
  category: "Party",
  players: "1-2P",
  howTo: "Click Draw — each player flips the top card of their own deck. Higher card wins the round (Aces are low). Ties re-draw. Best of 7 rounds wins the match.",
  init(root, ctx) {
    const ROUNDS_TO_WIN = 4;

    const state = {
      p1Deck: [],
      p2Deck: [],
      p1Score: 0,
      p2Score: 0,
      round: 1,
      over: false,
      drawing: false,
    };

    const timers = [];

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "14px";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "10px";
    const restartBtn = document.createElement("button");
    restartBtn.className = "btn";
    restartBtn.textContent = "Restart Match";
    restartBtn.onclick = reset;
    controls.appendChild(restartBtn);

    const scoreRow = document.createElement("div");
    scoreRow.style.display = "flex";
    scoreRow.style.gap = "40px";
    scoreRow.style.fontSize = "1rem";
    scoreRow.style.fontWeight = "600";
    const p1ScoreEl = document.createElement("div");
    p1ScoreEl.textContent = "Player 1: 0";
    const p2ScoreEl = document.createElement("div");
    p2ScoreEl.textContent = "Player 2: 0";
    scoreRow.appendChild(p1ScoreEl);
    scoreRow.appendChild(p2ScoreEl);

    const cardsRow = document.createElement("div");
    cardsRow.style.display = "flex";
    cardsRow.style.gap = "40px";
    cardsRow.style.alignItems = "center";
    cardsRow.style.minHeight = "110px";

    function makeSlot(label) {
      const box = document.createElement("div");
      box.style.display = "flex";
      box.style.flexDirection = "column";
      box.style.alignItems = "center";
      box.style.gap = "8px";
      const title = document.createElement("div");
      title.style.color = "var(--text-dim)";
      title.textContent = label;
      const cardHolder = document.createElement("div");
      cardHolder.style.width = "60px";
      cardHolder.style.height = "84px";
      box.appendChild(title);
      box.appendChild(cardHolder);
      return { box, cardHolder };
    }

    const p1Slot = makeSlot("Player 1");
    const p2Slot = makeSlot("Player 2");
    cardsRow.appendChild(p1Slot.box);
    const vsLabel = document.createElement("div");
    vsLabel.style.fontSize = "1.4rem";
    vsLabel.style.fontWeight = "700";
    vsLabel.style.color = "var(--text-dim)";
    vsLabel.textContent = "VS";
    cardsRow.appendChild(vsLabel);
    cardsRow.appendChild(p2Slot.box);

    const message = document.createElement("div");
    message.style.minHeight = "1.4em";
    message.style.fontWeight = "600";

    const drawBtn = document.createElement("button");
    drawBtn.className = "btn primary";
    drawBtn.textContent = "Draw";
    drawBtn.onclick = drawRound;

    wrap.appendChild(controls);
    wrap.appendChild(scoreRow);
    wrap.appendChild(cardsRow);
    wrap.appendChild(message);
    wrap.appendChild(drawBtn);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Reveal Next Cards",
        run: () => {
          if (state.over || !state.p1Deck.length || !state.p2Deck.length) return;
          const c1 = state.p1Deck[state.p1Deck.length - 1];
          const c2 = state.p2Deck[state.p2Deck.length - 1];
          message.textContent = `Next: P1 ${c1.rank}${c1.suit} vs P2 ${c2.rank}${c2.suit}`;
        },
      },
      {
        label: "Force Win Match",
        run: () => {
          if (state.over) return;
          state.p1Score = ROUNDS_TO_WIN;
          state.over = true;
          renderScores();
          drawBtn.style.display = "none";
          message.textContent = "Player 1 wins the match!";
          ctx.showOverlay({
            title: "Player 1 Wins the Match!",
            subtitle: `Final score: Player 1 ${state.p1Score} - ${state.p2Score} Player 2`,
            buttonText: "Play Again",
            onButton: reset,
          });
        },
      },
    ]);

    function freshSplitDecks() {
      const full = ctx.shuffle(ctx.newDeck());
      return { p1: full.slice(0, 26), p2: full.slice(26) };
    }

    function drawFrom(who) {
      const deckKey = who === "p1" ? "p1Deck" : "p2Deck";
      if (state[deckKey].length === 0) {
        // Reshuffle a fresh 26-card half-deck for this player if exhausted.
        const full = ctx.shuffle(ctx.newDeck());
        state[deckKey] = full.slice(0, 26);
      }
      return state[deckKey].pop();
    }

    function renderScores() {
      p1ScoreEl.textContent = `Player 1: ${state.p1Score}`;
      p2ScoreEl.textContent = `Player 2: ${state.p2Score}`;
    }

    function clearSlot(slot) {
      slot.cardHolder.innerHTML = "";
    }

    function showCard(slot, card) {
      clearSlot(slot);
      slot.cardHolder.appendChild(ctx.cardEl(card, {}));
    }

    function drawRound() {
      if (state.drawing || state.over) return;
      state.drawing = true;
      drawBtn.disabled = true;
      message.textContent = "";

      const c1 = drawFrom("p1");
      const c2 = drawFrom("p2");
      ctx.playSound("pop");
      showCard(p1Slot, c1);
      showCard(p2Slot, c2);

      const t = setTimeout(() => resolveRound(c1, c2), 250);
      timers.push(t);
    }

    function resolveRound(c1, c2) {
      if (c1.value === c2.value) {
        message.textContent = `Tie (${c1.rank} vs ${c2.rank})! Drawing again for round ${state.round}...`;
        ctx.playSound("click");
        const t = setTimeout(() => {
          state.drawing = false;
          drawBtn.disabled = false;
        }, 900);
        timers.push(t);
        return;
      }

      const winner = c1.value > c2.value ? "p1" : "p2";
      if (winner === "p1") state.p1Score++;
      else state.p2Score++;
      renderScores();
      ctx.playSound(winner === "p1" ? "success" : "fail");

      const winnerLabel = winner === "p1" ? "Player 1" : "Player 2";

      if (state.p1Score >= ROUNDS_TO_WIN || state.p2Score >= ROUNDS_TO_WIN) {
        state.over = true;
        message.textContent = `${winnerLabel} wins round ${state.round} (${c1.rank}${c1.suit} vs ${c2.rank}${c2.suit}) and the match!`;
        drawBtn.style.display = "none";
        const matchWinner = state.p1Score > state.p2Score ? "Player 1" : "Player 2";
        const t = setTimeout(() => {
          ctx.showOverlay({
            title: `${matchWinner} Wins the Match!`,
            subtitle: `Final score: Player 1 ${state.p1Score} - ${state.p2Score} Player 2`,
            buttonText: "Play Again",
            onButton: reset,
          });
        }, 500);
        timers.push(t);
        return;
      }

      message.textContent = `${winnerLabel} wins round ${state.round} (${c1.rank}${c1.suit} vs ${c2.rank}${c2.suit}).`;
      state.round++;
      state.drawing = false;
      drawBtn.disabled = false;
    }

    function reset() {
      const decks = freshSplitDecks();
      state.p1Deck = decks.p1;
      state.p2Deck = decks.p2;
      state.p1Score = 0;
      state.p2Score = 0;
      state.round = 1;
      state.over = false;
      state.drawing = false;
      clearSlot(p1Slot);
      clearSlot(p2Slot);
      renderScores();
      message.textContent = "";
      drawBtn.style.display = "inline-block";
      drawBtn.disabled = false;
      ctx.setStatus(`Best of 7 rounds — first to ${ROUNDS_TO_WIN} wins. Aces are low.`);
    }

    reset();

    return () => {
      timers.forEach((t) => {
        clearInterval(t);
        clearTimeout(t);
      });
    };
  },
});
