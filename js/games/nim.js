MimiGames.register({
  id: "nim",
  title: "Nim",
  emoji: "🪵",
  category: "Board",
  players: "1-2P",
  howTo: "Click a stone in a pile to remove it and every stone after it in that row. Whoever takes the last stone wins. Play vs a friend, or vs the CPU.",
  init(root, ctx) {
    const START_PILES = [3, 5, 7];

    const state = {
      piles: START_PILES.slice(),
      turn: 1, // 1 or 2
      vsCpu: true,
      over: false,
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "18px";
    wrap.style.width = "100%";

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
    const resetBtn = document.createElement("button");
    resetBtn.className = "btn";
    resetBtn.textContent = "Restart";
    resetBtn.onclick = reset;
    controls.appendChild(cpuBtn);
    controls.appendChild(resetBtn);

    const pilesEl = document.createElement("div");
    pilesEl.style.display = "flex";
    pilesEl.style.flexDirection = "column";
    pilesEl.style.gap = "16px";
    pilesEl.style.alignItems = "flex-start";

    wrap.appendChild(controls);
    wrap.appendChild(pilesEl);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Take All Stones (Win)",
        run: () => {
          if (state.over) return;
          state.piles = state.piles.map(() => 0);
          ctx.playSound("click");
          afterMove();
        },
      },
      {
        label: "Reveal Optimal Move",
        run: () => {
          if (state.over) return;
          const xor = state.piles.reduce((a, b) => a ^ b, 0);
          if (xor === 0) {
            ctx.setStatus("No winning move available — every move leaves a losing position.");
            return;
          }
          for (let i = 0; i < state.piles.length; i++) {
            const p = state.piles[i];
            const desired = p ^ xor;
            if (desired < p) {
              ctx.setStatus(`Optimal move: take pile ${i + 1} down from ${p} to ${desired}.`);
              return;
            }
          }
        },
      },
    ]);

    function playerName(p) {
      if (state.vsCpu) return p === 1 ? "You" : "CPU";
      return `Player ${p}`;
    }

    function renderPiles() {
      pilesEl.innerHTML = "";
      state.piles.forEach((count, pileIdx) => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "10px";

        const label = document.createElement("div");
        label.style.width = "70px";
        label.style.color = "var(--text-dim)";
        label.style.fontSize = ".85rem";
        label.textContent = `Pile ${pileIdx + 1}`;
        row.appendChild(label);

        const stonesEl = document.createElement("div");
        stonesEl.style.display = "flex";
        stonesEl.style.gap = "6px";
        stonesEl.style.flexWrap = "wrap";

        for (let j = 0; j < count; j++) {
          const stone = document.createElement("div");
          stone.textContent = "🪵";
          stone.style.fontSize = "1.6rem";
          stone.style.cursor = canClick() ? "pointer" : "default";
          stone.title = `Take ${count - j} stone${count - j > 1 ? "s" : ""}`;
          stone.onclick = () => takeFrom(pileIdx, j);
          stonesEl.appendChild(stone);
        }
        row.appendChild(stonesEl);
        pilesEl.appendChild(row);
      });
    }

    function canClick() {
      return !state.over && !(state.vsCpu && state.turn === 2);
    }

    function takeFrom(pileIdx, fromIndex) {
      if (!canClick()) return;
      const pile = state.piles[pileIdx];
      if (fromIndex < 0 || fromIndex >= pile) return;
      state.piles[pileIdx] = fromIndex;
      ctx.playSound("click");
      afterMove();
    }

    function afterMove() {
      renderPiles();
      if (state.piles.every((p) => p === 0)) {
        endGame(state.turn);
        return;
      }
      state.turn = state.turn === 1 ? 2 : 1;
      ctx.setStatus(`${playerName(state.turn)}'s turn`);
      if (state.vsCpu && state.turn === 2 && !state.over) {
        setTimeout(cpuMove, 500);
      }
    }

    function cpuMove() {
      if (state.over) return;
      const xor = state.piles.reduce((a, b) => a ^ b, 0);
      let pileIdx = -1;
      let target = -1;
      if (xor !== 0) {
        for (let i = 0; i < state.piles.length; i++) {
          const p = state.piles[i];
          const desired = p ^ xor;
          if (desired < p) {
            pileIdx = i;
            target = desired;
            break;
          }
        }
      }
      if (pileIdx === -1) {
        // losing position (or all zero handled already) - take 1 from largest pile
        let maxVal = -1;
        for (let i = 0; i < state.piles.length; i++) {
          if (state.piles[i] > maxVal) {
            maxVal = state.piles[i];
            pileIdx = i;
          }
        }
        target = Math.max(0, state.piles[pileIdx] - 1);
      }
      state.piles[pileIdx] = target;
      ctx.playSound("click");
      afterMove();
    }

    function endGame(winner) {
      state.over = true;
      const name = playerName(winner);
      ctx.playSound("success");
      ctx.setStatus(`${name} took the last stone and wins!`);
      setTimeout(() => {
        ctx.showOverlay({
          title: `${name} Wins!`,
          subtitle: "Took the last stone.",
          buttonText: "Play Again",
          onButton: reset,
        });
      }, 300);
    }

    function reset() {
      state.piles = START_PILES.slice();
      state.turn = 1;
      state.over = false;
      ctx.setStatus(`${playerName(1)}'s turn`);
      renderPiles();
    }

    reset();

    return () => {};
  },
});
