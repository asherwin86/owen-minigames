MimiGames.register({
  id: "rock-paper-scissors",
  title: "Rock Paper Scissors",
  emoji: "✊",
  category: "Party",
  players: "1-2P",
  howTo: "Pick Rock, Paper, or Scissors. Vs CPU or pass-and-play 2 Player. Best of 5 rounds wins the match.",
  init(root, ctx) {
    const CHOICES = [
      { key: "rock", emoji: "✊", label: "Rock" },
      { key: "paper", emoji: "✋", label: "Paper" },
      { key: "scissors", emoji: "✌️", label: "Scissors" },
    ];
    const BEATS = { rock: "scissors", scissors: "paper", paper: "rock" };
    const SUSPENSE = ["✊", "✋", "✌️"];

    const state = {
      vsCpu: true,
      roundWinsP1: 0,
      roundWinsP2: 0,
      round: 1,
      p1Choice: null,
      p2Choice: null,
      matchOver: false,
      awaiting: "p1", // whose turn to pick this round
      resolving: false,
    };

    let suspenseTimers = [];

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "16px";
    wrap.style.width = "100%";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "10px";
    const modeBtn = document.createElement("button");
    modeBtn.className = "btn primary";
    modeBtn.textContent = "Mode: vs CPU";
    modeBtn.onclick = () => {
      state.vsCpu = !state.vsCpu;
      modeBtn.textContent = state.vsCpu ? "Mode: vs CPU" : "Mode: 2 Player";
      newMatch();
    };
    const restartBtn = document.createElement("button");
    restartBtn.className = "btn";
    restartBtn.textContent = "Restart Match";
    restartBtn.onclick = newMatch;
    controls.appendChild(modeBtn);
    controls.appendChild(restartBtn);

    const scoreRow = document.createElement("div");
    scoreRow.style.display = "flex";
    scoreRow.style.gap = "24px";
    scoreRow.style.fontSize = "1rem";
    scoreRow.style.color = "var(--text)";
    const p1Score = document.createElement("div");
    const p2Score = document.createElement("div");
    scoreRow.appendChild(p1Score);
    scoreRow.appendChild(p2Score);

    const arena = document.createElement("div");
    arena.style.display = "flex";
    arena.style.alignItems = "center";
    arena.style.justifyContent = "center";
    arena.style.gap = "40px";
    arena.style.minHeight = "120px";
    arena.style.width = "100%";
    arena.style.maxWidth = "480px";

    const p1Display = document.createElement("div");
    p1Display.style.fontSize = "4rem";
    p1Display.style.textAlign = "center";
    const vsLabel = document.createElement("div");
    vsLabel.textContent = "VS";
    vsLabel.style.color = "var(--text-dim)";
    vsLabel.style.fontWeight = "700";
    const p2Display = document.createElement("div");
    p2Display.style.fontSize = "4rem";
    p2Display.style.textAlign = "center";
    arena.appendChild(p1Display);
    arena.appendChild(vsLabel);
    arena.appendChild(p2Display);

    const promptEl = document.createElement("div");
    promptEl.style.fontSize = "1rem";
    promptEl.style.color = "var(--accent2)";
    promptEl.style.fontWeight = "600";
    promptEl.style.minHeight = "1.4em";
    promptEl.style.textAlign = "center";

    const passScreen = document.createElement("div");
    passScreen.style.display = "none";
    passScreen.style.flexDirection = "column";
    passScreen.style.alignItems = "center";
    passScreen.style.gap = "10px";
    const passLabel = document.createElement("div");
    passLabel.style.fontSize = "1rem";
    passLabel.style.color = "var(--text)";
    const passBtn = document.createElement("button");
    passBtn.className = "btn primary";
    passBtn.textContent = "I'm ready";
    passScreen.appendChild(passLabel);
    passScreen.appendChild(passBtn);

    const choiceRow = document.createElement("div");
    choiceRow.style.display = "flex";
    choiceRow.style.gap = "16px";

    CHOICES.forEach((c) => {
      const b = document.createElement("button");
      b.className = "btn";
      b.style.fontSize = "2.2rem";
      b.style.width = "80px";
      b.style.height = "80px";
      b.style.padding = "0";
      b.textContent = c.emoji;
      b.title = c.label;
      b.onclick = () => pick(c.key);
      choiceRow.appendChild(b);
    });

    wrap.appendChild(controls);
    wrap.appendChild(scoreRow);
    wrap.appendChild(arena);
    wrap.appendChild(promptEl);
    wrap.appendChild(passScreen);
    wrap.appendChild(choiceRow);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Force P1 Win Match",
        run: () => {
          if (state.matchOver) return;
          clearSuspense();
          state.roundWinsP1 = 3;
          endMatch();
        },
      },
      {
        label: "Reveal Opponent's Pick",
        run: () => {
          if (state.p2Choice) {
            const c2 = CHOICES.find((c) => c.key === state.p2Choice);
            ctx.setStatus(`Opponent picked: ${c2.label}`);
          } else {
            ctx.setStatus("Opponent hasn't picked yet this round.");
          }
        },
      },
    ]);

    function clearSuspense() {
      suspenseTimers.forEach((t) => clearTimeout(t));
      suspenseTimers = [];
    }

    function newMatch() {
      clearSuspense();
      state.roundWinsP1 = 0;
      state.roundWinsP2 = 0;
      state.round = 1;
      state.matchOver = false;
      startRound();
    }

    function startRound() {
      state.p1Choice = null;
      state.p2Choice = null;
      state.resolving = false;
      state.awaiting = "p1";
      p1Display.textContent = "❔";
      p2Display.textContent = "❔";
      passScreen.style.display = "none";
      choiceRow.style.display = "flex";
      updateScores();
      if (state.vsCpu) {
        promptEl.textContent = `Round ${state.round} — make your choice!`;
      } else {
        promptEl.textContent = `Round ${state.round} — Player 1, choose!`;
      }
      setChoicesEnabled(true);
    }

    function updateScores() {
      const p1Name = "Player 1";
      const p2Name = state.vsCpu ? "CPU" : "Player 2";
      p1Score.textContent = `${p1Name}: ${state.roundWinsP1}`;
      p2Score.textContent = `${p2Name}: ${state.roundWinsP2}`;
    }

    function setChoicesEnabled(enabled) {
      Array.from(choiceRow.children).forEach((b) => (b.disabled = !enabled));
    }

    function pick(key) {
      if (state.matchOver || state.resolving) return;
      if (state.vsCpu) {
        if (state.p1Choice) return;
        state.p1Choice = key;
        setChoicesEnabled(false);
        ctx.playSound("select");
        const cpuKey = CHOICES[Math.floor(Math.random() * CHOICES.length)].key;
        state.p2Choice = cpuKey;
        runSuspense();
      } else {
        if (state.awaiting === "p1") {
          state.p1Choice = key;
          state.awaiting = "p2";
          ctx.playSound("select");
          choiceRow.style.display = "none";
          passScreen.style.display = "flex";
          passLabel.textContent = "Player 1 has chosen. Pass the device to Player 2, then continue.";
          promptEl.textContent = "";
          passBtn.textContent = "Player 2 ready";
          passBtn.onclick = () => {
            passScreen.style.display = "none";
            choiceRow.style.display = "flex";
            promptEl.textContent = `Round ${state.round} — Player 2, choose!`;
          };
        } else if (state.awaiting === "p2") {
          state.p2Choice = key;
          setChoicesEnabled(false);
          ctx.playSound("select");
          runSuspense();
        }
      }
    }

    function runSuspense() {
      state.resolving = true;
      promptEl.textContent = "Rock! Paper! Scissors!";
      const words = ["Rock!", "Paper!", "Scissors!"];
      let i = 0;
      const flashInterval = 220;
      function flash() {
        p1Display.textContent = SUSPENSE[i % SUSPENSE.length];
        p2Display.textContent = SUSPENSE[(i + 1) % SUSPENSE.length];
        promptEl.textContent = words[i % words.length];
        ctx.playSound("tick");
        i++;
      }
      for (let n = 0; n < 5; n++) {
        suspenseTimers.push(setTimeout(flash, n * flashInterval));
      }
      suspenseTimers.push(setTimeout(reveal, 5 * flashInterval));
    }

    function reveal() {
      const c1 = CHOICES.find((c) => c.key === state.p1Choice);
      const c2 = CHOICES.find((c) => c.key === state.p2Choice);
      p1Display.textContent = c1.emoji;
      p2Display.textContent = c2.emoji;

      let result; // "p1", "p2", "tie"
      if (state.p1Choice === state.p2Choice) {
        result = "tie";
      } else if (BEATS[state.p1Choice] === state.p2Choice) {
        result = "p1";
      } else {
        result = "p2";
      }

      const p2Name = state.vsCpu ? "CPU" : "Player 2";
      if (result === "tie") {
        promptEl.textContent = "Tie! Same choice.";
        ctx.playSound("click");
      } else if (result === "p1") {
        state.roundWinsP1++;
        promptEl.textContent = `Player 1 wins the round! (${c1.label} beats ${c2.label})`;
        ctx.playSound("success");
      } else {
        state.roundWinsP2++;
        promptEl.textContent = `${p2Name} wins the round! (${c2.label} beats ${c1.label})`;
        ctx.playSound(state.vsCpu ? "fail" : "success");
      }
      updateScores();
      state.resolving = false;

      const winThreshold = 3; // best of 5
      if (state.roundWinsP1 >= winThreshold || state.roundWinsP2 >= winThreshold) {
        suspenseTimers.push(setTimeout(() => endMatch(), 900));
      } else {
        state.round++;
        suspenseTimers.push(setTimeout(() => startRound(), 1400));
      }
    }

    function endMatch() {
      state.matchOver = true;
      setChoicesEnabled(false);
      const p2Name = state.vsCpu ? "CPU" : "Player 2";
      const winner = state.roundWinsP1 > state.roundWinsP2 ? "Player 1" : p2Name;
      const isPlayerWin = winner === "Player 1" || !state.vsCpu;
      ctx.setStatus(`${winner} wins the match!`);
      if (winner === "Player 1") ctx.confetti(wrap);
      ctx.playSound(state.vsCpu && winner !== "Player 1" ? "lose" : "win");
      ctx.showOverlay({
        title: `${winner} Wins the Match!`,
        subtitle: `Final score — Player 1: ${state.roundWinsP1} · ${p2Name}: ${state.roundWinsP2}`,
        buttonText: "Play Again",
        onButton: newMatch,
      });
    }

    newMatch();

    return () => {
      clearSuspense();
    };
  },
});
