MimiGames.register({
  id: "pinball",
  title: "Pinball",
  emoji: "🕹️",
  category: "Action",
  players: "1P",
  howTo: "Left/Right (or A/D) flip the flippers, Space launches a new ball. Gamepad: D-pad flips, any face button launches (Start un-hides the controller cursor if you need it). Hit the bumpers and targets for points and combo multipliers. You have 3 balls — the ball drains if it falls past the flippers.",
  init(root, ctx) {
    const W = 380, H = 620;
    const GRAVITY = 620;
    const BALL_RADIUS = 8;
    const FLIPPER_LENGTH = 62;
    const FLIPPER_SPEED = 11; // rad/s swing speed
    const RESTITUTION = 0.72;

    // --- persisted settings, Kart-Circuit-style options panel ---
    const SETTINGS_KEY = "pinballSettings";
    const settings = Object.assign(
      { soundEnabled: true, ballSpeed: "normal" },
      ctx.storage.get(SETTINGS_KEY, {}),
    );
    const SPEED_MULT = { slow: 0.85, normal: 1, fast: 1.2 };
    function saveSettings() { ctx.storage.set(SETTINGS_KEY, settings); }
    function playSound(name) { if (settings.soundEnabled) ctx.playSound(name); }

    const state = {
      score: 0,
      balls: 3,
      combo: 1,
      comboTimer: 0,
      running: false,
      ballLive: false,
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "10px";

    const settingsPanel = document.createElement("div");
    settingsPanel.style.display = "flex";
    settingsPanel.style.gap = "8px";
    settingsPanel.style.flexWrap = "wrap";
    settingsPanel.style.justifyContent = "center";

    const speedBtn = document.createElement("button");
    speedBtn.className = "btn";
    speedBtn.onclick = () => {
      const keys = Object.keys(SPEED_MULT);
      settings.ballSpeed = keys[(keys.indexOf(settings.ballSpeed) + 1) % keys.length];
      saveSettings();
      syncSettingsUI();
    };
    const soundBtn = document.createElement("button");
    soundBtn.className = "btn";
    soundBtn.onclick = () => {
      settings.soundEnabled = !settings.soundEnabled;
      saveSettings();
      syncSettingsUI();
    };
    function syncSettingsUI() {
      speedBtn.textContent = `Ball Speed: ${settings.ballSpeed[0].toUpperCase()}${settings.ballSpeed.slice(1)}`;
      soundBtn.textContent = `Sound: ${settings.soundEnabled ? "On" : "Off"}`;
    }
    syncSettingsUI();
    settingsPanel.appendChild(speedBtn);
    settingsPanel.appendChild(soundBtn);

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.style.background = "#0c0e18";
    canvas.style.border = "2px solid var(--border)";
    canvas.style.borderRadius = "10px";
    canvas.style.touchAction = "none";
    canvas.style.maxHeight = "min(74vh, 760px)";
    const g = canvas.getContext("2d");

    const hint = document.createElement("div");
    hint.style.color = "var(--text-dim)";
    hint.style.fontSize = ".8rem";
    hint.textContent = "A/D or Left/Right flip · Space launches a ball.";

    const touchRow = document.createElement("div");
    touchRow.style.display = "flex";
    touchRow.style.gap = "10px";
    const touchState = { left: false, right: false };
    [["◀ Left Flipper", "left"], ["🚀 Launch", "launch"], ["Right Flipper ▶", "right"]].forEach(([label, key]) => {
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = label;
      btn.style.touchAction = "none";
      if (key === "launch") {
        btn.addEventListener("pointerdown", (e) => { e.preventDefault(); launchBall(); });
      } else {
        const set = (v) => (e) => { e.preventDefault(); touchState[key] = v; };
        btn.addEventListener("pointerdown", set(true));
        btn.addEventListener("pointerup", set(false));
        btn.addEventListener("pointerleave", set(false));
      }
      touchRow.appendChild(btn);
    });

    const restartBtn = document.createElement("button");
    restartBtn.className = "btn primary";
    restartBtn.textContent = "Start Game";
    restartBtn.onclick = startGame;

    wrap.appendChild(settingsPanel);
    wrap.appendChild(canvas);
    wrap.appendChild(hint);
    wrap.appendChild(touchRow);
    wrap.appendChild(restartBtn);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      { label: "Add Score +500", run: () => { if (state.running) addScore(500); } },
      {
        label: "Extra Ball",
        run: () => {
          if (!state.running) return;
          state.balls += 1;
          updateStatus();
        },
      },
    ]);

    // --- static table geometry ---
    const wallMargin = 16;
    const chuteX = W - 34; // ball-launch lane on the right
    const flipperY = H - 90;
    const leftPivot = { x: W / 2 - 70, y: flipperY };
    const rightPivot = { x: W / 2 + 70, y: flipperY };
    const leftRestAngle = 0.55;
    const rightRestAngle = Math.PI - 0.55;
    const leftUpAngle = -0.45;
    const rightUpAngle = Math.PI + 0.45;

    const bumpers = [
      { x: W / 2 - 60, y: 190, r: 22, color: "#ff6b6b", points: 100 },
      { x: W / 2 + 20, y: 150, r: 22, color: "#53e0ff", points: 100 },
      { x: W / 2 - 10, y: 260, r: 20, color: "#ffd166", points: 100 },
    ];
    const targets = [
      { x: 60, y: 340, w: 14, h: 46, hit: false, points: 250 },
      { x: W - 60 - chuteGap(), y: 340, w: 14, h: 46, hit: false, points: 250 },
    ];
    function chuteGap() { return 34; } // keep the right lane clear
    const slingshots = [
      { x1: W / 2 - 100, y1: flipperY - 10, x2: W / 2 - 55, y2: flipperY - 60, points: 50, color: "#a55eea" },
      { x1: W / 2 + 100, y1: flipperY - 10, x2: W / 2 + 55, y2: flipperY - 60, points: 50, color: "#a55eea" },
    ];

    let ball = null;
    let leftAngle = leftRestAngle;
    let rightAngle = rightRestAngle;
    let leftFlipping = false;
    let rightFlipping = false;
    const bumperFlash = new Map();

    function resetBall() {
      ball = { x: chuteX, y: H - 60, vx: 0, vy: 0, launched: false };
      state.ballLive = true;
    }

    function launchBall() {
      if (!state.running || !ball || ball.launched) return;
      // must comfortably clear the distance from the chute (near the bottom)
      // up to the top wall (v^2/2g at launch = max height reached) — the
      // original 520 only reached ~218px, well short of the bumpers at
      // y=150-260, so the whole upper table was unreachable
      const power = 800 * SPEED_MULT[settings.ballSpeed];
      ball.vy = -power;
      // A real table's launch lane curves back into the play field via the
      // top wall's shape; this table has no such curve, so without a real
      // leftward push the ball just travels straight up/down the right edge
      // and never reaches the bumpers, which all sit center-left. Angle the
      // launch so the ball's arc actually carries it into the play field.
      ball.vx = -130 + (Math.random() - 0.5) * 30;
      ball.launched = true;
      playSound("swoosh");
    }

    const keys = new Set();
    function onKeydown(e) {
      if (["ArrowLeft", "ArrowRight", "KeyA", "KeyD", "Space"].includes(e.code)) e.preventDefault();
      keys.add(e.code);
      if (e.code === "Space") launchBall();
    }
    function onKeyup(e) { keys.delete(e.code); }
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("keyup", onKeyup);

    // Gamepad: the hub's site-wide D-pad-to-arrow-keys bridge (js/pad-cursor.js)
    // already holds the flippers via ArrowLeft/ArrowRight, so the only thing
    // missing is Launch — any face button does it (launchBall() already no-ops
    // once a ball is in play, so no edge-detection bookkeeping is needed here).
    // Buttons 0 (B) and 9 (Start) are excluded: that same bridge reserves
    // them everywhere as "back to the game grid" and "un-hide the cursor".
    function pollGamepad() {
      if (typeof navigator.getGamepads !== "function") return;
      const pad = Array.from(navigator.getGamepads()).find((p) => p?.connected);
      if (!pad) return;
      if (pad.buttons.some((button, index) => index !== 0 && index !== 9 && button?.pressed)) launchBall();
    }

    function isLeftFlip() { return keys.has("ArrowLeft") || keys.has("KeyA") || touchState.left; }
    function isRightFlip() { return keys.has("ArrowRight") || keys.has("KeyD") || touchState.right; }

    function addScore(points) {
      state.score += points * state.combo;
      state.combo = Math.min(8, state.combo + 1);
      state.comboTimer = 2.2;
      updateStatus();
    }

    function updateStatus() {
      ctx.setStatus(`Score: ${state.score} · Balls: ${state.balls} · Combo x${state.combo}`);
    }

    function circleCollide(bx, by, br, cx, cy, cr) {
      const dx = bx - cx, dy = by - cy;
      const dist = Math.hypot(dx, dy);
      return dist < br + cr ? { dx, dy, dist } : null;
    }

    function reflectOffCircle(hit, cr) {
      const nx = hit.dx / hit.dist, ny = hit.dy / hit.dist;
      const dot = ball.vx * nx + ball.vy * ny;
      ball.vx -= 2 * dot * nx;
      ball.vy -= 2 * dot * ny;
      ball.vx *= RESTITUTION;
      ball.vy *= RESTITUTION;
      const overlap = BALL_RADIUS + cr - hit.dist;
      ball.x += nx * overlap;
      ball.y += ny * overlap;
    }

    function flipperTip(pivot, angle) {
      return { x: pivot.x + Math.cos(angle) * FLIPPER_LENGTH, y: pivot.y + Math.sin(angle) * FLIPPER_LENGTH };
    }

    // approximate flipper collision as a capsule: nearest point on the
    // pivot-to-tip segment, then treat like a circle bounce with flipper spin
    // added to the ball's velocity (so a well-timed flip really launches it)
    function collideFlipper(pivot, angle, angularVel) {
      const tip = flipperTip(pivot, angle);
      const dx = tip.x - pivot.x, dy = tip.y - pivot.y;
      const len2 = dx * dx + dy * dy;
      let t = ((ball.x - pivot.x) * dx + (ball.y - pivot.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const nearX = pivot.x + dx * t, nearY = pivot.y + dy * t;
      const hit = circleCollide(ball.x, ball.y, BALL_RADIUS, nearX, nearY, 10);
      if (!hit) return false;
      reflectOffCircle(hit, 10);
      // impart flipper motion for a satisfying kick
      ball.vx += -Math.sin(angle) * angularVel * FLIPPER_LENGTH * t * 0.3;
      ball.vy += Math.cos(angle) * angularVel * FLIPPER_LENGTH * t * 0.3;
      playSound("hit");
      return true;
    }

    function update(dt) {
      if (!state.running) return;
      state.comboTimer = Math.max(0, state.comboTimer - dt);
      if (state.comboTimer <= 0) state.combo = 1;

      // flipper swing
      const leftTarget = isLeftFlip() ? leftUpAngle : leftRestAngle;
      const rightTarget = isRightFlip() ? rightUpAngle : rightRestAngle;
      const leftVel = Math.sign(leftTarget - leftAngle) * FLIPPER_SPEED;
      const rightVel = Math.sign(rightTarget - rightAngle) * FLIPPER_SPEED;
      if (Math.abs(leftTarget - leftAngle) > 0.02) leftAngle += leftVel * dt; else leftAngle = leftTarget;
      if (Math.abs(rightTarget - rightAngle) > 0.02) rightAngle += rightVel * dt; else rightAngle = rightTarget;

      if (!ball) return;
      if (!ball.launched) {
        ball.x = chuteX;
        return;
      }

      ball.vy += GRAVITY * dt;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      // walls
      if (ball.x - BALL_RADIUS < wallMargin) { ball.x = wallMargin + BALL_RADIUS; ball.vx *= -RESTITUTION; }
      const rightWall = ball.y < H - 130 ? W - wallMargin : chuteX - 12; // funnel the chute below the drop
      if (ball.x + BALL_RADIUS > rightWall && ball.y < H - 130) { ball.x = rightWall - BALL_RADIUS; ball.vx *= -RESTITUTION; }
      if (ball.y - BALL_RADIUS < wallMargin) { ball.y = wallMargin + BALL_RADIUS; ball.vy *= -RESTITUTION; }

      // bumpers
      bumpers.forEach((b, i) => {
        const hit = circleCollide(ball.x, ball.y, BALL_RADIUS, b.x, b.y, b.r);
        if (hit) {
          reflectOffCircle(hit, b.r);
          const kick = 180;
          ball.vx += (hit.dx / hit.dist) * kick;
          ball.vy += (hit.dy / hit.dist) * kick;
          addScore(b.points);
          bumperFlash.set(i, 0.15);
          playSound("pop");
        }
      });

      // slingshots (angled walls near the flippers)
      slingshots.forEach((s) => {
        const hit = segmentCollide(s);
        if (hit) addScore(s.points);
      });

      // drop targets
      targets.forEach((t) => {
        if (t.hit) return;
        if (ball.x + BALL_RADIUS > t.x && ball.x - BALL_RADIUS < t.x + t.w && ball.y + BALL_RADIUS > t.y && ball.y - BALL_RADIUS < t.y + t.h) {
          t.hit = true;
          ball.vx *= -1;
          addScore(t.points);
          playSound("coin");
          if (targets.every((x) => x.hit)) {
            addScore(500);
            targets.forEach((x) => { x.hit = false; });
            playSound("success");
          }
        }
      });

      // flippers
      collideFlipper(leftPivot, leftAngle, Math.sign(leftTarget - leftAngle));
      collideFlipper(rightPivot, rightAngle, Math.sign(rightTarget - rightAngle));

      // drain
      if (ball.y - BALL_RADIUS > H) {
        loseBall();
      }
    }

    function segmentCollide(s) {
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
      const len2 = dx * dx + dy * dy;
      let t = ((ball.x - s.x1) * dx + (ball.y - s.y1) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const nearX = s.x1 + dx * t, nearY = s.y1 + dy * t;
      const hit = circleCollide(ball.x, ball.y, BALL_RADIUS, nearX, nearY, 6);
      if (!hit) return false;
      reflectOffCircle(hit, 6);
      ball.vx += (hit.dx / hit.dist) * 220;
      ball.vy += (hit.dy / hit.dist) * 220;
      playSound("hit");
      return true;
    }

    function loseBall() {
      state.balls -= 1;
      state.combo = 1;
      playSound("fail");
      if (state.balls <= 0) {
        endGame();
      } else {
        resetBall();
        updateStatus();
      }
    }

    function draw() {
      g.fillStyle = "#0c0e18";
      g.fillRect(0, 0, W, H);

      g.strokeStyle = "rgba(255,255,255,0.15)";
      g.lineWidth = 2;
      g.strokeRect(wallMargin, wallMargin, W - wallMargin * 2, H - wallMargin * 2 - 90);
      // launch chute
      g.beginPath();
      g.moveTo(chuteX - 12, H - 130);
      g.lineTo(chuteX - 12, H - 20);
      g.stroke();

      bumpers.forEach((b, i) => {
        const flash = bumperFlash.get(i) || 0;
        if (flash > 0) bumperFlash.set(i, flash - 0.016);
        g.fillStyle = flash > 0 ? "#fff" : b.color;
        g.beginPath();
        g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "rgba(255,255,255,0.3)";
        g.beginPath();
        g.arc(b.x, b.y, b.r * 0.4, 0, Math.PI * 2);
        g.fill();
      });

      slingshots.forEach((s) => {
        g.strokeStyle = s.color;
        g.lineWidth = 6;
        g.beginPath();
        g.moveTo(s.x1, s.y1);
        g.lineTo(s.x2, s.y2);
        g.stroke();
      });

      targets.forEach((t) => {
        g.fillStyle = t.hit ? "rgba(120,120,140,0.4)" : "#ffd166";
        g.fillRect(t.x, t.y, t.w, t.h);
      });

      // flippers
      g.lineCap = "round";
      g.lineWidth = 15;
      g.strokeStyle = "#53e0ff";
      [[leftPivot, leftAngle], [rightPivot, rightAngle]].forEach(([pivot, angle]) => {
        const tip = flipperTip(pivot, angle);
        g.beginPath();
        g.moveTo(pivot.x, pivot.y);
        g.lineTo(tip.x, tip.y);
        g.stroke();
      });

      if (ball) {
        g.fillStyle = "#f2f2f2";
        g.beginPath();
        g.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
        g.fill();
      }

      if (!state.running) {
        g.fillStyle = "rgba(255,255,255,0.9)";
        g.font = "600 18px sans-serif";
        g.textAlign = "center";
        g.fillText("Press Start to play", W / 2, H / 2);
      } else if (ball && !ball.launched) {
        g.fillStyle = "rgba(255,255,255,0.85)";
        g.font = "600 14px sans-serif";
        g.textAlign = "center";
        g.fillText("Space / Launch to serve", W / 2, H - 150);
      }
    }

    function endGame() {
      state.running = false;
      const best = ctx.storage.get("best", 0);
      const newBest = Math.max(best, state.score);
      ctx.storage.set("best", newBest);
      playSound(state.score > best ? "win" : "lose");
      ctx.setStatus(`Game Over — Score: ${state.score} · Best: ${newBest}`);
      setTimeout(() => {
        ctx.showOverlay({
          title: "Game Over",
          subtitle: `Score: ${state.score} · Best: ${newBest}`,
          buttonText: "Play Again",
          onButton: startGame,
        });
      }, 400);
    }

    function startGame() {
      state.score = 0;
      state.balls = 3;
      state.combo = 1;
      state.comboTimer = 0;
      state.running = true;
      targets.forEach((t) => { t.hit = false; });
      resetBall();
      updateStatus();
    }

    let lastTime = 0;
    let rafId = null;
    function loop(now) {
      const dt = lastTime ? Math.min(0.033, (now - lastTime) / 1000) : 0.016;
      lastTime = now;
      pollGamepad();
      update(dt);
      draw();
      // the D-pad already flips via the hub's site-wide arrow-key bridge
      // (js/pad-cursor.js) and Launch is polled above — keep that bridge's
      // own gamepad cursor out of the way while actually playing
      window.MimiPadCursor?.setSuppressed(state.running);
      rafId = requestAnimationFrame(loop);
    }

    draw();
    ctx.setStatus("Press Start to play");
    rafId = requestAnimationFrame(loop);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.MimiPadCursor?.setSuppressed(false);
      document.removeEventListener("keydown", onKeydown);
      document.removeEventListener("keyup", onKeyup);
    };
  },
});
