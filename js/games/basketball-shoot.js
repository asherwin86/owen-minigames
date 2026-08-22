MimiGames.register({
  id: "basketball-shoot",
  title: "Basketball Shoot",
  emoji: "🏀",
  category: "Sports",
  players: "1P",
  howTo: "Drag back from the ball and release to launch it toward the hoop, slingshot-style. Score as many as you can in 40 seconds. Chain makes for a combo bonus, sink a clean swish for extra points, and watch out — the hoop starts swaying once your score gets high enough.",
  init(root, ctx) {
    const COLORS = {
      panel: "#1e2338",
      panelLight: "#262c47",
      accent: "#ff4757",
      accent2: "#00d2ff",
      text: "#f1f3f9",
      textDim: "#9aa1bd",
      border: "#333a5c",
      win: "#35d07f",
      lose: "#ff5c5c",
      gold: "#ffd166",
    };

    const W = 560, H = 380;
    const GROUND_Y = 330;
    const BASE_RIM_X = 480, RIM_Y = 150;
    const RIM_HALF = 17;
    const RIM_POST_R = 4.5;
    const BALL_R = 12;
    const THREE_LINE_X = 220;
    const GRAVITY = 0.42;
    const DRAG_SCALE = 0.13;
    const MAX_SPEED = 17;
    const SWAY_UNLOCK_SCORE = 10;
    const SWAY_AMPLITUDE = 24;
    const SWAY_SPEED = 0.0018;
    const BACKBOARD_OFFSET = RIM_HALF + 6;
    const BACKBOARD_TOP = RIM_Y - 55;
    const BACKBOARD_BOTTOM = RIM_Y + 10;

    const SPAWNS = [
      { x: 100, y: GROUND_Y, pts: 3 },
      { x: 150, y: GROUND_Y, pts: 3 },
      { x: 300, y: GROUND_Y - 30, pts: 2 },
      { x: 340, y: GROUND_Y, pts: 2 },
      { x: 260, y: GROUND_Y - 10, pts: 2 },
    ];

    function comboBonus(streak) {
      if (streak >= 6) return 2;
      if (streak >= 3) return 1;
      return 0;
    }

    const state = {
      score: 0,
      timeLeft: 40,
      startTs: null,
      over: false,
      ball: { x: SPAWNS[0].x, y: SPAWNS[0].y, vx: 0, vy: 0, spin: 0 },
      spawnPts: SPAWNS[0].pts,
      flying: false,
      scoredThisFlight: false,
      touchedRim: false,
      dragging: false,
      dragX: 0,
      dragY: 0,
      flash: 0,
      flashText: "",
      flashColor: COLORS.win,
      netSwing: 0,
      streak: 0,
      bestStreak: 0,
      trail: [],
      rimX: BASE_RIM_X,
    };

    const timeouts = [];
    function delay(fn, ms) {
      const id = setTimeout(fn, ms);
      timeouts.push(id);
      return id;
    }

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "10px";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "10px";
    const restartBtn = document.createElement("button");
    restartBtn.className = "btn";
    restartBtn.textContent = "Restart";
    restartBtn.onclick = resetGame;
    controls.appendChild(restartBtn);

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.style.background = COLORS.panel;
    canvas.style.borderRadius = "14px";
    canvas.style.touchAction = "none";
    canvas.style.cursor = "pointer";

    const hint = document.createElement("div");
    hint.style.color = COLORS.textDim;
    hint.style.fontSize = ".8rem";
    hint.textContent = "Balls spawn closer (2pt) or behind the line (3pt). Chain makes for a combo bonus; a clean swish (no rim contact) scores extra.";

    wrap.appendChild(controls);
    wrap.appendChild(canvas);
    wrap.appendChild(hint);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      { label: "Add Score +50", run: () => { state.score += 50; updateStatus(); } },
      { label: "Add Time +20s", run: () => { state.startTs += 20000; updateStatus(); } },
    ]);

    const g = canvas.getContext("2d");

    function canvasPos(evt) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((evt.clientX - rect.left) / rect.width) * W,
        y: ((evt.clientY - rect.top) / rect.height) * H,
      };
    }

    function newSpawn() {
      const s = SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
      state.ball.x = s.x;
      state.ball.y = s.y;
      state.ball.vx = 0;
      state.ball.vy = 0;
      state.ball.spin = 0;
      state.spawnPts = s.pts;
      state.flying = false;
      state.scoredThisFlight = false;
      state.touchedRim = false;
      state.resetting = false;
      state.trail.length = 0;
    }

    function registerMiss() {
      if (state.streak > 0) state.streak = 0;
    }

    function onPointerDown(evt) {
      if (state.over || state.flying) return;
      const p = canvasPos(evt);
      const d = Math.hypot(p.x - state.ball.x, p.y - state.ball.y);
      if (d < 34) {
        state.dragging = true;
        state.dragX = p.x;
        state.dragY = p.y;
        canvas.setPointerCapture && canvas.setPointerCapture(evt.pointerId);
      }
    }
    function onPointerMove(evt) {
      if (!state.dragging) return;
      const p = canvasPos(evt);
      state.dragX = p.x;
      state.dragY = p.y;
    }
    function onPointerUp(evt) {
      if (!state.dragging) return;
      state.dragging = false;
      const p = canvasPos(evt);
      const dx = p.x - state.ball.x;
      const dy = p.y - state.ball.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 6) return;
      const power = Math.min(dist, 130) * DRAG_SCALE;
      const nx = -dx / dist, ny = -dy / dist;
      const speed = Math.min(power * 8, MAX_SPEED);
      state.ball.vx = nx * speed;
      state.ball.vy = ny * speed;
      state.flying = true;
      state.scoredThisFlight = false;
      state.touchedRim = false;
      ctx.playSound("click");
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    function bounceOffPost(b, postX, postY) {
      const dx = b.x - postX, dy = b.y - postY;
      const dist = Math.hypot(dx, dy) || 0.01;
      const minDist = BALL_R + RIM_POST_R;
      if (dist >= minDist) return false;
      const nx = dx / dist, ny = dy / dist;
      b.x = postX + nx * minDist;
      b.y = postY + ny * minDist;
      const dot = b.vx * nx + b.vy * ny;
      b.vx = (b.vx - 2 * dot * nx) * 0.55;
      b.vy = (b.vy - 2 * dot * ny) * 0.55;
      return true;
    }

    function physicsStep() {
      if (!state.flying) return;
      const b = state.ball;
      const prevY = b.y;
      b.x += b.vx;
      b.y += b.vy;
      b.vy += GRAVITY;
      b.spin += b.vx * 0.05;

      state.trail.push({ x: b.x, y: b.y });
      if (state.trail.length > 14) state.trail.shift();

      // Backboard: a flat bank surface just past the rim. Approaching balls
      // moving rightward that reach it bounce back with damping instead of
      // just being blocked outright — a bank shot can still fall through the
      // rim afterward, same as it would on a real hoop.
      const backboardX = state.rimX + BACKBOARD_OFFSET;
      if (
        b.vx > 0 &&
        b.x + BALL_R >= backboardX &&
        b.y > BACKBOARD_TOP &&
        b.y < BACKBOARD_BOTTOM
      ) {
        b.x = backboardX - BALL_R;
        b.vx = -b.vx * 0.55;
        state.touchedRim = true;
        ctx.playSound("click");
      }

      // Rim posts: two small collision circles at the mouth of the hoop.
      // Clipping one deflects the ball instead of silently passing through
      // or vanishing — a near-miss now visibly rattles off the rim.
      const hitLeft = bounceOffPost(b, state.rimX - RIM_HALF, RIM_Y);
      const hitRight = hitLeft ? false : bounceOffPost(b, state.rimX + RIM_HALF, RIM_Y);
      if (hitLeft || hitRight) {
        state.touchedRim = true;
        ctx.playSound("click");
      }

      if (
        !state.scoredThisFlight &&
        prevY < RIM_Y &&
        b.y >= RIM_Y &&
        b.vy > 0 &&
        Math.abs(b.x - state.rimX) < RIM_HALF
      ) {
        state.scoredThisFlight = true;
        state.resetting = true;
        state.streak += 1;
        state.bestStreak = Math.max(state.bestStreak, state.streak);
        const bonus = comboBonus(state.streak);
        const swish = !state.touchedRim;
        const gained = state.spawnPts + bonus + (swish ? 1 : 0);
        state.score += gained;
        state.flash = 20;
        state.flashColor = swish ? COLORS.gold : COLORS.win;
        state.flashText = `+${gained}` + (swish ? " SWISH!" : "") + (bonus ? ` 🔥x${state.streak}` : "");
        state.netSwing = 12;
        ctx.playSound("success");
        ctx.vibrate(25);
        updateStatus();
        delay(() => newSpawn(), 400);
        return;
      }

      // Ground: a soft bounce for a shot that comes up short, rather than
      // the ball just sliding through the floor — it settles after a couple
      // of hops and only then counts as a miss.
      if (!state.resetting && b.y + BALL_R >= GROUND_Y && b.vy > 0) {
        if (Math.abs(b.vy) > 2.2) {
          b.y = GROUND_Y - BALL_R;
          b.vy = -b.vy * 0.42;
          b.vx *= 0.75;
        } else {
          state.resetting = true;
          registerMiss();
          updateStatus();
          delay(() => newSpawn(), 400);
          return;
        }
      }

      if (!state.resetting && (b.x > W + 30 || b.y > H + 30 || b.x < -30)) {
        state.resetting = true;
        registerMiss();
        updateStatus();
        delay(() => newSpawn(), 150);
      }
    }

    function finishGame() {
      state.over = true;
      const best = ctx.storage.get("best", 0);
      const bestStreak = ctx.storage.get("bestStreak", 0);
      const isBest = state.score > best;
      const isBestStreak = state.bestStreak > bestStreak;
      if (isBest) ctx.storage.set("best", state.score);
      if (isBestStreak) ctx.storage.set("bestStreak", state.bestStreak);
      ctx.playSound(isBest ? "success" : "click");
      delay(() => {
        ctx.showOverlay({
          title: "Time's Up!",
          subtitle: `Final score: ${state.score}  •  Best: ${Math.max(best, state.score)}${isBest ? " (new best!)" : ""}  •  Best streak: ${Math.max(bestStreak, state.bestStreak)}`,
          buttonText: "Play Again",
          onButton: resetGame,
        });
      }, 300);
    }

    function updateStatus() {
      const streakBit = state.streak >= 2 ? `  🔥 Streak: ${state.streak}` : "";
      ctx.setStatus(`Time: ${state.timeLeft}s — Score: ${state.score}${streakBit}`);
    }

    function resetGame() {
      timeouts.forEach(clearTimeout);
      timeouts.length = 0;
      state.score = 0;
      state.timeLeft = 40;
      state.startTs = performance.now();
      state.over = false;
      state.dragging = false;
      state.streak = 0;
      state.bestStreak = 0;
      state.flash = 0;
      state.netSwing = 0;
      newSpawn();
      updateStatus();
    }

    function draw() {
      g.clearRect(0, 0, W, H);
      g.fillStyle = COLORS.panel;
      g.fillRect(0, 0, W, H);

      // court
      g.fillStyle = "#20304a";
      g.fillRect(0, GROUND_Y + BALL_R, W, H - GROUND_Y - BALL_R);
      g.strokeStyle = COLORS.border;
      g.beginPath();
      g.moveTo(0, GROUND_Y + BALL_R);
      g.lineTo(W, GROUND_Y + BALL_R);
      g.stroke();

      // three point line
      g.strokeStyle = "rgba(255,217,61,.6)";
      g.setLineDash([5, 4]);
      g.beginPath();
      g.moveTo(THREE_LINE_X, 0);
      g.lineTo(THREE_LINE_X, H);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = "rgba(255,217,61,.8)";
      g.font = "11px sans-serif";
      g.textAlign = "center";
      g.fillText("3PT LINE", THREE_LINE_X, 16);

      // shot arc trail
      if (state.trail.length > 1) {
        for (let i = 0; i < state.trail.length; i++) {
          const t = state.trail[i];
          const alpha = (i / state.trail.length) * 0.35;
          g.beginPath();
          g.arc(t.x, t.y, BALL_R * 0.32, 0, Math.PI * 2);
          g.fillStyle = `rgba(0,210,255,${alpha})`;
          g.fill();
        }
      }

      // backboard + rim (rim sways horizontally once score is high enough)
      g.strokeStyle = COLORS.text;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(state.rimX + BACKBOARD_OFFSET, BACKBOARD_TOP);
      g.lineTo(state.rimX + BACKBOARD_OFFSET, BACKBOARD_BOTTOM);
      g.stroke();
      g.lineWidth = 5;
      g.strokeStyle = state.flash > 0 ? state.flashColor : COLORS.accent;
      g.beginPath();
      g.moveTo(state.rimX - RIM_HALF, RIM_Y);
      g.lineTo(state.rimX + RIM_HALF, RIM_Y);
      g.stroke();
      // net, flexed outward briefly right after a make for a "swish" feel
      const swing = state.netSwing > 0 ? (state.netSwing / 12) * 6 : 0;
      g.strokeStyle = "rgba(241,243,249,.5)";
      g.lineWidth = 1;
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(state.rimX + i * (RIM_HALF / 2.2), RIM_Y);
        g.lineTo(state.rimX + i * (RIM_HALF / 4), RIM_Y + 24 + swing);
        g.stroke();
      }
      if (state.netSwing > 0) state.netSwing--;
      if (state.rimX !== BASE_RIM_X) {
        g.fillStyle = "rgba(255,71,87,.75)";
        g.font = "10px sans-serif";
        g.textAlign = "center";
        g.fillText("hoop is swaying!", state.rimX, RIM_Y - 30);
      }

      // aim line
      if (state.dragging) {
        g.setLineDash([6, 5]);
        g.strokeStyle = "rgba(241,243,249,.5)";
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(state.ball.x, state.ball.y);
        g.lineTo(state.dragX, state.dragY);
        g.stroke();
        g.setLineDash([]);

        const dx = state.dragX - state.ball.x, dy = state.dragY - state.ball.y;
        const dist = Math.hypot(dx, dy) || 1;
        const power = Math.min(dist, 130) * DRAG_SCALE;
        const nx = -dx / dist, ny = -dy / dist;
        g.strokeStyle = COLORS.accent2;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(state.ball.x, state.ball.y);
        g.lineTo(state.ball.x + nx * power * 9, state.ball.y + ny * power * 9);
        g.stroke();
      }

      // ball, with a rotating seam so it visibly spins in flight
      g.save();
      g.translate(state.ball.x, state.ball.y);
      g.rotate(state.ball.spin);
      g.beginPath();
      g.arc(0, 0, BALL_R, 0, Math.PI * 2);
      g.fillStyle = "#e2711d";
      g.fill();
      g.strokeStyle = "#5c3210";
      g.lineWidth = 1.5;
      g.stroke();
      g.beginPath();
      g.moveTo(-BALL_R, 0);
      g.lineTo(BALL_R, 0);
      g.moveTo(0, -BALL_R);
      g.lineTo(0, BALL_R);
      g.strokeStyle = "#5c3210";
      g.lineWidth = 1;
      g.stroke();
      g.restore();

      // spawn point label
      if (!state.flying) {
        g.fillStyle = COLORS.textDim;
        g.font = "11px sans-serif";
        g.textAlign = "center";
        g.fillText(state.spawnPts === 3 ? "3PT" : "2PT", state.ball.x, state.ball.y + 26);
      }

      if (state.flash > 0) {
        g.fillStyle = state.flashColor;
        g.globalAlpha = state.flash / 20;
        g.font = "bold 24px sans-serif";
        g.textAlign = "center";
        g.fillText(state.flashText, state.rimX, RIM_Y - 30);
        g.globalAlpha = 1;
        state.flash--;
      }
    }

    let rafId = null;
    function loop() {
      const now = performance.now();
      state.rimX = state.score >= SWAY_UNLOCK_SCORE
        ? BASE_RIM_X + Math.sin(now * SWAY_SPEED) * SWAY_AMPLITUDE
        : BASE_RIM_X;
      if (!state.over) {
        physicsStep();
        const elapsed = (performance.now() - state.startTs) / 1000;
        const remaining = Math.max(0, Math.ceil(40 - elapsed));
        if (remaining !== state.timeLeft) {
          state.timeLeft = remaining;
          updateStatus();
        }
        if (remaining <= 0) {
          finishGame();
        }
      }
      draw();
      rafId = requestAnimationFrame(loop);
    }

    resetGame();
    rafId = requestAnimationFrame(loop);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      timeouts.forEach(clearTimeout);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    };
  },
});
