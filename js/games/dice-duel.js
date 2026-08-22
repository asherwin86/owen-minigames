MimiGames.register({
  id: "dice-duel",
  title: "Dice Duel",
  emoji: "🎲",
  category: "Party",
  players: "1-2P",
  howTo: "Take turns rolling two dice — higher total wins the round (ties re-roll). Best of 5 rounds wins the match. Play vs a friend, or vs the CPU.",
  init(root, ctx) {
    const FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
    const ROUNDS_TO_WIN = 3;

    const state = {
      vsCpu: true,
      p1Rounds: 0,
      p2Rounds: 0,
      round: 1,
      phase: "p1", // 'p1' | 'p2' | 'done'
      p1Dice: [null, null],
      p2Dice: [null, null],
      over: false,
      rolling: false,
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
    const cpuBtn = document.createElement("button");
    cpuBtn.className = "btn primary";
    cpuBtn.textContent = "Mode: vs CPU";
    cpuBtn.onclick = () => {
      state.vsCpu = !state.vsCpu;
      cpuBtn.textContent = state.vsCpu ? "Mode: vs CPU" : "Mode: 2 Player";
      reset();
    };
    const restartBtn = document.createElement("button");
    restartBtn.className = "btn";
    restartBtn.textContent = "Restart Match";
    restartBtn.onclick = reset;
    controls.appendChild(cpuBtn);
    controls.appendChild(restartBtn);

    const scoreRow = document.createElement("div");
    scoreRow.style.display = "flex";
    scoreRow.style.gap = "40px";
    scoreRow.style.fontSize = "1rem";
    scoreRow.style.fontWeight = "600";
    const p1ScoreEl = document.createElement("div");
    const p2ScoreEl = document.createElement("div");
    scoreRow.appendChild(p1ScoreEl);
    scoreRow.appendChild(p2ScoreEl);

    const playersRow = document.createElement("div");
    playersRow.style.display = "flex";
    playersRow.style.gap = "40px";
    playersRow.style.justifyContent = "center";

    function makePlayerBox(label) {
      const box = document.createElement("div");
      box.style.display = "flex";
      box.style.flexDirection = "column";
      box.style.alignItems = "center";
      box.style.gap = "8px";
      const title = document.createElement("div");
      title.style.color = "var(--text-dim)";
      title.textContent = label;
      const diceRow = document.createElement("div");
      diceRow.style.display = "flex";
      diceRow.style.gap = "8px";
      const d1 = document.createElement("div");
      const d2 = document.createElement("div");
      [d1, d2].forEach((d) => {
        d.style.width = "64px";
        d.style.height = "64px";
        d.style.display = "flex";
        d.style.alignItems = "center";
        d.style.justifyContent = "center";
        d.style.fontSize = "2.6rem";
        d.style.background = "var(--panel-light)";
        d.style.border = "2px solid var(--border)";
        d.style.borderRadius = "10px";
        diceRow.appendChild(d);
      });
      const total = document.createElement("div");
      total.style.fontWeight = "700";
      total.style.fontSize = "1.1rem";
      box.appendChild(title);
      box.appendChild(diceRow);
      box.appendChild(total);
      return { box, d1, d2, total };
    }

    const p1Box = makePlayerBox("Player 1");
    const p2Box = makePlayerBox("Player 2");
    playersRow.appendChild(p1Box.box);
    playersRow.appendChild(p2Box.box);

    const message = document.createElement("div");
    message.style.minHeight = "1.4em";
    message.style.fontWeight = "600";

    const rollBtn = document.createElement("button");
    rollBtn.className = "btn primary";
    rollBtn.onclick = doRoll;

    wrap.appendChild(controls);
    wrap.appendChild(scoreRow);
    wrap.appendChild(playersRow);
    wrap.appendChild(message);
    wrap.appendChild(rollBtn);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Rig Dice: Off",
        run(e) {
          state.rigDice = !state.rigDice;
          e.target.textContent = `Rig Dice: ${state.rigDice ? "On" : "Off"}`;
        },
      },
      {
        label: "Force Win (P1)",
        run() {
          if (state.over) return;
          state.p1Rounds = ROUNDS_TO_WIN;
          renderScores();
          state.over = true;
          updateRollBtn();
          ctx.playSound("success");
          message.textContent = "Player 1 forced the match win!";
          ctx.showOverlay({
            title: "Player 1 Wins the Match!",
            subtitle: `Final score: Player 1 ${state.p1Rounds} - ${state.p2Rounds} ${state.vsCpu ? "CPU" : "Player 2"}`,
            buttonText: "Play Again",
            onButton: reset,
          });
        },
      },
    ]);

    function renderScores() {
      p1ScoreEl.textContent = `Player 1: ${state.p1Rounds}`;
      p2ScoreEl.textContent = `${state.vsCpu ? "CPU" : "Player 2"}: ${state.p2Rounds}`;
      p1Box.box.querySelector("div").textContent = "Player 1";
      p2Box.box.querySelector("div").textContent = state.vsCpu ? "CPU" : "Player 2";
    }

    function renderDice() {
      p1Box.d1.textContent = state.p1Dice[0] ? FACES[state.p1Dice[0]] : "";
      p1Box.d2.textContent = state.p1Dice[1] ? FACES[state.p1Dice[1]] : "";
      p2Box.d1.textContent = state.p2Dice[0] ? FACES[state.p2Dice[0]] : "";
      p2Box.d2.textContent = state.p2Dice[1] ? FACES[state.p2Dice[1]] : "";
      p1Box.total.textContent = state.p1Dice[0] && state.p1Dice[1] ? `= ${state.p1Dice[0] + state.p1Dice[1]}` : "";
      p2Box.total.textContent = state.p2Dice[0] && state.p2Dice[1] ? `= ${state.p2Dice[0] + state.p2Dice[1]}` : "";
    }

    function updateRollBtn() {
      if (state.over) {
        rollBtn.style.display = "none";
        return;
      }
      rollBtn.style.display = "inline-block";
      rollBtn.disabled = state.rolling;
      if (state.phase === "p1") {
        rollBtn.textContent = "Player 1: Roll";
      } else if (state.phase === "p2") {
        rollBtn.textContent = state.vsCpu ? "CPU rolling..." : "Player 2: Roll";
        if (state.vsCpu) rollBtn.disabled = true;
      }
    }

    function animateRoll(box, onDone) {
      state.rolling = true;
      updateRollBtn();
      let ticks = 0;
      const interval = setInterval(() => {
        box.d1.textContent = FACES[1 + Math.floor(Math.random() * 6)];
        box.d2.textContent = FACES[1 + Math.floor(Math.random() * 6)];
        ticks++;
        if (ticks >= 8) {
          clearInterval(interval);
          const idx = timers.indexOf(interval);
          if (idx >= 0) timers.splice(idx, 1);
          const a = 1 + Math.floor(Math.random() * 6);
          const b = 1 + Math.floor(Math.random() * 6);
          state.rolling = false;
          onDone(a, b);
        }
      }, 70);
      timers.push(interval);
    }

    function doRoll() {
      if (state.rolling || state.over) return;
      ctx.playSound("click");
      if (state.phase === "p1") {
        animateRoll(p1Box, (a, b) => {
          if (state.rigDice) { a = 6; b = 6; }
          state.p1Dice = [a, b];
          renderDice();
          state.phase = "p2";
          message.textContent = state.vsCpu ? "CPU is rolling..." : "Player 2's turn.";
          updateRollBtn();
          if (state.vsCpu) {
            const t = setTimeout(doRoll, 500);
            timers.push(t);
          }
        });
      } else if (state.phase === "p2") {
        animateRoll(p2Box, (a, b) => {
          state.p2Dice = [a, b];
          renderDice();
          resolveRound();
        });
      }
    }

    function resolveRound() {
      const t1 = state.p1Dice[0] + state.p1Dice[1];
      const t2 = state.p2Dice[0] + state.p2Dice[1];
      const p2Label = state.vsCpu ? "CPU" : "Player 2";
      if (t1 === t2) {
        message.textContent = `Tie ${t1}-${t2}! Re-rolling this round.`;
        ctx.playSound("click");
        const t = setTimeout(() => {
          state.p1Dice = [null, null];
          state.p2Dice = [null, null];
          state.phase = "p1";
          renderDice();
          updateRollBtn();
        }, 900);
        timers.push(t);
        return;
      }
      let winner;
      if (t1 > t2) {
        state.p1Rounds++;
        winner = "Player 1";
      } else {
        state.p2Rounds++;
        winner = p2Label;
      }
      ctx.playSound(t1 > t2 ? "success" : "fail");
      renderScores();

      if (state.p1Rounds >= ROUNDS_TO_WIN || state.p2Rounds >= ROUNDS_TO_WIN) {
        state.over = true;
        message.textContent = `${winner} wins round ${state.round} (${t1} vs ${t2}) and the match!`;
        updateRollBtn();
        const matchWinner = state.p1Rounds > state.p2Rounds ? "Player 1" : p2Label;
        const t = setTimeout(() => {
          ctx.showOverlay({
            title: `${matchWinner} Wins the Match!`,
            subtitle: `Final score: Player 1 ${state.p1Rounds} - ${state.p2Rounds} ${p2Label}`,
            buttonText: "Play Again",
            onButton: reset,
          });
        }, 500);
        timers.push(t);
        return;
      }

      message.textContent = `${winner} wins round ${state.round} (${t1} vs ${t2}).`;
      state.round++;
      state.p1Dice = [null, null];
      state.p2Dice = [null, null];
      state.phase = "p1";
      const t = setTimeout(() => {
        renderDice();
        updateRollBtn();
      }, 600);
      timers.push(t);
    }

    function reset() {
      state.p1Rounds = 0;
      state.p2Rounds = 0;
      state.round = 1;
      state.phase = "p1";
      state.p1Dice = [null, null];
      state.p2Dice = [null, null];
      state.over = false;
      state.rolling = false;
      renderScores();
      renderDice();
      message.textContent = "Round 1 — Player 1, roll the dice!";
      updateRollBtn();
      ctx.setStatus(`Best of 5 rounds — first to ${ROUNDS_TO_WIN} wins.`);
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
