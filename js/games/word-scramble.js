MimiGames.register({
  id: "word-scramble",
  title: "Word Scramble",
  emoji: "🔤",
  category: "Puzzle",
  players: "1P",
  howTo: "Unscramble the letters and type the word. Submit to score, Skip to pass, or use a Hint for a small penalty.",
  init(root, ctx) {
    const WORDS = [
      "planet", "guitar", "bridge", "castle", "orange", "puzzle", "shadow", "wonder",
      "garden", "yellow", "purple", "silver", "mirror", "candle", "forest", "island",
      "jungle", "rocket", "engine", "pencil", "wallet", "basket", "cotton", "marble",
      "ribbon", "temple", "valley", "winter", "summer", "autumn", "flower", "hunter",
      "knight", "wizard", "dragon", "falcon", "tunnel", "signal", "camera", "cookie",
      "coffee", "banana", "market", "carpet", "ladder", "helmet", "jacket", "sunset",
    ];

    const state = {
      word: "",
      scrambled: "",
      revealed: [],
      score: 0,
      best: ctx.storage.get("best", 0),
      hintsUsed: 0,
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "14px";
    wrap.style.width = "100%";
    wrap.style.maxWidth = "420px";

    const scoreRow = document.createElement("div");
    scoreRow.style.fontWeight = "700";

    const scrambledEl = document.createElement("div");
    scrambledEl.style.fontSize = "2rem";
    scrambledEl.style.letterSpacing = "6px";
    scrambledEl.style.fontWeight = "800";
    scrambledEl.style.color = "var(--accent2)";
    scrambledEl.style.textAlign = "center";
    scrambledEl.style.wordBreak = "break-all";

    const hintEl = document.createElement("div");
    hintEl.style.fontSize = "1.1rem";
    hintEl.style.letterSpacing = "4px";
    hintEl.style.color = "var(--text-dim)";
    hintEl.style.minHeight = "1.4em";

    const inputRow = document.createElement("div");
    inputRow.style.display = "flex";
    inputRow.style.gap = "8px";
    inputRow.style.width = "100%";
    inputRow.style.justifyContent = "center";

    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.style.background = "var(--panel-light)";
    input.style.border = "1px solid var(--border)";
    input.style.color = "var(--text)";
    input.style.padding = "10px 14px";
    input.style.borderRadius = "10px";
    input.style.fontSize = "1rem";
    input.style.width = "200px";
    input.onkeydown = (e) => {
      if (e.key === "Enter") submitGuess();
    };

    const submitBtn = document.createElement("button");
    submitBtn.className = "btn primary";
    submitBtn.textContent = "Submit";
    submitBtn.onclick = submitGuess;

    inputRow.appendChild(input);
    inputRow.appendChild(submitBtn);

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "10px";

    const hintBtn = document.createElement("button");
    hintBtn.className = "btn";
    hintBtn.textContent = "Hint (-2)";
    hintBtn.onclick = useHint;

    const skipBtn = document.createElement("button");
    skipBtn.className = "btn";
    skipBtn.textContent = "Skip";
    skipBtn.onclick = () => {
      ctx.playSound("click");
      nextWord();
    };

    controls.appendChild(hintBtn);
    controls.appendChild(skipBtn);

    const feedback = document.createElement("div");
    feedback.style.minHeight = "1.4em";
    feedback.style.fontWeight = "700";

    wrap.appendChild(scoreRow);
    wrap.appendChild(scrambledEl);
    wrap.appendChild(hintEl);
    wrap.appendChild(inputRow);
    wrap.appendChild(controls);
    wrap.appendChild(feedback);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Auto-Solve",
        run() {
          input.value = state.word;
          submitGuess();
        },
      },
      {
        label: "Add Score +20",
        run: () => { state.score += 20; render(); },
      },
    ]);

    function scrambleWord(word) {
      const letters = word.split("");
      let attempt = letters.slice();
      do {
        ctx.shuffle(attempt);
      } while (attempt.join("") === word && word.length > 1);
      return attempt.join("");
    }

    function pickWord() {
      let w;
      do {
        w = WORDS[Math.floor(Math.random() * WORDS.length)];
      } while (w === state.word && WORDS.length > 1);
      return w;
    }

    function nextWord() {
      state.word = pickWord();
      state.scrambled = scrambleWord(state.word.toUpperCase());
      state.revealed = new Array(state.word.length).fill(false);
      state.hintsUsed = 0;
      input.value = "";
      feedback.textContent = "";
      render();
      input.focus();
    }

    function useHint() {
      const idx = state.revealed.findIndex((v) => !v);
      if (idx === -1) return;
      state.revealed[idx] = true;
      state.hintsUsed++;
      state.score = Math.max(0, state.score - 2);
      ctx.playSound("click");
      render();
    }

    function submitGuess() {
      const guess = input.value.trim().toLowerCase();
      if (!guess) return;
      if (guess === state.word) {
        const bonus = state.hintsUsed === 0 ? 15 : 10;
        state.score += bonus;
        if (state.score > state.best) {
          state.best = state.score;
          ctx.storage.set("best", state.best);
        }
        ctx.playSound("success");
        feedback.style.color = "var(--win)";
        feedback.textContent = `Correct! +${bonus}`;
        setTimeout(nextWord, 700);
        render();
      } else {
        ctx.playSound("fail");
        feedback.style.color = "var(--lose)";
        feedback.textContent = "Not quite — try again!";
        input.select();
      }
    }

    function render() {
      scrambledEl.textContent = state.scrambled;
      hintEl.textContent = state.word
        .split("")
        .map((ch, i) => (state.revealed[i] ? ch.toUpperCase() : "_"))
        .join(" ");
      scoreRow.textContent = `Score: ${state.score}  •  Best: ${state.best}`;
      ctx.setStatus(scoreRow.textContent);
    }

    nextWord();

    return () => {};
  },
});
