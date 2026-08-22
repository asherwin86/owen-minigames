MimiGames.register({
  id: "flappy-wings",
  title: "Flappy Wings",
  emoji: "🐦",
  category: "Action",
  players: "1P",
  howTo: "Click/tap the board, press Space, or hit a gamepad face button (A/X/Y, not B) to flap and climb (Start un-hides the controller cursor if you need it). Gravity pulls you down the rest of the time — thread the gaps between pipes without hitting one, the ground, or the ceiling.",
  init(root, ctx) {
    const W = 400,
      H = 560;
    const GRAVITY = 1500; // px/s^2
    const FLAP_VELOCITY = -420; // px/s
    const BIRD_X = W * 0.28;
    const BIRD_R = 14;
    const GROUND_H = 60;
    const PIPE_W = 62;
    const PIPE_GAP_MAX = 168;
    const PIPE_GAP_MIN = 128;
    const PIPE_SPEED_BASE = 190; // px/s
    const PIPE_INTERVAL = 1.35; // seconds between pipe spawns

    const state = {
      bird: { y: H / 2, vy: 0, angle: 0 },
      pipes: [],
      score: 0,
      best: ctx.storage.get("best", 0),
      started: false,
      over: false,
      groundOffset: 0,
      spawnTimer: 0,
      elapsed: 0,
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "10px";

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.style.background = "#4ec0e8";
    canvas.style.border = "2px solid var(--border)";
    canvas.style.borderRadius = "10px";
    canvas.style.touchAction = "none";
    canvas.style.cursor = "pointer";
    canvas.style.maxWidth = "100%";
    const g = canvas.getContext("2d");

    const hint = document.createElement("div");
    hint.style.color = "var(--text-dim)";
    hint.style.fontSize = ".8rem";
    hint.textContent = "Click/tap, press Space, or press a gamepad button to flap.";

    const restartBtn = document.createElement("button");
    restartBtn.className = "btn primary";
    restartBtn.textContent = "Restart";
    restartBtn.onclick = reset;

    wrap.appendChild(canvas);
    wrap.appendChild(hint);
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
        label: "Add Score +5",
        run() {
          if (!state.started || state.over) return;
          state.score += 5;
          ctx.setStatus(`Score: ${state.score} · Best: ${Math.max(state.best, state.score)}`);
        },
      },
    ]);

    function pipeGapFor(score) {
      return Math.max(PIPE_GAP_MIN, PIPE_GAP_MAX - score * 3);
    }
    function pipeSpeedFor(score) {
      return Math.min(320, PIPE_SPEED_BASE + score * 4);
    }

    function spawnPipe() {
      const gap = pipeGapFor(state.score);
      const margin = 50;
      const gapCenter = margin + gap / 2 + Math.random() * (H - GROUND_H - margin * 2 - gap);
      state.pipes.push({ x: W + PIPE_W, gapCenter, gap, scored: false });
    }

    function flap() {
      if (state.over) return;
      if (!state.started) {
        state.started = true;
      }
      state.bird.vy = FLAP_VELOCITY;
      ctx.playSound("tick");
    }

    function onKeydown(e) {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        if (e.repeat) return; // mash-proofing: holding the key shouldn't auto-flap every repeat tick
        flap();
      }
    }
    document.addEventListener("keydown", onKeydown);

    function onPointerDown(e) {
      e.preventDefault();
      flap();
    }
    canvas.addEventListener("pointerdown", onPointerDown);

    // gamepad support: any face button flaps, polled alongside the render loop.
    // Button 0 (B) is excluded — the hub's site-wide gamepad cursor (js/pad-cursor.js)
    // reserves it everywhere as "back to the game grid", and this game runs directly
    // in the hub's DOM (not an isolated iframe like Kart Circuit), so that binding
    // is always live here too; flapping on it would instantly exit the game.
    const BACK_BUTTON_INDEX = 0;
    const gamepadPrevPressed = new Set();
    function pollGamepad() {
      if (typeof navigator.getGamepads !== "function") return;
      const pad = Array.from(navigator.getGamepads()).find((p) => p?.connected);
      if (!pad) {
        gamepadPrevPressed.clear();
        return;
      }
      pad.buttons.forEach((button, index) => {
        if (index === BACK_BUTTON_INDEX) return;
        const pressed = Boolean(button?.pressed);
        if (pressed && !gamepadPrevPressed.has(index)) flap();
        if (pressed) gamepadPrevPressed.add(index);
        else gamepadPrevPressed.delete(index);
      });
    }

    function circleRectOverlap(cx, cy, r, rx, ry, rw, rh) {
      const nearestX = Math.max(rx, Math.min(cx, rx + rw));
      const nearestY = Math.max(ry, Math.min(cy, ry + rh));
      const dx = cx - nearestX;
      const dy = cy - nearestY;
      return dx * dx + dy * dy < r * r;
    }

    let lastTime = 0;
    function update(dt) {
      state.groundOffset = (state.groundOffset + pipeSpeedFor(state.score) * dt) % 24;

      if (!state.started || state.over) return;

      state.elapsed += dt;
      state.bird.vy += GRAVITY * dt;
      state.bird.y += state.bird.vy * dt;
      state.bird.angle = clamp(state.bird.vy / 600, -0.5, 1.1);

      const speed = pipeSpeedFor(state.score);
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        spawnPipe();
        state.spawnTimer = PIPE_INTERVAL;
      }

      state.pipes.forEach((pipe) => {
        pipe.x -= speed * dt;
        if (!pipe.scored && pipe.x + PIPE_W < BIRD_X) {
          pipe.scored = true;
          state.score += 1;
          ctx.playSound("coin");
          ctx.setStatus(`Score: ${state.score} · Best: ${Math.max(state.best, state.score)}`);
        }
      });
      state.pipes = state.pipes.filter((pipe) => pipe.x + PIPE_W > -10);

      // collisions: ground, ceiling, pipes
      if (!devInvincible && (state.bird.y + BIRD_R >= H - GROUND_H || state.bird.y - BIRD_R <= 0)) {
        return endGame();
      }
      if (!devInvincible) {
        for (const pipe of state.pipes) {
          const topH = pipe.gapCenter - pipe.gap / 2;
          const bottomY = pipe.gapCenter + pipe.gap / 2;
          if (
            circleRectOverlap(BIRD_X, state.bird.y, BIRD_R, pipe.x, 0, PIPE_W, topH) ||
            circleRectOverlap(BIRD_X, state.bird.y, BIRD_R, pipe.x, bottomY, PIPE_W, H - GROUND_H - bottomY)
          ) {
            return endGame();
          }
        }
      }
    }

    function clamp(v, min, max) {
      return Math.max(min, Math.min(max, v));
    }

    function draw() {
      // sky
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#7fd8f5");
      sky.addColorStop(1, "#bdeeff");
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);

      // soft cloud shapes (purely decorative, static)
      g.fillStyle = "rgba(255,255,255,0.6)";
      [[60, 90, 30], [130, 70, 22], [320, 130, 26], [280, 60, 18]].forEach(([cx, cy, r]) => {
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.fill();
      });

      // pipes
      g.fillStyle = "#4fbf5f";
      g.strokeStyle = "#2f8a3c";
      g.lineWidth = 3;
      state.pipes.forEach((pipe) => {
        const topH = pipe.gapCenter - pipe.gap / 2;
        const bottomY = pipe.gapCenter + pipe.gap / 2;
        g.fillRect(pipe.x, 0, PIPE_W, topH);
        g.strokeRect(pipe.x, 0, PIPE_W, topH);
        g.fillRect(pipe.x, bottomY, PIPE_W, H - GROUND_H - bottomY);
        g.strokeRect(pipe.x, bottomY, PIPE_W, H - GROUND_H - bottomY);
        // pipe caps for a little visual detail
        g.fillRect(pipe.x - 4, topH - 20, PIPE_W + 8, 20);
        g.strokeRect(pipe.x - 4, topH - 20, PIPE_W + 8, 20);
        g.fillRect(pipe.x - 4, bottomY, PIPE_W + 8, 20);
        g.strokeRect(pipe.x - 4, bottomY, PIPE_W + 8, 20);
      });

      // ground
      g.fillStyle = "#deb974";
      g.fillRect(0, H - GROUND_H, W, GROUND_H);
      g.fillStyle = "#c9a05e";
      for (let x = -24; x < W + 24; x += 24) {
        g.fillRect(x - state.groundOffset, H - GROUND_H, 12, 10);
      }
      g.fillStyle = "#6fae4a";
      g.fillRect(0, H - GROUND_H, W, 6);

      // bird
      g.save();
      g.translate(BIRD_X, state.bird.y);
      g.rotate(state.bird.angle);
      g.font = "28px sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("🐦", 0, 2);
      g.restore();

      // score
      g.fillStyle = "#ffffff";
      g.strokeStyle = "rgba(0,0,0,0.35)";
      g.lineWidth = 4;
      g.font = "700 32px sans-serif";
      g.textAlign = "center";
      g.strokeText(String(state.score), W / 2, 56);
      g.fillText(String(state.score), W / 2, 56);

      if (!state.started) {
        g.fillStyle = "rgba(0,0,0,0.35)";
        g.fillRect(0, H / 2 - 44, W, 88);
        g.fillStyle = "#ffffff";
        g.font = "600 18px sans-serif";
        g.fillText("Tap / Space / gamepad", W / 2, H / 2 - 10);
        g.fillText("to flap and start", W / 2, H / 2 + 16);
      }
    }

    function endGame() {
      state.over = true;
      const newBest = Math.max(state.best, state.score);
      state.best = newBest;
      ctx.storage.set("best", newBest);
      ctx.playSound("fail");
      ctx.setStatus(`Game Over — Score: ${state.score} · Best: ${newBest}`);
      setTimeout(() => {
        ctx.showOverlay({
          title: "Game Over!",
          subtitle: `Score: ${state.score} · Best: ${newBest}`,
          buttonText: "Play Again",
          onButton: reset,
        });
      }, 400);
    }

    function reset() {
      state.bird.y = H / 2;
      state.bird.vy = 0;
      state.bird.angle = 0;
      state.pipes = [];
      state.score = 0;
      state.started = false;
      state.over = false;
      state.spawnTimer = PIPE_INTERVAL * 0.6;
      state.elapsed = 0;
      ctx.setStatus(`Score: 0 · Best: ${state.best}`);
    }

    let rafId = null;
    function loop(now) {
      const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0.016;
      lastTime = now;
      pollGamepad();
      update(dt);
      draw();
      // this game reads the gamepad itself while flying — keep the hub's
      // site-wide gamepad cursor (js/pad-cursor.js) out of the way so it
      // doesn't drift across the board on top of active gameplay
      window.MimiPadCursor?.setSuppressed(state.started && !state.over);
      rafId = requestAnimationFrame(loop);
    }

    reset();
    rafId = requestAnimationFrame(loop);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.MimiPadCursor?.setSuppressed(false);
      document.removeEventListener("keydown", onKeydown);
      canvas.removeEventListener("pointerdown", onPointerDown);
    };
  },
});
