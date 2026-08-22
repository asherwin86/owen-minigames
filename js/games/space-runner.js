MimiGames.register({
  id: "space-runner",
  title: "Space Runner 3D",
  emoji: "🚀",
  category: "Action",
  tags: ["3D"],
  players: "1P",
  howTo: "A pseudo-3D tunnel flight through an asteroid field. Left/Right or A/D to change lanes and dodge asteroids, Up/W to boost (faster, more points, harder to react). Collect 💎 gems for bonus score. Clip an asteroid and you'll lose a shield — three hits ends the run, with a moment of flashing invulnerability to recover. Gamepad: D-pad to steer and boost (Start un-hides the controller cursor if you need it). Touch: ◀ ▶ to change lanes, hold BOOST to speed up.",
  init(root, ctx) {
    const SCREEN_W = 960, SCREEN_H = 600;
    const HORIZON_Y = SCREEN_H * 0.42;
    const CAM_HEIGHT = 70;
    const PROJECTION = 300;
    const CAMERA_BACK = 70;
    const NEAR_PLANE = 12;
    const FAR_DRAW_DISTANCE = 2600;

    const LANE_COUNT = 3;
    const LANE_WIDTH = 82;
    const TUNNEL_HALF_WIDTH = (LANE_COUNT / 2) * LANE_WIDTH;

    const SPEED_MAX = 400;
    const SPEED_MIN = 110;
    const ACCEL = 220;
    const COAST_DRAG = 70;
    const BOOST_ACCEL = 340;

    const COLLISION_RANGE = 26;
    const DESPAWN_BEHIND = -110;
    const SPAWN_AHEAD = 1600;
    const MIN_LANE_GAP = 260;
    const CRASH_INVULN = 1.5;
    const LIVES_START = 3;

    const SETTINGS_KEY = "spaceRunnerSettings";
    const DIFFICULTIES = {
      easy: { label: "Easy", label2: "Sparse Field", spawnInterval: 1.1 },
      normal: { label: "Normal", label2: "Asteroid Belt", spawnInterval: 0.8 },
      hard: { label: "Hard", label2: "Debris Storm", spawnInterval: 0.55 },
    };
    const settings = Object.assign({ difficulty: "normal", soundEnabled: true }, ctx.storage.get(SETTINGS_KEY, {}));
    function saveSettings() { ctx.storage.set(SETTINGS_KEY, settings); }
    function playSound(name) { if (settings.soundEnabled) ctx.playSound(name); }
    function currentDiff() { return DIFFICULTIES[settings.difficulty]; }

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function clamp01(v) { return clamp(v, 0, 1); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function laneWorldX(lane) { return (lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH; }

    // ============ DOM ============
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
    const difficultyBtn = document.createElement("button");
    difficultyBtn.className = "btn";
    difficultyBtn.onclick = () => {
      const keys = Object.keys(DIFFICULTIES);
      settings.difficulty = keys[(keys.indexOf(settings.difficulty) + 1) % keys.length];
      saveSettings();
      syncSettingsUI();
    };
    const soundBtn = document.createElement("button");
    soundBtn.className = "btn";
    soundBtn.onclick = () => { settings.soundEnabled = !settings.soundEnabled; saveSettings(); syncSettingsUI(); };
    function syncSettingsUI() {
      const d = currentDiff();
      difficultyBtn.textContent = `Difficulty: ${d.label} (${d.label2})`;
      soundBtn.textContent = `Sound: ${settings.soundEnabled ? "On" : "Off"}`;
    }
    syncSettingsUI();
    settingsPanel.append(difficultyBtn, soundBtn);

    const canvasWrap = document.createElement("div");
    canvasWrap.className = "mimi-fullscreen-stage";
    canvasWrap.style.position = "relative";
    canvasWrap.style.maxWidth = "100%";

    const canvas = document.createElement("canvas");
    canvas.width = SCREEN_W;
    canvas.height = SCREEN_H;
    canvas.style.background = "#05030f";
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
    hint.textContent = "Left/Right = steer, Up = boost. Dodge asteroids, grab gems.";

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
    const laneLeftBtn = touchBtn("◀");
    const boostBtn = touchBtn("🚀 BOOST");
    const laneRightBtn = touchBtn("▶");
    touchRow.append(laneLeftBtn, boostBtn, laneRightBtn);

    const startBtn = document.createElement("button");
    startBtn.className = "btn primary";
    startBtn.textContent = "Launch";
    startBtn.onclick = startGame;

    wrap.append(settingsPanel, canvasWrap, hint, touchRow, startBtn);
    root.appendChild(wrap);

    let invincible = false;
    ctx.devCheatPanel(root, [
      {
        label: "Invincible: Off",
        run(e) {
          invincible = !invincible;
          e.target.textContent = `Invincible: ${invincible ? "On" : "Off"}`;
        },
      },
      {
        label: "Add Score +500",
        run: () => { score += 500; },
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
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "KeyA", "KeyD", "KeyW"].includes(code)) e.preventDefault();
      if (!keys.has(code)) {
        if (code === "ArrowLeft" || code === "KeyA") changeLane(-1);
        else if (code === "ArrowRight" || code === "KeyD") changeLane(1);
      }
      keys.add(code);
    }
    function onKeyup(e) { keys.delete(e.code); }
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("keyup", onKeyup);

    function heldBoost() { return keys.has("ArrowUp") || keys.has("KeyW") || touchBoostHeld; }

    let touchBoostHeld = false;
    function bindHold(el, onDown, onUp) {
      el.addEventListener("pointerdown", (e) => { e.preventDefault(); onDown(); });
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
      el.addEventListener("pointerleave", onUp);
    }
    bindHold(boostBtn, () => { touchBoostHeld = true; }, () => { touchBoostHeld = false; });
    laneLeftBtn.addEventListener("click", () => changeLane(-1));
    laneRightBtn.addEventListener("click", () => changeLane(1));

    function changeLane(dir) {
      if (!running || over) return;
      player.targetLane = clamp(player.targetLane + dir, 0, LANE_COUNT - 1);
      playSound("click");
    }

    // ============ state ============
    let running = false;
    let over = false;
    let score = 0;
    let lives = LIVES_START;
    let shakeTimer = 0;
    let spawnTimer = 1.4;
    let gemTimer = 0.9;
    let rocks = [];
    let gems = [];
    let popups = [];

    const player = {
      lane: 1,
      targetLane: 1,
      laneX: laneWorldX(1),
      worldPos: 0,
      speed: 180,
      lean: 0,
      invuln: 0,
      flash: 0,
    };

    function spawnPopup(worldZ, lane, text, color) {
      popups.push({ worldZ, lane, life: 1, maxLife: 1, text, color: color || "#fff" });
    }

    function resetState() {
      score = 0;
      lives = LIVES_START;
      shakeTimer = 0;
      spawnTimer = 1.4;
      gemTimer = 0.9;
      rocks = [];
      gems = [];
      popups = [];
      player.lane = 1;
      player.targetLane = 1;
      player.laneX = laneWorldX(1);
      player.worldPos = 0;
      player.speed = 180;
      player.lean = 0;
      player.invuln = 0;
      player.flash = 0;
    }

    // ============ projection ============
    function project(worldX, worldZAbs, height) {
      const cameraZ = player.worldPos - CAMERA_BACK;
      const forward = Math.max(worldZAbs - cameraZ, NEAR_PLANE * 0.6);
      const scale = PROJECTION / forward;
      return {
        x: SCREEN_W / 2 + worldX * scale,
        y: HORIZON_Y + (CAM_HEIGHT - height) * scale,
        scale,
        forward,
      };
    }

    // ============ spawning ============
    function trySpawnRock() {
      const diff = currentDiff();
      const lane = Math.floor(Math.random() * LANE_COUNT);
      const spawnZ = player.worldPos + SPAWN_AHEAD + Math.random() * 250;
      const blocked = rocks.some((o) => o.lane === lane && Math.abs(o.worldZ - spawnZ) < MIN_LANE_GAP);
      if (blocked) return;
      rocks.push({ lane, worldZ: spawnZ, size: 0.8 + Math.random() * 0.5, spin: Math.random() * 6.28 });
    }
    function trySpawnGem() {
      const lane = Math.floor(Math.random() * LANE_COUNT);
      const spawnZ = player.worldPos + SPAWN_AHEAD * 0.7 + Math.random() * 300;
      gems.push({ lane, worldZ: spawnZ, taken: false });
    }

    function crash() {
      lives -= 1;
      player.speed = Math.max(SPEED_MIN, player.speed * 0.4);
      player.invuln = CRASH_INVULN;
      player.flash = CRASH_INVULN;
      shakeTimer = 0.4;
      playSound("hit");
      ctx.setStatus(`Shield hit! ${lives} ${lives === 1 ? "shield" : "shields"} left.`);
      if (lives <= 0) endGame();
    }

    function updateEntities(dt) {
      const diff = currentDiff();
      spawnTimer -= dt;
      if (spawnTimer <= 0) { trySpawnRock(); spawnTimer = diff.spawnInterval * (0.8 + Math.random() * 0.4); }
      gemTimer -= dt;
      if (gemTimer <= 0) { trySpawnGem(); gemTimer = 1.6 + Math.random() * 1.2; }

      rocks.forEach((o) => { o.spin += dt * 1.5; });
      rocks = rocks.filter((o) => o.worldZ - player.worldPos > DESPAWN_BEHIND);
      gems = gems.filter((o) => o.worldZ - player.worldPos > DESPAWN_BEHIND && !o.taken);

      if (!running || over) return;
      rocks.forEach((o) => {
        const rel = o.worldZ - player.worldPos;
        if (player.invuln <= 0 && !invincible && Math.abs(rel) < COLLISION_RANGE && o.lane === player.targetLane) crash();
      });
      gems.forEach((o) => {
        if (o.taken) return;
        const rel = o.worldZ - player.worldPos;
        if (Math.abs(rel) < COLLISION_RANGE && o.lane === player.targetLane) {
          o.taken = true;
          score += 25;
          spawnPopup(o.worldZ, o.lane, "+25 💎", "#7ee81c");
          playSound("coin");
        }
      });
    }

    // ============ update ============
    function updateScore(dt) {
      const speedFrac = clamp01((player.speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN));
      score += (2 + speedFrac * 8) * dt;
    }

    function update(dt) {
      if (!running) return;
      if (!over) {
        if (heldBoost()) player.speed += BOOST_ACCEL * dt;
        else player.speed += (ACCEL - COAST_DRAG) * dt * 0.4;
        player.speed = clamp(player.speed, SPEED_MIN, SPEED_MAX);

        player.worldPos += player.speed * dt;
        const targetX = laneWorldX(player.targetLane);
        player.laneX = lerp(player.laneX, targetX, Math.min(1, dt * 9));
        player.lean = lerp(player.lean, clamp((targetX - player.laneX) / LANE_WIDTH, -1, 1), Math.min(1, dt * 10));
        player.lane = player.targetLane;

        updateScore(dt);
      }
      updateEntities(dt);
      if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);
      if (player.flash > 0) player.flash = Math.max(0, player.flash - dt);
      if (shakeTimer > 0) shakeTimer = Math.max(0, shakeTimer - dt);
      popups.forEach((p) => { p.life -= dt / p.maxLife; });
      popups = popups.filter((p) => p.life > 0);
    }

    // ============ draw ============
    function drawSky() {
      const grad = g.createLinearGradient(0, 0, 0, HORIZON_Y);
      grad.addColorStop(0, "#050318");
      grad.addColorStop(1, "#160a3a");
      g.fillStyle = grad;
      g.fillRect(0, 0, SCREEN_W, HORIZON_Y);
      // starfield, seeded/deterministic so it doesn't flicker randomly each frame
      for (let i = 0; i < 60; i++) {
        const sx = (i * 137.5) % SCREEN_W;
        const sy = (i * 71.3) % HORIZON_Y;
        const tw = 0.5 + 0.5 * Math.sin(performance.now() / 400 + i);
        g.fillStyle = `rgba(255,255,255,${0.3 + tw * 0.5})`;
        g.fillRect(sx, sy, 1.6, 1.6);
      }
      g.fillStyle = "#0a0620";
      g.fillRect(0, HORIZON_Y, SCREEN_W, SCREEN_H - HORIZON_Y);
    }

    function drawTunnel() {
      const nearZ = player.worldPos - CAMERA_BACK + NEAR_PLANE;
      const farZ = player.worldPos - CAMERA_BACK + FAR_DRAW_DISTANCE;
      const nearL = project(-TUNNEL_HALF_WIDTH, nearZ, 0);
      const nearR = project(TUNNEL_HALF_WIDTH, nearZ, 0);
      const farL = project(-TUNNEL_HALF_WIDTH, farZ, 0);
      const farR = project(TUNNEL_HALF_WIDTH, farZ, 0);
      g.fillStyle = "#120a2e";
      g.beginPath();
      g.moveTo(nearL.x, nearL.y); g.lineTo(farL.x, farL.y); g.lineTo(farR.x, farR.y); g.lineTo(nearR.x, nearR.y);
      g.closePath(); g.fill();

      g.strokeStyle = "#00c3e3";
      g.lineWidth = 2;
      g.globalAlpha = 0.5;
      g.beginPath(); g.moveTo(nearL.x, nearL.y); g.lineTo(farL.x, farL.y); g.stroke();
      g.beginPath(); g.moveTo(nearR.x, nearR.y); g.lineTo(farR.x, farR.y); g.stroke();
      g.globalAlpha = 1;

      // lane divider streaks, scrolling toward the camera
      const dashSpacing = 100;
      const offset = player.worldPos % dashSpacing;
      for (let laneEdge = 1; laneEdge < LANE_COUNT; laneEdge += 1) {
        const dividerX = -TUNNEL_HALF_WIDTH + laneEdge * LANE_WIDTH;
        for (let i = 0; i < 22; i += 1) {
          const zAbs = player.worldPos - CAMERA_BACK + NEAR_PLANE + 20 + i * dashSpacing - offset;
          if (zAbs - (player.worldPos - CAMERA_BACK) < NEAR_PLANE) continue;
          const p = project(dividerX, zAbs, 0);
          if (p.scale < 0.02) continue;
          const w = Math.max(1, 4 * p.scale), h = Math.max(1, 26 * p.scale);
          g.fillStyle = "rgba(0,195,227,0.55)";
          g.fillRect(p.x - w / 2, p.y - h / 2, w, h);
        }
      }
    }

    function drawRocks() {
      const sorted = rocks.slice().sort((a, b) => (b.worldZ - a.worldZ));
      sorted.forEach((o) => {
        const forward = o.worldZ - (player.worldPos - CAMERA_BACK);
        if (forward < NEAR_PLANE * 0.5 || forward > FAR_DRAW_DISTANCE) return;
        const worldX = laneWorldX(o.lane);
        const p = project(worldX, o.worldZ, 0);
        const size = Math.max(10, 44 * p.scale * o.size);
        g.save();
        g.globalAlpha = clamp01(p.scale * 3);
        g.translate(p.x, p.y);
        g.rotate(o.spin);
        g.font = `${size}px sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("🪨", 0, 0);
        g.restore();
      });
    }

    function drawGems() {
      gems.forEach((o) => {
        if (o.taken) return;
        const forward = o.worldZ - (player.worldPos - CAMERA_BACK);
        if (forward < NEAR_PLANE * 0.5 || forward > FAR_DRAW_DISTANCE) return;
        const worldX = laneWorldX(o.lane);
        const bob = Math.sin(performance.now() / 220 + o.worldZ) * 6;
        const p = project(worldX, o.worldZ, 26 + bob);
        const size = Math.max(9, 34 * p.scale);
        g.save();
        g.globalAlpha = clamp01(p.scale * 3);
        g.font = `${size}px sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("💎", p.x, p.y);
        g.restore();
      });
    }

    function drawPopups() {
      popups.forEach((p) => {
        const worldX = laneWorldX(p.lane);
        const proj = project(worldX, p.worldZ, 40);
        g.globalAlpha = clamp01(p.life);
        g.fillStyle = p.color;
        g.font = "700 15px sans-serif";
        g.textAlign = "center";
        g.fillText(p.text, proj.x, proj.y - p.life * 20);
        g.globalAlpha = 1;
      });
    }

    function drawShip() {
      const p = project(player.laneX, player.worldPos, 0);
      const blink = player.flash > 0 && Math.floor(player.flash * 10) % 2 === 0;
      if (blink) return;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(player.lean * 0.3);
      g.font = `${Math.max(30, 60 * p.scale)}px sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("🚀", 0, 0);
      g.restore();
    }

    function drawHud() {
      g.textAlign = "left";
      g.font = "700 20px sans-serif";
      g.fillStyle = "#f2f5ff";
      g.fillText(`Score: ${Math.floor(score)}`, 16, 30);

      const barW = 160;
      const speedFrac = clamp01((player.speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN));
      g.font = "600 11px sans-serif";
      g.fillStyle = "rgba(255,255,255,0.75)";
      g.fillText("Speed", 16, 50);
      g.fillStyle = "rgba(0,0,0,0.5)";
      g.fillRect(16, 56, barW, 10);
      g.fillStyle = "#00c3e3";
      g.fillRect(16, 56, barW * speedFrac, 10);

      g.textAlign = "right";
      g.font = "20px sans-serif";
      let heartsStr = "";
      for (let i = 0; i < LIVES_START; i += 1) heartsStr += i < lives ? "🛡️" : "💥";
      g.fillText(heartsStr, SCREEN_W - 16, 30);
      g.font = "600 11px sans-serif";
      g.fillStyle = "rgba(255,255,255,0.75)";
      g.fillText(`Distance: ${Math.floor(player.worldPos / 3)}m`, SCREEN_W - 16, 50);
    }

    function draw() {
      g.clearRect(0, 0, SCREEN_W, SCREEN_H);
      g.save();
      if (shakeTimer > 0) {
        const s = shakeTimer * 14;
        g.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      }
      drawSky();
      drawTunnel();
      drawRocks();
      drawGems();
      drawPopups();
      drawShip();
      if (running) {
        drawHud();
      } else {
        g.fillStyle = "rgba(0,0,0,0.35)";
        g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      }
      g.restore();
    }

    // ============ lifecycle ============
    function endGame() {
      if (over) return;
      over = true;
      playSound("lose");
      const best = ctx.storage.get("bestScore", 0);
      const isNewBest = score > best;
      if (isNewBest) ctx.storage.set("bestScore", Math.floor(score));
      ctx.setStatus(`Run over — Score: ${Math.floor(score)}`);
      setTimeout(() => {
        ctx.showOverlay({
          title: "Shields Down!",
          subtitle: `Score: ${Math.floor(score)} · Distance: ${Math.floor(player.worldPos / 3)}m${isNewBest ? " · New Best!" : ` · Best: ${Math.max(Math.floor(score), best)}`}`,
          buttonText: "Fly Again",
          onButton: startGame,
        });
      }, 400);
    }

    function startGame() {
      resetState();
      running = true;
      over = false;
      ctx.setStatus("Go! Dodge the asteroids, grab the gems.");
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
    ctx.setStatus("Ready to launch.");
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
    };
  },
});
