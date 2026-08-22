MimiGames.register({
  id: "roulette",
  title: "Roulette",
  emoji: "🎰",
  category: "Party",
  players: "1P",
  howTo: "Pick a chip amount, click a number or an outside bet, then Spin. Straight numbers pay 35:1, outside bets pay 1:1.",
  init(root, ctx) {
    const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

    function colorOf(n) {
      if (n === 0) return "green";
      return RED_NUMBERS.includes(n) ? "red" : "black";
    }

    const state = {
      balance: ctx.storage.get("balance", 1000),
      amount: 10,
      bet: null, // { type: 'number', value: n } | { type: 'red'|'black'|'odd'|'even'|'low'|'high' }
      spinning: false,
      riggedResult: null,
    };

    let spinInterval = null;
    let spinTimeout = null;

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "12px";
    wrap.style.width = "100%";
    wrap.style.maxWidth = "700px";

    // Result readout
    const readout = document.createElement("div");
    readout.style.width = "90px";
    readout.style.height = "90px";
    readout.style.borderRadius = "50%";
    readout.style.display = "flex";
    readout.style.alignItems = "center";
    readout.style.justifyContent = "center";
    readout.style.fontSize = "2.2rem";
    readout.style.fontWeight = "700";
    readout.style.color = "white";
    readout.style.border = "3px solid var(--border)";
    readout.style.background = "var(--panel-light)";
    readout.textContent = "-";

    // Chip amount selector
    const amountRow = document.createElement("div");
    amountRow.style.display = "flex";
    amountRow.style.gap = "8px";
    amountRow.style.alignItems = "center";
    const amountLabel = document.createElement("div");
    amountLabel.style.color = "var(--text-dim)";
    amountLabel.style.fontSize = ".8rem";
    amountLabel.textContent = "Bet amount:";
    amountRow.appendChild(amountLabel);
    const amountBtns = [];
    [10, 50, 100].forEach((amt) => {
      const b = document.createElement("button");
      b.className = "btn" + (amt === state.amount ? " primary" : "");
      b.textContent = amt + " chips";
      b.onclick = () => {
        state.amount = amt;
        amountBtns.forEach((x) => x.classList.remove("primary"));
        b.classList.add("primary");
      };
      amountBtns.push(b);
      amountRow.appendChild(b);
    });

    // Numbers grid
    const grid = document.createElement("div");
    grid.className = "cell-grid";
    grid.style.gridTemplateColumns = "repeat(9, 42px)";
    grid.style.justifyContent = "center";

    const numberCells = [];
    for (let n = 0; n <= 36; n++) {
      const c = document.createElement("button");
      c.className = "btn";
      c.style.width = "42px";
      c.style.height = "36px";
      c.style.padding = "0";
      c.style.fontSize = ".8rem";
      c.textContent = String(n);
      const col = colorOf(n);
      if (col === "red") { c.style.background = "#7a1f24"; c.style.borderColor = "#d3202f"; }
      else if (col === "black") { c.style.background = "#15171f"; c.style.borderColor = "#444"; }
      else { c.style.background = "#12452e"; c.style.borderColor = "var(--win)"; }
      c.onclick = () => selectBet({ type: "number", value: n }, c);
      numberCells.push(c);
      grid.appendChild(c);
    }

    // Outside bets
    const outsideRow = document.createElement("div");
    outsideRow.style.display = "flex";
    outsideRow.style.flexWrap = "wrap";
    outsideRow.style.gap = "8px";
    outsideRow.style.justifyContent = "center";
    const outsideDefs = [
      { type: "red", label: "Red" },
      { type: "black", label: "Black" },
      { type: "odd", label: "Odd" },
      { type: "even", label: "Even" },
      { type: "low", label: "1-18" },
      { type: "high", label: "19-36" },
    ];
    const outsideCells = [];
    outsideDefs.forEach((d) => {
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = d.label;
      b.onclick = () => selectBet({ type: d.type }, b);
      outsideCells.push(b);
      outsideRow.appendChild(b);
    });

    const allSelectable = () => numberCells.concat(outsideCells);

    function selectBet(bet, el) {
      if (state.spinning) return;
      state.bet = bet;
      allSelectable().forEach((c) => (c.style.outline = ""));
      el.style.outline = "3px solid var(--accent2)";
      updateSpinBtn();
    }

    const actionRow = document.createElement("div");
    actionRow.style.display = "flex";
    actionRow.style.gap = "10px";
    const spinBtn = document.createElement("button");
    spinBtn.className = "btn primary";
    spinBtn.textContent = "Spin";
    spinBtn.onclick = spin;
    const resetBtn = document.createElement("button");
    resetBtn.className = "btn";
    resetBtn.textContent = "Reset Balance";
    resetBtn.style.display = "none";
    resetBtn.onclick = () => {
      state.balance = 1000;
      ctx.storage.set("balance", state.balance);
      resetBtn.style.display = "none";
      renderStatus();
      updateSpinBtn();
    };
    actionRow.appendChild(spinBtn);
    actionRow.appendChild(resetBtn);

    const message = document.createElement("div");
    message.style.minHeight = "1.4em";
    message.style.fontWeight = "600";

    wrap.appendChild(readout);
    wrap.appendChild(amountRow);
    wrap.appendChild(grid);
    wrap.appendChild(outsideRow);
    wrap.appendChild(actionRow);
    wrap.appendChild(message);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Add 1000 Chips",
        run: () => {
          state.balance += 1000;
          ctx.storage.set("balance", state.balance);
          renderStatus();
          resetBtn.style.display = "none";
          updateSpinBtn();
        },
      },
      {
        label: "Rig Next Spin (Win)",
        run: () => {
          if (!state.bet) { ctx.setStatus("Pick a bet first, then rig the spin."); return; }
          const bet = state.bet;
          if (bet.type === "number") state.riggedResult = bet.value;
          else if (bet.type === "red") state.riggedResult = RED_NUMBERS[0];
          else if (bet.type === "black") state.riggedResult = 2;
          else if (bet.type === "odd") state.riggedResult = 1;
          else if (bet.type === "even") state.riggedResult = 2;
          else if (bet.type === "low") state.riggedResult = 1;
          else if (bet.type === "high") state.riggedResult = 36;
          ctx.setStatus(`Next spin rigged to land on ${state.riggedResult}.`);
        },
      },
    ]);

    function updateSpinBtn() {
      spinBtn.disabled = state.spinning || !state.bet || state.balance < state.amount;
    }

    function renderStatus() {
      ctx.setStatus(`Balance: ${state.balance} chips`);
    }

    function setSelectableDisabled(disabled) {
      allSelectable().forEach((c) => (c.disabled = disabled));
      amountBtns.forEach((c) => (c.disabled = disabled));
    }

    function spin() {
      if (state.spinning || !state.bet || state.balance < state.amount) return;
      state.spinning = true;
      message.textContent = "";
      setSelectableDisabled(true);
      updateSpinBtn();

      state.balance -= state.amount;
      ctx.storage.set("balance", state.balance);
      renderStatus();
      ctx.playSound("click");

      const result = state.riggedResult !== null ? state.riggedResult : Math.floor(Math.random() * 37);
      state.riggedResult = null;
      let ticks = 0;
      const totalTicks = 22;
      spinInterval = setInterval(() => {
        const n = Math.floor(Math.random() * 37);
        readout.textContent = String(n);
        readout.style.background = colorOf(n) === "red" ? "#d3202f" : colorOf(n) === "black" ? "#15171f" : "var(--win)";
        ticks++;
        if (ticks >= totalTicks) {
          clearInterval(spinInterval);
          spinInterval = null;
          finishSpin(result);
        }
      }, 70);
    }

    function finishSpin(result) {
      readout.textContent = String(result);
      const col = colorOf(result);
      readout.style.background = col === "red" ? "#d3202f" : col === "black" ? "#15171f" : "var(--win)";

      const bet = state.bet;
      let won = false;
      let payoutMultiple = 0;
      if (bet.type === "number") {
        won = bet.value === result;
        payoutMultiple = 35;
      } else if (bet.type === "red" || bet.type === "black") {
        won = col === bet.type;
        payoutMultiple = 1;
      } else if (bet.type === "odd") {
        won = result !== 0 && result % 2 === 1;
        payoutMultiple = 1;
      } else if (bet.type === "even") {
        won = result !== 0 && result % 2 === 0;
        payoutMultiple = 1;
      } else if (bet.type === "low") {
        won = result >= 1 && result <= 18;
        payoutMultiple = 1;
      } else if (bet.type === "high") {
        won = result >= 19 && result <= 36;
        payoutMultiple = 1;
      }

      if (won) {
        const winnings = state.amount * (payoutMultiple + 1);
        state.balance += winnings;
        ctx.storage.set("balance", state.balance);
        message.textContent = `${result} (${col.toUpperCase()})! You won ${winnings} chips!`;
        message.style.color = "var(--win)";
        ctx.playSound("success");
        if (payoutMultiple >= 35) ctx.confetti(wrap);
      } else {
        message.textContent = `${result} (${col.toUpperCase()}). No win this time.`;
        message.style.color = "var(--lose)";
        ctx.playSound("fail");
      }

      renderStatus();
      state.spinning = false;
      state.bet = null;
      allSelectable().forEach((c) => (c.style.outline = ""));
      setSelectableDisabled(false);
      updateSpinBtn();

      if (state.balance <= 0) {
        resetBtn.style.display = "inline-block";
        spinBtn.disabled = true;
      }
    }

    renderStatus();
    updateSpinBtn();
    if (state.balance <= 0) resetBtn.style.display = "inline-block";

    return () => {
      if (spinInterval) clearInterval(spinInterval);
      if (spinTimeout) clearTimeout(spinTimeout);
    };
  },
});
