MimiGames.register({
  id: "fruit-catch",
  title: "Fruit Catch",
  emoji: "🍎",
  category: "Action",
  players: "1P",
  howTo: "Drag with mouse/finger or use arrow keys / A-D to move the basket. Catch falling fruit, avoid bombs, and don't miss too many fruit.",
  init(root, ctx) {
    const W = 480,
      H = 480;
    const BASKET_W = 74,
      BASKET_H = 26;
    const FRUITS = ["🍎", "🍊", "🍌", "🍇"];
    const START_LIVES = 3;

    const state = {
      basketX: W / 2 - BASKET_W / 2,
      items: [],
      score: 0,
      lives: START_LIVES,
      over: false,
      keys: { left: false, right: false },
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "10px";

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.style.background = "#132318";
    canvas.style.border = "2px solid var(--border)";
    canvas.style.borderRadius = "10px";
    canvas.style.touchAction = "none";
    canvas.style.maxWidth = "100%";
    const g = canvas.getContext("2d");

    const restartBtn = document.createElement("button");
    restartBtn.className = "btn primary";
    restartBtn.textContent = "Restart";
    restartBtn.onclick = reset;

    wrap.appendChild(canvas);
    wrap.appendChild(restartBtn);
    root.appendChild(wrap);

    let devInvincible = false;
    ctx.devCheatPanel(root, [
      {
        label: "Invincible: Off",
        run(e) {
          devInvincible = !devInvincible;
          e.target.textContent = `Invincible: ${devInvincible ? "On" : "Off"}`;
        },
      },
      {
        label: "Add Score +50",
        run() {
          if (state.over) return;
          state.score += 50;
          updateStatus();
        },
      },
    ]);

    function setBasketFromClientX(clientX) {
      const rect = canvas.getBoundingClientRect();
      const x = (clientX - rect.left) * (W / rect.width);
      state.basketX = Math.max(0, Math.min(W - BASKET_W, x - BASKET_W / 2));
    }
    function onPointerMove(e) {
      if (e.buttons === 0 && e.pointerType === "mouse") return;
      setBasketFromClientX(e.clientX);
    }
    function onPointerDown(e) {
      setBasketFromClientX(e.clientX);
    }
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);

    function onKeydown(e) {
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") {
        state.keys.left = true;
        e.preventDefault();
      } else if (k === "arrowright" || k === "d") {
        state.keys.right = true;
        e.preventDefault();
      }
    }
    function onKeyup(e) {
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") state.keys.left = false;
      else if (k === "arrowright" || k === "d") state.keys.right = false;
    }
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("keyup", onKeyup);

    let spawnTimeoutId = null;
    function scheduleSpawn() {
      const delay = 500 + Math.random() * 700;
      spawnTimeoutId = setTimeout(() => {
        if (!state.over) spawnItem();
        scheduleSpawn();
      }, delay);
    }

    function spawnItem() {
      const isBomb = Math.random() < 0.15;
      const emoji = isBomb ? "💣" : FRUITS[Math.floor(Math.random() * FRUITS.length)];
      state.items.push({
        x: 20 + Math.random() * (W - 40),
        y: -20,
        vy: 2 + Math.random() * 2.5,
        emoji,
        isBomb,
        resolved: false,
      });
    }

    let rafId = null;

    function update() {
      if (!state.over) {
        if (state.keys.left) state.basketX = Math.max(0, state.basketX - 6);
        if (state.keys.right) state.basketX = Math.min(W - BASKET_W, state.basketX + 6);

        const basketY = H - 50;
        for (const item of state.items) {
          if (item.resolved) continue;
          item.y += item.vy;

          const withinX = item.x >= state.basketX - 10 && item.x <= state.basketX + BASKET_W + 10;
          if (item.y >= basketY && item.y <= basketY + BASKET_H && withinX) {
            item.resolved = true;
            if (item.isBomb) {
              if (!devInvincible) state.lives--;
              ctx.playSound("fail");
              ctx.vibrate(40);
            } else {
              state.score += 10;
              ctx.playSound("pop");
            }
            updateStatus();
            if (state.lives <= 0) endGame();
          } else if (item.y > H + 20) {
            item.resolved = true;
            if (!item.isBomb) {
              if (!devInvincible) state.lives--;
              updateStatus();
              if (state.lives <= 0) endGame();
            }
          }
        }
        state.items = state.items.filter((it) => !it.resolved);
      }

      draw();
      rafId = requestAnimationFrame(update);
    }

    function draw() {
      g.clearRect(0, 0, W, H);
      g.fillStyle = "#132318";
      g.fillRect(0, 0, W, H);

      g.font = "28px sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      state.items.forEach((item) => {
        g.fillText(item.emoji, item.x, item.y);
      });

      const basketY = H - 50;
      g.fillStyle = "#a0632a";
      g.fillRect(state.basketX, basketY, BASKET_W, BASKET_H);
      g.font = "20px sans-serif";
      g.fillText("🧺", state.basketX + BASKET_W / 2, basketY + BASKET_H / 2);
    }

    function updateStatus() {
      ctx.setStatus(`Score: ${state.score} · Lives: ${"❤️".repeat(Math.max(0, state.lives))}`);
    }

    function endGame() {
      state.over = true;
      if (spawnTimeoutId) {
        clearTimeout(spawnTimeoutId);
        spawnTimeoutId = null;
      }
      const best = ctx.storage.get("best", 0);
      const newBest = Math.max(best, state.score);
      ctx.storage.set("best", newBest);
      ctx.playSound("fail");
      ctx.setStatus(`Game Over — Score: ${state.score}`);
      ctx.showOverlay({
        title: "Game Over!",
        subtitle: `Score: ${state.score} · Best: ${newBest}`,
        buttonText: "Play Again",
        onButton: reset,
      });
    }

    function reset() {
      if (spawnTimeoutId) {
        clearTimeout(spawnTimeoutId);
        spawnTimeoutId = null;
      }
      state.basketX = W / 2 - BASKET_W / 2;
      state.items = [];
      state.score = 0;
      state.lives = START_LIVES;
      state.over = false;
      updateStatus();
      scheduleSpawn();
    }

    reset();
    rafId = requestAnimationFrame(update);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (spawnTimeoutId) clearTimeout(spawnTimeoutId);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeydown);
      document.removeEventListener("keyup", onKeyup);
    };
  },
});
