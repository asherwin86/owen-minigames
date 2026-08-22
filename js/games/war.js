MimiGames.register({
  id: "war",
  title: "Card War",
  emoji: "⚔️",
  category: "Cards",
  players: "1P",
  howTo: "Click Flip to battle the CPU. Higher card wins both. Ties trigger a War — three face down, one face up decides it all.",
  init(root, ctx) {
    const MAX_ROUNDS = 400;
    const state = {
      player: [],
      cpu: [],
      round: 0,
      lastPlayer: [],
      lastCpu: [],
      over: false,
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "16px";
    wrap.style.width = "100%";

    const countsEl = document.createElement("div");
    countsEl.style.display = "flex";
    countsEl.style.gap = "40px";
    countsEl.style.fontSize = "1rem";
    countsEl.style.fontWeight = "600";

    const battleEl = document.createElement("div");
    battleEl.style.display = "flex";
    battleEl.style.gap = "40px";
    battleEl.style.alignItems = "flex-start";
    battleEl.style.minHeight = "110px";

    const playerZone = document.createElement("div");
    playerZone.style.display = "flex";
    playerZone.style.flexDirection = "column";
    playerZone.style.alignItems = "center";
    playerZone.style.gap = "6px";
    const playerZoneLabel = document.createElement("div");
    playerZoneLabel.textContent = "You";
    playerZoneLabel.style.color = "var(--text-dim)";
    playerZoneLabel.style.fontSize = ".8rem";
    const playerCardsEl = document.createElement("div");
    playerCardsEl.style.display = "flex";
    playerCardsEl.style.gap = "4px";
    playerCardsEl.style.flexWrap = "wrap";
    playerCardsEl.style.justifyContent = "center";
    playerZone.appendChild(playerZoneLabel);
    playerZone.appendChild(playerCardsEl);

    const cpuZone = document.createElement("div");
    cpuZone.style.display = "flex";
    cpuZone.style.flexDirection = "column";
    cpuZone.style.alignItems = "center";
    cpuZone.style.gap = "6px";
    const cpuZoneLabel = document.createElement("div");
    cpuZoneLabel.textContent = "CPU";
    cpuZoneLabel.style.color = "var(--text-dim)";
    cpuZoneLabel.style.fontSize = ".8rem";
    const cpuCardsEl = document.createElement("div");
    cpuCardsEl.style.display = "flex";
    cpuCardsEl.style.gap = "4px";
    cpuCardsEl.style.flexWrap = "wrap";
    cpuCardsEl.style.justifyContent = "center";
    cpuZone.appendChild(cpuZoneLabel);
    cpuZone.appendChild(cpuCardsEl);

    battleEl.appendChild(playerZone);
    battleEl.appendChild(cpuZone);

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "10px";
    const flipBtn = document.createElement("button");
    flipBtn.className = "btn primary";
    flipBtn.textContent = "Flip Cards";
    flipBtn.onclick = playRound;
    const newBtn = document.createElement("button");
    newBtn.className = "btn";
    newBtn.textContent = "New Game";
    newBtn.onclick = newGame;
    controls.appendChild(flipBtn);
    controls.appendChild(newBtn);

    wrap.appendChild(countsEl);
    wrap.appendChild(battleEl);
    wrap.appendChild(controls);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Auto-Win",
        run() {
          if (state.over) return;
          state.player = state.player.concat(state.cpu);
          state.cpu = [];
          render();
          checkEnd();
        },
      },
      {
        label: "Stack Next Card (High)",
        run() {
          if (state.over || state.player.length === 0) return;
          let bestIdx = 0;
          for (let i = 1; i < state.player.length; i++) {
            if (state.player[i].value > state.player[bestIdx].value) bestIdx = i;
          }
          const [best] = state.player.splice(bestIdx, 1);
          state.player.unshift(best);
          ctx.setStatus("Your next card is stacked high.");
        },
      },
    ]);

    function newGame() {
      const deck = ctx.shuffle(ctx.newDeck());
      state.player = deck.slice(0, 26);
      state.cpu = deck.slice(26);
      state.round = 0;
      state.lastPlayer = [];
      state.lastCpu = [];
      state.over = false;
      ctx.setStatus("Click Flip to battle!");
      render();
    }

    function awardAll(pool, who) {
      const target = who === "player" ? state.player : state.cpu;
      target.push(...pool);
    }

    function resolveCompare(pCard, cCard, pool) {
      if (pCard.value === cCard.value) {
        if (state.player.length < 4 || state.cpu.length < 4) {
          if (state.player.length > state.cpu.length) awardAll(pool, "player");
          else if (state.cpu.length > state.player.length) awardAll(pool, "cpu");
          else if (Math.random() < 0.5) awardAll(pool, "player");
          else awardAll(pool, "cpu");
          finishRound();
          return;
        }
        const pDown = [state.player.shift(), state.player.shift(), state.player.shift()];
        const cDown = [state.cpu.shift(), state.cpu.shift(), state.cpu.shift()];
        const pUp = state.player.shift();
        const cUp = state.cpu.shift();
        pool.push(...pDown, ...cDown, pUp, cUp);
        state.lastPlayer.push(...pDown, pUp);
        state.lastCpu.push(...cDown, cUp);
        ctx.setStatus("War! Battling for " + pool.length + " cards...");
        resolveCompare(pUp, cUp, pool);
        return;
      }
      if (pCard.value > cCard.value) awardAll(pool, "player");
      else awardAll(pool, "cpu");
      finishRound();
    }

    function playRound() {
      if (state.over) return;
      if (state.player.length === 0 || state.cpu.length === 0) {
        checkEnd();
        return;
      }
      state.round++;
      const pCard = state.player.shift();
      const cCard = state.cpu.shift();
      state.lastPlayer = [pCard];
      state.lastCpu = [cCard];
      const pool = [pCard, cCard];
      resolveCompare(pCard, cCard, pool);
    }

    function finishRound() {
      ctx.playSound("pop");
      render();
      checkEnd();
    }

    function checkEnd() {
      if (state.player.length === 0) {
        endGame("CPU wins!", "CPU captured all the cards.");
      } else if (state.cpu.length === 0) {
        endGame("You win!", "You captured all the cards.");
      } else if (state.round >= MAX_ROUNDS) {
        if (state.player.length === state.cpu.length) {
          endGame("Draw!", "Equal cards after the round limit.");
        } else if (state.player.length > state.cpu.length) {
          endGame("You win!", "Most cards after the round limit.");
        } else {
          endGame("CPU wins!", "Most cards after the round limit.");
        }
      } else {
        ctx.setStatus(`Round ${state.round}`);
      }
    }

    function endGame(title, subtitle) {
      state.over = true;
      ctx.playSound(title.startsWith("You") ? "success" : "fail");
      ctx.setStatus(title);
      render();
      if (title.startsWith("You")) ctx.confetti(wrap);
      setTimeout(() => {
        ctx.showOverlay({
          title,
          subtitle,
          buttonText: "Play Again",
          onButton: newGame,
        });
      }, 400);
    }

    function render() {
      countsEl.innerHTML = "";
      const pc = document.createElement("div");
      pc.textContent = `You: ${state.player.length}`;
      const cc = document.createElement("div");
      cc.textContent = `CPU: ${state.cpu.length}`;
      countsEl.appendChild(pc);
      countsEl.appendChild(cc);

      playerCardsEl.innerHTML = "";
      state.lastPlayer.forEach((c, i) => {
        playerCardsEl.appendChild(ctx.cardEl(c, { faceDown: i < state.lastPlayer.length - 1 && state.lastPlayer.length > 1 }));
      });
      cpuCardsEl.innerHTML = "";
      state.lastCpu.forEach((c, i) => {
        cpuCardsEl.appendChild(ctx.cardEl(c, { faceDown: i < state.lastCpu.length - 1 && state.lastCpu.length > 1 }));
      });

      flipBtn.disabled = state.over;
    }

    newGame();

    return () => {};
  },
});
