MimiGames.register({
  id: "bike-rush",
  title: "Bike Rush",
  emoji: "🏍️",
  category: "Action",
  tags: ["3D"],
  players: "1P",
  howTo: "A pseudo-3D highway dash. Hold Up/W to gun the throttle, Down/S to brake, and Left/Right or A/D to swap lanes and dodge traffic. Gamepad: D-pad up to accelerate, D-pad left/right to change lanes (Start un-hides the controller cursor if you need it). Your score builds every second based on how fast you're going — floor it and you rack up points fast, but coast along slow and you'll barely earn anything (watch for the \"Too Slow!\" warning). Clip a car and you'll spin out — lose speed, lose a life, and get a moment of flashing invulnerability to recover. Squeeze past a car in the next lane over for a near-miss bonus. Three crashes and it's game over. Touch: ◀ ▶ to change lanes, hold GAS to accelerate.",
  init(root, ctx) {
    const SCREEN_W = 960, SCREEN_H = 600;
    const HORIZON_Y = SCREEN_H * 0.38;
    // CAM_HEIGHT is tuned so that an object sitting exactly CAMERA_BACK away
    // (i.e. right where the player's own bike always renders) lands well
    // inside the canvas — get this wrong and both the bike sprite and any
    // traffic closing in on it project below the visible screen and vanish
    // right as they matter most, the same class of bug the road projection
    // below already has to guard against.
    const CAM_HEIGHT = 76;
    const PROJECTION = 300;
    const CAMERA_BACK = 70; // player always sits this far "in front" of the camera
    const NEAR_PLANE = 12;
    const FAR_DRAW_DISTANCE = 2600;

    const LANE_COUNT = 3;
    const LANE_WIDTH = 78;
    const ROAD_HALF_WIDTH = (LANE_COUNT / 2) * LANE_WIDTH;
    const SHOULDER_EXTRA = 46;

    const SPEED_MAX = 420;
    const SPEED_MIN = 40;
    const ACCEL = 240;
    const COAST_DRAG = 90;
    const BRAKE_DECEL = 300;
    const SLOW_THRESHOLD = SPEED_MAX * 0.45;

    const COLLISION_RANGE = 26;
    const NEAR_MISS_RANGE = 55;
    const DESPAWN_BEHIND = -110;
    const SPAWN_AHEAD = 1500;
    const MIN_LANE_GAP = 260;
    const CRASH_INVULN = 1.6;
    const LIVES_START = 3;

    const CAR_EMOJI = ["🚗", "🚙", "🚕", "🚐", "🚚", "🚌"];
    // traffic doesn't just make engine noise — each lane rings its own note
    // (a C major triad) the moment a car passes the player, so the flow of
    // traffic itself becomes a loose, generative little melody
    const MUSIC_SCALE = [523.25, 659.25, 783.99]; // C5, E5, G5, one per lane

    const SETTINGS_KEY = "bikeRushSettings";
    const DIFFICULTIES = {
      easy: { label: "Easy", spawnInterval: 1.7, speedRange: [70, 140], label2: "Light Traffic" },
      normal: { label: "Normal", spawnInterval: 1.2, speedRange: [90, 175], label2: "Rush Hour" },
      hard: { label: "Hard", spawnInterval: 0.85, speedRange: [110, 205], label2: "Gridlock Sprint" },
    };
    const settings = Object.assign({ difficulty: "normal", soundEnabled: true }, ctx.storage.get(SETTINGS_KEY, {}));
    function saveSettings() { ctx.storage.set(SETTINGS_KEY, settings); }
    function playSound(name) { if (settings.soundEnabled) ctx.playSound(name); }
    function currentDiff() { return DIFFICULTIES[settings.difficulty]; }

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function clamp01(v) { return clamp(v, 0, 1); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function laneWorldX(lane) { return (lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH; }

    // ============ engine sound ============
    // Two persistent oscillators (not the one-shot ctx.tone beeps used
    // elsewhere) — the bike and the nearest car both need continuous, pitch-
    // shifting noise because they're moving, not a discrete "event" sound.
    // The cars' actual musical notes (see MUSIC_SCALE above) are separate
    // one-shots fired when a car is passed, layered on top of this drone.
    let audioCtx = null;
    let bikeOsc = null, bikeGain = null;
    let trafficOsc = null, trafficGain = null;
    function getAudioCtx() {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      return audioCtx;
    }
    function startEngineSound() {
      if (bikeOsc) return; // already running
      try {
        const ac = getAudioCtx();
        bikeOsc = ac.createOscillator();
        bikeGain = ac.createGain();
        bikeOsc.type = "sawtooth";
        bikeGain.gain.value = 0;
        bikeOsc.connect(bikeGain);
        bikeGain.connect(ac.destination);
        bikeOsc.start();

        trafficOsc = ac.createOscillator();
        trafficGain = ac.createGain();
        trafficOsc.type = "triangle";
        trafficGain.gain.value = 0;
        trafficOsc.connect(trafficGain);
        trafficGain.connect(ac.destination);
        trafficOsc.start();
      } catch (e) { /* audio not available */ }
    }
    function stopEngineSound() {
      [bikeOsc, trafficOsc].forEach((osc) => { try { osc?.stop(); } catch (e) { /* already stopped */ } });
      bikeOsc = bikeGain = trafficOsc = trafficGain = null;
    }
    // the bike's own engine note pitches up with speed (moving = sound);
    // a second drone tracks whichever car is currently closest, so oncoming
    // traffic audibly grows louder/nearer instead of appearing silently
    function updateEngineSound() {
      if (!bikeOsc || !audioCtx) return;
      const ac = audioCtx;
      const on = settings.soundEnabled && running && !over;
      const speedFrac = clamp01((player.speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN));
      bikeOsc.frequency.setTargetAtTime(70 + speedFrac * 170, ac.currentTime, 0.05);
      bikeGain.gain.setTargetAtTime(on ? 0.03 + speedFrac * 0.05 : 0, ac.currentTime, 0.1);

      let nearest = null, nearestDist = Infinity;
      traffic.forEach((o) => {
        const d = Math.abs(o.worldZ - player.worldPos);
        if (d < nearestDist) { nearestDist = d; nearest = o; }
      });
      if (on && nearest && nearestDist < 480) {
        trafficOsc.frequency.setTargetAtTime(55 + nearest.speed * 0.35, ac.currentTime, 0.12);
        trafficGain.gain.setTargetAtTime(clamp01(1 - nearestDist / 480) * 0.055, ac.currentTime, 0.1);
      } else {
        trafficGain.gain.setTargetAtTime(0, ac.currentTime, 0.15);
      }
    }

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
    canvas.style.background = "#1a1a2e";
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
    hint.textContent = "Up/W = gas, Down/S = brake, Left/Right or A/D = change lanes. Speed = points. Don't hit traffic.";

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
    const gasBtn = touchBtn("🏍️ GAS");
    const laneRightBtn = touchBtn("▶");
    touchRow.append(laneLeftBtn, gasBtn, laneRightBtn);

    const startBtn = document.createElement("button");
    startBtn.className = "btn primary";
    startBtn.textContent = "Start Ride";
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
      }
      keys.add(code);
    }
    function onKeyup(e) { keys.delete(e.code); }
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("keyup", onKeyup);

    function heldAccelerate() { return keys.has("ArrowUp") || keys.has("KeyW") || touchGasHeld; }
    function heldBrake() { return keys.has("ArrowDown") || keys.has("KeyS"); }

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

    function changeLane(dir) {
      if (!running || over) return;
      player.targetLane = clamp(player.targetLane + dir, 0, LANE_COUNT - 1);
      playSound("click");
    }

    // ============ state ============
    let running = false;
    let over = false;
    let invincible = false;
    let score = 0;
    let scoreAccum = 0;
    let lives = LIVES_START;
    let bestSpeed = 0;
    let shakeTimer = 0;
    let spawnTimer = 2;
    let traffic = [];
    let popups = [];

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

    function spawnPopup(worldZ, lane, text, color) {
      popups.push({ worldZ, lane, life: 1, maxLife: 1, text, color: color || "#fff" });
    }

    function resetState() {
      score = 0;
      scoreAccum = 0;
      lives = LIVES_START;
      bestSpeed = 0;
      shakeTimer = 0;
      spawnTimer = 2;
      traffic = [];
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
    // Straight road: camera always trails the player by CAMERA_BACK along the
    // track, forward direction never rotates, so edges/lanes project as
    // simple converging lines to a fixed vanishing point — no curve sampling
    // needed. depth is floored (not rejected) so nothing near the camera can
    // ever fail to project and vanish, the lesson from Kart Circuit's road
    // rendering — the same class of bug is trivially possible here too since
    // traffic sits right where the player is by design.
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

    // ============ traffic ============
    function trySpawnTraffic() {
      const diff = currentDiff();
      const lane = Math.floor(Math.random() * LANE_COUNT);
      const spawnZ = player.worldPos + SPAWN_AHEAD + Math.random() * 200;
      const blocked = traffic.some((o) => o.lane === lane && Math.abs(o.worldZ - spawnZ) < MIN_LANE_GAP);
      if (blocked) return;
      traffic.push({
        lane,
        worldZ: spawnZ,
        speed: lerp(diff.speedRange[0], diff.speedRange[1], Math.random()),
        emoji: CAR_EMOJI[Math.floor(Math.random() * CAR_EMOJI.length)],
        nearMissDone: false,
        notePlayed: false,
      });
    }

    function crash(obj) {
      lives -= 1;
      player.speed = Math.max(SPEED_MIN, player.speed * 0.32);
      player.invuln = CRASH_INVULN;
      player.flash = CRASH_INVULN;
      shakeTimer = 0.4;
      obj.worldZ -= 220; // shove it out of immediate re-collision range
      playSound("hit");
      ctx.setStatus(`Crash! ${lives} ${lives === 1 ? "life" : "lives"} left.`);
      if (lives <= 0) endGame();
    }

    function updateTraffic(dt) {
      const diff = currentDiff();
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        trySpawnTraffic();
        spawnTimer = diff.spawnInterval * (0.8 + Math.random() * 0.4);
      }
      traffic.forEach((o) => { o.worldZ += o.speed * dt; });
      traffic = traffic.filter((o) => o.worldZ - player.worldPos > DESPAWN_BEHIND);

      if (!running || over) return;
      traffic.forEach((o) => {
        const rel = o.worldZ - player.worldPos;
        if (!o.nearMissDone && Math.abs(rel) < NEAR_MISS_RANGE && Math.abs(o.lane - player.targetLane) === 1) {
          o.nearMissDone = true;
          score += 12;
          spawnPopup(o.worldZ, o.lane, "+12 Near Miss!", "#53e0ff");
          playSound("tick");
        }
        // the car "sings" its lane's note the instant it's overtaken/passed —
        // this is the traffic's music, distinct from the plain engine noise
        if (!o.notePlayed && rel <= 0) {
          o.notePlayed = true;
          if (settings.soundEnabled) ctx.tone.beep(MUSIC_SCALE[o.lane], 0.24, "triangle", 0.05);
        }
        if (!invincible && player.invuln <= 0 && Math.abs(rel) < COLLISION_RANGE && o.lane === player.targetLane) {
          crash(o);
        }
      });
    }

    // ============ update ============
    function updateScore(dt) {
      const speed = player.speed;
      let rate;
      if (speed < SLOW_THRESHOLD) rate = 1 + (speed / SLOW_THRESHOLD) * 3;
      else rate = 4 + ((speed - SLOW_THRESHOLD) / (SPEED_MAX - SLOW_THRESHOLD)) * 26;
      scoreAccum += rate * dt;
      while (scoreAccum >= 1) { score += 1; scoreAccum -= 1; }
    }

    function update(dt) {
      if (!running) return;
      if (!over) {
        if (heldAccelerate()) player.speed += ACCEL * dt;
        else if (heldBrake()) player.speed -= BRAKE_DECEL * dt;
        else player.speed -= COAST_DRAG * dt;
        player.speed = clamp(player.speed, SPEED_MIN, SPEED_MAX);
        bestSpeed = Math.max(bestSpeed, player.speed);

        player.worldPos += player.speed * dt;
        const targetX = laneWorldX(player.targetLane);
        player.laneX = lerp(player.laneX, targetX, Math.min(1, dt * 9));
        player.lean = lerp(player.lean, clamp((targetX - player.laneX) / LANE_WIDTH, -1, 1), Math.min(1, dt * 10));
        player.lane = player.targetLane;

        updateScore(dt);
      }
      updateTraffic(dt);
      updateEngineSound();
      if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);
      if (player.flash > 0) player.flash = Math.max(0, player.flash - dt);
      if (shakeTimer > 0) shakeTimer = Math.max(0, shakeTimer - dt);
      popups.forEach((p) => { p.life -= dt / p.maxLife; });
      popups = popups.filter((p) => p.life > 0);
    }

    // ============ draw ============
    function drawSky() {
      const grad = g.createLinearGradient(0, 0, 0, HORIZON_Y);
      grad.addColorStop(0, "#2b1055");
      grad.addColorStop(1, "#ff7a5c");
      g.fillStyle = grad;
      g.fillRect(0, 0, SCREEN_W, HORIZON_Y);
      g.fillStyle = "rgba(255,230,150,0.85)";
      g.beginPath();
      g.arc(SCREEN_W * 0.78, HORIZON_Y * 0.45, 40, 0, Math.PI * 2);
      g.fill();
      // distant skyline silhouette, gently parallax-scrolling with distance traveled
      g.fillStyle = "rgba(20,10,40,0.55)";
      const parallax = (player.worldPos * 0.03) % 120;
      for (let i = -1; i < 10; i++) {
        const bx = i * 120 - parallax;
        const bh = 30 + (((i * 37) % 60) + 60) % 60;
        g.fillRect(bx, HORIZON_Y - bh, 70, bh);
      }
      g.fillStyle = "#231536";
      g.fillRect(0, HORIZON_Y, SCREEN_W, SCREEN_H - HORIZON_Y);
    }

    function drawRoad() {
      const nearZ = player.worldPos - CAMERA_BACK + NEAR_PLANE;
      const farZ = player.worldPos - CAMERA_BACK + FAR_DRAW_DISTANCE;
      const nearL = project(-ROAD_HALF_WIDTH - SHOULDER_EXTRA, nearZ, 0);
      const nearR = project(ROAD_HALF_WIDTH + SHOULDER_EXTRA, nearZ, 0);
      const farL = project(-ROAD_HALF_WIDTH - SHOULDER_EXTRA, farZ, 0);
      const farR = project(ROAD_HALF_WIDTH + SHOULDER_EXTRA, farZ, 0);
      g.fillStyle = "#2f6b3c";
      g.beginPath();
      g.moveTo(nearL.x, nearL.y); g.lineTo(farL.x, farL.y); g.lineTo(farR.x, farR.y); g.lineTo(nearR.x, nearR.y);
      g.closePath(); g.fill();

      const roadNearL = project(-ROAD_HALF_WIDTH, nearZ, 0);
      const roadNearR = project(ROAD_HALF_WIDTH, nearZ, 0);
      const roadFarL = project(-ROAD_HALF_WIDTH, farZ, 0);
      const roadFarR = project(ROAD_HALF_WIDTH, farZ, 0);
      g.fillStyle = "#38394a";
      g.beginPath();
      g.moveTo(roadNearL.x, roadNearL.y); g.lineTo(roadFarL.x, roadFarL.y); g.lineTo(roadFarR.x, roadFarR.y); g.lineTo(roadNearR.x, roadNearR.y);
      g.closePath(); g.fill();

      // outer edge curbs
      g.strokeStyle = "#ffd166";
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(roadNearL.x, roadNearL.y); g.lineTo(roadFarL.x, roadFarL.y); g.stroke();
      g.beginPath(); g.moveTo(roadNearR.x, roadNearR.y); g.lineTo(roadFarR.x, roadFarR.y); g.stroke();

      // dashed lane dividers, scrolling toward the camera
      const dashSpacing = 90;
      const offset = player.worldPos % dashSpacing;
      for (let laneEdge = 1; laneEdge < LANE_COUNT; laneEdge += 1) {
        const dividerX = -ROAD_HALF_WIDTH + laneEdge * LANE_WIDTH;
        for (let i = 0; i < 26; i += 1) {
          const zAbs = player.worldPos - CAMERA_BACK + NEAR_PLANE + 20 + i * dashSpacing - offset;
          if (zAbs - (player.worldPos - CAMERA_BACK) < NEAR_PLANE) continue;
          const p = project(dividerX, zAbs, 0);
          if (p.scale < 0.02) continue;
          const w = Math.max(1, 5 * p.scale), h = Math.max(1, 22 * p.scale);
          g.fillStyle = "rgba(255,255,255,0.85)";
          g.fillRect(p.x - w / 2, p.y - h / 2, w, h);
        }
      }
    }

    function drawScenery() {
      const spacing = 260;
      const offset = player.worldPos % spacing;
      for (let i = 0; i < 14; i += 1) {
        const zAbs = player.worldPos - CAMERA_BACK + 60 + i * spacing - offset;
        const forward = zAbs - (player.worldPos - CAMERA_BACK);
        if (forward < NEAR_PLANE || forward > FAR_DRAW_DISTANCE) continue;
        const seed = Math.floor((zAbs) / spacing);
        const side = seed % 2 === 0 ? -1 : 1;
        const worldX = side * (ROAD_HALF_WIDTH + SHOULDER_EXTRA + 30 + (seed % 3) * 14);
        const p = project(worldX, zAbs, 0);
        if (p.scale < 0.03) continue;
        const emoji = seed % 3 === 0 ? "🏢" : seed % 3 === 1 ? "🌲" : "🌴";
        g.font = `${Math.max(8, 30 * p.scale)}px sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "bottom";
        g.fillText(emoji, p.x, p.y);
      }
    }

    function drawTraffic() {
      const sorted = traffic.slice().sort((a, b) => (b.worldZ - a.worldZ));
      sorted.forEach((o) => {
        const forward = o.worldZ - (player.worldPos - CAMERA_BACK);
        if (forward < NEAR_PLANE * 0.5 || forward > FAR_DRAW_DISTANCE) return;
        const worldX = laneWorldX(o.lane);
        const p = project(worldX, o.worldZ, 0);
        const size = Math.max(10, 46 * p.scale);
        g.save();
        g.globalAlpha = clamp01(p.scale * 3);
        g.font = `${size}px sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "bottom";
        g.fillText(o.emoji, p.x, p.y + size * 0.12);
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

    function drawBike() {
      // the player always sits exactly CAMERA_BACK ahead of the camera, so
      // this projects to a fixed near screen position every frame — only
      // laneX (and lean) move it left/right during a lane change
      const p = project(player.laneX, player.worldPos, 0);
      const blink = player.flash > 0 && Math.floor(player.flash * 10) % 2 === 0;
      if (blink) return;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(player.lean * 0.28);
      g.font = `${Math.max(30, 62 * p.scale)}px sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "bottom";
      g.fillText("🏍️", 0, 6);
      g.restore();
    }

    function drawHud() {
      g.textAlign = "left";
      g.font = "700 20px sans-serif";
      g.fillStyle = "#f2f5ff";
      g.fillText(`Score: ${score}`, 16, 30);

      // speed gauge
      const barW = 160;
      const speedFrac = clamp01((player.speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN));
      g.font = "600 11px sans-serif";
      g.fillStyle = "rgba(255,255,255,0.75)";
      g.fillText("Speed", 16, 50);
      g.fillStyle = "rgba(0,0,0,0.5)";
      g.fillRect(16, 56, barW, 10);
      g.fillStyle = player.speed < SLOW_THRESHOLD ? "#ff9f43" : "#9bff8f";
      g.fillRect(16, 56, barW * speedFrac, 10);
      g.fillStyle = "rgba(255,255,255,0.8)";
      g.font = "600 11px sans-serif";
      g.fillText(`${Math.round(player.speed)} km/h`, 16, 80);

      if (player.speed < SLOW_THRESHOLD && running && !over) {
        g.globalAlpha = 0.6 + Math.sin(performance.now() / 130) * 0.35;
        g.fillStyle = "#ff9f43";
        g.font = "700 13px sans-serif";
        g.fillText("Too Slow! ⤴ speed up for more points", 16, 98);
        g.globalAlpha = 1;
      }

      // lives, top-right
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
      // Even before "Start Ride" is clicked, show a real (dimmed) preview of
      // the road/scenery/bike instead of a flat black rectangle — a static
      // sky-only screen reads as broken/2D, not as a paused 3D game.
      drawSky();
      drawRoad();
      drawScenery();
      if (running) {
        drawTraffic();
        drawPopups();
      }
      drawBike();
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
      if (isNewBest) ctx.storage.set("bestScore", score);
      ctx.setStatus(`Ride over — Score: ${score}`);
      setTimeout(() => {
        ctx.showOverlay({
          title: "Wiped Out!",
          subtitle: `Score: ${score} · Distance: ${Math.floor(player.worldPos / 3)}m · Top speed: ${Math.round(bestSpeed)} km/h${isNewBest ? " · New Best!" : ` · Best: ${Math.max(score, best)}`}`,
          buttonText: "Ride Again",
          onButton: startGame,
        });
      }, 400);
    }

    function startGame() {
      resetState();
      running = true;
      over = false;
      startEngineSound(); // Start Ride click is a real user gesture — safe to create/resume the AudioContext here
      ctx.setStatus("Go! Speed up for points, dodge the traffic.");
    }

    let lastTime = 0;
    let rafId = null;
    function loop(now) {
      const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0.016;
      lastTime = now;
      update(dt);
      draw();
      // this game reads the gamepad itself while riding — keep the hub's
      // site-wide gamepad cursor (js/pad-cursor.js) out of the way so it
      // doesn't drift across the road on top of active gameplay
      window.MimiPadCursor?.setSuppressed(running && !over);
      rafId = requestAnimationFrame(loop);
    }

    running = false; over = false;
    resetState();
    draw();
    ctx.setStatus("Ready to ride.");
    rafId = requestAnimationFrame(loop);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.MimiPadCursor?.setSuppressed(false);
      stopEngineSound();
      if (isFullscreenActive()) (document.exitFullscreen?.() || document.webkitExitFullscreen?.());
      document.removeEventListener("keydown", onKeydown);
      document.removeEventListener("keyup", onKeyup);
      document.removeEventListener("fullscreenchange", syncFullscreenBtn);
      document.removeEventListener("webkitfullscreenchange", syncFullscreenBtn);
      window.removeEventListener("resize", resizeCanvasForFullscreen);
    };
  },
});
