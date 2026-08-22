MimiGames.register({
  id: "blackjack",
  title: "Blackjack",
  emoji: "♠️",
  category: "Cards",
  players: "1P",
  howTo: "Beat the dealer without going over 21. Deal, then Hit or Stand. Blackjack (A+10) pays extra. Flat bet of $10 per round.",
  init(root, ctx) {
    const BET = 10;
    const state = {
      deck: [],
      player: [],
      dealer: [],
      dealerHidden: true,
      balance: ctx.storage.get("balance", 100),
      phase: "betting", // betting | playing | done
      over: false,
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "16px";
    wrap.style.width = "100%";

    const balanceEl = document.createElement("div");
    balanceEl.style.fontSize = "1.1rem";
    balanceEl.style.fontWeight = "700";
    balanceEl.style.color = "var(--accent2)";

    const dealerLabel = document.createElement("div");
    dealerLabel.style.color = "var(--text-dim)";
    dealerLabel.style.fontSize = ".85rem";
    dealerLabel.textContent = "Dealer";
    const dealerRow = document.createElement("div");
    dealerRow.style.display = "flex";
    dealerRow.style.gap = "6px";
    dealerRow.style.minHeight = "84px";

    const dealerTotalEl = document.createElement("div");
    dealerTotalEl.style.fontSize = ".85rem";
    dealerTotalEl.style.color = "var(--text-dim)";

    const playerLabel = document.createElement("div");
    playerLabel.style.color = "var(--text-dim)";
    playerLabel.style.fontSize = ".85rem";
    playerLabel.textContent = "You";
    const playerRow = document.createElement("div");
    playerRow.style.display = "flex";
    playerRow.style.gap = "6px";
    playerRow.style.minHeight = "84px";

    const playerTotalEl = document.createElement("div");
    playerTotalEl.style.fontSize = ".85rem";
    playerTotalEl.style.color = "var(--text-dim)";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "10px";

    const dealBtn = document.createElement("button");
    dealBtn.className = "btn primary";
    dealBtn.textContent = "Deal ($" + BET + ")";
    dealBtn.onclick = deal;

    const hitBtn = document.createElement("button");
    hitBtn.className = "btn";
    hitBtn.textContent = "Hit";
    hitBtn.onclick = hit;

    const standBtn = document.createElement("button");
    standBtn.className = "btn";
    standBtn.textContent = "Stand";
    standBtn.onclick = stand;

    controls.appendChild(dealBtn);
    controls.appendChild(hitBtn);
    controls.appendChild(standBtn);

    wrap.appendChild(balanceEl);
    wrap.appendChild(dealerLabel);
    wrap.appendChild(dealerRow);
    wrap.appendChild(dealerTotalEl);
    wrap.appendChild(playerLabel);
    wrap.appendChild(playerRow);
    wrap.appendChild(playerTotalEl);
    wrap.appendChild(controls);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Add Chips +100",
        run: () => {
          state.balance += 100;
          ctx.storage.set("balance", state.balance);
          render();
        },
      },
      {
        label: "Force Win",
        run: () => {
          if (state.phase === "done" || state.phase === "betting") return;
          state.dealerHidden = false;
          resolve("win");
        },
      },
    ]);

    function handValue(hand) {
      let total = 0;
      let aces = 0;
      for (const c of hand) {
        let v = c.value;
        if (v > 10) v = 10;
        if (v === 1) {
          aces++;
          v = 11;
        }
        total += v;
      }
      while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
      }
      return total;
    }

    function draw() {
      if (!state.deck.length) state.deck = ctx.shuffle(ctx.newDeck());
      return state.deck.pop();
    }

    function setButtons(phase) {
      dealBtn.disabled = phase !== "betting";
      hitBtn.disabled = phase !== "playing";
      standBtn.disabled = phase !== "playing";
    }

    function deal() {
      if (state.balance < BET) {
        ctx.setStatus("Not enough chips!");
        return;
      }
      state.balance -= BET;
      ctx.storage.set("balance", state.balance);
      state.deck = ctx.shuffle(ctx.newDeck());
      state.player = [draw(), draw()];
      state.dealer = [draw(), draw()];
      state.dealerHidden = true;
      state.phase = "playing";
      ctx.setStatus("Your turn — Hit or Stand.");
      render();

      const pVal = handValue(state.player);
      const dVal = handValue(state.dealer);
      const pBJ = pVal === 21;
      const dBJ = dVal === 21;
      if (pBJ || dBJ) {
        state.dealerHidden = false;
        if (pBJ && dBJ) resolve("push");
        else if (pBJ) resolve("blackjack");
        else resolve("lose");
      }
    }

    function hit() {
      if (state.phase !== "playing") return;
      state.player.push(draw());
      ctx.playSound("click");
      render();
      const v = handValue(state.player);
      if (v > 21) {
        state.dealerHidden = false;
        resolve("lose");
      }
    }

    function stand() {
      if (state.phase !== "playing") return;
      state.dealerHidden = false;
      while (handValue(state.dealer) < 17) {
        state.dealer.push(draw());
      }
      render();
      const p = handValue(state.player);
      const d = handValue(state.dealer);
      if (d > 21 || p > d) resolve("win");
      else if (p === d) resolve("push");
      else resolve("lose");
    }

    function resolve(outcome) {
      state.phase = "done";
      let title, subtitle;
      if (outcome === "blackjack") {
        state.balance += Math.round(BET * 2.5);
        title = "Blackjack!";
        subtitle = "You win 3:2 on your bet.";
        ctx.playSound("success");
      } else if (outcome === "win") {
        state.balance += BET * 2;
        title = "You Win!";
        subtitle = "Dealer busts or you had the higher hand.";
        ctx.playSound("success");
      } else if (outcome === "push") {
        state.balance += BET;
        title = "Push";
        subtitle = "Bet returned — it's a tie.";
        ctx.playSound("click");
      } else {
        title = "You Lose";
        subtitle = "Better luck next round.";
        ctx.playSound("fail");
      }
      ctx.storage.set("balance", state.balance);
      ctx.setStatus(title);
      render();
      setTimeout(() => {
        if (state.balance < BET) {
          ctx.showOverlay({
            title: "Out of Chips!",
            subtitle: title + " — " + subtitle,
            buttonText: "Reset Chips ($100)",
            onButton: () => {
              state.balance = 100;
              ctx.storage.set("balance", 100);
              state.phase = "betting";
              ctx.setStatus("Chips reset. Deal to play again.");
              render();
            },
          });
        } else {
          ctx.showOverlay({
            title,
            subtitle: subtitle + ` Balance: $${state.balance}`,
            buttonText: "Next Round",
            onButton: () => {
              state.phase = "betting";
              ctx.setStatus("Deal to play again.");
              render();
            },
          });
        }
      }, 400);
    }

    function render() {
      balanceEl.textContent = `Balance: $${state.balance}`;

      dealerRow.innerHTML = "";
      state.dealer.forEach((c, i) => {
        const faceDown = state.dealerHidden && i === 1;
        dealerRow.appendChild(ctx.cardEl(c, { faceDown }));
      });
      dealerTotalEl.textContent = !state.dealer.length
        ? ""
        : state.dealerHidden
        ? `Showing: ${handValue([state.dealer[0]])}`
        : `Total: ${handValue(state.dealer)}`;

      playerRow.innerHTML = "";
      state.player.forEach((c) => playerRow.appendChild(ctx.cardEl(c, {})));
      playerTotalEl.textContent = state.player.length ? `Total: ${handValue(state.player)}` : "";

      setButtons(state.phase);
    }

    ctx.setStatus("Press Deal to start a round.");
    render();

    return () => {};
  },
});
