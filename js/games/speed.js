MimiGames.register({
  id: "speed",
  title: "Speed",
  emoji: "🏎️",
  category: "Cards",
  players: "1P",
  howTo: "Click a card in your hand then a center pile to play it if its rank is exactly one higher or lower. Empty your hand and draw pile before the CPU!",
  init(root, ctx) {
    const state = {
      playerHand: [],
      playerDraw: [],
      cpuHand: [],
      cpuDraw: [],
      center: [[], []],
      selected: null,
      over: false,
      ticks: 0,
      stuckTicks: 0,
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "16px";
    wrap.style.width = "100%";

    const cpuLabel = document.createElement("div");
    cpuLabel.style.color = "var(--text-dim)";
    cpuLabel.style.fontSize = ".8rem";
    const cpuRow = document.createElement("div");
    cpuRow.style.display = "flex";
    cpuRow.style.gap = "4px";
    cpuRow.style.minHeight = "84px";

    const centerRow = document.createElement("div");
    centerRow.style.display = "flex";
    centerRow.style.gap = "30px";
    centerRow.style.alignItems = "center";
    const centerPiles = [document.createElement("div"), document.createElement("div")];
    const drawLabels = document.createElement("div");
    drawLabels.style.display = "flex";
    drawLabels.style.gap = "8px";
    drawLabels.style.fontSize = ".8rem";
    drawLabels.style.color = "var(--text-dim)";

    centerPiles.forEach((el, i) => {
      el.style.width = "60px";
      el.style.height = "84px";
      el.onclick = () => attemptPlay(i);
      centerRow.appendChild(el);
    });

    const playerLabel = document.createElement("div");
    playerLabel.style.color = "var(--text-dim)";
    playerLabel.style.fontSize = ".8rem";
    const playerRow = document.createElement("div");
    playerRow.style.display = "flex";
    playerRow.style.gap = "6px";
    playerRow.style.minHeight = "84px";

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
    wrap.appendChild(drawLabels);
    wrap.appendChild(centerRow);
    wrap.appendChild(playerLabel);
    wrap.appendChild(playerRow);
    wrap.appendChild(controls);
    root.appendChild(wrap);

    let revealCpu = false;
    ctx.devCheatPanel(root, [
      {
        label: "Auto-Win",
        run() {
          if (state.over) return;
          state.playerHand = [];
          state.playerDraw = [];
          render();
          checkWin();
        },
      },
      {
        label: "Reveal CPU Hand: Off",
        run(e) {
          revealCpu = !revealCpu;
          e.target.textContent = `Reveal CPU Hand: ${revealCpu ? "On" : "Off"}`;
          render();
        },
      },
    ]);

    function newGame() {
      const deck = ctx.shuffle(ctx.newDeck());
      state.playerHand = deck.splice(0, 5);
      state.playerDraw = deck.splice(0, 20);
      state.cpuHand = deck.splice(0, 5);
      state.cpuDraw = deck.splice(0, 20);
      state.center = [[deck.pop()], [deck.pop()]];
      state.selected = null;
      state.over = false;
      state.stuckTicks = 0;
      ctx.setStatus("Play a card that's one rank above or below a center pile.");
      render();
    }

    function isLegal(card, centerPile) {
      const top = centerPile[centerPile.length - 1];
      return Math.abs(card.value - top.value) === 1;
    }

    function hasLegalMove(hand) {
      return hand.some((c) => isLegal(c, state.center[0]) || isLegal(c, state.center[1]));
    }

    function refill(hand, drawPile) {
      if (hand.length < 5 && drawPile.length) hand.push(drawPile.pop());
    }

    function attemptPlay(centerIdx) {
      if (state.over || state.selected == null) return;
      const card = state.playerHand[state.selected];
      if (!isLegal(card, state.center[centerIdx])) {
        ctx.playSound("fail");
        return;
      }
      state.playerHand.splice(state.selected, 1);
      state.center[centerIdx].push(card);
      state.selected = null;
      refill(state.playerHand, state.playerDraw);
      ctx.playSound("pop");
      ctx.vibrate(10);
      afterMove();
    }

    function selectCard(i) {
      if (state.over) return;
      state.selected = state.selected === i ? null : i;
      render();
    }

    function cpuTryMove() {
      for (let i = 0; i < state.cpuHand.length; i++) {
        for (let c = 0; c < 2; c++) {
          if (isLegal(state.cpuHand[i], state.center[c])) {
            const card = state.cpuHand.splice(i, 1)[0];
            state.center[c].push(card);
            refill(state.cpuHand, state.cpuDraw);
            ctx.playSound("click");
            return true;
          }
        }
      }
      return false;
    }

    function checkStuckAndResolve() {
      if (state.over) return;
      const pStuck = !hasLegalMove(state.playerHand);
      const cStuck = !hasLegalMove(state.cpuHand);
      if (pStuck && cStuck) {
        let moved = false;
        if (state.playerDraw.length) {
          state.center[0].push(state.playerDraw.pop());
          moved = true;
        }
        if (state.cpuDraw.length) {
          state.center[1].push(state.cpuDraw.pop());
          moved = true;
        }
        if (moved) {
          ctx.setStatus("Both stuck — new cards flipped to the center!");
          state.stuckTicks = 0;
        } else {
          state.stuckTicks++;
        }
      } else {
        state.stuckTicks = 0;
      }
      // true stalemate: nobody can move and neither draw pile has cards
      if (
        pStuck &&
        cStuck &&
        !state.playerDraw.length &&
        !state.cpuDraw.length &&
        state.stuckTicks > 0
      ) {
        const pTotal = state.playerHand.length + state.playerDraw.length;
        const cTotal = state.cpuHand.length + state.cpuDraw.length;
        if (pTotal < cTotal) endGame("player", "You had fewer cards remaining!");
        else if (cTotal < pTotal) endGame("cpu", "CPU had fewer cards remaining.");
        else endGame("draw", "Nobody could move — it's a draw.");
      }
    }

    function checkWin() {
      if (state.over) return;
      const pDone = state.playerHand.length === 0 && state.playerDraw.length === 0;
      const cDone = state.cpuHand.length === 0 && state.cpuDraw.length === 0;
      if (pDone && cDone) endGame("draw", "Both emptied their cards at once!");
      else if (pDone) endGame("player", "You emptied your hand and draw pile!");
      else if (cDone) endGame("cpu", "CPU emptied its hand and draw pile.");
    }

    function endGame(who, subtitle) {
      state.over = true;
      ctx.setStatus(who === "player" ? "You win!" : who === "cpu" ? "CPU wins!" : "Draw!");
      ctx.playSound(who === "player" ? "success" : who === "cpu" ? "fail" : "click");
      render();
      if (who === "player") ctx.confetti(wrap);
      setTimeout(() => {
        ctx.showOverlay({
          title: who === "player" ? "You Win!" : who === "cpu" ? "CPU Wins" : "Draw!",
          subtitle,
          buttonText: "Play Again",
          onButton: newGame,
        });
      }, 400);
    }

    function afterMove() {
      checkStuckAndResolve();
      checkWin();
      render();
    }

    function render() {
      cpuLabel.textContent = `CPU hand: ${state.cpuHand.length}  ·  CPU draw pile: ${state.cpuDraw.length}`;
      cpuRow.innerHTML = "";
      state.cpuHand.forEach((card) => cpuRow.appendChild(ctx.cardEl(card, { faceDown: !revealCpu })));

      drawLabels.textContent = `Your draw pile: ${state.playerDraw.length}   Your hand: ${state.playerHand.length}`;

      centerPiles.forEach((el, i) => {
        el.innerHTML = "";
        const pile = state.center[i];
        if (pile.length) el.appendChild(ctx.cardEl(pile[pile.length - 1], {}));
      });

      playerLabel.textContent = "Your hand";
      playerRow.innerHTML = "";
      state.playerHand.forEach((card, i) => {
        const el = ctx.cardEl(card, { disabled: state.over });
        if (state.selected === i) el.style.boxShadow = "0 0 0 3px var(--accent2)";
        el.onclick = () => selectCard(i);
        playerRow.appendChild(el);
      });
    }

    newGame();

    const timer = setInterval(() => {
      if (state.over) return;
      state.ticks++;
      cpuTryMove();
      checkStuckAndResolve();
      checkWin();
      render();
    }, 800);

    return () => clearInterval(timer);
  },
});
