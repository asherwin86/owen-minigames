MimiGames.register({
  id: "air-hockey",
  title: "Air Hockey",
  emoji: "🏒",
  category: "Action",
  players: "1P",
  howTo: "Drag your mallet (bottom half) with mouse or finger to hit the puck into the top goal. First to 7 wins.",
  init(root, ctx) {
    const W = 380,
      H = 520;
    const R_MALLET = 22,
      R_PUCK = 12;
    const GOAL_W = 130;
    const WIN_SCORE = 7;
    const FRICTION = 0.992;

    const state = {
      player: { x: W / 2, y: H - 60, vx: 0, vy: 0, prevX: W / 2, prevY: H - 60 },
      cpu: { x: W / 2, y: 60, vx: 0, vy: 0 },
      puck: { x: W / 2, y: H / 2, vx: 0, vy: 0 },
      playerScore: 0,
      cpuScore: 0,
      over: false,
      dragging: false,
      cpuFrozen: false,
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "10px";

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.style.background = "#0a1830";
    canvas.style.border = "2px solid var(--border)";
    canvas.style.borderRadius = "10px";
    canvas.style.touchAction = "none";
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
        label: "Freeze CPU: Off",
        run(e) {
          state.cpuFrozen = !state.cpuFrozen;
          e.target.textContent = `Freeze CPU: ${state.cpuFrozen ? "On" : "Off"}`;
        },
      },
      {
        label: "Add Player Point",
        run: () => {
          if (state.over) return;
          state.playerScore++;
          ctx.setStatus(`You: ${state.playerScore}  ·  CPU: ${state.cpuScore}`);
          if (state.playerScore >= WIN_SCORE) endGame(true);
        },
      },
    ]);

    function localPos(e) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (W / rect.width),
        y: (e.clientY - rect.top) * (H / rect.height),
      };
    }

    function movePlayer(x, y) {
      const p = state.player;
      p.x = Math.max(R_MALLET, Math.min(W - R_MALLET, x));
      p.y = Math.max(H / 2 + R_MALLET, Math.min(H - R_MALLET, y));
    }

    function onPointerDown(e) {
      if (state.over) return;
      canvas.setPointerCapture(e.pointerId);
      state.dragging = true;
      const pos = localPos(e);
      movePlayer(pos.x, pos.y);
    }
    function onPointerMove(e) {
      if (!state.dragging) return;
      const pos = localPos(e);
      movePlayer(pos.x, pos.y);
    }
    function onPointerUp() {
      state.dragging = false;
    }
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    function servePuck(towardTop) {
      state.puck.x = W / 2;
      state.puck.y = H / 2;
      const baseAngle = towardTop ? -Math.PI / 2 : Math.PI / 2;
      const angle = baseAngle + (Math.random() * 0.8 - 0.4);
      state.puck.vx = Math.cos(angle) * 3;
      state.puck.vy = Math.sin(angle) * 3;
    }

    function reset() {
      state.player.x = W / 2;
      state.player.y = H - 60;
      state.player.prevX = state.player.x;
      state.player.prevY = state.player.y;
      state.player.vx = 0;
      state.player.vy = 0;
      state.cpu.x = W / 2;
      state.cpu.y = 60;
      state.cpu.vx = 0;
      state.cpu.vy = 0;
      state.playerScore = 0;
      state.cpuScore = 0;
      state.over = false;
      servePuck(Math.random() < 0.5);
      ctx.setStatus(`You: ${state.playerScore}  ·  CPU: ${state.cpuScore}`);
    }

    function circleCollide(a, ar, b, br) {
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist < ar + br && dist > 0) {
        return { dx, dy, dist };
      }
      return null;
    }

    let rafId = null;

    function update() {
      if (!state.over) {
        // player velocity from actual per-frame movement (drag speed)
        state.player.vx = state.player.x - state.player.prevX;
        state.player.vy = state.player.y - state.player.prevY;

        // CPU AI
        const cpu = state.cpu;
        if (state.cpuFrozen) {
          cpu.vx = 0;
          cpu.vy = 0;
        } else {
          let targetX = W / 2,
            targetY = 60;
          if (state.puck.y < H / 2) {
            targetX = state.puck.x;
            targetY = Math.max(R_MALLET, Math.min(H / 2 - R_MALLET, state.puck.y));
          }
          const cpuSpeed = 4.2;
          const dx = targetX - cpu.x,
            dy = targetY - cpu.y;
          const d = Math.hypot(dx, dy);
          if (d > 1) {
            cpu.vx = (dx / d) * Math.min(cpuSpeed, d);
            cpu.vy = (dy / d) * Math.min(cpuSpeed, d);
          } else {
            cpu.vx = 0;
            cpu.vy = 0;
          }
          cpu.x += cpu.vx;
          cpu.y += cpu.vy;
          cpu.x = Math.max(R_MALLET, Math.min(W - R_MALLET, cpu.x));
          cpu.y = Math.max(R_MALLET, Math.min(H / 2 - R_MALLET, cpu.y));
        }

        const puck = state.puck;
        puck.x += puck.vx;
        puck.y += puck.vy;
        puck.vx *= FRICTION;
        puck.vy *= FRICTION;

        if (puck.x - R_PUCK < 0) {
          puck.x = R_PUCK;
          puck.vx *= -1;
        }
        if (puck.x + R_PUCK > W) {
          puck.x = W - R_PUCK;
          puck.vx *= -1;
        }

        const goalLeft = W / 2 - GOAL_W / 2,
          goalRight = W / 2 + GOAL_W / 2;
        if (puck.y - R_PUCK < 0) {
          if (puck.x > goalLeft && puck.x < goalRight) {
            state.playerScore++;
            ctx.playSound("success");
            ctx.setStatus(`You: ${state.playerScore}  ·  CPU: ${state.cpuScore}`);
            if (state.playerScore >= WIN_SCORE) {
              endGame(true);
            } else {
              servePuck(false);
            }
          } else {
            puck.y = R_PUCK;
            puck.vy *= -1;
          }
        } else if (puck.y + R_PUCK > H) {
          if (puck.x > goalLeft && puck.x < goalRight) {
            state.cpuScore++;
            ctx.playSound("fail");
            ctx.setStatus(`You: ${state.playerScore}  ·  CPU: ${state.cpuScore}`);
            if (state.cpuScore >= WIN_SCORE) {
              endGame(false);
            } else {
              servePuck(true);
            }
          } else {
            puck.y = H - R_PUCK;
            puck.vy *= -1;
          }
        }

        [state.player, state.cpu].forEach((mallet) => {
          const col = circleCollide(mallet, R_MALLET, puck, R_PUCK);
          if (col) {
            const nx = col.dx / col.dist,
              ny = col.dy / col.dist;
            const overlap = R_MALLET + R_PUCK - col.dist;
            puck.x += nx * overlap;
            puck.y += ny * overlap;
            const speed = Math.hypot(puck.vx, puck.vy);
            const malletSpeed = Math.hypot(mallet.vx || 0, mallet.vy || 0);
            const power = Math.max(speed, malletSpeed * 1.3, 3);
            puck.vx = nx * power + (mallet.vx || 0) * 0.5;
            puck.vy = ny * power + (mallet.vy || 0) * 0.5;
            ctx.playSound("click");
          }
        });

        state.player.prevX = state.player.x;
        state.player.prevY = state.player.y;
      }

      draw();
      rafId = requestAnimationFrame(update);
    }

    function draw() {
      g.clearRect(0, 0, W, H);
      g.fillStyle = "#0a1830";
      g.fillRect(0, 0, W, H);

      g.strokeStyle = "rgba(255,255,255,.25)";
      g.beginPath();
      g.moveTo(0, H / 2);
      g.lineTo(W, H / 2);
      g.stroke();
      g.beginPath();
      g.arc(W / 2, H / 2, 50, 0, Math.PI * 2);
      g.stroke();

      const goalLeft = W / 2 - GOAL_W / 2,
        goalRight = W / 2 + GOAL_W / 2;
      g.lineWidth = 4;
      g.strokeStyle = "#ff4757";
      g.beginPath();
      g.moveTo(goalLeft, 2);
      g.lineTo(goalRight, 2);
      g.stroke();
      g.strokeStyle = "#00d2ff";
      g.beginPath();
      g.moveTo(goalLeft, H - 2);
      g.lineTo(goalRight, H - 2);
      g.stroke();
      g.lineWidth = 1;

      g.beginPath();
      g.fillStyle = "#00d2ff";
      g.arc(state.player.x, state.player.y, R_MALLET, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.fillStyle = "#ff4757";
      g.arc(state.cpu.x, state.cpu.y, R_MALLET, 0, Math.PI * 2);
      g.fill();

      g.beginPath();
      g.fillStyle = "#f1f3f9";
      g.arc(state.puck.x, state.puck.y, R_PUCK, 0, Math.PI * 2);
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
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    };
  },
});
