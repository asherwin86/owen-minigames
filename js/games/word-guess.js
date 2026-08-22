MimiGames.register({
  id: "word-guess",
  title: "Word Guess",
  emoji: "🟩",
  category: "Puzzle",
  players: "1P",
  howTo: "Guess the secret 5-letter word in 6 tries. After each guess, tiles turn green (right letter, right spot), yellow (right letter, wrong spot), or gray (not in the word). Type letters, Enter to submit, Backspace to delete.",
  init(root, ctx) {
    const WORD_LENGTH = 5;
    const MAX_GUESSES = 6;
    const WORDS = [
      "APPLE", "BEACH", "CHAIR", "DANCE", "EAGLE", "FLAME", "GRAPE", "HOUSE",
      "IMAGE", "JOKER", "KNIFE", "LEMON", "MONEY", "NOVEL", "OCEAN", "PIANO",
      "QUILT", "RIVER", "STONE", "TIGER", "UNCLE", "VOICE", "WATER", "YOUTH",
      "ZEBRA", "BRAVE", "CLOUD", "DRIFT", "EARTH", "FEAST", "GLOBE", "HONEY",
      "IVORY", "JELLY", "KITES", "LIGHT", "MIRTH", "NIGHT", "OLIVE", "PLANT",
      "QUEEN", "ROBOT", "SHARP", "TRAIN", "URBAN", "VIVID", "WITCH", "YIELD",
      "BLOOM", "CRISP", "DREAM", "EMBER", "FROST", "GRAIN", "HOVER", "INBOX",
      "JUMBO", "KARMA", "LUNAR", "MAPLE", "NORTH", "PEARL", "QUART", "ROUGE",
    ];

    const state = {
      answer: "",
      guesses: [],
      current: "",
      over: false,
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "10px";

    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateRows = `repeat(${MAX_GUESSES}, 1fr)`;
    grid.style.gap = "6px";

    const rows = [];
    for (let r = 0; r < MAX_GUESSES; r++) {
      const rowEl = document.createElement("div");
      rowEl.style.display = "grid";
      rowEl.style.gridTemplateColumns = `repeat(${WORD_LENGTH}, 44px)`;
      rowEl.style.gap = "6px";
      const cells = [];
      for (let c = 0; c < WORD_LENGTH; c++) {
        const cell = document.createElement("div");
        cell.style.width = "44px";
        cell.style.height = "44px";
        cell.style.display = "flex";
        cell.style.alignItems = "center";
        cell.style.justifyContent = "center";
        cell.style.fontSize = "1.3rem";
        cell.style.fontWeight = "700";
        cell.style.border = "2px solid var(--border)";
        cell.style.borderRadius = "6px";
        cell.style.textTransform = "uppercase";
        cell.style.color = "var(--text)";
        rowEl.appendChild(cell);
        cells.push(cell);
      }
      grid.appendChild(rowEl);
      rows.push(cells);
    }

    // on-screen keyboard, doubles as a letter-state legend
    const keyboardWrap = document.createElement("div");
    keyboardWrap.style.display = "flex";
    keyboardWrap.style.flexDirection = "column";
    keyboardWrap.style.gap = "6px";
    keyboardWrap.style.alignItems = "center";
    const KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
    const keyEls = {};
    KEY_ROWS.forEach((rowStr, i) => {
      const rowEl = document.createElement("div");
      rowEl.style.display = "flex";
      rowEl.style.gap = "5px";
      if (i === 2) {
        rowEl.appendChild(makeActionKey("ENTER", submitGuess, "56px"));
      }
      rowStr.split("").forEach((letter) => {
        const key = document.createElement("button");
        key.className = "btn";
        key.textContent = letter;
        key.style.padding = "7px 0";
        key.style.width = "32px";
        key.style.fontWeight = "700";
        key.onclick = () => typeLetter(letter);
        rowEl.appendChild(key);
        keyEls[letter] = key;
      });
      if (i === 2) {
        rowEl.appendChild(makeActionKey("⌫", backspace, "44px"));
      }
      keyboardWrap.appendChild(rowEl);
    });

    function makeActionKey(label, handler, width) {
      const key = document.createElement("button");
      key.className = "btn";
      key.textContent = label;
      key.style.padding = "10px 0";
      key.style.width = width;
      key.style.fontSize = "0.75rem";
      key.style.fontWeight = "700";
      key.onclick = handler;
      return key;
    }

    const restartBtn = document.createElement("button");
    restartBtn.className = "btn primary";
    restartBtn.textContent = "New Word";
    restartBtn.onclick = startGame;

    wrap.appendChild(grid);
    wrap.appendChild(keyboardWrap);
    wrap.appendChild(restartBtn);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Auto-Solve",
        run() {
          if (state.over) return;
          state.current = state.answer;
          renderCurrentRow();
          submitGuess();
        },
      },
      {
        label: "Reveal Answer",
        run() {
          ctx.setStatus(`Answer: ${state.answer}`);
        },
      },
    ]);

    function typeLetter(letter) {
      if (state.over) return;
      if (state.current.length >= WORD_LENGTH) return;
      state.current += letter;
      renderCurrentRow();
      ctx.playSound("tick");
    }

    function backspace() {
      if (state.over) return;
      state.current = state.current.slice(0, -1);
      renderCurrentRow();
    }

    function renderCurrentRow() {
      const cells = rows[state.guesses.length];
      if (!cells) return;
      cells.forEach((cell, i) => {
        cell.textContent = state.current[i] || "";
      });
    }

    function submitGuess() {
      if (state.over) return;
      if (state.current.length !== WORD_LENGTH) {
        ctx.setStatus("Not enough letters.");
        ctx.playSound("error");
        return;
      }
      const guess = state.current;
      const marks = scoreGuess(guess, state.answer);
      paintRow(state.guesses.length, guess, marks);
      updateKeyboard(guess, marks);
      state.guesses.push(guess);
      state.current = "";

      if (guess === state.answer) {
        state.over = true;
        const wins = ctx.storage.get("wins", 0) + 1;
        ctx.storage.set("wins", wins);
        ctx.playSound("win");
        ctx.setStatus(`You got it in ${state.guesses.length}! Wins: ${wins}`);
        setTimeout(() => {
          ctx.confetti(wrap);
          ctx.showOverlay({
            title: "Solved!",
            subtitle: `"${state.answer}" in ${state.guesses.length}/${MAX_GUESSES} · Total wins: ${wins}`,
            buttonText: "Play Again",
            onButton: startGame,
          });
        }, 350);
        return;
      }

      if (state.guesses.length >= MAX_GUESSES) {
        state.over = true;
        ctx.playSound("lose");
        ctx.setStatus(`Out of guesses! The word was ${state.answer}.`);
        setTimeout(() => {
          ctx.showOverlay({
            title: "So Close!",
            subtitle: `The word was "${state.answer}"`,
            buttonText: "Try Again",
            onButton: startGame,
          });
        }, 350);
        return;
      }

      ctx.playSound("click");
      ctx.setStatus(`Guess ${state.guesses.length + 1} of ${MAX_GUESSES}`);
    }

    // returns array of "correct" | "present" | "absent" per letter, handling
    // duplicate letters the standard Wordle way (exact matches claimed first)
    function scoreGuess(guess, answer) {
      const marks = new Array(WORD_LENGTH).fill("absent");
      const answerLetters = answer.split("");
      const used = new Array(WORD_LENGTH).fill(false);
      for (let i = 0; i < WORD_LENGTH; i++) {
        if (guess[i] === answerLetters[i]) {
          marks[i] = "correct";
          used[i] = true;
        }
      }
      for (let i = 0; i < WORD_LENGTH; i++) {
        if (marks[i] === "correct") continue;
        const idx = answerLetters.findIndex((letter, j) => !used[j] && letter === guess[i]);
        if (idx !== -1) {
          marks[i] = "present";
          used[idx] = true;
        }
      }
      return marks;
    }

    function colorFor(mark) {
      if (mark === "correct") return { bg: "#4caf50", border: "#4caf50", fg: "#fff" };
      if (mark === "present") return { bg: "#d4b106", border: "#d4b106", fg: "#fff" };
      return { bg: "var(--panel-2, #333)", border: "var(--border)", fg: "var(--text-dim)" };
    }

    function paintRow(rowIndex, guess, marks) {
      const cells = rows[rowIndex];
      cells.forEach((cell, i) => {
        cell.textContent = guess[i];
        const c = colorFor(marks[i]);
        cell.style.background = c.bg;
        cell.style.borderColor = c.border;
        cell.style.color = c.fg;
      });
    }

    const KEY_RANK = { absent: 0, present: 1, correct: 2 };
    function updateKeyboard(guess, marks) {
      guess.split("").forEach((letter, i) => {
        const key = keyEls[letter];
        if (!key) return;
        const mark = marks[i];
        const prevRank = key.dataset.rank ? Number(key.dataset.rank) : -1;
        if (KEY_RANK[mark] > prevRank) {
          key.dataset.rank = KEY_RANK[mark];
          const c = colorFor(mark);
          key.style.background = c.bg;
          key.style.borderColor = c.border;
          key.style.color = c.fg;
        }
      });
    }

    function onKeydown(e) {
      if (document.activeElement && ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
      if (e.key === "Enter") {
        e.preventDefault();
        submitGuess();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        backspace();
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        typeLetter(e.key.toUpperCase());
      }
    }
    document.addEventListener("keydown", onKeydown);

    function startGame() {
      state.answer = WORDS[Math.floor(Math.random() * WORDS.length)];
      state.guesses = [];
      state.current = "";
      state.over = false;
      rows.forEach((cells) => {
        cells.forEach((cell) => {
          cell.textContent = "";
          cell.style.background = "";
          cell.style.borderColor = "var(--border)";
          cell.style.color = "var(--text)";
        });
      });
      Object.values(keyEls).forEach((key) => {
        key.style.background = "";
        key.style.borderColor = "";
        key.style.color = "";
        delete key.dataset.rank;
      });
      ctx.setStatus(`Guess 1 of ${MAX_GUESSES}`);
    }

    startGame();

    return () => {
      document.removeEventListener("keydown", onKeydown);
    };
  },
});
