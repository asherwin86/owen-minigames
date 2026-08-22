MimiGames.register({
  id: "pong",
  title: "Table Tennis",
  emoji: "🏓",
  category: "Action",
  players: "1P",
  howTo: "Move your mouse/finger up and down over the table (or use W/S or Up/Down arrows — D-pad too, with a gamepad) to control your paddle. First to 7 points wins.",
  init(root, ctx) {
    const W = 480,
      H = 320;
    const PADDLE_W = 10,
      PADDLE_H = 64;
    const BALL_R = 6;
    const WIN_SCORE = 7;

    const state = {
      playerY: H / 2 - PADDLE_H / 2,
      cpuY: H / 2 - PADDLE_H / 2,
      ball: { x: W / 2, y: H / 2, vx: 4, vy: 2 },
      playerScore: 0,
      cpuScore: 0,
      over: false,
      keys: { w: false, s: false },
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
    canvas.style.background = "#06170f";
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

    ctx.devCheatPanel(root, [
      {
        label: "Invincible: Off",
        run(e) {
          state.invincible = !state.invincible;
          e.target.textContent = `Invincible: ${state.invincible ? "On" : "Off"}`;
        },
      },
      {
        label: "Add Point",
        run: () => {
          if (state.over) return;
          state.playerScore++;
          ctx.setStatus(`You: ${state.playerScore}  ·  CPU: ${state.cpuScore}`);
          if (state.playerScore >= WIN_SCORE) endGame(true);
        },
      },
    ]);

    function onPointerMove(e) {
      const rect = canvas.getBoundingClientRect();
      const y = (e.clientY - rect.top) * (H / rect.height);
      state.playerY = Math.max(0, Math.min(H - PADDLE_H, y - PADDLE_H / 2));
    }
    canvas.addEventListener("pointermove", onPointerMove);

    function onKeydown(e) {
      const k = e.key.toLowerCase();
      if (k === "w" || k === "arrowup") state.keys.w = true;
      else if (k === "s" || k === "arrowdown") state.keys.s = true;
      else return;
      e.preventDefault();
    }
    function onKeyup(e) {
      const k = e.key.toLowerCase();
      if (k === "w" || k === "arrowup") state.keys.w = false;
      else if (k === "s" || k === "arrowdown") state.keys.s = false;
    }
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("keyup", onKeyup);

    function serve(direction) {
      state.ball.x = W / 2;
      state.ball.y = H / 2;
      const angle = Math.random() * 0.6 - 0.3;
      const speed = 4.5;
      state.ball.vx = Math.cos(angle) * speed * direction;
      state.ball.vy = Math.sin(angle) * speed;
    }

    function reset() {
      state.playerY = H / 2 - PADDLE_H / 2;
      state.cpuY = H / 2 - PADDLE_H / 2;
      state.playerScore = 0;
      state.cpuScore = 0;
      state.over = false;
      serve(Math.random() < 0.5 ? 1 : -1);
      ctx.setStatus(`You: ${state.playerScore}  ·  CPU: ${state.cpuScore}`);
    }

    let rafId = null;

    function update() {
      if (!state.over) {
        if (state.keys.w) state.playerY = Math.max(0, state.playerY - 6);
        if (state.keys.s) state.playerY = Math.min(H - PADDLE_H, state.playerY + 6);

        const cpuCenter = state.cpuY + PADDLE_H / 2;
        const target = state.ball.y;
        const cpuSpeed = 3.6;
        if (cpuCenter < target - 6) state.cpuY = Math.min(H - PADDLE_H, state.cpuY + cpuSpeed);
        else if (cpuCenter > target + 6) state.cpuY = Math.max(0, state.cpuY - cpuSpeed);

        const b = state.ball;
        b.x += b.vx;
        b.y += b.vy;

        if (b.y - BALL_R < 0) {
          b.y = BALL_R;
          b.vy *= -1;
        }
        if (b.y + BALL_R > H) {
          b.y = H - BALL_R;
          b.vy *= -1;
        }

        if (
          b.vx < 0 &&
          b.x - BALL_R <= PADDLE_W &&
          b.x - BALL_R > 0 &&
          b.y >= state.playerY &&
          b.y <= state.playerY + PADDLE_H
        ) {
          const hitPos = (b.y - (state.playerY + PADDLE_H / 2)) / (PADDLE_H / 2);
          const speed = Math.min(9, Math.hypot(b.vx, b.vy) * 1.05);
          b.vx = Math.abs(Math.cos(hitPos * 0.4) * speed);
          b.vy = hitPos * speed;
          b.x = PADDLE_W + BALL_R;
          ctx.playSound("click");
        }

        if (
          b.vx > 0 &&
          b.x + BALL_R >= W - PADDLE_W &&
          b.x + BALL_R < W &&
          b.y >= state.cpuY &&
          b.y <= state.cpuY + PADDLE_H
        ) {
          const hitPos = (b.y - (state.cpuY + PADDLE_H / 2)) / (PADDLE_H / 2);
          const speed = Math.min(9, Math.hypot(b.vx, b.vy) * 1.05);
          b.vx = -Math.abs(Math.cos(hitPos * 0.4) * speed);
          b.vy = hitPos * speed;
          b.x = W - PADDLE_W - BALL_R;
          ctx.playSound("click");
        }

        if (b.x < -BALL_R) {
          if (state.invincible) {
            b.x = BALL_R;
            b.vx = Math.abs(b.vx);
          } else {
            state.cpuScore++;
            ctx.playSound("fail");
            ctx.setStatus(`You: ${state.playerScore}  ·  CPU: ${state.cpuScore}`);
            if (state.cpuScore >= WIN_SCORE) endGame(false);
            else serve(1);
          }
        } else if (b.x > W + BALL_R) {
          state.playerScore++;
          ctx.playSound("pop");
          ctx.setStatus(`You: ${state.playerScore}  ·  CPU: ${state.cpuScore}`);
          if (state.playerScore >= WIN_SCORE) endGame(true);
          else serve(-1);
        }
      }

      draw();
      rafId = requestAnimationFrame(update);
    }

    function draw() {
      g.clearRect(0, 0, W, H);
      g.fillStyle = "#06170f";
      g.fillRect(0, 0, W, H);

      g.strokeStyle = "rgba(255,255,255,.25)";
      g.setLineDash([6, 8]);
      g.beginPath();
      g.moveTo(W / 2, 0);
      g.lineTo(W / 2, H);
      g.stroke();
      g.setLineDash([]);

      g.fillStyle = "#00d2ff";
      g.fillRect(0, state.playerY, PADDLE_W, PADDLE_H);
      g.fillStyle = "#ff4757";
      g.fillRect(W - PADDLE_W, state.cpuY, PADDLE_W, PADDLE_H);

      g.beginPath();
      g.fillStyle = "#ffd93d";
      g.arc(state.ball.x, state.ball.y, BALL_R, 0, Math.PI * 2);
      g.fill();
    }

    function endGame(won) {
      state.over = true;
      ctx.playSound(won ? "success" : "fail");
      ctx.setStatus(`Final: You ${state.playerScore} — CPU ${state.cpuScore}`);
      ctx.showOverlay({
        title: won ? "You Win!" : "CPU Wins",
        subtitle: `Final Score — You: ${state.playerScore} · CPU: ${state.cpuScore}`,
        buttonText: "Play Again",
        onButton: reset,
      });
    }

    reset();
    rafId = requestAnimationFrame(update);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      canvas.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("keydown", onKeydown);
      document.removeEventListener("keyup", onKeyup);
    };
  },
});
