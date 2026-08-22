MimiGames.register({
  id: "yahtzee",
  title: "Yahtzee",
  emoji: "🎯",
  category: "Party",
  players: "1P",
  howTo: "Roll up to 3 times per turn, click dice to hold them between rolls, then click a scorecard category to score your turn.",
  init(root, ctx) {
    const DIE_FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
    const CATEGORIES = [
      { key: "ones", label: "Ones", section: "upper" },
      { key: "twos", label: "Twos", section: "upper" },
      { key: "threes", label: "Threes", section: "upper" },
      { key: "fours", label: "Fours", section: "upper" },
      { key: "fives", label: "Fives", section: "upper" },
      { key: "sixes", label: "Sixes", section: "upper" },
      { key: "threeKind", label: "Three of a Kind", section: "lower" },
      { key: "fourKind", label: "Four of a Kind", section: "lower" },
      { key: "fullHouse", label: "Full House", section: "lower" },
      { key: "smallStraight", label: "Small Straight", section: "lower" },
      { key: "largeStraight", label: "Large Straight", section: "lower" },
      { key: "yahtzee", label: "Yahtzee", section: "lower" },
      { key: "chance", label: "Chance", section: "lower" },
    ];
    const UPPER_BONUS_THRESHOLD = 63;
    const UPPER_BONUS = 35;

    const state = {
      dice: [1, 1, 1, 1, 1],
      held: [false, false, false, false, false],
      rollsLeft: 3,
      scores: {}, // key -> number | null (unset)
      rolling: false,
      over: false,
      turnRolled: false,
    };

    let spinInterval = null;

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "14px";
    wrap.style.width = "100%";
    wrap.style.maxWidth = "620px";

    const statsEl = document.createElement("div");
    statsEl.style.display = "flex";
    statsEl.style.gap = "18px";
    statsEl.style.fontSize = ".85rem";
    statsEl.style.color = "var(--text-dim)";

    const diceRow = document.createElement("div");
    diceRow.style.display = "flex";
    diceRow.style.gap = "10px";
    diceRow.style.justifyContent = "center";

    const dieEls = [];
    for (let i = 0; i < 5; i++) {
      const d = document.createElement("button");
      d.className = "btn";
      d.style.width = "64px";
      d.style.height = "64px";
      d.style.fontSize = "2rem";
      d.style.display = "flex";
      d.style.alignItems = "center";
      d.style.justifyContent = "center";
      d.onclick = () => toggleHold(i);
      diceRow.appendChild(d);
      dieEls.push(d);
    }

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "10px";
    const rollBtn = document.createElement("button");
    rollBtn.className = "btn primary";
    rollBtn.textContent = "Roll Dice";
    rollBtn.onclick = rollDice;
    const newBtn = document.createElement("button");
    newBtn.className = "btn";
    newBtn.textContent = "New Game";
    newBtn.onclick = newGame;
    controls.appendChild(rollBtn);
    controls.appendChild(newBtn);

    const cardEl = document.createElement("div");
    cardEl.style.width = "100%";
    cardEl.style.display = "grid";
    cardEl.style.gridTemplateColumns = "repeat(auto-fill, minmax(170px, 1fr))";
    cardEl.style.gap = "6px";

    wrap.appendChild(statsEl);
    wrap.appendChild(diceRow);
    wrap.appendChild(controls);
    wrap.appendChild(cardEl);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Force Yahtzee",
        run() {
          if (state.over || state.rolling) return;
          state.dice = [6, 6, 6, 6, 6];
          state.turnRolled = true;
          if (state.rollsLeft === 3) state.rollsLeft = 2;
          renderDice();
          renderCard();
          updateStats();
          rollBtn.disabled = state.rollsLeft <= 0;
          rollBtn.textContent = state.rollsLeft <= 0 ? "No Rolls Left" : `Roll Dice (${state.rollsLeft} left)`;
        },
      },
      {
        label: "Add Bonus +50",
        run() {
          if (state.over) return;
          const cat = CATEGORIES.find((c) => typeof state.scores[c.key] !== "number");
          if (!cat) return;
          state.scores[cat.key] = 50;
          ctx.playSound("success");
          startNewTurn();
          renderCard();
          updateStats();
          checkGameOver();
        },
      },
    ]);

    function toggleHold(i) {
      if (!state.turnRolled || state.rolling || state.over) return;
      if (state.rollsLeft === 0) return;
      state.held[i] = !state.held[i];
      ctx.playSound("click");
      renderDice();
    }

    function rollDice() {
      if (state.rolling || state.over || state.rollsLeft <= 0) return;
      state.rolling = true;
      rollBtn.disabled = true;
      let ticks = 0;
      spinInterval = setInterval(() => {
        for (let i = 0; i < 5; i++) {
          if (!state.held[i]) state.dice[i] = 1 + Math.floor(Math.random() * 6);
        }
        renderDice();
        ticks++;
        if (ticks >= 8) {
          clearInterval(spinInterval);
          spinInterval = null;
          state.rolling = false;
          state.rollsLeft--;
          state.turnRolled = true;
          ctx.playSound("pop");
          ctx.vibrate(10);
          renderDice();
          renderCard();
          updateStats();
          rollBtn.disabled = state.rollsLeft <= 0;
          rollBtn.textContent = state.rollsLeft <= 0 ? "No Rolls Left" : `Roll Dice (${state.rollsLeft} left)`;
        }
      }, 70);
      ctx.playSound("tick");
    }

    function renderDice() {
      dieEls.forEach((el, i) => {
        el.textContent = DIE_FACES[state.dice[i]];
        el.style.opacity = state.held[i] ? "1" : ".85";
        el.style.background = state.held[i] ? "var(--accent2)" : "var(--panel-light)";
        el.style.borderColor = state.held[i] ? "var(--accent2)" : "var(--border)";
        el.disabled = !state.turnRolled || state.rolling || state.over || state.rollsLeft === 3;
      });
    }

    function counts() {
      const c = [0, 0, 0, 0, 0, 0, 0];
      state.dice.forEach((v) => c[v]++);
      return c;
    }

    function sumOf(n) {
      return state.dice.filter((v) => v === n).length * n;
    }

    function computeScore(key) {
      const c = counts();
      const total = state.dice.reduce((a, b) => a + b, 0);
      switch (key) {
        case "ones": return sumOf(1);
        case "twos": return sumOf(2);
        case "threes": return sumOf(3);
        case "fours": return sumOf(4);
        case "fives": return sumOf(5);
        case "sixes": return sumOf(6);
        case "threeKind": return c.some((n) => n >= 3) ? total : 0;
        case "fourKind": return c.some((n) => n >= 4) ? total : 0;
        case "fullHouse": {
          const vals = c.slice(1);
          return vals.includes(3) && vals.includes(2) ? 25 : 0;
        }
        case "smallStraight": {
          const set = new Set(state.dice);
          const runs = [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]];
          return runs.some((run) => run.every((v) => set.has(v))) ? 30 : 0;
        }
        case "largeStraight": {
          const set = new Set(state.dice);
          const runs = [[1, 2, 3, 4, 5], [2, 3, 4, 5, 6]];
          return runs.some((run) => run.every((v) => set.has(v)) && set.size === 5) ? 40 : 0;
        }
        case "yahtzee": return c.some((n) => n === 5) ? 50 : 0;
        case "chance": return total;
        default: return 0;
      }
    }

    function upperSubtotal() {
      let sum = 0;
      ["ones", "twos", "threes", "fours", "fives", "sixes"].forEach((k) => {
        if (typeof state.scores[k] === "number") sum += state.scores[k];
      });
      return sum;
    }

    function grandTotal() {
      let sum = 0;
      Object.values(state.scores).forEach((v) => {
        if (typeof v === "number") sum += v;
      });
      if (upperSubtotal() >= UPPER_BONUS_THRESHOLD) sum += UPPER_BONUS;
      return sum;
    }

    function chooseCategory(key) {
      if (state.over || !state.turnRolled) return;
      if (state.scores[key] !== null && state.scores[key] !== undefined) return;
      const pts = computeScore(key);
      state.scores[key] = pts;
      ctx.playSound(pts > 0 ? "success" : "fail");
      ctx.vibrate(pts > 0 ? 20 : 0);
      startNewTurn();
      renderCard();
      updateStats();
      checkGameOver();
    }

    function startNewTurn() {
      state.dice = [1, 1, 1, 1, 1];
      state.held = [false, false, false, false, false];
      state.rollsLeft = 3;
      state.turnRolled = false;
      rollBtn.disabled = false;
      rollBtn.textContent = "Roll Dice";
      renderDice();
    }

    function checkGameOver() {
      const filled = CATEGORIES.every((c) => typeof state.scores[c.key] === "number");
      if (filled) {
        state.over = true;
        const total = grandTotal();
        const best = ctx.storage.get("bestTotal", 0);
        let newRecord = false;
        if (total > best) {
          ctx.storage.set("bestTotal", total);
          newRecord = true;
        }
        ctx.setStatus(`Final score: ${total}`);
        ctx.playSound("win");
        ctx.confetti(wrap);
        rollBtn.disabled = true;
        setTimeout(() => {
          ctx.showOverlay({
            title: "Scorecard Complete!",
            subtitle: newRecord ? `New best total: ${total}!` : `Final total: ${total}.`,
            buttonText: "New Game",
            onButton: newGame,
          });
        }, 400);
      }
    }

    function renderCard() {
      cardEl.innerHTML = "";
      CATEGORIES.forEach((c) => {
        const row = document.createElement("button");
        row.className = "btn";
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.textAlign = "left";
        const filled = typeof state.scores[c.key] === "number";
        const preview = state.turnRolled && !state.over && !filled ? computeScore(c.key) : null;
        row.disabled = filled || !state.turnRolled || state.over;
        row.onclick = () => chooseCategory(c.key);
        const label = document.createElement("span");
        label.textContent = c.label;
        const val = document.createElement("span");
        val.style.fontWeight = "700";
        val.style.color = filled ? "var(--accent2)" : preview !== null ? "var(--text-dim)" : "var(--text-dim)";
        val.textContent = filled ? String(state.scores[c.key]) : preview !== null ? `(${preview})` : "—";
        row.appendChild(label);
        row.appendChild(val);
        cardEl.appendChild(row);
      });
    }

    function updateStats() {
      const best = ctx.storage.get("bestTotal", 0);
      statsEl.textContent = "";
      const upperEl = document.createElement("div");
      const bonusNote = upperSubtotal() >= UPPER_BONUS_THRESHOLD ? " (+35 bonus)" : ` (need ${UPPER_BONUS_THRESHOLD})`;
      upperEl.textContent = `Upper: ${upperSubtotal()}${bonusNote}`;
      const totalEl = document.createElement("div");
      totalEl.textContent = `Total: ${grandTotal()}`;
      const bestEl = document.createElement("div");
      bestEl.textContent = `Best: ${best}`;
      statsEl.appendChild(upperEl);
      statsEl.appendChild(totalEl);
      statsEl.appendChild(bestEl);
    }

    function newGame() {
      state.dice = [1, 1, 1, 1, 1];
      state.held = [false, false, false, false, false];
      state.rollsLeft = 3;
      state.scores = {};
      state.rolling = false;
      state.over = false;
      state.turnRolled = false;
      rollBtn.disabled = false;
      rollBtn.textContent = "Roll Dice";
      ctx.setStatus("Roll the dice to begin!");
      renderDice();
      renderCard();
      updateStats();
    }

    newGame();

    return () => {
      if (spinInterval) clearInterval(spinInterval);
    };
  },
});
