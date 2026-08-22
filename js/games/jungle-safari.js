MimiGames.register({
  id: "jungle-safari",
  title: "Jungle Safari 3D",
  emoji: "🦁",
  category: "Sports",
  tags: ["3D"],
  players: "1P",
  howTo: "A pseudo-3D safari drive down a jungle trail. Left/Right or A/D to change lanes and dodge logs and rocks, Up/W to speed up. Wildlife occasionally appears at the roadside — press Space (or the 📷 button) while it's in frame to snap a photo for bonus points; too early, too late, or no press at all and the shot is missed. Clip an obstacle and you'll spin out, losing speed and a life. Three crashes ends the drive. Gamepad: D-pad to steer/speed, any face button to snap a photo. Touch: ◀ ▶ to change lanes, hold GAS to accelerate, 📷 to shoot.",
  init(root, ctx) {
    const SCREEN_W = 960, SCREEN_H = 600;
    const HORIZON_Y = SCREEN_H * 0.38;
    const CAM_HEIGHT = 72;
    const PROJECTION = 300;
    const CAMERA_BACK = 70;
    const NEAR_PLANE = 12;
    const FAR_DRAW_DISTANCE = 2600;

    const LANE_COUNT = 3;
    const LANE_WIDTH = 80;
    const ROAD_HALF_WIDTH = (LANE_COUNT / 2) * LANE_WIDTH;
    const SHOULDER_EXTRA = 60;

    const SPEED_MAX = 360;
    const SPEED_MIN = 90;
    const ACCEL = 210;
    const COAST_DRAG = 95;

    const COLLISION_RANGE = 26;
    const PHOTO_RANGE = 70;
    const DESPAWN_BEHIND = -110;
    const SPAWN_AHEAD = 1500;
    const MIN_LANE_GAP = 260;
    const CRASH_INVULN = 1.5;
    const LIVES_START = 3;

    const ANIMAL_EMOJI = ["🦁", "🐘", "🦒", "🦓", "🐆"];
    const OBSTACLE_EMOJI = ["🪵", "🪨"];

    const SETTINGS_KEY = "jungleSafariSettings";
    const DIFFICULTIES = {
      easy: { label: "Easy", label2: "Quiet Trail", spawnInterval: 1.7 },
      normal: { label: "Normal", label2: "Game Trail", spawnInterval: 1.2 },
      hard: { label: "Hard", label2: "Overgrown", spawnInterval: 0.85 },
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
    canvas.style.background = "#12200f";
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
    hint.textContent = "Up/W = gas, Left/Right = change lanes, Space = snap a photo when wildlife is in frame.";

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
    const gasBtn = touchBtn("🚙 GAS");
    const laneRightBtn = touchBtn("▶");
    const photoBtn = touchBtn("📷");
    touchRow.append(laneLeftBtn, gasBtn, laneRightBtn, photoBtn);

    const startBtn = document.createElement("button");
    startBtn.className = "btn primary";
    startBtn.textContent = "Start Safari";
    startBtn.onclick = startGame;

    wrap.append(settingsPanel, canvasWrap, hint, touchRow, startBtn);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Invincible: Off",
        run(e) {
          devInvincible = !devInvincible;
          e.target.textContent = `Invincible: ${devInvincible ? "On" : "Off"}`;
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
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "KeyA", "KeyD", "KeyW", "Space"].includes(code)) e.preventDefault();
      if (!keys.has(code)) {
        if (code === "ArrowLeft" || code === "KeyA") changeLane(-1);
        else if (code === "ArrowRight" || code === "KeyD") changeLane(1);
        else if (code === "Space") snapPhoto();
      }
      keys.add(code);
    }
    function onKeyup(e) { keys.delete(e.code); }
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("keyup", onKeyup);

    function heldAccelerate() { return keys.has("ArrowUp") || keys.has("KeyW") || touchGasHeld; }

    let touchGasHeld = false;
    function bindHold(el, onDown, onUp) {
      el.addEventListener("pointerdown", (e) => { e.preventDefault(); onDown(); });
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
      el.addEventListener("pointerleave", onUp);
    }
    bindHold(gasBtn, () => { touchGasHeld = true; }, () => { touchGasHeld = false; });
    laneLeftBtn.addEventListener("click", () => changeLane(-1));
    laneRightBtn.addEventListener("click", () => changeLane(1));
    photoBtn.addEventListener("click", () => snapPhoto());

    function changeLane(dir) {
      if (!running || over) return;
      player.targetLane = clamp(player.targetLane + dir, 0, LANE_COUNT - 1);
      playSound("click");
    }

    // ============ state ============
    let running = false;
    let over = false;
    let score = 0;
    let photosGood = 0;
    let photosMissed = 0;
    let lives = LIVES_START;
    let shakeTimer = 0;
    let flashTimer = 0;
    let spawnTimer = 2;
    let animalTimer = 1.4;
    let obstacles = [];
    let animals = [];
    let popups = [];
    let devInvincible = false;

    const player = {
      lane: 1,
      targetLane: 1,
      laneX: laneWorldX(1),
      worldPos: 0,
      speed: 130,
      lean: 0,
      invuln: 0,
      flash: 0,
    };

    function spawnPopup(worldZ, x, text, color) {
      popups.push({ worldZ, x, life: 1, maxLife: 1, text, color: color || "#fff" });
    }

    function resetState() {
      score = 0;
      photosGood = 0;
      photosMissed = 0;
      lives = LIVES_START;
      shakeTimer = 0;
      flashTimer = 0;
      spawnTimer = 2;
      animalTimer = 1.4;
      obstacles = [];
      animals = [];
      popups = [];
      player.lane = 1;
      player.targetLane = 1;
      player.laneX = laneWorldX(1);
      player.worldPos = 0;
      player.speed = 130;
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
    function trySpawnObstacle() {
      const diff = currentDiff();
      const lane = Math.floor(Math.random() * LANE_COUNT);
      const spawnZ = player.worldPos + SPAWN_AHEAD + Math.random() * 200;
      const blocked = obstacles.some((o) => o.lane === lane && Math.abs(o.worldZ - spawnZ) < MIN_LANE_GAP);
      if (blocked) return;
      obstacles.push({ lane, worldZ: spawnZ, emoji: OBSTACLE_EMOJI[Math.floor(Math.random() * OBSTACLE_EMOJI.length)] });
    }
    function trySpawnAnimal() {
      const side = Math.random() < 0.5 ? -1 : 1;
      const worldX = side * (ROAD_HALF_WIDTH + SHOULDER_EXTRA * 0.6);
      const spawnZ = player.worldPos + SPAWN_AHEAD * 0.8 + Math.random() * 300;
      animals.push({
        worldX, worldZ: spawnZ,
        emoji: ANIMAL_EMOJI[Math.floor(Math.random() * ANIMAL_EMOJI.length)],
        resolved: false,
      });
    }

    function crash() {
      lives -= 1;
      player.speed = Math.max(SPEED_MIN, player.speed * 0.32);
      player.invuln = CRASH_INVULN;
      player.flash = CRASH_INVULN;
      shakeTimer = 0.4;
      playSound("hit");
      ctx.setStatus(`Spin out! ${lives} ${lives === 1 ? "life" : "lives"} left.`);
      if (lives <= 0) endGame();
    }

    function snapPhoto() {
      if (!running || over) return;
      const target = animals.find((a) => !a.resolved && Math.abs(a.worldZ - player.worldPos) < PHOTO_RANGE);
      flashTimer = 0.15;
      if (target) {
        target.resolved = true;
        const perfect = Math.abs(target.worldZ - player.worldPos) < PHOTO_RANGE * 0.4;
        const gained = perfect ? 60 : 30;
        score += gained;
        photosGood += 1;
        spawnPopup(target.worldZ, target.worldX, perfect ? `+${gained} Perfect Shot!` : `+${gained} Photo!`, "#53e0ff");
        playSound(perfect ? "success" : "tick");
      } else {
        playSound("click");
      }
    }

    function updateEntities(dt) {
      const diff = currentDiff();
      spawnTimer -= dt;
      if (spawnTimer <= 0) { trySpawnObstacle(); spawnTimer = diff.spawnInterval * (0.8 + Math.random() * 0.4); }
      animalTimer -= dt;
      if (animalTimer <= 0) { trySpawnAnimal(); animalTimer = 2.2 + Math.random() * 1.6; }

      obstacles = obstacles.filter((o) => o.worldZ - player.worldPos > DESPAWN_BEHIND);
      animals.forEach((a) => {
        if (!a.resolved && a.worldZ - player.worldPos < -PHOTO_RANGE) {
          a.resolved = true;
          photosMissed += 1;
        }
      });
      animals = animals.filter((a) => a.worldZ - player.worldPos > DESPAWN_BEHIND);

      if (!running || over) return;
      obstacles.forEach((o) => {
        const rel = o.worldZ - player.worldPos;
        if (!devInvincible && player.invuln <= 0 && Math.abs(rel) < COLLISION_RANGE && o.lane === player.targetLane) crash();
      });
    }

    // ============ update ============
    function updateScore(dt) {
      score += (1 + clamp01((player.speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * 5) * dt;
    }

    function update(dt) {
      if (!running) return;
      if (!over) {
        if (heldAccelerate()) player.speed += ACCEL * dt;
        else player.speed -= COAST_DRAG * dt;
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
      if (flashTimer > 0) flashTimer = Math.max(0, flashTimer - dt);
      popups.forEach((p) => { p.life -= dt / p.maxLife; });
      popups = popups.filter((p) => p.life > 0);
    }

    // ============ draw ============
    function drawSky() {
      const grad = g.createLinearGradient(0, 0, 0, HORIZON_Y);
      grad.addColorStop(0, "#bfe08a");
      grad.addColorStop(1, "#e8d98a");
      g.fillStyle = grad;
      g.fillRect(0, 0, SCREEN_W, HORIZON_Y);
      g.fillStyle = "rgba(255,244,200,0.85)";
      g.beginPath();
      g.arc(SCREEN_W * 0.7, HORIZON_Y * 0.4, 38, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(20,50,15,0.6)";
      const parallax = (player.worldPos * 0.03) % 140;
      for (let i = -1; i < 9; i++) {
        const bx = i * 140 - parallax;
        const bh = 40 + (((i * 47) % 70) + 70) % 70;
        g.beginPath();
        g.arc(bx + 40, HORIZON_Y - bh * 0.55, bh * 0.55, 0, Math.PI * 2);
        g.fill();
        g.fillRect(bx + 34, HORIZON_Y - bh * 0.3, 12, bh * 0.3);
      }
      g.fillStyle = "#2a2410";
      g.fillRect(0, HORIZON_Y, SCREEN_W, SCREEN_H - HORIZON_Y);
    }

    function drawRoad() {
      const nearZ = player.worldPos - CAMERA_BACK + NEAR_PLANE;
      const farZ = player.worldPos - CAMERA_BACK + FAR_DRAW_DISTANCE;
      const nearL = project(-ROAD_HALF_WIDTH - SHOULDER_EXTRA, nearZ, 0);
      const nearR = project(ROAD_HALF_WIDTH + SHOULDER_EXTRA, nearZ, 0);
      const farL = project(-ROAD_HALF_WIDTH - SHOULDER_EXTRA, farZ, 0);
      const farR = project(ROAD_HALF_WIDTH + SHOULDER_EXTRA, farZ, 0);
      g.fillStyle = "#3d5c1f";
      g.beginPath();
      g.moveTo(nearL.x, nearL.y); g.lineTo(farL.x, farL.y); g.lineTo(farR.x, farR.y); g.lineTo(nearR.x, nearR.y);
      g.closePath(); g.fill();

      const roadNearL = project(-ROAD_HALF_WIDTH, nearZ, 0);
      const roadNearR = project(ROAD_HALF_WIDTH, nearZ, 0);
      const roadFarL = project(-ROAD_HALF_WIDTH, farZ, 0);
      const roadFarR = project(ROAD_HALF_WIDTH, farZ, 0);
      g.fillStyle = "#8a6a45";
      g.beginPath();
      g.moveTo(roadNearL.x, roadNearL.y); g.lineTo(roadFarL.x, roadFarL.y); g.lineTo(roadFarR.x, roadFarR.y); g.lineTo(roadNearR.x, roadNearR.y);
      g.closePath(); g.fill();

      g.strokeStyle = "rgba(90,60,30,0.6)";
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(roadNearL.x, roadNearL.y); g.lineTo(roadFarL.x, roadFarL.y); g.stroke();
      g.beginPath(); g.moveTo(roadNearR.x, roadNearR.y); g.lineTo(roadFarR.x, roadFarR.y); g.stroke();
    }

    function drawObstacles() {
      const sorted = obstacles.slice().sort((a, b) => (b.worldZ - a.worldZ));
      sorted.forEach((o) => {
        const forward = o.worldZ - (player.worldPos - CAMERA_BACK);
        if (forward < NEAR_PLANE * 0.5 || forward > FAR_DRAW_DISTANCE) return;
        const worldX = laneWorldX(o.lane);
        const p = project(worldX, o.worldZ, 0);
        const size = Math.max(10, 40 * p.scale);
        g.save();
        g.globalAlpha = clamp01(p.scale * 3);
        g.font = `${size}px sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "bottom";
        g.fillText(o.emoji, p.x, p.y + size * 0.12);
        g.restore();
      });
    }

    function drawAnimals() {
      animals.forEach((a) => {
        const forward = a.worldZ - (player.worldPos - CAMERA_BACK);
        if (forward < NEAR_PLANE * 0.5 || forward > FAR_DRAW_DISTANCE) return;
        const p = project(a.worldX, a.worldZ, 0);
        const size = Math.max(10, 44 * p.scale);
        const inRange = !a.resolved && Math.abs(a.worldZ - player.worldPos) < PHOTO_RANGE;
        g.save();
        g.globalAlpha = clamp01(p.scale * 3);
        g.font = `${size}px sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "bottom";
        g.fillText(a.emoji, p.x, p.y + size * 0.1);
        if (inRange) {
          g.strokeStyle = "#53e0ff";
          g.lineWidth = 2;
          g.strokeRect(p.x - size * 0.6, p.y - size * 1.1, size * 1.2, size * 1.15);
        }
        g.restore();
      });
    }

    function drawPopups() {
      popups.forEach((p) => {
        const proj = project(p.x, p.worldZ, 40);
        g.globalAlpha = clamp01(p.life);
        g.fillStyle = p.color;
        g.font = "700 15px sans-serif";
        g.textAlign = "center";
        g.fillText(p.text, proj.x, proj.y - p.life * 20);
        g.globalAlpha = 1;
      });
    }

    function drawJeep() {
      const p = project(player.laneX, player.worldPos, 0);
      const blink = player.flash > 0 && Math.floor(player.flash * 10) % 2 === 0;
      if (blink) return;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(player.lean * 0.24);
      g.font = `${Math.max(30, 62 * p.scale)}px sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "bottom";
      g.fillText("🚙", 0, 6);
      g.restore();
    }

    function drawHud() {
      g.textAlign = "left";
      g.font = "700 20px sans-serif";
      g.fillStyle = "#f2f5ff";
      g.fillText(`Score: ${Math.floor(score)}`, 16, 30);
      g.font = "600 11px sans-serif";
      g.fillStyle = "rgba(255,255,255,0.75)";
      g.fillText(`📷 ${photosGood} shots · ${photosMissed} missed`, 16, 50);

      g.textAlign = "right";
      g.font = "20px sans-serif";
      let heartsStr = "";
      for (let i = 0; i < LIVES_START; i += 1) heartsStr += i < lives ? "❤️" : "🖤";
      g.fillText(heartsStr, SCREEN_W - 16, 30);
      g.font = "600 11px sans-serif";
      g.fillStyle = "rgba(255,255,255,0.75)";
      g.fillText(`Distance: ${Math.floor(player.worldPos / 3)}m`, SCREEN_W - 16, 50);

      if (flashTimer > 0) {
        g.fillStyle = `rgba(255,255,255,${flashTimer / 0.15 * 0.6})`;
        g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      }
    }

    function draw() {
      g.clearRect(0, 0, SCREEN_W, SCREEN_H);
      g.save();
      if (shakeTimer > 0) {
        const s = shakeTimer * 14;
        g.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      }
      drawSky();
      drawRoad();
      drawAnimals();
      drawObstacles();
      drawPopups();
      drawJeep();
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
      ctx.setStatus(`Safari over — Score: ${Math.floor(score)}`);
      setTimeout(() => {
        ctx.showOverlay({
          title: "Safari Over!",
          subtitle: `Score: ${Math.floor(score)} · Photos: ${photosGood} · Distance: ${Math.floor(player.worldPos / 3)}m${isNewBest ? " · New Best!" : ` · Best: ${Math.max(Math.floor(score), best)}`}`,
          buttonText: "Drive Again",
          onButton: startGame,
        });
      }, 400);
    }

    function startGame() {
      resetState();
      running = true;
      over = false;
      ctx.setStatus("Go! Snap photos, dodge the trail hazards.");
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
    ctx.setStatus("Ready for the trail.");
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
