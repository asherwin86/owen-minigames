MimiGames.register({
  id: "field-tag",
  title: "Field Tag 3D",
  emoji: "🏃",
  category: "Action",
  tags: ["3D"],
  players: "1P",
  howTo: "A pseudo-3D open grass field full of runners. Up/W to move forward, Down/S to back up, Left/Right or A/D to turn. Get close enough to a runner to tag them — they scatter, you score, and a new one shows up elsewhere. Tag as many as you can before time runs out. Gamepad: left stick to move/turn. Touch: drag anywhere on the field to steer, the buttons below to move.",
  init(root, ctx) {
    const SCREEN_W = 960, SCREEN_H = 600;
    const HORIZON_Y = SCREEN_H * 0.42;
    const CAM_HEIGHT = 34;
    const PROJECTION = 480;
    const NEAR_PLANE = 18;
    const FAR_DRAW_DISTANCE = 1400;

    const FIELD_RADIUS = 900; // runners and the player stay within this circle
    const MOVE_SPEED = 190;
    const TURN_SPEED = 2.4; // radians/sec
    const TAG_RADIUS = 34;
    const RUNNER_COUNT = 5;
    const RUNNER_FLEE_RADIUS = 220;
    const RUNNER_SPEED = 110;
    const ROUND_SECONDS = 60;

    const RUNNER_EMOJI = ["🏃", "🏃‍♀️", "🧍", "🧍‍♀️", "🚶"];
    const DECOR_EMOJI = ["🌳", "🌲", "🌸", "🪨"];

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    function wrapAngle(a) {
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      return a;
    }

    // ============ DOM ============
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "10px";

    const canvasWrap = document.createElement("div");
    canvasWrap.className = "mimi-fullscreen-stage";
    canvasWrap.style.position = "relative";
    canvasWrap.style.maxWidth = "100%";

    const canvas = document.createElement("canvas");
    canvas.width = SCREEN_W;
    canvas.height = SCREEN_H;
    canvas.style.background = "#7ec8e3";
    canvas.style.border = "2px solid var(--border)";
    canvas.style.borderRadius = "10px";
    canvas.style.touchAction = "none";
    canvas.style.maxWidth = "100%";
    canvas.style.display = "block";
    const g = canvas.getContext("2d");

    const fullscreenBtn = document.createElement("button");
    fullscreenBtn.className = "btn";
    fullscreenBtn.textContent = "Fullscreen: Off";
    fullscreenBtn.style.cssText = "position:absolute; left:50%; top:8px; transform:translateX(-50%); z-index:5; opacity:0.85; font-size:12px; padding:4px 10px;";
    canvasWrap.append(canvas, fullscreenBtn);

    function isFullscreenActive() { return Boolean(document.fullscreenElement || document.webkitFullscreenElement); }
    function resizeCanvasForFullscreen() {
      canvasWrap.classList.toggle("is-fullscreen", isFullscreenActive());
      if (isFullscreenActive()) {
        const scale = Math.min(window.innerWidth / SCREEN_W, window.innerHeight / SCREEN_H);
        canvas.style.width = `${SCREEN_W * scale}px`;
        canvas.style.height = `${SCREEN_H * scale}px`;
      } else {
        canvas.style.width = "";
        canvas.style.height = "";
      }
    }
    function syncFullscreenBtn() {
      const supported = Boolean(canvasWrap.requestFullscreen || canvasWrap.webkitRequestFullscreen);
      fullscreenBtn.textContent = supported ? `Fullscreen: ${isFullscreenActive() ? "On" : "Off"}` : "Fullscreen: N/A";
      resizeCanvasForFullscreen();
    }
    async function toggleFullscreen() {
      const request = canvasWrap.requestFullscreen?.bind(canvasWrap) || canvasWrap.webkitRequestFullscreen?.bind(canvasWrap);
      const exit = document.exitFullscreen?.bind(document) || document.webkitExitFullscreen?.bind(document);
      if (!request || !exit) return;
      try { if (isFullscreenActive()) await exit(); else await request(); } catch (e) { /* ignore */ }
      syncFullscreenBtn();
    }
    fullscreenBtn.onclick = toggleFullscreen;
    document.addEventListener("fullscreenchange", syncFullscreenBtn);
    document.addEventListener("webkitfullscreenchange", syncFullscreenBtn);
    window.addEventListener("resize", resizeCanvasForFullscreen);
    syncFullscreenBtn();

    const hint = document.createElement("div");
    hint.style.color = "var(--text-dim)";
    hint.style.fontSize = ".8rem";
    hint.textContent = "Chase down runners before the clock runs out. Get close to tag them.";

    const touchRow = document.createElement("div");
    touchRow.style.display = "flex";
    touchRow.style.gap = "10px";
    touchRow.style.alignItems = "center";
    function touchBtn(label) {
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = label;
      b.style.fontSize = "1.1rem";
      b.style.padding = "10px 18px";
      b.style.touchAction = "none";
      return b;
    }
    const turnLeftBtn = touchBtn("◀");
    const forwardBtn = touchBtn("▲ Run");
    const turnRightBtn = touchBtn("▶");
    touchRow.append(turnLeftBtn, forwardBtn, turnRightBtn);

    const startBtn = document.createElement("button");
    startBtn.className = "btn primary";
    startBtn.textContent = "Start Round";
    startBtn.onclick = startGame;

    wrap.append(canvasWrap, hint, touchRow, startBtn);
    root.appendChild(wrap);

    let devSpeedBoost = false;
    ctx.devCheatPanel(root, [
      {
        label: "Speed Boost: Off",
        run(e) {
          devSpeedBoost = !devSpeedBoost;
          e.target.textContent = `Speed Boost: ${devSpeedBoost ? "On" : "Off"}`;
        },
      },
      {
        label: "Add Score +5",
        run() {
          if (!running || over) return;
          score += 5;
          ctx.setStatus(`Score: ${score} · Time: ${Math.ceil(timeLeft)}s`);
        },
      },
    ]);

    // ============ input ============
    const keys = new Set();
    function isTypingInField() {
      const tag = document.activeElement?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA";
    }
    function onKeydown(e) {
      if (isTypingInField()) return;
      const code = e.code;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD", "KeyW", "KeyS"].includes(code)) e.preventDefault();
      keys.add(code);
    }
    function onKeyup(e) { keys.delete(e.code); }
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("keyup", onKeyup);

    let touchForwardHeld = false;
    let touchTurn = 0;
    function bindHold(el, onDown, onUp) {
      el.addEventListener("pointerdown", (e) => { e.preventDefault(); onDown(); });
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
      el.addEventListener("pointerleave", onUp);
    }
    bindHold(forwardBtn, () => { touchForwardHeld = true; }, () => { touchForwardHeld = false; });
    bindHold(turnLeftBtn, () => { touchTurn = -1; }, () => { touchTurn = 0; });
    bindHold(turnRightBtn, () => { touchTurn = 1; }, () => { touchTurn = 0; });

    // Drag-to-steer directly on the field, same "tap-and-hold a direction"
    // feel as the button row but usable one-thumb anywhere on the canvas.
    let dragActive = false;
    let dragStartX = 0;
    function onPointerDown(e) { dragActive = true; dragStartX = e.clientX; touchForwardHeld = true; }
    function onPointerMove(e) {
      if (!dragActive) return;
      const dx = e.clientX - dragStartX;
      touchTurn = clamp(dx / 60, -1, 1);
    }
    function onPointerUp() { dragActive = false; touchForwardHeld = false; touchTurn = 0; }
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);

    function gamepadAxes() {
      if (typeof navigator.getGamepads !== "function") return { turn: 0, forward: 0 };
      const pad = Array.from(navigator.getGamepads()).find((p) => p?.connected);
      if (!pad) return { turn: 0, forward: 0 };
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      const dead = 0.18;
      return {
        turn: Math.abs(ax) > dead ? ax : 0,
        forward: Math.abs(ay) > dead ? -ay : 0,
      };
    }

    // ============ world state ============
    let player, runners, decor, score, best, timeLeft, running, over;

    function randomFieldPoint(minDistFromCenter) {
      let x, y;
      do {
        x = (Math.random() * 2 - 1) * FIELD_RADIUS;
        y = (Math.random() * 2 - 1) * FIELD_RADIUS;
      } while (Math.hypot(x, y) > FIELD_RADIUS || (minDistFromCenter && Math.hypot(x, y) < minDistFromCenter));
      return { x, y };
    }

    function spawnRunner() {
      const pos = randomFieldPoint(240);
      return {
        x: pos.x,
        y: pos.y,
        emoji: RUNNER_EMOJI[Math.floor(Math.random() * RUNNER_EMOJI.length)],
        wanderAngle: Math.random() * Math.PI * 2,
        wanderTimer: 1 + Math.random() * 2,
      };
    }

    function resetState() {
      player = { x: 0, y: 0, angle: 0 };
      runners = Array.from({ length: RUNNER_COUNT }, spawnRunner);
      decor = Array.from({ length: 26 }, () => {
        const pos = randomFieldPoint();
        return { x: pos.x, y: pos.y, emoji: DECOR_EMOJI[Math.floor(Math.random() * DECOR_EMOJI.length)] };
      });
      score = 0;
      best = ctx.storage.get("bestScore", 0);
      timeLeft = ROUND_SECONDS;
    }

    function tagRunner(index) {
      score += 1;
      playSound();
      runners.splice(index, 1, spawnRunner());
    }

    function playSound() { ctx.playSound("pop"); }

    function update(dt) {
      if (!running || over) return;

      const gp = gamepadAxes();
      let turn = (keys.has("ArrowLeft") || keys.has("KeyA") ? -1 : 0) + (keys.has("ArrowRight") || keys.has("KeyD") ? 1 : 0) + touchTurn + gp.turn;
      turn = clamp(turn, -1, 1);
      let forward = (keys.has("ArrowUp") || keys.has("KeyW") ? 1 : 0) + (keys.has("ArrowDown") || keys.has("KeyS") ? -1 : 0);
      if (touchForwardHeld) forward = 1;
      forward = clamp(forward + gp.forward, -1, 1);

      player.angle = wrapAngle(player.angle + turn * TURN_SPEED * dt);
      const speedMult = devSpeedBoost ? 2.5 : 1;
      const nx = player.x + Math.cos(player.angle) * forward * MOVE_SPEED * speedMult * dt;
      const ny = player.y + Math.sin(player.angle) * forward * MOVE_SPEED * speedMult * dt;
      if (Math.hypot(nx, ny) <= FIELD_RADIUS) {
        player.x = nx;
        player.y = ny;
      }

      runners.forEach((runner) => {
        const toPlayer = dist(runner, player);
        let moveAngle;
        if (toPlayer < RUNNER_FLEE_RADIUS) {
          moveAngle = Math.atan2(runner.y - player.y, runner.x - player.x);
        } else {
          runner.wanderTimer -= dt;
          if (runner.wanderTimer <= 0) {
            runner.wanderAngle = Math.random() * Math.PI * 2;
            runner.wanderTimer = 1.5 + Math.random() * 2;
          }
          moveAngle = runner.wanderAngle;
        }
        const speed = toPlayer < RUNNER_FLEE_RADIUS ? RUNNER_SPEED : RUNNER_SPEED * 0.35;
        const rx = runner.x + Math.cos(moveAngle) * speed * dt;
        const ry = runner.y + Math.sin(moveAngle) * speed * dt;
        if (Math.hypot(rx, ry) <= FIELD_RADIUS) {
          runner.x = rx;
          runner.y = ry;
        } else {
          runner.wanderAngle += Math.PI; // bounce off the field edge
        }
      });

      for (let i = runners.length - 1; i >= 0; i -= 1) {
        if (dist(runners[i], player) < TAG_RADIUS) {
          tagRunner(i);
          break; // splice inside the loop — re-check the rest next frame
        }
      }

      timeLeft -= dt;
      if (timeLeft <= 0) {
        timeLeft = 0;
        endGame();
      }
      ctx.setStatus(`Score: ${score} · Time: ${Math.ceil(timeLeft)}s`);
    }

    // ============ render ============
    function project(worldX, worldY) {
      const dx = worldX - player.x;
      const dy = worldY - player.y;
      const forwardX = Math.cos(player.angle), forwardY = Math.sin(player.angle);
      const rightX = -Math.sin(player.angle), rightY = Math.cos(player.angle);
      const depth = dx * forwardX + dy * forwardY;
      const lateral = dx * rightX + dy * rightY;
      return { depth, lateral };
    }

    function draw() {
      g.clearRect(0, 0, SCREEN_W, SCREEN_H);
      const sky = g.createLinearGradient(0, 0, 0, HORIZON_Y);
      sky.addColorStop(0, "#6fb8e8");
      sky.addColorStop(1, "#bfe4f5");
      g.fillStyle = sky;
      g.fillRect(0, 0, SCREEN_W, HORIZON_Y);

      const grass = g.createLinearGradient(0, HORIZON_Y, 0, SCREEN_H);
      grass.addColorStop(0, "#6fbf5f");
      grass.addColorStop(1, "#357a35");
      g.fillStyle = grass;
      g.fillRect(0, HORIZON_Y, SCREEN_W, SCREEN_H - HORIZON_Y);

      const billboards = [];
      decor.forEach((d) => {
        const { depth, lateral } = project(d.x, d.y);
        if (depth > NEAR_PLANE && depth < FAR_DRAW_DISTANCE) billboards.push({ depth, lateral, emoji: d.emoji, size: 46 });
      });
      runners.forEach((r) => {
        const { depth, lateral } = project(r.x, r.y);
        if (depth > NEAR_PLANE && depth < FAR_DRAW_DISTANCE) billboards.push({ depth, lateral, emoji: r.emoji, size: 40, isRunner: true });
      });
      billboards.sort((a, b) => b.depth - a.depth); // far first, so near ones draw on top

      billboards.forEach((b) => {
        const scale = PROJECTION / b.depth;
        const screenX = SCREEN_W / 2 + (b.lateral / b.depth) * PROJECTION;
        const screenY = HORIZON_Y + (CAM_HEIGHT / b.depth) * PROJECTION;
        const fontSize = clamp(b.size * (scale / PROJECTION) * 60, 6, 220);
        if (screenX < -fontSize || screenX > SCREEN_W + fontSize) return;
        g.font = `${fontSize}px sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "bottom";
        if (b.isRunner) {
          g.fillStyle = "rgba(0,0,0,0.25)";
          g.beginPath();
          g.ellipse(screenX, screenY + fontSize * 0.06, fontSize * 0.28, fontSize * 0.09, 0, 0, Math.PI * 2);
          g.fill();
        }
        g.fillText(b.emoji, screenX, screenY);
      });

      g.save();
      g.fillStyle = "#fff";
      g.font = "700 22px Space Grotesk, sans-serif";
      g.textAlign = "left";
      g.textBaseline = "top";
      g.shadowColor = "rgba(0,0,0,0.6)";
      g.shadowBlur = 4;
      g.fillText(`Score: ${score}`, 16, 14);
      g.textAlign = "right";
      g.fillText(`${Math.ceil(timeLeft)}s`, SCREEN_W - 16, 14);
      g.restore();
    }

    // ============ lifecycle ============
    function endGame() {
      if (over) return;
      over = true;
      const isNewBest = score > best;
      if (isNewBest) ctx.storage.set("bestScore", score);
      ctx.reportScore(Math.max(score, best), { sortDir: "desc" });
      ctx.playSound(isNewBest ? "win" : "success");
      ctx.setStatus(`Time's up — Score: ${score}`);
      setTimeout(() => {
        ctx.showOverlay({
          title: "Time's Up!",
          subtitle: `Tagged ${score} runner${score === 1 ? "" : "s"}${isNewBest ? " · New Best!" : ` · Best: ${Math.max(score, best)}`}`,
          buttonText: "Run Again",
          onButton: startGame,
        });
      }, 400);
    }

    function startGame() {
      resetState();
      running = true;
      over = false;
      ctx.setStatus("Go! Chase down the runners.");
    }

    let lastTime = 0;
    let rafId = null;
    function loop(now) {
      const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0.016;
      lastTime = now;
      update(dt);
      draw();
      window.MimiPadCursor?.setSuppressed(running && !over);
      rafId = requestAnimationFrame(loop);
    }

    running = false; over = false;
    resetState();
    draw();
    ctx.setStatus("Ready to run.");
    rafId = requestAnimationFrame(loop);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.MimiPadCursor?.setSuppressed(false);
      if (isFullscreenActive()) (document.exitFullscreen?.() || document.webkitExitFullscreen?.());
      document.removeEventListener("keydown", onKeydown);
      document.removeEventListener("keyup", onKeyup);
      document.removeEventListener("fullscreenchange", syncFullscreenBtn);
      document.removeEventListener("webkitfullscreenchange", syncFullscreenBtn);
      window.removeEventListener("resize", resizeCanvasForFullscreen);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerUp);
    };
  },
});
