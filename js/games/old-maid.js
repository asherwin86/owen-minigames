MimiGames.register({
  id: "old-maid",
  title: "Old Maid",
  emoji: "👵",
  category: "Cards",
  players: "1P",
  howTo: "Pairs auto-discard. On your turn, click one of the CPU's face-down cards to draw it. Avoid being left holding the lone Old Maid queen!",
  init(root, ctx) {
    const state = {
      player: [],
      cpu: [],
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

    const cpuLabel = document.createElement("div");
    cpuLabel.style.color = "var(--text-dim)";
    cpuLabel.style.fontSize = ".85rem";
    const cpuRow = document.createElement("div");
    cpuRow.style.display = "flex";
    cpuRow.style.gap = "4px";
    cpuRow.style.flexWrap = "wrap";
    cpuRow.style.justifyContent = "center";
    cpuRow.style.minHeight = "84px";
    cpuRow.style.maxWidth = "620px";

    const playerLabel = document.createElement("div");
    playerLabel.style.color = "var(--text-dim)";
    playerLabel.style.fontSize = ".85rem";
    const playerRow = document.createElement("div");
    playerRow.style.display = "flex";
    playerRow.style.gap = "4px";
    playerRow.style.flexWrap = "wrap";
    playerRow.style.justifyContent = "center";
    playerRow.style.minHeight = "84px";
    playerRow.style.maxWidth = "620px";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "10px";
    const newBtn = document.createElement("button");
    newBtn.className = "btn primary";
    newBtn.textContent = "New Game";
    newBtn.onclick = newGame;
    controls.appendChild(newBtn);

    wrap.appendChild(cpuLabel);
    wrap.appendChild(cpuRow);
    wrap.appendChild(controls);
    wrap.appendChild(playerLabel);
    wrap.appendChild(playerRow);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Reveal CPU Hand: Off",
        run(e) {
          state.revealCpu = !state.revealCpu;
          e.target.textContent = `Reveal CPU Hand: ${state.revealCpu ? "On" : "Off"}`;
          render();
        },
      },
      {
        label: "Force Win",
        run: () => {
          if (state.over) return;
          state.cpu.push(...state.player);
          state.player = [];
          autoDiscardPairs(state.cpu);
          render();
          checkEnd();
        },
      },
    ]);

    function autoDiscardPairs(hand) {
      const byRank = {};
      for (const c of hand) (byRank[c.rank] = byRank[c.rank] || []).push(c);
      const keep = [];
      for (const rank in byRank) {
        const group = byRank[rank];
        if (group.length % 2 === 1) keep.push(group[0]);
      }
      hand.length = 0;
      hand.push(...keep);
    }

    function newGame() {
      let deck = ctx.newDeck();
      const idx = deck.findIndex((c) => c.rank === "Q" && c.suit === "♠");
      deck.splice(idx, 1); // remove one queen so one is left unpaired
      deck = ctx.shuffle(deck);
      state.player = [];
      state.cpu = [];
      deck.forEach((c, i) => (i % 2 === 0 ? state.player : state.cpu).push(c));
      autoDiscardPairs(state.player);
      autoDiscardPairs(state.cpu);
      state.turn = "player";
      state.over = false;
      ctx.setStatus("Your turn — click a card from the CPU's hand.");
      render();
      checkEnd();
    }

    function playerDrawFrom(cpuIndex) {
      if (state.over || state.turn !== "player") return;
      if (cpuIndex < 0 || cpuIndex >= state.cpu.length) return;
      const card = state.cpu.splice(cpuIndex, 1)[0];
      state.player.push(card);
      autoDiscardPairs(state.player);
      ctx.playSound("click");
      render();
      if (checkEnd()) return;
      state.turn = "cpu";
      ctx.setStatus("CPU's turn...");
      render();
      setTimeout(cpuTurn, 700);
    }

    function cpuTurn() {
      if (state.over || state.turn !== "cpu") return;
      if (!state.player.length) {
        checkEnd();
        return;
      }
      const i = Math.floor(Math.random() * state.player.length);
      const card = state.player.splice(i, 1)[0];
      state.cpu.push(card);
      autoDiscardPairs(state.cpu);
      ctx.playSound("click");
      render();
      if (checkEnd()) return;
      state.turn = "player";
      ctx.setStatus("Your turn — click a card from the CPU's hand.");
      render();
    }

    function checkEnd() {
      const total = state.player.length + state.cpu.length;
      if (total <= 1) {
        state.over = true;
        const playerHoldsIt = state.player.length > 0;
        ctx.playSound(playerHoldsIt ? "fail" : "success");
        ctx.setStatus(playerHoldsIt ? "You got stuck with the Old Maid!" : "You avoided the Old Maid!");
        render();
        if (!playerHoldsIt) ctx.confetti(wrap);
        setTimeout(() => {
          ctx.showOverlay({
            title: playerHoldsIt ? "You're the Old Maid!" : "You Escaped!",
            subtitle: playerHoldsIt
              ? "The CPU dodged the lone queen this time."
              : "The CPU got left holding the queen.",
            buttonText: "Play Again",
            onButton: newGame,
          });
        }, 400);
        return true;
      }
      return false;
    }

    function render() {
      cpuLabel.textContent = `CPU hand (${state.cpu.length})`;
      cpuRow.innerHTML = "";
      state.cpu.forEach((c, i) => {
        const el = ctx.cardEl(c, { faceDown: !state.revealCpu, disabled: state.turn !== "player" || state.over });
        el.onclick = () => playerDrawFrom(i);
        cpuRow.appendChild(el);
      });

      playerLabel.textContent = `Your hand (${state.player.length})`;
      playerRow.innerHTML = "";
      state.player.forEach((c) => playerRow.appendChild(ctx.cardEl(c, {})));
    }

    newGame();

    return () => {};
  },
});
