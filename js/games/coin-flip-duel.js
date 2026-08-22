MimiGames.register({
  id: "coin-flip-duel",
  title: "Coin Flip Duel",
  emoji: "🪙",
  category: "Party",
  players: "1-2P",
  howTo: "The caller picks Heads or Tails, then Flip. Guess right and the caller scores, guess wrong and the other player scores. Callers alternate each round. Best of 7 wins the match.",
  init(root, ctx) {
    const ROUNDS_TO_WIN = 4;

    const state = {
      vsCpu: true,
      p1Score: 0,
      p2Score: 0,
      round: 1,
      caller: "p1", // 'p1' | 'p2'
      guess: null, // 'H' | 'T'
      flipping: false,
      over: false,
      history: [], // recent flip results, most recent last
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

    const coin = document.createElement("div");
    coin.style.width = "100px";
    coin.style.height = "100px";
    coin.style.borderRadius = "50%";
    coin.style.background = "linear-gradient(135deg, #ffd93d, #d4a017)";
    coin.style.display = "flex";
    coin.style.alignItems = "center";
    coin.style.justifyContent = "center";
    coin.style.fontSize = "2.4rem";
    coin.style.fontWeight = "800";
    coin.style.color = "#3a2a00";
    coin.style.border = "3px solid #a5730c";
    coin.textContent = "🪙";

    const callInfo = document.createElement("div");
    callInfo.style.fontWeight = "600";

    const guessRow = document.createElement("div");
    guessRow.style.display = "flex";
    guessRow.style.gap = "10px";
    const headsBtn = document.createElement("button");
    headsBtn.className = "btn";
    headsBtn.textContent = "Heads";
    headsBtn.onclick = () => selectGuess("H");
    const tailsBtn = document.createElement("button");
    tailsBtn.className = "btn";
    tailsBtn.textContent = "Tails";
    tailsBtn.onclick = () => selectGuess("T");
    guessRow.appendChild(headsBtn);
    guessRow.appendChild(tailsBtn);

    const flipBtn = document.createElement("button");
    flipBtn.className = "btn primary";
    flipBtn.textContent = "Flip";
    flipBtn.onclick = doFlip;

    const message = document.createElement("div");
    message.style.minHeight = "1.4em";
    message.style.fontWeight = "600";

    // A running strip of recent flip results — the coin flip and the CPU's
    // guess are each an independent 50/50 draw, but a caller only gets
    // roughly 3 calls in a best-of-7 match, so any one match's streaks are
    // easy to misread as bias. Keeping the last several results visible
    // (persists across the whole session, not just one match) makes it
    // possible to actually see the balance for yourself instead of having
    // to trust it.
    const HISTORY_MAX = 16;
    const historyLabel = document.createElement("div");
    historyLabel.style.cssText = "font-size:.75rem;opacity:.7;margin-top:2px";
    historyLabel.textContent = "Recent flips:";
    const historyRow = document.createElement("div");
    historyRow.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;justify-content:center;max-width:320px";

    function renderHistory() {
      historyRow.innerHTML = "";
      state.history.forEach((letter) => {
        const chip = document.createElement("span");
        chip.textContent = letter;
        chip.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;font-size:.72rem;font-weight:700;color:#3a2a00;background:${letter === "H" ? "#ffd93d" : "#c9c9c9"};`;
        historyRow.appendChild(chip);
      });
      const heads = state.history.filter((l) => l === "H").length;
      const tails = state.history.length - heads;
      historyLabel.textContent = state.history.length ? `Recent flips (${heads}H / ${tails}T):` : "Recent flips:";
    }

    wrap.appendChild(controls);
    wrap.appendChild(scoreRow);
    wrap.appendChild(coin);
    wrap.appendChild(callInfo);
    wrap.appendChild(guessRow);
    wrap.appendChild(flipBtn);
    wrap.appendChild(message);
    wrap.appendChild(historyLabel);
    wrap.appendChild(historyRow);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Rig Flip: Off",
        run(e) {
          state.rigFlip = !state.rigFlip;
          e.target.textContent = `Rig Flip: ${state.rigFlip ? "On" : "Off"}`;
        },
      },
      {
        label: "Force Win (P1)",
        run() {
          if (state.over) return;
          state.p1Score = ROUNDS_TO_WIN;
          renderScores();
          state.over = true;
          updateButtons();
          ctx.playSound("success");
          message.textContent = "Player 1 forced the match win!";
          ctx.showOverlay({
            title: "Player 1 Wins the Match!",
            subtitle: `Final score: Player 1 ${state.p1Score} - ${state.p2Score} ${state.vsCpu ? "CPU" : "Player 2"}`,
            buttonText: "Play Again",
            onButton: reset,
          });
        },
      },
    ]);

    function callerLabel(who) {
      who = who || state.caller;
      if (who === "p1") return "Player 1";
      return state.vsCpu ? "CPU" : "Player 2";
    }
    function otherLabel(who) {
      return callerLabel(who === "p1" ? "p2" : "p1");
    }

    function renderScores() {
      p1ScoreEl.textContent = `Player 1: ${state.p1Score}`;
      p2ScoreEl.textContent = `${state.vsCpu ? "CPU" : "Player 2"}: ${state.p2Score}`;
    }

    function selectGuess(g) {
      if (state.flipping || state.over) return;
      if (state.caller === "p2" && state.vsCpu) return; // CPU calls itself
      state.guess = g;
      headsBtn.classList.toggle("primary", g === "H");
      tailsBtn.classList.toggle("primary", g === "T");
      updateButtons();
    }

    function updateButtons() {
      const isCpuTurn = state.caller === "p2" && state.vsCpu;
      headsBtn.disabled = state.flipping || state.over || isCpuTurn;
      tailsBtn.disabled = state.flipping || state.over || isCpuTurn;
      flipBtn.disabled = state.flipping || state.over || !state.guess || isCpuTurn;
      flipBtn.style.display = state.over ? "none" : "inline-block";
      guessRow.style.display = state.over ? "none" : "flex";
      callInfo.textContent = state.over
        ? ""
        : `Round ${state.round}: ${callerLabel()} is calling${isCpuTurn ? " (thinking...)" : ""}`;
    }

    function doFlip() {
      if (state.flipping || state.over || !state.guess) return;
      state.flipping = true;
      updateButtons();
      ctx.playSound("click");

      const result = state.rigFlip ? state.guess : (Math.random() < 0.5 ? "H" : "T");
      let ticks = 0;
      const interval = setInterval(() => {
        coin.textContent = Math.random() < 0.5 ? "H" : "T";
        ticks++;
        if (ticks >= 10) {
          clearInterval(interval);
          const idx = timers.indexOf(interval);
          if (idx >= 0) timers.splice(idx, 1);
          coin.textContent = result;
          resolveRound(result);
        }
      }, 80);
      timers.push(interval);
    }

    function resolveRound(result) {
      const win = state.guess === result;
      const winner = win ? state.caller : (state.caller === "p1" ? "p2" : "p1");
      if (winner === "p1") state.p1Score++;
      else state.p2Score++;
      renderScores();
      state.history.push(result);
      if (state.history.length > HISTORY_MAX) state.history.shift();
      renderHistory();
      ctx.playSound(win ? "success" : "fail");

      const resultWord = result === "H" ? "Heads" : "Tails";
      const guessWord = state.guess === "H" ? "Heads" : "Tails";
      const callerName = callerLabel();

      if (state.p1Score >= ROUNDS_TO_WIN || state.p2Score >= ROUNDS_TO_WIN) {
        state.over = true;
        message.textContent = `${resultWord}! ${callerName} called ${guessWord} — ${win ? "correct" : "wrong"}.`;
        const matchWinner = state.p1Score > state.p2Score ? "Player 1" : (state.vsCpu ? "CPU" : "Player 2");
        updateButtons();
        const t = setTimeout(() => {
          ctx.showOverlay({
            title: `${matchWinner} Wins the Match!`,
            subtitle: `Final score: Player 1 ${state.p1Score} - ${state.p2Score} ${state.vsCpu ? "CPU" : "Player 2"}`,
            buttonText: "Play Again",
            onButton: reset,
          });
        }, 500);
        timers.push(t);
        return;
      }

      // Always name what the caller actually called, not just whether they
      // won — the coin flip and the CPU's guess are both independently
      // randomized, but with a caller only getting ~3 calls per best-of-7
      // match, a normal streak is easy to misread as "it's always X" when
      // there's no way to double-check what was actually called each round.
      message.textContent = `${resultWord}! ${callerName} called ${guessWord} — ${win ? "guessed right and scores!" : "guessed wrong — " + otherLabel() + " scores!"}`;
      state.round++;
      state.caller = state.caller === "p1" ? "p2" : "p1";
      state.guess = null;
      state.flipping = false;
      headsBtn.classList.remove("primary");
      tailsBtn.classList.remove("primary");
      updateButtons();

      if (state.caller === "p2" && state.vsCpu) {
        const t = setTimeout(() => {
          state.guess = Math.random() < 0.5 ? "H" : "T";
          updateButtons();
          const t2 = setTimeout(doFlip, 500);
          timers.push(t2);
        }, 500);
        timers.push(t);
      }
    }

    function reset() {
      state.p1Score = 0;
      state.p2Score = 0;
      state.round = 1;
      state.caller = "p1";
      state.guess = null;
      state.flipping = false;
      state.over = false;
      coin.textContent = "🪙";
      headsBtn.classList.remove("primary");
      tailsBtn.classList.remove("primary");
      renderScores();
      updateButtons();
      message.textContent = "";
      ctx.setStatus(`Best of 7 rounds — first to ${ROUNDS_TO_WIN} wins.`);
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
