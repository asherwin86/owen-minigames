MimiGames.register({
  id: "slots",
  title: "Slot Machine",
  emoji: "🎰",
  category: "Party",
  players: "1P",
  howTo: "Each spin costs 10 credits. Click Spin and watch the reels — match 3 for a big payout, match 2 for a small one.",
  init(root, ctx) {
    const SYMBOLS = ["🍒", "🍋", "🔔", "🍇", "⭐", "💎"];
    const PAYOUTS = { "🍒": 5, "🍋": 8, "🔔": 12, "🍇": 15, "⭐": 25, "💎": 50 };
    const BET = 10;
    const PAIR_PAYOUT = 2; // multiple of BET

    const state = {
      credits: ctx.storage.get("credits", 500),
      spinning: false,
    };

    const timers = [];

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "16px";

    const reelsRow = document.createElement("div");
    reelsRow.style.display = "flex";
    reelsRow.style.gap = "12px";

    const reelEls = [0, 1, 2].map(() => {
      const box = document.createElement("div");
      box.style.width = "90px";
      box.style.height = "90px";
      box.style.display = "flex";
      box.style.alignItems = "center";
      box.style.justifyContent = "center";
      box.style.fontSize = "3rem";
      box.style.background = "var(--panel-light)";
      box.style.border = "2px solid var(--border)";
      box.style.borderRadius = "12px";
      box.textContent = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
      reelsRow.appendChild(box);
      return box;
    });

    const payTable = document.createElement("div");
    payTable.style.fontSize = ".75rem";
    payTable.style.color = "var(--text-dim)";
    payTable.style.textAlign = "center";
    payTable.style.maxWidth = "420px";
    payTable.textContent =
      "3-in-a-row: 🍒x5  🍋x8  🔔x12  🍇x15  ⭐x25  💎x50  |  any 2 matching: x2   (multiplied by bet of " + BET + ")";

    const actionRow = document.createElement("div");
    actionRow.style.display = "flex";
    actionRow.style.gap = "10px";
    const spinBtn = document.createElement("button");
    spinBtn.className = "btn primary";
    spinBtn.textContent = `Spin (${BET} credits)`;
    spinBtn.onclick = spin;
    const resetBtn = document.createElement("button");
    resetBtn.className = "btn";
    resetBtn.textContent = "Reset Balance";
    resetBtn.style.display = "none";
    resetBtn.onclick = () => {
      state.credits = 500;
      ctx.storage.set("credits", state.credits);
      resetBtn.style.display = "none";
      spinBtn.disabled = false;
      renderStatus();
    };
    actionRow.appendChild(spinBtn);
    actionRow.appendChild(resetBtn);

    const message = document.createElement("div");
    message.style.minHeight = "1.4em";
    message.style.fontWeight = "600";

    wrap.appendChild(reelsRow);
    wrap.appendChild(payTable);
    wrap.appendChild(actionRow);
    wrap.appendChild(message);
    root.appendChild(wrap);

    let forceJackpot = false;
    ctx.devCheatPanel(root, [
      {
        label: "Force Jackpot",
        run() {
          if (state.spinning) return;
          forceJackpot = true;
          if (state.credits < BET) {
            state.credits = BET;
            ctx.storage.set("credits", state.credits);
            resetBtn.style.display = "none";
            spinBtn.disabled = false;
          }
          spin();
        },
      },
      {
        label: "Add Credits +500",
        run: () => {
          state.credits += 500;
          ctx.storage.set("credits", state.credits);
          renderStatus();
          spinBtn.disabled = false;
          resetBtn.style.display = "none";
        },
      },
    ]);

    function renderStatus() {
      ctx.setStatus(`Credits: ${state.credits}`);
    }

    function spin() {
      if (state.spinning) return;
      if (state.credits < BET) {
        message.textContent = "Not enough credits to spin.";
        message.style.color = "var(--lose)";
        resetBtn.style.display = "inline-block";
        return;
      }
      state.spinning = true;
      spinBtn.disabled = true;
      message.textContent = "";
      state.credits -= BET;
      ctx.storage.set("credits", state.credits);
      renderStatus();
      ctx.playSound("click");

      const jackpotSymbol = SYMBOLS[SYMBOLS.length - 1];
      const finals = forceJackpot
        ? [jackpotSymbol, jackpotSymbol, jackpotSymbol]
        : reelEls.map(() => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
      forceJackpot = false;
      const stopDelays = [900, 1350, 1800];

      reelEls.forEach((box, i) => {
        const cycle = setInterval(() => {
          box.textContent = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
        }, 60);
        timers.push(cycle);

        const stopTimer = setTimeout(() => {
          clearInterval(cycle);
          box.textContent = finals[i];
          ctx.playSound("pop");
          if (i === reelEls.length - 1) {
            resolve(finals);
          }
        }, stopDelays[i]);
        timers.push(stopTimer);
      });
    }

    function resolve(finals) {
      let winnings = 0;
      if (finals[0] === finals[1] && finals[1] === finals[2]) {
        winnings = PAYOUTS[finals[0]] * BET;
      } else if (
        finals[0] === finals[1] ||
        finals[1] === finals[2] ||
        finals[0] === finals[2]
      ) {
        winnings = PAIR_PAYOUT * BET;
      }

      if (winnings > 0) {
        state.credits += winnings;
        ctx.storage.set("credits", state.credits);
        message.textContent = `You won ${winnings} credits!`;
        message.style.color = "var(--win)";
        ctx.playSound("success");
        if (finals[0] === finals[1] && finals[1] === finals[2] && finals[0] === "💎") {
          ctx.confetti(wrap);
        }
      } else {
        message.textContent = "No match — try again!";
        message.style.color = "var(--lose)";
        ctx.playSound("fail");
      }

      renderStatus();
      state.spinning = false;
      spinBtn.disabled = state.credits < BET;
      if (state.credits < BET) {
        resetBtn.style.display = "inline-block";
        message.textContent += " Out of credits.";
      }
    }

    renderStatus();
    if (state.credits < BET) resetBtn.style.display = "inline-block";

    return () => {
      timers.forEach((t) => {
        clearInterval(t);
        clearTimeout(t);
      });
    };
  },
});
