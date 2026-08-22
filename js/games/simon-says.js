MimiGames.register({
  id: "simon-says",
  title: "Simon Says",
  emoji: "🎵",
  category: "Action",
  players: "1P",
  howTo: "Watch the pads light up in sequence, then click them back in the same order. Each round adds one more step.",
  init(root, ctx) {
    const COLORS = [
      { base: "#7a1f1f", lit: "#ff4757", freq: 330 },
      { base: "#123a5c", lit: "#00d2ff", freq: 392 },
      { base: "#1c4a2e", lit: "#35d07f", freq: 494 },
      { base: "#5c4d10", lit: "#ffd93d", freq: 587 },
    ];

    let audioCtx = null;
    function tone(freq, dur) {
      try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.value = 0.08;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
        osc.stop(audioCtx.currentTime + dur + 0.02);
      } catch (e) {
        /* audio not available */
      }
    }

    const state = {
      sequence: [],
      playerIndex: 0,
      accepting: false,
      level: 0,
      over: false,
    };

    const timeouts = [];
    function later(fn, delay) {
      const id = setTimeout(() => {
        const idx = timeouts.indexOf(id);
        if (idx !== -1) timeouts.splice(idx, 1);
        fn();
      }, delay);
      timeouts.push(id);
      return id;
    }
    function clearAllTimeouts() {
      timeouts.forEach((id) => clearTimeout(id));
      timeouts.length = 0;
    }

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "16px";

    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(2, 140px)";
    grid.style.gridTemplateRows = "repeat(2, 140px)";
    grid.style.gap = "10px";

    const pads = COLORS.map((c, i) => {
      const pad = document.createElement("button");
      pad.style.width = "140px";
      pad.style.height = "140px";
      pad.style.borderRadius = "18px";
      pad.style.border = "3px solid #000";
      pad.style.background = c.base;
      pad.style.cursor = "pointer";
      pad.style.transition = "background .1s, transform .1s";
      pad.onclick = () => handlePadClick(i);
      grid.appendChild(pad);
      return pad;
    });

    const startBtn = document.createElement("button");
    startBtn.className = "btn primary";
    startBtn.textContent = "Start Game";
    startBtn.onclick = startGame;

    wrap.appendChild(grid);
    wrap.appendChild(startBtn);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Skip Level",
        run() {
          if (state.over || !state.accepting) return;
          state.playerIndex = state.sequence.length;
          state.accepting = false;
          ctx.playSound("success");
          later(() => addStep(), 700);
        },
      },
      {
        label: "Reveal Sequence",
        run() {
          if (state.over || state.sequence.length === 0) return;
          playSequence();
        },
      },
    ]);

    function litPad(i, on) {
      pads[i].style.background = on ? COLORS[i].lit : COLORS[i].base;
      pads[i].style.transform = on ? "scale(0.95)" : "scale(1)";
    }

    function startGame() {
      clearAllTimeouts();
      state.sequence = [];
      state.level = 0;
      state.over = false;
      state.accepting = false;
      addStep();
    }

    function addStep() {
      state.sequence.push(Math.floor(Math.random() * 4));
      state.level = state.sequence.length;
      ctx.setStatus(`Level ${state.level} — watch closely...`);
      state.accepting = false;
      later(() => playSequence(), 600);
    }

    function playSequence() {
      state.accepting = false;
      const stepTime = 550;
      state.sequence.forEach((padIdx, j) => {
        later(() => {
          litPad(padIdx, true);
          tone(COLORS[padIdx].freq, 0.28);
        }, j * stepTime);
        later(() => {
          litPad(padIdx, false);
        }, j * stepTime + 320);
      });
      later(() => {
        state.accepting = true;
        state.playerIndex = 0;
        ctx.setStatus(`Level ${state.level} — your turn!`);
      }, state.sequence.length * stepTime + 100);
    }

    function handlePadClick(i) {
      if (!state.accepting || state.over) return;
      litPad(i, true);
      tone(COLORS[i].freq, 0.15);
      later(() => litPad(i, false), 150);

      if (i === state.sequence[state.playerIndex]) {
        state.playerIndex++;
        if (state.playerIndex === state.sequence.length) {
          state.accepting = false;
          ctx.playSound("success");
          later(() => addStep(), 700);
        }
      } else {
        state.accepting = false;
        state.over = true;
        ctx.playSound("fail");
        const best = ctx.storage.get("best", 0);
        const finalLevel = state.level;
        const scoreLevel = finalLevel - 1 >= 0 ? finalLevel - 1 : 0;
        const newBest = Math.max(best, scoreLevel);
        ctx.storage.set("best", newBest);
        ctx.setStatus(`Game Over — reached level ${finalLevel}`);
        later(() => {
          ctx.showOverlay({
            title: "Wrong Pad!",
            subtitle: `You completed ${scoreLevel} level${scoreLevel === 1 ? "" : "s"} · Best: ${newBest}`,
            buttonText: "Play Again",
            onButton: startGame,
          });
        }, 400);
      }
    }

    ctx.setStatus("Click Start Game to begin.");

    return () => {
      clearAllTimeouts();
    };
  },
});
