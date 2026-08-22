MimiGames.register({
  id: "breakout",
  title: "Breakout",
  emoji: "🧱",
  category: "Action",
  players: "1P",
  howTo: "Move your mouse or finger over the board to slide the paddle. Click/tap to launch the ball and clear all the bricks without losing your 3 lives.",
  init(root, ctx) {
    const W = 480,
      H = 420;
    const ROWS = 6,
      COLS = 8;
    const BRICK_W = W / COLS,
      BRICK_H = 18,
      BRICK_TOP = 40;
    const PADDLE_W = 80,
      PADDLE_H = 12;
    const BALL_R = 6;

    const state = {
      bricks: [],
      paddleX: W / 2 - PADDLE_W / 2,
      ball: { x: W / 2, y: H - 60, vx: 0, vy: 0 },
      score: 0,
      lives: 3,
      over: false,
      launched: false,
      invincible: false,
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "10px";

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.style.background = "#0d0f1c";
    canvas.style.border = "2px solid var(--border)";
    canvas.style.borderRadius = "10px";
    canvas.style.touchAction = "none";
    canvas.style.cursor = "pointer";
    canvas.style.maxWidth = "100%";
    const g = canvas.getContext("2d");

    const hint = document.createElement("div");
    hint.style.color = "var(--text-dim)";
    hint.style.fontSize = ".8rem";
    hint.textContent = "Move mouse/finger to steer. Click/tap to launch the ball.";

    const restartBtn = document.createElement("button");
    restartBtn.className = "btn primary";
    restartBtn.textContent = "Restart";
    restartBtn.onclick = reset;

    wrap.appendChild(canvas);
    wrap.appendChild(hint);
    wrap.appendChild(restartBtn);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Invincible: Off",
        run(e) {
          state.invincible = !state.invincible;
          e.target.textContent = `Invincible: ${state.invincible ? "On" : "Off"}`;
        },
      },
      {
        label: "Add Score +50",
        run: () => {
          state.score += 50;
          ctx.setStatus(`Score: ${state.score} · Lives: ${state.lives}`);
        },
      },
    ]);

    const BRICK_COLORS = ["#ff4757", "#ff9f43", "#ffd93d", "#35d07f", "#00d2ff", "#a55eea"];

    function initBricks() {
      state.bricks = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          state.bricks.push({ r, c, alive: true, color: BRICK_COLORS[r % BRICK_COLORS.length] });
        }
      }
    }

    function resetBall() {
      state.ball.x = state.paddleX + PADDLE_W / 2;
      state.ball.y = H - 40;
      state.ball.vx = 0;
      state.ball.vy = 0;
      state.launched = false;
    }

    function launchBall() {
      if (state.launched || state.over) return;
      const angle = -Math.PI / 2 + (Math.random() * 0.6 - 0.3);
      const speed = 4.5;
      state.ball.vx = Math.cos(angle) * speed;
      state.ball.vy = Math.sin(angle) * speed;
      state.launched = true;
    }

    function onPointerMove(e) {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (W / rect.width);
      state.paddleX = Math.max(0, Math.min(W - PADDLE_W, x - PADDLE_W / 2));
      if (!state.launched) {
        state.ball.x = state.paddleX + PADDLE_W / 2;
      }
    }
    function onPointerDown() {
      launchBall();
    }
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);

    let rafId = null;

    function update() {
      if (!state.over && state.launched) {
        const b = state.ball;
        b.x += b.vx;
        b.y += b.vy;

        if (b.x - BALL_R < 0) {
          b.x = BALL_R;
          b.vx *= -1;
        }
        if (b.x + BALL_R > W) {
          b.x = W - BALL_R;
          b.vx *= -1;
        }
        if (b.y - BALL_R < 0) {
          b.y = BALL_R;
          b.vy *= -1;
        }

        const paddleY = H - 24;
        if (
          b.vy > 0 &&
          b.y + BALL_R >= paddleY &&
          b.y + BALL_R <= paddleY + PADDLE_H + 6 &&
          b.x >= state.paddleX &&
          b.x <= state.paddleX + PADDLE_W
        ) {
          const hitPos = (b.x - (state.paddleX + PADDLE_W / 2)) / (PADDLE_W / 2);
          const angle = hitPos * (Math.PI / 3) - Math.PI / 2;
          const speed = Math.min(8, Math.hypot(b.vx, b.vy) * 1.03 + 0.05);
          b.vx = Math.cos(angle) * speed;
          b.vy = Math.sin(angle) * speed;
          b.y = paddleY - BALL_R;
          ctx.playSound("click");
        }

        for (const brick of state.bricks) {
          if (!brick.alive) continue;
          const bx = brick.c * BRICK_W,
            by = BRICK_TOP + brick.r * BRICK_H;
          if (
            b.x + BALL_R > bx &&
            b.x - BALL_R < bx + BRICK_W &&
            b.y + BALL_R > by &&
            b.y - BALL_R < by + BRICK_H
          ) {
            brick.alive = false;
            b.vy *= -1;
            state.score += 10;
            ctx.playSound("pop");
            ctx.setStatus(`Score: ${state.score} · Lives: ${state.lives}`);
            break;
          }
        }

        if (b.y - BALL_R > H) {
          if (state.invincible) {
            ctx.playSound("fail");
            resetBall();
          } else {
            state.lives--;
            ctx.playSound("fail");
            ctx.setStatus(`Score: ${state.score} · Lives: ${state.lives}`);
            if (state.lives <= 0) {
              endGame(false);
            } else {
              resetBall();
            }
          }
        }

        if (state.bricks.every((br) => !br.alive)) {
          endGame(true);
        }
      }

      draw();
      rafId = requestAnimationFrame(update);
    }

    function draw() {
      g.clearRect(0, 0, W, H);
      g.fillStyle = "#0d0f1c";
      g.fillRect(0, 0, W, H);

      state.bricks.forEach((brick) => {
        if (!brick.alive) return;
        g.fillStyle = brick.color;
        g.fillRect(brick.c * BRICK_W + 2, BRICK_TOP + brick.r * BRICK_H + 2, BRICK_W - 4, BRICK_H - 4);
      });

      g.fillStyle = "#00d2ff";
      g.fillRect(state.paddleX, H - 24, PADDLE_W, PADDLE_H);

      g.beginPath();
      g.fillStyle = "#ffd93d";
      g.arc(state.ball.x, state.ball.y, BALL_R, 0, Math.PI * 2);
      g.fill();

      if (!state.launched && !state.over) {
        g.fillStyle = "rgba(255,255,255,.7)";
        g.font = "14px sans-serif";
        g.textAlign = "center";
        g.fillText("Click / tap to launch", W / 2, H - 60);
      }
    }

    function endGame(won) {
      state.over = true;
      const best = ctx.storage.get("best", 0);
      const newBest = Math.max(best, state.score);
      ctx.storage.set("best", newBest);
      ctx.playSound(won ? "success" : "fail");
      ctx.setStatus(won ? `You cleared the board! Score: ${state.score}` : `Game Over — Score: ${state.score}`);
      ctx.showOverlay({
        title: won ? "Board Cleared!" : "Game Over",
        subtitle: `Score: ${state.score} · Best: ${newBest}`,
        buttonText: "Play Again",
        onButton: reset,
      });
    }

    function reset() {
      state.paddleX = W / 2 - PADDLE_W / 2;
      state.score = 0;
      state.lives = 3;
      state.over = false;
      initBricks();
      resetBall();
      ctx.setStatus(`Score: ${state.score} · Lives: ${state.lives}`);
    }

    reset();
    rafId = requestAnimationFrame(update);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
    };
  },
});
