MimiGames.register({
  id: "ludo-race",
  title: "Ludo Race",
  emoji: "🏁",
  category: "Board",
  players: "2P",
  howTo: "Hot-seat 2P. Roll the dice and race your token to the end. Land on your opponent to send them back to start. Roll a 6 for another turn.",
  init(root, ctx) {
    // Simplified Ludo: instead of a full cross-shaped board, both players share
    // one winding track of 30 numbered spaces rendered as a wrapping grid of cells.
    const TRACK_LEN = 30; // final space index
    const COLS = 10;

    const state = {
      pos: { 1: 0, 2: 0 }, // 0 = start (off track), 1..TRACK_LEN = on track
      turn: 1,
      over: false,
      rolling: false,
      lastRoll: null,
    };

    let rollTimer = null;

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "14px";
    wrap.style.width = "100%";

    const statusRow = document.createElement("div");
    statusRow.style.fontSize = "1rem";
    statusRow.style.fontWeight = "600";
    statusRow.style.color = "var(--accent2)";
    statusRow.style.minHeight = "1.4em";

    const boardEl = document.createElement("div");
    boardEl.style.display = "grid";
    boardEl.style.gridTemplateColumns = `repeat(${COLS}, 42px)`;
    boardEl.style.gridAutoRows = "42px";
    boardEl.style.gap = "3px";
    boardEl.style.background = "var(--panel)";
    boardEl.style.padding = "10px";
    boardEl.style.borderRadius = "10px";
    boardEl.style.border = "1px solid var(--border)";

    // Build cells for spaces 0 (start, shown as label only outside grid) .. TRACK_LEN
    const cellEls = {};
    for (let i = 1; i <= TRACK_LEN; i++) {
      const cell = document.createElement("div");
      cell.style.background = "var(--panel-light)";
      cell.style.border = "1px solid var(--border)";
      cell.style.borderRadius = "6px";
      cell.style.display = "flex";
      cell.style.flexDirection = "column";
      cell.style.alignItems = "center";
      cell.style.justifyContent = "center";
      cell.style.fontSize = ".6rem";
      cell.style.color = "var(--text-dim)";
      cell.style.position = "relative";
      if (i === TRACK_LEN) {
        cell.style.background = "var(--win)";
        cell.style.color = "#08210f";
      }
      const num = document.createElement("div");
      num.textContent = i === TRACK_LEN ? "🏁" : i;
      cell.appendChild(num);
      const tokenRow = document.createElement("div");
      tokenRow.style.display = "flex";
      tokenRow.style.gap = "2px";
      tokenRow.style.fontSize = "1.1rem";
      cell.appendChild(tokenRow);
      cellEls[i] = { cell, tokenRow };
      boardEl.appendChild(cell);
    }

    const startInfo = document.createElement("div");
    startInfo.style.display = "flex";
    startInfo.style.gap = "24px";
    startInfo.style.fontSize = ".8rem";
    startInfo.style.color = "var(--text-dim)";
    const p1StartLabel = document.createElement("div");
    const p2StartLabel = document.createElement("div");
    startInfo.appendChild(p1StartLabel);
    startInfo.appendChild(p2StartLabel);

    const diceRow = document.createElement("div");
    diceRow.style.display = "flex";
    diceRow.style.flexDirection = "column";
    diceRow.style.alignItems = "center";
    diceRow.style.gap = "10px";

    const diceDisplay = document.createElement("div");
    diceDisplay.style.fontSize = "2.6rem";
    diceDisplay.style.width = "70px";
    diceDisplay.style.height = "70px";
    diceDisplay.style.display = "flex";
    diceDisplay.style.alignItems = "center";
    diceDisplay.style.justifyContent = "center";
    diceDisplay.style.background = "var(--panel-light)";
    diceDisplay.style.border = "1px solid var(--border)";
    diceDisplay.style.borderRadius = "12px";
    diceDisplay.textContent = "?";

    const rollBtn = document.createElement("button");
    rollBtn.className = "btn primary";
    rollBtn.textContent = "Roll Dice";
    rollBtn.onclick = rollDice;

    const restartBtn = document.createElement("button");
    restartBtn.className = "btn";
    restartBtn.textContent = "Restart";
    restartBtn.onclick = reset;

    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.gap = "10px";
    btnRow.appendChild(rollBtn);
    btnRow.appendChild(restartBtn);

    diceRow.appendChild(diceDisplay);
    diceRow.appendChild(btnRow);

    wrap.appendChild(statusRow);
    wrap.appendChild(boardEl);
    wrap.appendChild(startInfo);
    wrap.appendChild(diceRow);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Force Win",
        run: () => {
          if (state.over) return;
          state.pos[state.turn] = TRACK_LEN;
          render();
          finishGame(state.turn);
        },
      },
      {
        label: "Send Opponent to Start",
        run: () => {
          if (state.over) return;
          const opponent = state.turn === 1 ? 2 : 1;
          state.pos[opponent] = 0;
          render();
          ctx.setStatus(`Player ${opponent} was sent back to start!`);
        },
      },
    ]);

    const DICE_FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

    function reset() {
      if (rollTimer) {
        clearInterval(rollTimer);
        rollTimer = null;
      }
      state.pos = { 1: 0, 2: 0 };
      state.turn = 1;
      state.over = false;
      state.rolling = false;
      state.lastRoll = null;
      diceDisplay.textContent = "?";
      updateStatus();
      render();
    }

    function updateStatus() {
      if (state.over) return;
      statusRow.textContent = `Player ${state.turn}'s turn — roll the dice!`;
      statusRow.style.color = state.turn === 1 ? "var(--accent)" : "var(--accent2)";
      ctx.setStatus(`Player ${state.turn}'s turn`);
    }

    function rollDice() {
      if (state.over || state.rolling) return;
      state.rolling = true;
      rollBtn.disabled = true;
      let ticks = 0;
      rollTimer = setInterval(() => {
        diceDisplay.textContent = DICE_FACES[Math.floor(Math.random() * 6)];
        ctx.playSound("tick");
        ticks++;
        if (ticks >= 8) {
          clearInterval(rollTimer);
          rollTimer = null;
          settleRoll();
        }
      }, 80);
    }

    function settleRoll() {
      const roll = 1 + Math.floor(Math.random() * 6);
      state.lastRoll = roll;
      diceDisplay.textContent = DICE_FACES[roll - 1];
      ctx.playSound("pop");
      applyMove(roll);
    }

    function applyMove(roll) {
      const mover = state.turn;
      const opponent = mover === 1 ? 2 : 1;
      let newPos = state.pos[mover] + roll;
      if (newPos >= TRACK_LEN) {
        newPos = TRACK_LEN;
      }
      state.pos[mover] = newPos;

      // Landing exactly on opponent sends them back to start
      let bumped = false;
      if (newPos > 0 && newPos < TRACK_LEN && newPos === state.pos[opponent]) {
        state.pos[opponent] = 0;
        bumped = true;
      }

      render();

      if (newPos >= TRACK_LEN) {
        finishGame(mover);
        return;
      }

      if (bumped) {
        ctx.playSound("hit");
        statusRow.textContent = `Ouch! Player ${mover} sent Player ${opponent} back to start!`;
      }

      const getsExtra = roll === 6;
      state.rolling = false;
      rollBtn.disabled = false;

      if (getsExtra) {
        setTimeout(() => {
          if (state.over) return;
          statusRow.textContent = `Player ${mover} rolled a 6 — roll again!`;
        }, bumped ? 900 : 0);
      } else {
        state.turn = opponent;
        setTimeout(() => {
          if (state.over) return;
          updateStatus();
        }, bumped ? 900 : 0);
      }
    }

    function finishGame(winner) {
      state.over = true;
      state.rolling = false;
      rollBtn.disabled = true;
      ctx.playSound("win");
      ctx.confetti(wrap);
      statusRow.textContent = `Player ${winner} wins!`;
      ctx.setStatus(`Player ${winner} wins!`);
      setTimeout(() => {
        ctx.showOverlay({
          title: `Player ${winner} Wins!`,
          subtitle: "First to the finish line!",
          buttonText: "Play Again",
          onButton: reset,
        });
      }, 500);
    }

    function render() {
      // clear tokens
      for (let i = 1; i <= TRACK_LEN; i++) {
        cellEls[i].tokenRow.innerHTML = "";
      }
      p1StartLabel.textContent = state.pos[1] === 0 ? "Player 1: at Start 🔴" : "Player 1: on track";
      p2StartLabel.textContent = state.pos[2] === 0 ? "Player 2: at Start 🔵" : "Player 2: on track";

      [1, 2].forEach((p) => {
        const pos = state.pos[p];
        if (pos > 0) {
          const tok = document.createElement("span");
          tok.textContent = p === 1 ? "🔴" : "🔵";
          cellEls[pos].tokenRow.appendChild(tok);
        }
      });

      rollBtn.disabled = state.over || state.rolling;
    }

    reset();

    return () => {
      if (rollTimer) clearInterval(rollTimer);
    };
  },
});
