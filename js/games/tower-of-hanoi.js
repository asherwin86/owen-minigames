MimiGames.register({
  id: "tower-of-hanoi",
  title: "Tower of Hanoi",
  emoji: "🗼",
  category: "Puzzle",
  players: "1P",
  howTo: "Click a peg to pick up its top disk, then click another peg to move it. Move every disk to the last peg.",
  init(root, ctx) {
    const state = {
      pegs: [[], [], []],
      diskCount: 4,
      selected: null,
      moves: 0,
      over: false,
      history: [],
    };

    const DISK_COLORS = ["#ff4757", "#ffa502", "#ffd93d", "#35d07f", "#00d2ff", "#a55eea"];

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "12px";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "10px";
    controls.style.alignItems = "center";

    const sizeLabel = document.createElement("span");
    sizeLabel.style.color = "var(--text-dim)";
    sizeLabel.style.fontSize = ".85rem";
    sizeLabel.textContent = "Disks:";

    const sizeSelect = document.createElement("select");
    sizeSelect.className = "btn";
    for (let n = 3; n <= 6; n++) {
      const opt = document.createElement("option");
      opt.value = String(n);
      opt.textContent = String(n);
      if (n === state.diskCount) opt.selected = true;
      sizeSelect.appendChild(opt);
    }
    sizeSelect.onchange = () => {
      state.diskCount = parseInt(sizeSelect.value, 10);
      newGame();
    };

    const resetBtn = document.createElement("button");
    resetBtn.className = "btn primary";
    resetBtn.textContent = "Restart";
    resetBtn.onclick = newGame;

    controls.appendChild(sizeLabel);
    controls.appendChild(sizeSelect);
    controls.appendChild(resetBtn);

    const info = document.createElement("div");
    info.style.fontWeight = "700";

    const pegsWrap = document.createElement("div");
    pegsWrap.style.display = "flex";
    pegsWrap.style.gap = "34px";
    pegsWrap.style.alignItems = "flex-end";
    pegsWrap.style.height = "220px";
    pegsWrap.style.marginTop = "10px";

    const pegEls = [];
    for (let p = 0; p < 3; p++) {
      const pegCol = document.createElement("div");
      pegCol.style.position = "relative";
      pegCol.style.width = "150px";
      pegCol.style.height = "220px";
      pegCol.style.display = "flex";
      pegCol.style.flexDirection = "column-reverse";
      pegCol.style.alignItems = "center";
      pegCol.style.cursor = "pointer";
      pegCol.style.borderBottom = "4px solid var(--border)";

      const rod = document.createElement("div");
      rod.style.position = "absolute";
      rod.style.bottom = "4px";
      rod.style.left = "50%";
      rod.style.transform = "translateX(-50%)";
      rod.style.width = "8px";
      rod.style.height = "190px";
      rod.style.background = "var(--panel-light)";
      rod.style.borderRadius = "4px";
      pegCol.appendChild(rod);

      const diskStack = document.createElement("div");
      diskStack.style.position = "relative";
      diskStack.style.zIndex = "1";
      diskStack.style.display = "flex";
      diskStack.style.flexDirection = "column-reverse";
      diskStack.style.alignItems = "center";
      diskStack.style.gap = "3px";
      diskStack.style.paddingBottom = "4px";
      pegCol.appendChild(diskStack);

      pegCol.onclick = () => handlePegClick(p);
      pegsWrap.appendChild(pegCol);
      pegEls.push({ pegCol, diskStack });
    }

    wrap.appendChild(controls);
    wrap.appendChild(info);
    wrap.appendChild(pegsWrap);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Auto-Solve",
        run() {
          if (state.over) return;
          const arr = [];
          for (let d = state.diskCount; d >= 1; d--) arr.push(d);
          state.pegs = [[], [], arr];
          state.selected = null;
          render();
          checkWin();
        },
      },
      {
        label: "Undo Last Move",
        run() {
          if (state.over || state.history.length === 0) return;
          const last = state.history.pop();
          state.pegs[last.to].pop();
          state.pegs[last.from].push(last.disk);
          state.moves = Math.max(0, state.moves - 1);
          state.selected = null;
          render();
        },
      },
    ]);

    function optimalMoves() {
      return Math.pow(2, state.diskCount) - 1;
    }

    function handlePegClick(p) {
      if (state.over) return;
      if (state.selected === null) {
        if (state.pegs[p].length === 0) return;
        state.selected = p;
        ctx.playSound("click");
        render();
        return;
      }
      if (state.selected === p) {
        state.selected = null;
        render();
        return;
      }
      const fromPeg = state.pegs[state.selected];
      const toPeg = state.pegs[p];
      const disk = fromPeg[fromPeg.length - 1];
      const topOfTarget = toPeg[toPeg.length - 1];
      if (topOfTarget !== undefined && topOfTarget < disk) {
        // illegal move
        ctx.playSound("fail");
        flashFail(p);
        state.selected = null;
        render();
        return;
      }
      fromPeg.pop();
      toPeg.push(disk);
      state.history.push({ from: state.selected, to: p, disk });
      state.moves++;
      state.selected = null;
      ctx.playSound("pop");
      render();
      checkWin();
    }

    function flashFail(p) {
      const el = pegEls[p].pegCol;
      el.style.borderBottomColor = "var(--lose)";
      setTimeout(() => { el.style.borderBottomColor = "var(--border)"; }, 260);
    }

    function checkWin() {
      if (state.pegs[2].length === state.diskCount) {
        state.over = true;
        ctx.playSound("success");
        setTimeout(() => {
          ctx.showOverlay({
            title: "Solved!",
            subtitle: `You did it in ${state.moves} moves (optimal is ${optimalMoves()}).`,
            buttonText: "Play Again",
            onButton: newGame,
          });
        }, 200);
      }
    }

    function render() {
      for (let p = 0; p < 3; p++) {
        const stack = pegEls[p].diskStack;
        stack.innerHTML = "";
        state.pegs[p].forEach((diskSize, i) => {
          const disk = document.createElement("div");
          const width = 30 + diskSize * 16;
          disk.style.width = width + "px";
          disk.style.height = "18px";
          disk.style.borderRadius = "6px";
          disk.style.background = DISK_COLORS[(diskSize - 1) % DISK_COLORS.length];
          const isTop = i === state.pegs[p].length - 1;
          if (isTop && state.selected === p) {
            disk.style.outline = "3px solid var(--accent2)";
            disk.style.transform = "translateY(-6px)";
          }
          stack.appendChild(disk);
        });
        pegEls[p].pegCol.style.outline = state.selected === p ? "2px dashed var(--accent2)" : "none";
      }
      info.textContent = `Moves: ${state.moves}  •  Optimal: ${optimalMoves()}`;
      ctx.setStatus(state.over ? "Solved!" : `Moves: ${state.moves} (optimal ${optimalMoves()})`);
    }

    function newGame() {
      state.pegs = [[], [], []];
      for (let d = state.diskCount; d >= 1; d--) state.pegs[0].push(d);
      state.selected = null;
      state.moves = 0;
      state.over = false;
      state.history = [];
      render();
    }

    newGame();

    return () => {};
  },
});
