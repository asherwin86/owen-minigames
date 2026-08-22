MimiGames.register({
  id: "backgammon",
  title: "Backgammon",
  emoji: "🎲",
  category: "Board",
  players: "1P",
  howTo: "You're White, moving your checkers from point 24 toward point 1 and bearing them off. Roll, then click a checker and a highlighted point to move it. Land two of your checkers on a point to make it safe; land on a lone enemy checker to send it to the bar. Bear off all 15 checkers first to win.",
  init(root, ctx) {
    // Points are numbered 1-24 the classic way for White (moving 24 -> 1).
    // Board array index 0..23 maps to points 1..24. Positive count = White,
    // negative = Black (the CPU). bar.white/bar.black hold hit checkers.
    const START_LAYOUT = () => ({
      points: [
        -2, 0, 0, 0, 0, 5,
        0, 3, 0, 0, 0, -5,
        5, 0, 0, 0, -3, 0,
        -5, 0, 0, 0, 0, 2,
      ],
      bar: { white: 0, black: 0 },
      off: { white: 0, black: 0 },
    });

    const state = {
      board: START_LAYOUT(),
      dice: [],
      movesLeft: [],
      turn: "white",
      selected: null,
      over: false,
      thinking: false,
      loadedDice: false,
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "12px";

    const boardEl = document.createElement("div");
    boardEl.style.position = "relative";
    boardEl.style.width = "600px";
    boardEl.style.maxWidth = "100%";
    boardEl.style.aspectRatio = "600 / 360";
    boardEl.style.background = "#5a3a22";
    boardEl.style.border = "8px solid #3a2414";
    boardEl.style.borderRadius = "6px";
    boardEl.style.display = "flex";
    boardEl.style.padding = "0 14px";
    boardEl.style.boxSizing = "border-box";
    boardEl.style.gap = "14px";

    const quads = [document.createElement("div"), document.createElement("div")];
    quads.forEach((q) => {
      q.style.flex = "1";
      q.style.display = "flex";
      q.style.position = "relative";
    });
    const bar = document.createElement("div");
    bar.style.width = "18px";
    bar.style.background = "#3a2414";
    boardEl.appendChild(quads[0]);
    boardEl.appendChild(bar);
    boardEl.appendChild(quads[1]);

    // 24 point columns, split 12/12 across the two quads, each quad split
    // top/bottom by a shared row of point-triangles
    const pointEls = []; // index 0..23 -> point 1..24
    function buildPoints() {
      // Layout: quad[0] holds points 13-18 (top, left-to-right) and 12-7
      // (bottom, left-to-right); quad[1] holds 19-24 (top) and 6-1 (bottom).
      const topLeft = [13, 14, 15, 16, 17, 18];
      const bottomLeft = [12, 11, 10, 9, 8, 7];
      const topRight = [19, 20, 21, 22, 23, 24];
      const bottomRight = [6, 5, 4, 3, 2, 1];
      [[quads[0], topLeft, bottomLeft], [quads[1], topRight, bottomRight]].forEach(([quad, top, bottom]) => {
        const col = document.createElement("div");
        col.style.display = "flex";
        col.style.flexDirection = "column";
        col.style.justifyContent = "space-between";
        col.style.width = "100%";
        const topRow = document.createElement("div");
        topRow.style.display = "flex";
        const bottomRow = document.createElement("div");
        bottomRow.style.display = "flex";
        top.forEach((pointNum, i) => topRow.appendChild(makePoint(pointNum, true, i)));
        bottom.forEach((pointNum, i) => bottomRow.appendChild(makePoint(pointNum, false, i)));
        col.appendChild(topRow);
        col.appendChild(bottomRow);
        quad.appendChild(col);
      });
    }

    function makePoint(pointNum, isTop, i) {
      const col = document.createElement("div");
      col.style.flex = "1";
      col.style.height = "150px";
      col.style.position = "relative";
      col.style.cursor = "pointer";
      col.dataset.point = pointNum;

      const triangle = document.createElement("div");
      triangle.style.position = "absolute";
      triangle.style.left = "8%";
      triangle.style.right = "8%";
      triangle.style.width = "84%";
      if (isTop) {
        triangle.style.top = "0";
        triangle.style.borderLeft = "18px solid transparent";
        triangle.style.borderRight = "18px solid transparent";
        triangle.style.borderTop = `140px solid ${i % 2 === 0 ? "#c98a4b" : "#e8d5b5"}`;
      } else {
        triangle.style.bottom = "0";
        triangle.style.borderLeft = "18px solid transparent";
        triangle.style.borderRight = "18px solid transparent";
        triangle.style.borderBottom = `140px solid ${i % 2 === 0 ? "#c98a4b" : "#e8d5b5"}`;
      }
      col.appendChild(triangle);

      const stack = document.createElement("div");
      stack.style.position = "absolute";
      stack.style.left = "50%";
      stack.style.transform = "translateX(-50%)";
      stack.style.display = "flex";
      stack.style.flexDirection = isTop ? "column" : "column-reverse";
      stack.style.gap = "2px";
      if (isTop) stack.style.top = "4px"; else stack.style.bottom = "4px";
      col.appendChild(stack);

      col.addEventListener("click", () => onPointClick(pointNum));
      pointEls[pointNum - 1] = { col, stack };
      return col;
    }

    buildPoints();

    const barStacks = { white: document.createElement("div"), black: document.createElement("div") };
    [barStacks.white, barStacks.black].forEach((el) => {
      el.style.position = "absolute";
      el.style.left = "50%";
      el.style.transform = "translateX(-50%)";
      el.style.display = "flex";
      el.style.flexDirection = "column";
      el.style.gap = "2px";
    });
    barStacks.white.style.bottom = "6px";
    barStacks.black.style.top = "6px";
    bar.style.position = "relative";
    bar.appendChild(barStacks.white);
    bar.appendChild(barStacks.black);
    bar.addEventListener("click", () => onPointClick("bar"));

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.alignItems = "center";
    controls.style.gap = "12px";
    controls.style.flexWrap = "wrap";
    controls.style.justifyContent = "center";

    const diceEl = document.createElement("div");
    diceEl.style.display = "flex";
    diceEl.style.gap = "8px";
    diceEl.style.fontSize = "1.8rem";
    diceEl.style.minWidth = "70px";

    const rollBtn = document.createElement("button");
    rollBtn.className = "btn primary";
    rollBtn.textContent = "Roll Dice";
    rollBtn.onclick = rollDice;

    const newGameBtn = document.createElement("button");
    newGameBtn.className = "btn";
    newGameBtn.textContent = "New Game";
    newGameBtn.onclick = startGame;

    controls.appendChild(diceEl);
    controls.appendChild(rollBtn);
    controls.appendChild(newGameBtn);

    wrap.appendChild(boardEl);
    wrap.appendChild(controls);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Loaded Dice: Off",
        run(e) {
          state.loadedDice = !state.loadedDice;
          e.target.textContent = `Loaded Dice: ${state.loadedDice ? "On" : "Off"}`;
        },
      },
      {
        label: "Force Win",
        run: () => {
          if (state.over) return;
          state.board.off.white = 15;
          finishGame("white");
        },
      },
    ]);

    function checkerEl(color) {
      const c = document.createElement("div");
      c.style.width = "28px";
      c.style.height = "28px";
      c.style.borderRadius = "50%";
      c.style.background = color === "white"
        ? "radial-gradient(circle at 35% 30%, #fff, #d8cdbd 75%)"
        : "radial-gradient(circle at 35% 30%, #6a5a4a, #201812 75%)";
      c.style.border = "1px solid rgba(0,0,0,0.4)";
      c.style.boxShadow = "0 1px 2px rgba(0,0,0,0.4)";
      return c;
    }

    function render() {
      for (let p = 1; p <= 24; p++) {
        const { stack } = pointEls[p - 1];
        stack.innerHTML = "";
        const count = state.board.points[p - 1];
        if (count === 0) continue;
        const color = count > 0 ? "white" : "black";
        const n = Math.abs(count);
        const shown = Math.min(n, 5);
        for (let i = 0; i < shown; i++) {
          const c = checkerEl(color);
          if (i === shown - 1 && n > 5) {
            c.textContent = String(n);
            c.style.display = "flex";
            c.style.alignItems = "center";
            c.style.justifyContent = "center";
            c.style.fontSize = "0.7rem";
            c.style.fontWeight = "700";
            c.style.color = color === "white" ? "#333" : "#eee";
          }
          stack.appendChild(c);
        }
      }
      barStacks.white.innerHTML = "";
      for (let i = 0; i < state.board.bar.white; i++) barStacks.white.appendChild(checkerEl("white"));
      barStacks.black.innerHTML = "";
      for (let i = 0; i < state.board.bar.black; i++) barStacks.black.appendChild(checkerEl("black"));

      highlightTargets();
      diceEl.textContent = state.dice.length
        ? state.dice.map((d) => "⚀⚁⚂⚃⚄⚅"[d - 1]).join(" ")
        : "";
      rollBtn.disabled = state.dice.length > 0 && state.movesLeft.length > 0;
      rollBtn.style.opacity = rollBtn.disabled ? "0.5" : "1";
    }

    function highlightTargets() {
      pointEls.forEach(({ col }) => { col.style.boxShadow = ""; });
      bar.style.boxShadow = "";
      if (state.selected === null) return;
      const targets = legalTargetsFrom(state.selected);
      targets.forEach((t) => {
        if (t === "off") return;
        pointEls[t - 1].col.style.boxShadow = "inset 0 0 0 3px #53e0ff";
      });
      if (state.selected === "bar") {
        bar.style.boxShadow = "inset 0 0 0 3px #ffd166";
      } else {
        pointEls[state.selected - 1].col.style.boxShadow = "inset 0 0 0 3px #ffd166";
      }
    }

    // --- game rules ---

    function pointOwner(p) {
      const v = state.board.points[p - 1];
      if (v > 0) return "white";
      if (v < 0) return "black";
      return null;
    }

    function canLand(p, color) {
      if (p < 1 || p > 24) return false;
      const v = state.board.points[p - 1];
      if (color === "white") return v >= -1;
      return v <= 1;
    }

    // destination point for a given start (white moves 24->1, black moves 1->24)
    function destFor(from, die, color) {
      if (color === "white") {
        if (from === "bar") return 25 - die;
        return from - die;
      }
      if (from === "bar") return die;
      return from + die;
    }

    function allWhiteHome() {
      for (let p = 7; p <= 24; p++) if (state.board.points[p - 1] > 0) return false;
      return state.board.bar.white === 0;
    }

    function legalTargetsFrom(from) {
      const color = state.turn;
      const uniqueDice = [...new Set(state.movesLeft)];
      const targets = [];
      uniqueDice.forEach((die) => {
        const dest = destFor(from, die, color);
        if (dest >= 1 && dest <= 24 && canLand(dest, color)) {
          targets.push(dest);
        } else if (color === "white" && dest < 1 && allWhiteHome()) {
          // bearing off: exact or overshoot from the highest occupied point
          if (dest === 0 || isHighestOccupied(from, color)) targets.push("off");
        }
      });
      return targets;
    }

    function isHighestOccupied(from, color) {
      if (color !== "white") return false;
      for (let p = from + 1; p <= 6; p++) {
        if (state.board.points[p - 1] > 0) return false;
      }
      return true;
    }

    function hasAnyLegalMove(color) {
      const froms = color === "white" && state.board.bar.white > 0
        ? ["bar"]
        : (state.board.bar[color] > 0 ? [] : state.board.points
          .map((v, i) => (color === "white" ? (v > 0 ? i + 1 : null) : (v < 0 ? i + 1 : null)))
          .filter((v) => v !== null));
      return froms.some((f) => legalTargetsFrom(f).length > 0);
    }

    function onPointClick(p) {
      if (state.over || state.turn !== "white" || state.thinking) return;
      if (!state.movesLeft.length) return;

      if (state.selected !== null) {
        const targets = legalTargetsFrom(state.selected);
        if (targets.includes(p) || (p === "off" && targets.includes("off"))) {
          applyMove(state.selected, p);
          state.selected = null;
          render();
          maybeAutoAdvance();
          return;
        }
      }

      // select a new source
      if (p === "bar") {
        if (state.board.bar.white > 0) {
          state.selected = "bar";
        }
      } else if (pointOwner(p) === "white" && legalTargetsFrom(p).length > 0) {
        state.selected = p;
      } else {
        state.selected = null;
      }
      render();
    }

    function applyMove(from, to, color = state.turn) {
      const sign = color === "white" ? 1 : -1;
      const die = color === "white"
        ? (from === "bar" ? 25 - to : (to === "off" ? undefined : from - to))
        : (from === "bar" ? to : (to === "off" ? undefined : to - from));
      let usedDie = die;
      if (to === "off") {
        // find the smallest legal die that performs this bear-off
        const uniqueDice = [...new Set(state.movesLeft)];
        usedDie = uniqueDice.find((d) => {
          const dest = destFor(from, d, color);
          return dest === 0 || (dest < 0 && isHighestOccupied(from, color));
        });
      }
      const idx = state.movesLeft.indexOf(usedDie);
      if (idx !== -1) state.movesLeft.splice(idx, 1);

      // remove from source
      if (from === "bar") {
        state.board.bar[color] -= 1;
      } else {
        state.board.points[from - 1] -= sign;
      }
      // place at destination
      if (to === "off") {
        state.board.off[color] += 1;
      } else {
        const occupant = state.board.points[to - 1];
        if (color === "white" && occupant === -1) {
          state.board.points[to - 1] = 0;
          state.board.bar.black += 1;
          ctx.playSound("hit");
        } else if (color === "black" && occupant === 1) {
          state.board.points[to - 1] = 0;
          state.board.bar.white += 1;
          ctx.playSound("hit");
        }
        state.board.points[to - 1] += sign;
      }
      ctx.playSound(to === "off" ? "success" : "click");

      if (state.board.off.white === 15 || state.board.off.black === 15) {
        finishGame(state.board.off.white === 15 ? "white" : "black");
      }
    }

    function rollDice() {
      if (state.over || state.dice.length || state.turn !== "white" || state.thinking) return;
      const d1 = state.loadedDice ? 6 : 1 + Math.floor(Math.random() * 6);
      const d2 = state.loadedDice ? 6 : 1 + Math.floor(Math.random() * 6);
      state.dice = [d1, d2];
      state.movesLeft = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
      ctx.playSound("tick");
      if (!hasAnyLegalMove("white")) {
        ctx.setStatus("No legal moves — passing to the CPU.");
        state.movesLeft = [];
        render();
        setTimeout(endTurn, 900);
        return;
      }
      ctx.setStatus("Your roll — click a checker, then a highlighted point.");
      render();
    }

    function maybeAutoAdvance() {
      if (state.movesLeft.length === 0) {
        setTimeout(endTurn, 400);
      } else if (!hasAnyLegalMove_anySource()) {
        setTimeout(endTurn, 400);
      } else {
        ctx.setStatus(`${state.movesLeft.length} move(s) left this turn.`);
      }
    }

    function hasAnyLegalMove_anySource() {
      return hasAnyLegalMove("white");
    }

    function endTurn() {
      state.dice = [];
      state.movesLeft = [];
      state.selected = null;
      if (state.over) return;
      state.turn = state.turn === "white" ? "black" : "white";
      render();
      if (state.turn === "black") {
        ctx.setStatus("CPU is thinking...");
        state.thinking = true;
        setTimeout(cpuTurn, 600);
      } else {
        ctx.setStatus("Your turn — roll the dice.");
      }
    }

    function cpuTurn() {
      const d1 = 1 + Math.floor(Math.random() * 6);
      const d2 = 1 + Math.floor(Math.random() * 6);
      let moves = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
      state.dice = [d1, d2];
      render();

      function step() {
        if (state.over) return;
        // prune to only dice that currently have a legal move
        moves = moves.filter((d) => cpuFindMove(d));
        if (!moves.length) {
          state.thinking = false;
          setTimeout(endTurn, 500);
          return;
        }
        const die = moves.shift();
        const move = cpuFindMove(die);
        if (move) applyMove(move.from, move.to, "black");
        render();
        setTimeout(step, 500);
      }
      setTimeout(step, 400);
    }

    function cpuAllBlackHome() {
      for (let p = 1; p <= 18; p++) if (state.board.points[p - 1] < 0) return false;
      return state.board.bar.black === 0;
    }

    // simple heuristic AI: prefer hitting a blot, then bearing off, then
    // making a point (landing on its own checker), then any legal move
    function cpuFindMove(die) {
      const froms = state.board.bar.black > 0
        ? ["bar"]
        : state.board.points.map((v, i) => (v < 0 ? i + 1 : null)).filter((v) => v !== null);
      const candidates = [];
      froms.forEach((from) => {
        const dest = destFor(from, die, "black");
        if (dest >= 1 && dest <= 24 && canLand(dest, "black")) {
          candidates.push({ from, to: dest, score: scoreCpuMove(dest) });
        } else if (dest > 24 && cpuAllBlackHome()) {
          const highest = isHighestOccupiedBlack(from);
          if (dest === 25 || highest) candidates.push({ from, to: "off", score: 50 });
        }
      });
      if (!candidates.length) return null;
      candidates.sort((a, b) => b.score - a.score);
      return candidates[0];
    }

    function isHighestOccupiedBlack(from) {
      for (let p = 19; p < from; p++) {
        if (state.board.points[p - 1] < 0) return false;
      }
      return true;
    }

    function scoreCpuMove(dest) {
      const occupant = state.board.points[dest - 1];
      if (occupant === 1) return 40; // hit a blot
      if (occupant === -1) return 20; // make a point (safety)
      return 5;
    }

    function finishGame(winner) {
      state.over = true;
      state.dice = [];
      state.movesLeft = [];
      const wins = ctx.storage.get("wins", 0);
      if (winner === "white") {
        ctx.storage.set("wins", wins + 1);
        ctx.playSound("win");
        ctx.confetti(wrap);
        ctx.setStatus(`You win! Total wins: ${wins + 1}`);
      } else {
        ctx.playSound("lose");
        ctx.setStatus("The CPU bore off all its checkers first.");
      }
      render();
      setTimeout(() => {
        ctx.showOverlay({
          title: winner === "white" ? "You Win!" : "CPU Wins",
          subtitle: winner === "white" ? `Checkers off: 15/15 · Total wins: ${wins + 1}` : "Better luck next roll.",
          buttonText: "Play Again",
          onButton: startGame,
        });
      }, 400);
    }

    function startGame() {
      state.board = START_LAYOUT();
      state.dice = [];
      state.movesLeft = [];
      state.turn = "white";
      state.selected = null;
      state.over = false;
      state.thinking = false;
      ctx.setStatus("Your turn — roll the dice.");
      render();
    }

    startGame();
  },
});
