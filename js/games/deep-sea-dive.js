MimiGames.register({
  id: "deep-sea-dive",
  title: "Deep Sea Dive 3D",
  emoji: "🤿",
  category: "Action",
  tags: ["3D"],
  players: "1P",
  howTo: "A pseudo-3D dive through open water. Left/Right or A/D to change lanes, Up/W to kick faster. Oxygen drains the whole dive — grab 🫧 air bubbles to refill it, and collect 🦪 pearls for score. Swim into a jellyfish or shark and you'll lose a big chunk of oxygen and get pushed back, with a moment to recover. Run out of air and the dive ends. Gamepad: D-pad to steer/kick (Start un-hides the controller cursor if you need it). Touch: ◀ ▶ to change lanes, hold KICK to swim faster.",
  init(root, ctx) {
    const SCREEN_W = 960, SCREEN_H = 600;
    const HORIZON_Y = SCREEN_H * 0.34;
    const CAM_HEIGHT = 70;
    const PROJECTION = 300;
    const CAMERA_BACK = 70;
    const NEAR_PLANE = 12;
    const FAR_DRAW_DISTANCE = 2400;

    const LANE_COUNT = 3;
    const LANE_WIDTH = 80;
    const ROAD_HALF_WIDTH = (LANE_COUNT / 2) * LANE_WIDTH;
    const SHOULDER_EXTRA = 60;

    const SPEED_MAX = 340;
    const SPEED_MIN = 80;
    const ACCEL = 200;
    const COAST_DRAG = 90;

    const COLLISION_RANGE = 26;
    const DESPAWN_BEHIND = -110;
    const SPAWN_AHEAD = 1500;
    const MIN_LANE_GAP = 260;
    const HIT_INVULN = 1.3;
    const OXYGEN_START = 100;
    const OXYGEN_DRAIN_RATE = 1.6; // per second
    const OXYGEN_HIT_LOSS = 24;
    const OXYGEN_BUBBLE_GAIN = 22;

    const CREATURE_EMOJI = ["🪼", "🦈"];

    const SETTINGS_KEY = "deepSeaDiveSettings";
    const DIFFICULTIES = {
      easy: { label: "Easy", label2: "Shallow Reef", spawnInterval: 1.7 },
      normal: { label: "Normal", label2: "Open Water", spawnInterval: 1.2 },
      hard: { label: "Hard", label2: "The Trench", spawnInterval: 0.85 },
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
    canvas.style.background = "#023047";
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
    hint.textContent = "Left/Right = change lanes, Up = kick faster. Grab bubbles for air, dodge the wildlife.";

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
    const kickBtn = touchBtn("🤿 KICK");
    const laneRightBtn = touchBtn("▶");
    touchRow.append(laneLeftBtn, kickBtn, laneRightBtn);

    const startBtn = document.createElement("button");
    startBtn.className = "btn primary";
    startBtn.textContent = "Start Dive";
    startBtn.onclick = startGame;

    wrap.append(settingsPanel, canvasWrap, hint, touchRow, startBtn);
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
        label: "Refill Air +100 Score",
        run() {
          oxygen = OXYGEN_START;
          score += 100;
          ctx.setStatus(`Score: ${Math.floor(score)}`);
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

    function heldAccelerate() { return keys.has("ArrowUp") || keys.has("KeyW") || touchKickHeld; }

    let touchKickHeld = false;
    function bindHold(el, onDown, onUp) {
      el.addEventListener("pointerdown", (e) => { e.preventDefault(); onDown(); });
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
      el.addEventListener("pointerleave", onUp);
    }
    bindHold(kickBtn, () => { touchKickHeld = true; }, () => { touchKickHeld = false; });
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
    let oxygen = OXYGEN_START;
    let shakeTimer = 0;
    let spawnTimer = 1.5;
    let bubbleTimer = 1.8;
    let pearlTimer = 1.1;
    let creatures = [];
    let bubbles = [];
    let pearls = [];
    let popups = [];

    const player = {
      lane: 1,
      targetLane: 1,
      laneX: laneWorldX(1),
      worldPos: 0,
      speed: 140,
      lean: 0,
      invuln: 0,
      flash: 0,
    };

    function spawnPopup(worldZ, lane, text, color) {
      popups.push({ worldZ, lane, life: 1, maxLife: 1, text, color: color || "#fff" });
    }

    function resetState() {
      score = 0;
      oxygen = OXYGEN_START;
      shakeTimer = 0;
      spawnTimer = 1.5;
      bubbleTimer = 1.8;
      pearlTimer = 1.1;
      creatures = [];
      bubbles = [];
      pearls = [];
      popups = [];
      player.lane = 1;
      player.targetLane = 1;
      player.laneX = laneWorldX(1);
      player.worldPos = 0;
      player.speed = 140;
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
    function trySpawnCreature() {
      const diff = currentDiff();
      const lane = Math.floor(Math.random() * LANE_COUNT);
      const spawnZ = player.worldPos + SPAWN_AHEAD + Math.random() * 200;
      const blocked = creatures.some((o) => o.lane === lane && Math.abs(o.worldZ - spawnZ) < MIN_LANE_GAP);
      if (blocked) return;
      creatures.push({ lane, worldZ: spawnZ, emoji: CREATURE_EMOJI[Math.floor(Math.random() * CREATURE_EMOJI.length)], sway: Math.random() * 6.28 });
    }
    function trySpawnBubble() {
      const lane = Math.floor(Math.random() * LANE_COUNT);
      const spawnZ = player.worldPos + SPAWN_AHEAD * 0.8 + Math.random() * 300;
      bubbles.push({ lane, worldZ: spawnZ, taken: false });
    }
    function trySpawnPearl() {
      const lane = Math.floor(Math.random() * LANE_COUNT);
      const spawnZ = player.worldPos + SPAWN_AHEAD * 0.7 + Math.random() * 300;
      pearls.push({ lane, worldZ: spawnZ, taken: false });
    }

    function takeHit() {
      oxygen = Math.max(0, oxygen - OXYGEN_HIT_LOSS);
      player.speed = Math.max(SPEED_MIN, player.speed * 0.4);
      player.invuln = HIT_INVULN;
      player.flash = HIT_INVULN;
      shakeTimer = 0.4;
      playSound("hit");
      ctx.setStatus(oxygen > 0 ? `Startled! Oxygen ${Math.round(oxygen)}%.` : "Out of air!");
      if (oxygen <= 0) endGame();
    }

    function updateEntities(dt) {
      const diff = currentDiff();
      spawnTimer -= dt;
      if (spawnTimer <= 0) { trySpawnCreature(); spawnTimer = diff.spawnInterval * (0.8 + Math.random() * 0.4); }
      bubbleTimer -= dt;
      if (bubbleTimer <= 0) { trySpawnBubble(); bubbleTimer = 2.4 + Math.random() * 1.6; }
      pearlTimer -= dt;
      if (pearlTimer <= 0) { trySpawnPearl(); pearlTimer = 1.6 + Math.random() * 1.2; }

      creatures.forEach((o) => { o.sway += dt * 2; });
      creatures = creatures.filter((o) => o.worldZ - player.worldPos > DESPAWN_BEHIND);
      bubbles = bubbles.filter((o) => o.worldZ - player.worldPos > DESPAWN_BEHIND && !o.taken);
      pearls = pearls.filter((o) => o.worldZ - player.worldPos > DESPAWN_BEHIND && !o.taken);

      if (!running || over) return;
      creatures.forEach((o) => {
        const rel = o.worldZ - player.worldPos;
        if (player.invuln <= 0 && !devInvincible && Math.abs(rel) < COLLISION_RANGE && o.lane === player.targetLane) takeHit();
      });
      bubbles.forEach((o) => {
        if (o.taken) return;
        const rel = o.worldZ - player.worldPos;
        if (Math.abs(rel) < COLLISION_RANGE && o.lane === player.targetLane) {
          o.taken = true;
          oxygen = Math.min(OXYGEN_START, oxygen + OXYGEN_BUBBLE_GAIN);
          spawnPopup(o.worldZ, o.lane, "+22% Air", "#53e0ff");
          playSound("tick");
        }
      });
      pearls.forEach((o) => {
        if (o.taken) return;
        const rel = o.worldZ - player.worldPos;
        if (Math.abs(rel) < COLLISION_RANGE && o.lane === player.targetLane) {
          o.taken = true;
          score += 30;
          spawnPopup(o.worldZ, o.lane, "+30 🦪", "#ffd166");
          playSound("coin");
        }
      });
    }

    // ============ update ============
    function update(dt) {
      if (!running) return;
      if (!over) {
        if (heldAccelerate()) player.speed += ACCEL * dt;
        else player.speed -= COAST_DRAG * dt;
        player.speed = clamp(player.speed, SPEED_MIN, SPEED_MAX);

        player.worldPos += player.speed * dt;
        const targetX = laneWorldX(player.targetLane);
        player.laneX = lerp(player.laneX, targetX, Math.min(1, dt * 8));
        player.lean = lerp(player.lean, clamp((targetX - player.laneX) / LANE_WIDTH, -1, 1), Math.min(1, dt * 9));
        player.lane = player.targetLane;

        score += (1 + clamp01((player.speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * 4) * dt;
        oxygen = Math.max(0, oxygen - OXYGEN_DRAIN_RATE * dt);
        if (oxygen <= 0) endGame();
      }
      updateEntities(dt);
      if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);
      if (player.flash > 0) player.flash = Math.max(0, player.flash - dt);
      if (shakeTimer > 0) shakeTimer = Math.max(0, shakeTimer - dt);
      popups.forEach((p) => { p.life -= dt / p.maxLife; });
      popups = popups.filter((p) => p.life > 0);
    }

    // ============ draw ============
    function drawWater() {
      const grad = g.createLinearGradient(0, 0, 0, SCREEN_H);
      grad.addColorStop(0, "#4fb8d6");
      grad.addColorStop(0.5, "#0f5c7a");
      grad.addColorStop(1, "#022436");
      g.fillStyle = grad;
      g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      // ambient rising bubbles, purely decorative
      for (let i = 0; i < 26; i++) {
        const bx = (i * 97 + (player.worldPos * 0.4) % 90) % SCREEN_W;
        const by = (i * 53 - performance.now() / 18) % SCREEN_H;
        const yy = ((by % SCREEN_H) + SCREEN_H) % SCREEN_H;
        g.fillStyle = "rgba(255,255,255,0.18)";
        g.beginPath();
        g.arc(bx, yy, 2 + (i % 3), 0, Math.PI * 2);
        g.fill();
      }
    }

    function drawTrench() {
      const nearZ = player.worldPos - CAMERA_BACK + NEAR_PLANE;
      const farZ = player.worldPos - CAMERA_BACK + FAR_DRAW_DISTANCE;
      const nearL = project(-ROAD_HALF_WIDTH - SHOULDER_EXTRA, nearZ, -140);
      const nearR = project(ROAD_HALF_WIDTH + SHOULDER_EXTRA, nearZ, -140);
      const farL = project(-ROAD_HALF_WIDTH - SHOULDER_EXTRA, farZ, -140);
      const farR = project(ROAD_HALF_WIDTH + SHOULDER_EXTRA, farZ, -140);
      g.fillStyle = "rgba(2,20,30,0.65)";
      g.beginPath();
      g.moveTo(nearL.x, nearL.y); g.lineTo(farL.x, farL.y); g.lineTo(farR.x, farR.y); g.lineTo(nearR.x, nearR.y);
      g.closePath(); g.fill();

      // lane guide-ropes, scrolling toward the camera
      const dashSpacing = 100;
      const offset = player.worldPos % dashSpacing;
      for (let laneEdge = 1; laneEdge < LANE_COUNT; laneEdge += 1) {
        const dividerX = -ROAD_HALF_WIDTH + laneEdge * LANE_WIDTH;
        for (let i = 0; i < 22; i += 1) {
          const zAbs = player.worldPos - CAMERA_BACK + NEAR_PLANE + 20 + i * dashSpacing - offset;
          if (zAbs - (player.worldPos - CAMERA_BACK) < NEAR_PLANE) continue;
          const p = project(dividerX, zAbs, -60);
          if (p.scale < 0.02) continue;
          const w = Math.max(1, 4 * p.scale), h = Math.max(1, 20 * p.scale);
          g.fillStyle = "rgba(200,240,255,0.3)";
          g.fillRect(p.x - w / 2, p.y - h / 2, w, h);
        }
      }
    }

    function drawCreatures() {
      const sorted = creatures.slice().sort((a, b) => (b.worldZ - a.worldZ));
      sorted.forEach((o) => {
        const forward = o.worldZ - (player.worldPos - CAMERA_BACK);
        if (forward < NEAR_PLANE * 0.5 || forward > FAR_DRAW_DISTANCE) return;
        const worldX = laneWorldX(o.lane) + Math.sin(o.sway) * 6;
        const p = project(worldX, o.worldZ, 0);
        const size = Math.max(10, 42 * p.scale);
        g.save();
        g.globalAlpha = clamp01(p.scale * 3);
        g.font = `${size}px sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(o.emoji, p.x, p.y);
        g.restore();
      });
    }

    function drawPickups() {
      bubbles.forEach((o) => {
        if (o.taken) return;
        const forward = o.worldZ - (player.worldPos - CAMERA_BACK);
        if (forward < NEAR_PLANE * 0.5 || forward > FAR_DRAW_DISTANCE) return;
        const worldX = laneWorldX(o.lane);
        const p = project(worldX, o.worldZ, 10 + Math.sin(performance.now() / 200 + o.worldZ) * 6);
        const size = Math.max(9, 28 * p.scale);
        g.save();
        g.globalAlpha = clamp01(p.scale * 3);
        g.font = `${size}px sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("🫧", p.x, p.y);
        g.restore();
      });
      pearls.forEach((o) => {
        if (o.taken) return;
        const forward = o.worldZ - (player.worldPos - CAMERA_BACK);
        if (forward < NEAR_PLANE * 0.5 || forward > FAR_DRAW_DISTANCE) return;
        const worldX = laneWorldX(o.lane);
        const p = project(worldX, o.worldZ, 0);
        const size = Math.max(9, 28 * p.scale);
        g.save();
        g.globalAlpha = clamp01(p.scale * 3);
        g.font = `${size}px sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("🦪", p.x, p.y);
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

    function drawDiver() {
      const p = project(player.laneX, player.worldPos, 0);
      const blink = player.flash > 0 && Math.floor(player.flash * 10) % 2 === 0;
      if (blink) return;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(player.lean * 0.24);
      g.font = `${Math.max(28, 58 * p.scale)}px sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("🤿", 0, 0);
      g.restore();
    }

    function drawHud() {
      g.textAlign = "left";
      g.font = "700 20px sans-serif";
      g.fillStyle = "#f2f5ff";
      g.fillText(`Score: ${Math.floor(score)}`, 16, 30);

      const barW = 160;
      g.font = "600 11px sans-serif";
      g.fillStyle = "rgba(255,255,255,0.75)";
      g.fillText("Oxygen", 16, 50);
      g.fillStyle = "rgba(0,0,0,0.5)";
      g.fillRect(16, 56, barW, 10);
      g.fillStyle = oxygen > 30 ? "#53e0ff" : "#ff5c5c";
      g.fillRect(16, 56, barW * (oxygen / OXYGEN_START), 10);
      if (oxygen <= 30 && running && !over) {
        g.globalAlpha = 0.6 + Math.sin(performance.now() / 130) * 0.35;
        g.fillStyle = "#ff5c5c";
        g.font = "700 13px sans-serif";
        g.fillText("Low Air!", 16, 80);
        g.globalAlpha = 1;
      }

      g.textAlign = "right";
      g.font = "600 11px sans-serif";
      g.fillStyle = "rgba(255,255,255,0.75)";
      g.fillText(`Depth: ${Math.floor(player.worldPos / 3)}m`, SCREEN_W - 16, 30);
    }

    function draw() {
      g.clearRect(0, 0, SCREEN_W, SCREEN_H);
      g.save();
      if (shakeTimer > 0) {
        const s = shakeTimer * 14;
        g.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      }
      drawWater();
      drawTrench();
      drawPickups();
      drawCreatures();
      drawPopups();
      drawDiver();
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
      ctx.setStatus(`Dive over — Score: ${Math.floor(score)}`);
      setTimeout(() => {
        ctx.showOverlay({
          title: "Out of Air!",
          subtitle: `Score: ${Math.floor(score)} · Depth: ${Math.floor(player.worldPos / 3)}m${isNewBest ? " · New Best!" : ` · Best: ${Math.max(Math.floor(score), best)}`}`,
          buttonText: "Dive Again",
          onButton: startGame,
        });
      }, 400);
    }

    function startGame() {
      resetState();
      running = true;
      over = false;
      ctx.setStatus("Go! Grab bubbles, dodge the wildlife.");
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
    ctx.setStatus("Ready to dive.");
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
