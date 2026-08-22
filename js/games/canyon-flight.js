MimiGames.register({
  id: "canyon-flight",
  title: "Canyon Flight 3D",
  emoji: "🦅",
  category: "Action",
  tags: ["3D"],
  players: "1P",
  howTo: "A pseudo-3D wingsuit flight down a canyon — dodge in two directions at once. Left/Right or A/D to bank sideways, Up/Down or W/S to climb or dive between three altitude bands. Rock spires block specific lane-and-altitude cells, so you may need to move both ways to thread through. Fly into 💨 wind boosts for a burst of speed and score. Clip a spire and you'll lose a life and get a moment to recover — three hits ends the flight. Gamepad: D-pad to bank and climb/dive (Start un-hides the controller cursor if you need it). Touch: ◀ ▶ to bank, ▲ ▼ to climb/dive.",
  init(root, ctx) {
    const SCREEN_W = 960, SCREEN_H = 600;
    const HORIZON_Y = SCREEN_H * 0.36;
    const CAM_HEIGHT = 100;
    const PROJECTION = 300;
    const CAMERA_BACK = 70;
    const NEAR_PLANE = 12;
    const FAR_DRAW_DISTANCE = 2600;

    const LANE_COUNT = 3;
    const LANE_WIDTH = 92;
    const CANYON_HALF_WIDTH = (LANE_COUNT / 2) * LANE_WIDTH;
    const ALT_COUNT = 3;
    const ALT_LEVELS = [30, 100, 170]; // low, mid, high

    const SPEED_MAX = 400;
    const SPEED_MIN = 110;
    const ACCEL = 200;
    const COAST_DRAG = 60;
    const BOOST_KICK = 90;

    const COLLISION_RANGE = 30;
    const DESPAWN_BEHIND = -110;
    const SPAWN_AHEAD = 1600;
    const MIN_CELL_GAP = 300;
    const CRASH_INVULN = 1.5;
    const LIVES_START = 3;

    const SETTINGS_KEY = "canyonFlightSettings";
    const DIFFICULTIES = {
      easy: { label: "Easy", label2: "Wide Canyon", spawnInterval: 1.3 },
      normal: { label: "Normal", label2: "Narrow Pass", spawnInterval: 0.95 },
      hard: { label: "Hard", label2: "Needle's Eye", spawnInterval: 0.68 },
    };
    const settings = Object.assign({ difficulty: "normal", soundEnabled: true }, ctx.storage.get(SETTINGS_KEY, {}));
    function saveSettings() { ctx.storage.set(SETTINGS_KEY, settings); }
    function playSound(name) { if (settings.soundEnabled) ctx.playSound(name); }
    function currentDiff() { return DIFFICULTIES[settings.difficulty]; }

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function clamp01(v) { return clamp(v, 0, 1); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function laneWorldX(lane) { return (lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH; }
    function altWorldY(alt) { return ALT_LEVELS[alt]; }

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
    canvas.style.background = "#3a2418";
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
    hint.textContent = "Left/Right = bank, Up/Down = climb or dive. Thread the spires in both directions.";

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
    const climbBtn = touchBtn("▲");
    const diveBtn = touchBtn("▼");
    const laneRightBtn = touchBtn("▶");
    touchRow.append(laneLeftBtn, climbBtn, diveBtn, laneRightBtn);

    const startBtn = document.createElement("button");
    startBtn.className = "btn primary";
    startBtn.textContent = "Jump";
    startBtn.onclick = startGame;

    wrap.append(settingsPanel, canvasWrap, hint, touchRow, startBtn);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Invincible: Off",
        run(e) {
          invincible = !invincible;
          e.target.textContent = `Invincible: ${invincible ? "On" : "Off"}`;
        },
      },
      { label: "Add Score +200", run: () => { score += 200; } },
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
      if (!keys.has(code)) {
        if (code === "ArrowLeft" || code === "KeyA") changeLane(-1);
        else if (code === "ArrowRight" || code === "KeyD") changeLane(1);
        else if (code === "ArrowUp" || code === "KeyW") changeAlt(1);
        else if (code === "ArrowDown" || code === "KeyS") changeAlt(-1);
      }
      keys.add(code);
    }
    function onKeyup(e) { keys.delete(e.code); }
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("keyup", onKeyup);

    function bindHold(el, onDown, onUp) {
      el.addEventListener("pointerdown", (e) => { e.preventDefault(); onDown(); });
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
      el.addEventListener("pointerleave", onUp);
    }
    laneLeftBtn.addEventListener("click", () => changeLane(-1));
    laneRightBtn.addEventListener("click", () => changeLane(1));
    climbBtn.addEventListener("click", () => changeAlt(1));
    diveBtn.addEventListener("click", () => changeAlt(-1));

    function changeLane(dir) {
      if (!running || over) return;
      player.targetLane = clamp(player.targetLane + dir, 0, LANE_COUNT - 1);
      playSound("click");
    }
    function changeAlt(dir) {
      if (!running || over) return;
      player.targetAlt = clamp(player.targetAlt + dir, 0, ALT_COUNT - 1);
      playSound("click");
    }

    // ============ state ============
    let running = false;
    let over = false;
    let invincible = false;
    let score = 0;
    let lives = LIVES_START;
    let shakeTimer = 0;
    let spawnTimer = 1.6;
    let windTimer = 1.4;
    let spires = [];
    let winds = [];
    let popups = [];

    const player = {
      lane: 1,
      targetLane: 1,
      laneX: laneWorldX(1),
      alt: 1,
      targetAlt: 1,
      altY: altWorldY(1),
      worldPos: 0,
      speed: 170,
      lean: 0,
      invuln: 0,
      flash: 0,
    };

    function spawnPopup(worldZ, lane, alt, text, color) {
      popups.push({ worldZ, lane, alt, life: 1, maxLife: 1, text, color: color || "#fff" });
    }

    function resetState() {
      score = 0;
      lives = LIVES_START;
      shakeTimer = 0;
      spawnTimer = 1.6;
      windTimer = 1.4;
      spires = [];
      winds = [];
      popups = [];
      player.lane = 1;
      player.targetLane = 1;
      player.laneX = laneWorldX(1);
      player.alt = 1;
      player.targetAlt = 1;
      player.altY = altWorldY(1);
      player.worldPos = 0;
      player.speed = 170;
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
    function trySpawnSpire() {
      const diff = currentDiff();
      const lane = Math.floor(Math.random() * LANE_COUNT);
      const alt = Math.floor(Math.random() * ALT_COUNT);
      const spawnZ = player.worldPos + SPAWN_AHEAD + Math.random() * 220;
      const blocked = spires.some((o) => o.lane === lane && o.alt === alt && Math.abs(o.worldZ - spawnZ) < MIN_CELL_GAP);
      if (blocked) return;
      spires.push({ lane, alt, worldZ: spawnZ });
    }
    function trySpawnWind() {
      const lane = Math.floor(Math.random() * LANE_COUNT);
      const alt = Math.floor(Math.random() * ALT_COUNT);
      const spawnZ = player.worldPos + SPAWN_AHEAD * 0.75 + Math.random() * 300;
      winds.push({ lane, alt, worldZ: spawnZ, taken: false });
    }

    function crash() {
      lives -= 1;
      player.speed = Math.max(SPEED_MIN, player.speed * 0.4);
      player.invuln = CRASH_INVULN;
      player.flash = CRASH_INVULN;
      shakeTimer = 0.4;
      playSound("hit");
      ctx.setStatus(`Clipped a spire! ${lives} ${lives === 1 ? "life" : "lives"} left.`);
      if (lives <= 0) endGame();
    }

    function updateEntities(dt) {
      const diff = currentDiff();
      spawnTimer -= dt;
      if (spawnTimer <= 0) { trySpawnSpire(); spawnTimer = diff.spawnInterval * (0.8 + Math.random() * 0.4); }
      windTimer -= dt;
      if (windTimer <= 0) { trySpawnWind(); windTimer = 2 + Math.random() * 1.4; }

      spires = spires.filter((o) => o.worldZ - player.worldPos > DESPAWN_BEHIND);
      winds = winds.filter((o) => o.worldZ - player.worldPos > DESPAWN_BEHIND && !o.taken);

      if (!running || over) return;
      spires.forEach((o) => {
        const rel = o.worldZ - player.worldPos;
        if (!invincible && player.invuln <= 0 && Math.abs(rel) < COLLISION_RANGE && o.lane === player.targetLane && o.alt === player.targetAlt) crash();
      });
      winds.forEach((o) => {
        if (o.taken) return;
        const rel = o.worldZ - player.worldPos;
        if (Math.abs(rel) < COLLISION_RANGE && o.lane === player.targetLane && o.alt === player.targetAlt) {
          o.taken = true;
          score += 30;
          player.speed = Math.min(SPEED_MAX, player.speed + BOOST_KICK);
          spawnPopup(o.worldZ, o.lane, o.alt, "+30 💨", "#7ee81c");
          playSound("powerUp");
        }
      });
    }

    // ============ update ============
    function update(dt) {
      if (!running) return;
      if (!over) {
        player.speed += (ACCEL - COAST_DRAG) * dt * 0.35;
        player.speed = clamp(player.speed, SPEED_MIN, SPEED_MAX);

        player.worldPos += player.speed * dt;
        const targetX = laneWorldX(player.targetLane);
        player.laneX = lerp(player.laneX, targetX, Math.min(1, dt * 9));
        player.lean = lerp(player.lean, clamp((targetX - player.laneX) / LANE_WIDTH, -1, 1), Math.min(1, dt * 10));
        player.lane = player.targetLane;

        const targetY = altWorldY(player.targetAlt);
        player.altY = lerp(player.altY, targetY, Math.min(1, dt * 9));
        player.alt = player.targetAlt;

        score += (1.5 + clamp01((player.speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * 5) * dt;
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
      grad.addColorStop(0, "#ff9a5c");
      grad.addColorStop(1, "#c95a3c");
      g.fillStyle = grad;
      g.fillRect(0, 0, SCREEN_W, HORIZON_Y);
      g.fillStyle = "rgba(255,244,220,0.8)";
      g.beginPath();
      g.arc(SCREEN_W * 0.76, HORIZON_Y * 0.35, 36, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#5a2f1e";
      g.fillRect(0, HORIZON_Y, SCREEN_W, SCREEN_H - HORIZON_Y);
    }

    function drawCanyonWalls() {
      const nearZ = player.worldPos - CAMERA_BACK + NEAR_PLANE;
      const farZ = player.worldPos - CAMERA_BACK + FAR_DRAW_DISTANCE;
      // simple canyon walls flanking the flight corridor, top and bottom bound
      [-1, 1].forEach((side) => {
        const innerX = side * CANYON_HALF_WIDTH;
        const outerX = side * (CANYON_HALF_WIDTH + 260);
        const nearIn = project(innerX, nearZ, 260);
        const nearOut = project(outerX, nearZ, -40);
        const farIn = project(innerX, farZ, 260);
        const farOut = project(outerX, farZ, -40);
        g.fillStyle = "#4a2c1c";
        g.beginPath();
        g.moveTo(nearIn.x, nearIn.y); g.lineTo(farIn.x, farIn.y); g.lineTo(farOut.x, farOut.y); g.lineTo(nearOut.x, nearOut.y);
        g.closePath(); g.fill();
      });
      // altitude guide streaks down the middle of the corridor
      const dashSpacing = 110;
      const offset = player.worldPos % dashSpacing;
      for (let a = 0; a < ALT_COUNT; a++) {
        for (let i = 0; i < 18; i += 1) {
          const zAbs = player.worldPos - CAMERA_BACK + NEAR_PLANE + 20 + i * dashSpacing - offset;
          if (zAbs - (player.worldPos - CAMERA_BACK) < NEAR_PLANE) continue;
          const p = project(0, zAbs, ALT_LEVELS[a]);
          if (p.scale < 0.02) continue;
          g.fillStyle = "rgba(255,220,180,0.18)";
          g.fillRect(p.x - 200 * p.scale, p.y - 1, 400 * p.scale, 2);
        }
      }
    }

    function drawSpires() {
      const sorted = spires.slice().sort((a, b) => (b.worldZ - a.worldZ));
      sorted.forEach((o) => {
        const forward = o.worldZ - (player.worldPos - CAMERA_BACK);
        if (forward < NEAR_PLANE * 0.5 || forward > FAR_DRAW_DISTANCE) return;
        const worldX = laneWorldX(o.lane);
        const worldY = altWorldY(o.alt);
        const p = project(worldX, o.worldZ, worldY);
        const size = Math.max(11, 46 * p.scale);
        g.save();
        g.globalAlpha = clamp01(p.scale * 3);
        g.font = `${size}px sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("🗿", p.x, p.y);
        g.restore();
      });
    }

    function drawWinds() {
      winds.forEach((o) => {
        if (o.taken) return;
        const forward = o.worldZ - (player.worldPos - CAMERA_BACK);
        if (forward < NEAR_PLANE * 0.5 || forward > FAR_DRAW_DISTANCE) return;
        const worldX = laneWorldX(o.lane);
        const worldY = altWorldY(o.alt);
        const p = project(worldX, o.worldZ, worldY);
        const size = Math.max(9, 30 * p.scale);
        g.save();
        g.globalAlpha = clamp01(p.scale * 3);
        g.font = `${size}px sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("💨", p.x, p.y);
        g.restore();
      });
    }

    function drawPopups() {
      popups.forEach((p) => {
        const worldX = laneWorldX(p.lane);
        const worldY = altWorldY(p.alt);
        const proj = project(worldX, p.worldZ, worldY + 30);
        g.globalAlpha = clamp01(p.life);
        g.fillStyle = p.color;
        g.font = "700 15px sans-serif";
        g.textAlign = "center";
        g.fillText(p.text, proj.x, proj.y - p.life * 20);
        g.globalAlpha = 1;
      });
    }

    function drawFlyer() {
      const p = project(player.laneX, player.worldPos, player.altY);
      const blink = player.flash > 0 && Math.floor(player.flash * 10) % 2 === 0;
      if (blink) return;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(player.lean * 0.3);
      g.font = `${Math.max(30, 60 * p.scale)}px sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("🪂", 0, 0);
      g.restore();
    }

    function drawHud() {
      g.textAlign = "left";
      g.font = "700 20px sans-serif";
      g.fillStyle = "#f2f5ff";
      g.fillText(`Score: ${Math.floor(score)}`, 16, 30);
      g.font = "600 11px sans-serif";
      g.fillStyle = "rgba(255,255,255,0.75)";
      const altLabel = ["Low", "Mid", "High"][player.alt];
      g.fillText(`Altitude: ${altLabel}`, 16, 50);

      g.textAlign = "right";
      g.font = "20px sans-serif";
      let heartsStr = "";
      for (let i = 0; i < LIVES_START; i += 1) heartsStr += i < lives ? "❤️" : "🖤";
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
      drawCanyonWalls();
      drawWinds();
      drawSpires();
      drawPopups();
      drawFlyer();
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
      ctx.setStatus(`Flight over — Score: ${Math.floor(score)}`);
      setTimeout(() => {
        ctx.showOverlay({
          title: "Grounded!",
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
      ctx.setStatus("Go! Bank and climb/dive through the canyon.");
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
    ctx.setStatus("Ready to jump.");
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
