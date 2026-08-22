MimiGames.register({
  id: "mastermind",
  title: "Mastermind",
  emoji: "🔮",
  category: "Puzzle",
  players: "1P",
  howTo: "Click colors to build a 4-peg guess, then Submit. Black pegs = right color+spot, white = right color wrong spot. Crack the code in 10 tries.",
  init(root, ctx) {
    const COLORS = [
      { name: "Red", hex: "#ff4757" },
      { name: "Blue", hex: "#00d2ff" },
      { name: "Green", hex: "#35d07f" },
      { name: "Yellow", hex: "#ffd93d" },
      { name: "Purple", hex: "#a55eea" },
      { name: "Orange", hex: "#ff9f43" },
    ];
    const CODE_LEN = 4;
    const MAX_GUESSES = 10;

    const state = {
      code: [],
      guess: [null, null, null, null],
      history: [], // {guess:[idx..], black, white}
      over: false,
      won: false,
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "14px";
    wrap.style.width = "100%";
    wrap.style.maxWidth = "480px";

    const statsEl = document.createElement("div");
    statsEl.style.display = "flex";
    statsEl.style.gap = "20px";
    statsEl.style.fontSize = ".9rem";
    statsEl.style.color = "var(--text-dim)";

    const historyEl = document.createElement("div");
    historyEl.style.display = "flex";
    historyEl.style.flexDirection = "column";
    historyEl.style.gap = "6px";
    historyEl.style.width = "100%";
    historyEl.style.maxHeight = "230px";
    historyEl.style.overflowY = "auto";
    historyEl.style.padding = "6px";
    historyEl.style.background = "var(--bg-alt)";
    historyEl.style.borderRadius = "10px";
    historyEl.style.border = "1px solid var(--border)";

    const guessRow = document.createElement("div");
    guessRow.style.display = "flex";
    guessRow.style.gap = "10px";
    guessRow.style.justifyContent = "center";

    const slotEls = [];
    for (let i = 0; i < CODE_LEN; i++) {
      const slot = document.createElement("div");
      slot.style.width = "48px";
      slot.style.height = "48px";
      slot.style.borderRadius = "50%";
      slot.style.border = "2px dashed var(--border)";
      slot.style.background = "var(--panel-light)";
      slot.style.cursor = "pointer";
      slot.onclick = () => {
        state.guess[i] = null;
        ctx.playSound("click");
        renderGuess();
      };
      guessRow.appendChild(slot);
      slotEls.push(slot);
    }

    const paletteRow = document.createElement("div");
    paletteRow.style.display = "flex";
    paletteRow.style.gap = "10px";
    paletteRow.style.justifyContent = "center";
    paletteRow.style.flexWrap = "wrap";

    COLORS.forEach((col, idx) => {
      const b = document.createElement("button");
      b.style.width = "44px";
      b.style.height = "44px";
      b.style.borderRadius = "50%";
      b.style.border = "2px solid var(--border)";
      b.style.background = col.hex;
      b.style.cursor = "pointer";
      b.title = col.name;
      b.onclick = () => addColor(idx);
      paletteRow.appendChild(b);
    });

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "10px";
    const submitBtn = document.createElement("button");
    submitBtn.className = "btn primary";
    submitBtn.textContent = "Submit Guess";
    submitBtn.onclick = submitGuess;
    const clearBtn = document.createElement("button");
    clearBtn.className = "btn";
    clearBtn.textContent = "Clear";
    clearBtn.onclick = () => {
      state.guess = [null, null, null, null];
      renderGuess();
    };
    const newBtn = document.createElement("button");
    newBtn.className = "btn";
    newBtn.textContent = "New Game";
    newBtn.onclick = newGame;
    controls.appendChild(submitBtn);
    controls.appendChild(clearBtn);
    controls.appendChild(newBtn);

    wrap.appendChild(statsEl);
    wrap.appendChild(historyEl);
    wrap.appendChild(guessRow);
    wrap.appendChild(paletteRow);
    wrap.appendChild(controls);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Reveal Code",
        run: () => {
          ctx.setStatus(`Code: ${state.code.map((i) => COLORS[i].name).join(", ")}`);
        },
      },
      {
        label: "Auto-Solve",
        run: () => {
          if (state.over) return;
          state.guess = state.code.slice();
          renderGuess();
          submitGuess();
        },
      },
    ]);

    function addColor(idx) {
      if (state.over) return;
      const emptyIdx = state.guess.indexOf(null);
      if (emptyIdx === -1) return;
      state.guess[emptyIdx] = idx;
      ctx.playSound("tick");
      renderGuess();
    }

    function renderGuess() {
      slotEls.forEach((slot, i) => {
        const v = state.guess[i];
        slot.style.background = v === null ? "var(--panel-light)" : COLORS[v].hex;
        slot.style.border = v === null ? "2px dashed var(--border)" : "2px solid var(--border)";
      });
      submitBtn.disabled = state.guess.includes(null) || state.over;
    }

    function computeFeedback(guess, code) {
      let black = 0;
      const gRest = [];
      const cRest = [];
      for (let i = 0; i < CODE_LEN; i++) {
        if (guess[i] === code[i]) {
          black++;
        } else {
          gRest.push(guess[i]);
          cRest.push(code[i]);
        }
      }
      let white = 0;
      const used = new Array(cRest.length).fill(false);
      gRest.forEach((g) => {
        const idx = cRest.findIndex((c, i) => !used[i] && c === g);
        if (idx !== -1) {
          used[idx] = true;
          white++;
        }
      });
      return { black, white };
    }

    function submitGuess() {
      if (state.over || state.guess.includes(null)) return;
      const guessCopy = state.guess.slice();
      const { black, white } = computeFeedback(guessCopy, state.code);
      state.history.push({ guess: guessCopy, black, white });
      ctx.playSound(black === CODE_LEN ? "win" : "pop");
      state.guess = [null, null, null, null];
      renderGuess();
      renderHistory();
      updateStats();

      if (black === CODE_LEN) {
        state.over = true;
        state.won = true;
        const best = ctx.storage.get("bestGuesses", null);
        let newRecord = false;
        if (best === null || state.history.length < best) {
          ctx.storage.set("bestGuesses", state.history.length);
          newRecord = true;
        }
        ctx.setStatus(`Cracked it in ${state.history.length} guesses!`);
        ctx.confetti(wrap);
        setTimeout(() => {
          ctx.showOverlay({
            title: "You Cracked It!",
            subtitle: newRecord
              ? `New best: ${state.history.length} guesses!`
              : `Solved in ${state.history.length} guesses.`,
            buttonText: "Play Again",
            onButton: newGame,
          });
        }, 300);
      } else if (state.history.length >= MAX_GUESSES) {
        state.over = true;
        ctx.playSound("lose");
        ctx.setStatus("Out of guesses!");
        renderGuess();
        setTimeout(() => {
          ctx.showOverlay({
            title: "Out of Guesses",
            subtitle: `The code was: ${state.code.map((i) => COLORS[i].name).join(", ")}`,
            buttonText: "Try Again",
            onButton: newGame,
          });
        }, 300);
      }
      submitBtn.disabled = true;
    }

    function renderHistory() {
      historyEl.innerHTML = "";
      if (state.history.length === 0) {
        const empty = document.createElement("div");
        empty.style.color = "var(--text-dim)";
        empty.style.fontSize = ".8rem";
        empty.style.textAlign = "center";
        empty.style.padding = "8px";
        empty.textContent = "Your guesses will appear here.";
        historyEl.appendChild(empty);
        return;
      }
      state.history.forEach((h, i) => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "10px";
        row.style.padding = "4px 6px";

        const num = document.createElement("div");
        num.style.fontSize = ".75rem";
        num.style.color = "var(--text-dim)";
        num.style.width = "18px";
        num.textContent = String(i + 1);

        const dots = document.createElement("div");
        dots.style.display = "flex";
        dots.style.gap = "6px";
        h.guess.forEach((ci) => {
          const d = document.createElement("div");
          d.style.width = "22px";
          d.style.height = "22px";
          d.style.borderRadius = "50%";
          d.style.background = COLORS[ci].hex;
          d.style.border = "1px solid var(--border)";
          dots.appendChild(d);
        });

        const pegs = document.createElement("div");
        pegs.style.display = "grid";
        pegs.style.gridTemplateColumns = "repeat(2, 8px)";
        pegs.style.gridTemplateRows = "repeat(2, 8px)";
        pegs.style.gap = "3px";
        pegs.style.marginLeft = "8px";
        const pegList = [
          ...Array(h.black).fill("#111"),
          ...Array(h.white).fill("#eee"),
          ...Array(CODE_LEN - h.black - h.white).fill("transparent"),
        ];
        pegList.forEach((color) => {
          const p = document.createElement("div");
          p.style.width = "8px";
          p.style.height = "8px";
          p.style.borderRadius = "50%";
          p.style.background = color;
          p.style.border = color === "transparent" ? "1px solid var(--border)" : "1px solid #000";
          pegs.appendChild(p);
        });

        const label = document.createElement("div");
        label.style.fontSize = ".72rem";
        label.style.color = "var(--text-dim)";
        label.textContent = `${h.black}B ${h.white}W`;

        row.appendChild(num);
        row.appendChild(dots);
        row.appendChild(pegs);
        row.appendChild(label);
        historyEl.appendChild(row);
      });
      historyEl.scrollTop = historyEl.scrollHeight;
    }

    function updateStats() {
      const best = ctx.storage.get("bestGuesses", null);
      statsEl.textContent = "";
      const triesEl = document.createElement("div");
      triesEl.textContent = `Guess ${Math.min(state.history.length + 1, MAX_GUESSES)}/${MAX_GUESSES}`;
      const bestEl = document.createElement("div");
      bestEl.textContent = `Best: ${best === null ? "—" : best + " guesses"}`;
      statsEl.appendChild(triesEl);
      statsEl.appendChild(bestEl);
    }

    function newGame() {
      state.code = [];
      for (let i = 0; i < CODE_LEN; i++) {
        state.code.push(Math.floor(Math.random() * COLORS.length));
      }
      state.guess = [null, null, null, null];
      state.history = [];
      state.over = false;
      state.won = false;
      ctx.setStatus("Crack the secret code!");
      renderGuess();
      renderHistory();
      updateStats();
    }

    newGame();

    return () => {};
  },
});
