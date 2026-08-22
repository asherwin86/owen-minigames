MimiGames.register({
  id: "high-low",
  title: "Higher or Lower",
  emoji: "🔀",
  category: "Cards",
  players: "1P",
  howTo: "Guess whether the next card will be higher or lower than the current one. Ties count as a loss. Build the longest streak you can!",
  init(root, ctx) {
    const state = {
      deck: [],
      pointer: 0,
      current: null,
      streak: 0,
      over: false,
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "20px";

    const statsEl = document.createElement("div");
    statsEl.style.display = "flex";
    statsEl.style.gap = "30px";
    statsEl.style.fontSize = ".95rem";
    statsEl.style.color = "var(--text-dim)";

    const cardHolder = document.createElement("div");
    cardHolder.style.transform = "scale(1.8)";
    cardHolder.style.margin = "26px 0";

    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.gap = "14px";
    const lowerBtn = document.createElement("button");
    lowerBtn.className = "btn";
    lowerBtn.textContent = "⬇ Lower";
    lowerBtn.style.fontSize = "1rem";
    lowerBtn.style.padding = "12px 22px";
    lowerBtn.onclick = () => guess("lower");
    const higherBtn = document.createElement("button");
    higherBtn.className = "btn";
    higherBtn.textContent = "⬆ Higher";
    higherBtn.style.fontSize = "1rem";
    higherBtn.style.padding = "12px 22px";
    higherBtn.onclick = () => guess("higher");
    btnRow.appendChild(lowerBtn);
    btnRow.appendChild(higherBtn);

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "10px";
    const newBtn = document.createElement("button");
    newBtn.className = "btn primary";
    newBtn.textContent = "New Game";
    newBtn.onclick = newGame;
    controls.appendChild(newBtn);

    wrap.appendChild(statsEl);
    wrap.appendChild(cardHolder);
    wrap.appendChild(btnRow);
    wrap.appendChild(controls);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Reveal Next Card",
        run() {
          if (state.over || state.pointer + 1 >= state.deck.length) return;
          const next = state.deck[state.pointer + 1];
          ctx.setStatus(`Next card: ${next.rank}${next.suit} (value ${next.value})`);
        },
      },
      {
        label: "Add Streak +5",
        run() {
          if (state.over) return;
          state.streak += 5;
          render();
          ctx.setStatus(`Streak: ${state.streak}`);
        },
      },
    ]);

    function newGame() {
      state.deck = ctx.shuffle(ctx.newDeck());
      state.pointer = 0;
      state.current = state.deck[0];
      state.streak = 0;
      state.over = false;
      ctx.setStatus("Higher or Lower?");
      render();
    }

    function guess(dir) {
      if (state.over) return;
      if (state.pointer + 1 >= state.deck.length) return;
      const next = state.deck[state.pointer + 1];
      const tie = next.value === state.current.value;
      const correct = !tie && (dir === "higher" ? next.value > state.current.value : next.value < state.current.value);
      state.pointer++;
      state.current = next;

      if (correct) {
        state.streak++;
        ctx.playSound("success");
        ctx.vibrate(10);
        if (state.pointer + 1 >= state.deck.length) {
          finish(true, "You cleared the entire deck!");
          return;
        }
        render();
        ctx.setStatus(`Correct! Streak: ${state.streak}`);
      } else {
        ctx.playSound("fail");
        finish(false, tie ? "It was a tie — that counts as a loss." : "Wrong guess!");
      }
    }

    function finish(won, reason) {
      state.over = true;
      const best = ctx.storage.get("bestStreak", 0);
      let newRecord = false;
      if (state.streak > best) {
        ctx.storage.set("bestStreak", state.streak);
        newRecord = true;
      }
      render();
      ctx.setStatus(reason);
      if (won) ctx.confetti(wrap);
      setTimeout(() => {
        ctx.showOverlay({
          title: won ? "Deck Cleared!" : "Streak Ended",
          subtitle: `${reason} Final streak: ${state.streak}${newRecord ? " — new best!" : ""}`,
          buttonText: "New Game",
          onButton: newGame,
        });
      }, won ? 400 : 700);
    }

    function render() {
      const best = ctx.storage.get("bestStreak", 0);
      statsEl.innerHTML = "";
      const streakEl = document.createElement("div");
      streakEl.textContent = `Streak: ${state.streak}`;
      const bestEl = document.createElement("div");
      bestEl.textContent = `Best: ${best}`;
      const cardsLeftEl = document.createElement("div");
      cardsLeftEl.textContent = `Cards left: ${state.deck.length - state.pointer - 1}`;
      statsEl.appendChild(streakEl);
      statsEl.appendChild(bestEl);
      statsEl.appendChild(cardsLeftEl);

      cardHolder.innerHTML = "";
      cardHolder.appendChild(ctx.cardEl(state.current, {}));

      lowerBtn.disabled = state.over;
      higherBtn.disabled = state.over;
    }

    newGame();

    return () => {};
  },
});
