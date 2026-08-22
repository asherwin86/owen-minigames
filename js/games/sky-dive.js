MimiGames.register({
  id: "sky-dive",
  title: "Sky Dive 3D",
  emoji: "🪂",
  category: "Sports",
  tags: ["3D"],
  players: "1P",
  howTo: "A pseudo-3D freefall. Left/Right or A/D to drift and dodge birds, fly through 🟡 rings for bonus score. There's no braking — you're falling the whole way, and the ground rises to meet you. Your parachute opens automatically near the ground; how close you land to the target 🎯 at the center decides your landing bonus. Clip a bird and you'll tumble, losing a little control and costing time. Gamepad: D-pad left/right to drift (Start un-hides the controller cursor if you need it). Touch: drag left/right to drift.",
  init(root, ctx) {
    const SCREEN_W = 960, SCREEN_H = 600;
    const HORIZON_Y = SCREEN_H * 0.3;
    const CAM_HEIGHT = 90;
    const PROJECTION = 300;
    const CAMERA_BACK = 70;
    const NEAR_PLANE = 12;
    const FAR_DRAW_DISTANCE = 2600;

    const SKY_HALF_WIDTH = 240;
    const COURSE_LENGTH = 3200;
    const CHUTE_OPEN_AT = COURSE_LENGTH * 0.82;

    const SPEED_MAX = 380;
    const SPEED_MIN = 140;
    const FALL_ACCEL = 55;
    const CHUTE_DECEL = 340;
    const DRIFT_ACCEL = 300;
    const DRIFT_MAX_VX = 200;
    const DRIFT_DRAG_VX = 5.5;

    const COLLISION_RANGE = 26;
    const RING_RANGE = 40;
    const HIT_PENALTY = 1.1;
    const HIT_INVULN = 1.0;
    const RING_BONUS = 0.3;

    const SETTINGS_KEY = "skyDiveSettings";
    const DIFFICULTIES = {
      easy: { label: "Easy", label2: "Clear Skies", birdDensity: 0.7 },
      normal: { label: "Normal", label2: "Flight Path", birdDensity: 1 },
      hard: { label: "Hard", label2: "Storm Front", birdDensity: 1.5 },
    };
    const settings = Object.assign({ difficulty: "normal", soundEnabled: true }, ctx.storage.get(SETTINGS_KEY, {}));
    function saveSettings() { ctx.storage.set(SETTINGS_KEY, settings); }
    function playSound(name) { if (settings.soundEnabled) ctx.playSound(name); }
    function currentDiff() { return DIFFICULTIES[settings.difficulty]; }

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function clamp01(v) { return clamp(v, 0, 1); }
    function lerp(a, b, t) { return a + (b - a) * t; }

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
    canvas.style.background = "#3f7fd6";
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
    hint.textContent = "Left/Right = drift. Dodge birds, fly through rings, land near the target.";

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
    const leftBtn = touchBtn("◀");
    const rightBtn = touchBtn("▶");
    touchRow.append(leftBtn, rightBtn);

    const startBtn = document.createElement("button");
    startBtn.className = "btn primary";
    startBtn.textContent = "Jump";
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
        label: "Shave Time -5s",
        run: () => { raceTime = Math.max(0, raceTime - 5); },
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
      if (["ArrowLeft", "ArrowRight", "KeyA", "KeyD"].includes(code)) e.preventDefault();
      keys.add(code);
    }
    function onKeyup(e) { keys.delete(e.code); }
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("keyup", onKeyup);

    let touchLeftHeld = false, touchRightHeld = false;
    function heldLeft() { return keys.has("ArrowLeft") || keys.has("KeyA") || touchLeftHeld; }
    function heldRight() { return keys.has("ArrowRight") || keys.has("KeyD") || touchRightHeld; }

    function bindHold(el, onDown, onUp) {
      el.addEventListener("pointerdown", (e) => { e.preventDefault(); onDown(); });
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
      el.addEventListener("pointerleave", onUp);
    }
    bindHold(leftBtn, () => { touchLeftHeld = true; }, () => { touchLeftHeld = false; });
    bindHold(rightBtn, () => { touchRightHeld = true; }, () => { touchRightHeld = false; });

    // ============ state ============
    let running = false;
    let over = false;
    let raceTime = 0;
    let hits = 0;
    let ringsGrabbed = 0;
    let shakeTimer = 0;
    let popups = [];
    let birds = [];
    let rings = [];

    const player = {
      x: 0,
      vx: 0,
      worldPos: 0,
      speed: SPEED_MIN,
      lean: 0,
      invuln: 0,
      flash: 0,
    };

    function spawnPopup(worldZ, x, text, color) {
      popups.push({ worldZ, x, life: 1, maxLife: 1, text, color: color || "#fff" });
    }

    function chuteOpen() { return player.worldPos >= CHUTE_OPEN_AT; }

    function buildCourse() {
      const diff = currentDiff();
      birds = [];
      rings = [];
      const birdCount = Math.round(24 * diff.birdDensity);
      for (let i = 0; i < birdCount; i++) {
        const z = 300 + Math.random() * (CHUTE_OPEN_AT - 500);
        const x = (Math.random() * 2 - 1) * (SKY_HALF_WIDTH - 40);
        birds.push({ z, x, hit: false });
      }
      let rz = 260;
      while (rz < CHUTE_OPEN_AT - 200) {
        rings.push({ z: rz, x: (Math.random() * 2 - 1) * (SKY_HALF_WIDTH - 80), taken: false });
        rz += 260 + Math.random() * 220;
      }
    }

    function resetState() {
      raceTime = 0;
      hits = 0;
      ringsGrabbed = 0;
      shakeTimer = 0;
      popups = [];
      player.x = 0;
      player.vx = 0;
      player.worldPos = 0;
      player.speed = SPEED_MIN;
      player.lean = 0;
      player.invuln = 0;
      player.flash = 0;
      buildCourse();
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

    // ============ update ============
    function takeHit() {
      if (player.invuln > 0 || invincible) return;
      hits += 1;
      raceTime += HIT_PENALTY;
      player.invuln = HIT_INVULN;
      player.flash = HIT_INVULN;
      shakeTimer = 0.35;
      playSound("hit");
      ctx.setStatus(`Bird strike! +${HIT_PENALTY.toFixed(1)}s penalty.`);
    }

    function updateEntities() {
      birds.forEach((b) => {
        if (b.hit) return;
        if (player.invuln <= 0 && Math.abs(b.z - player.worldPos) < COLLISION_RANGE && Math.abs(b.x - player.x) < COLLISION_RANGE) {
          b.hit = true;
          takeHit();
        }
      });
      rings.forEach((r) => {
        if (r.taken) return;
        if (Math.abs(r.z - player.worldPos) < RING_RANGE && Math.abs(r.x - player.x) < RING_RANGE) {
          r.taken = true;
          ringsGrabbed += 1;
          raceTime = Math.max(0, raceTime - RING_BONUS);
          spawnPopup(r.z, r.x, `-${RING_BONUS.toFixed(1)}s Ring!`, "#53e0ff");
          playSound("tick");
        }
      });
    }

    function finishRun() {
      over = true;
      const landingError = Math.abs(player.x);
      const landingBonus = landingError < 20 ? "Bullseye!" : landingError < 60 ? "Good Landing" : landingError < 120 ? "Rough Landing" : "Off Target";
      const bonusTime = landingError < 20 ? 1.5 : landingError < 60 ? 0.8 : landingError < 120 ? 0.2 : 0;
      raceTime = Math.max(0, raceTime - bonusTime);
      const finalTime = raceTime;
      playSound(hits === 0 ? "success" : "lose");
      const best = ctx.storage.get("bestTime", null);
      const isNewBest = best === null || finalTime < best;
      if (isNewBest) ctx.storage.set("bestTime", finalTime);
      ctx.setStatus(`Landed — ${finalTime.toFixed(2)}s (${landingBonus})`);
      setTimeout(() => {
        ctx.showOverlay({
          title: landingBonus,
          subtitle: `Time: ${finalTime.toFixed(2)}s · Rings: ${ringsGrabbed} · Bird Strikes: ${hits}${isNewBest ? " · New Best!" : ` · Best: ${Math.min(finalTime, best).toFixed(2)}s`}`,
          buttonText: "Jump Again",
          onButton: startGame,
        });
      }, 400);
    }

    function update(dt) {
      if (!running) return;
      if (!over) {
        if (chuteOpen()) player.speed = Math.max(SPEED_MIN * 0.5, player.speed - CHUTE_DECEL * dt);
        else player.speed = Math.min(SPEED_MAX, player.speed + FALL_ACCEL * dt);

        if (!chuteOpen()) {
          if (heldLeft()) player.vx -= DRIFT_ACCEL * dt;
          if (heldRight()) player.vx += DRIFT_ACCEL * dt;
        }
        if (!heldLeft() && !heldRight()) player.vx = lerp(player.vx, 0, Math.min(1, dt * DRIFT_DRAG_VX));
        player.vx = clamp(player.vx, -DRIFT_MAX_VX, DRIFT_MAX_VX);
        player.lean = lerp(player.lean, clamp(player.vx / DRIFT_MAX_VX, -1, 1), Math.min(1, dt * 8));

        player.worldPos += player.speed * dt;
        player.x += player.vx * dt;
        player.x = clamp(player.x, -SKY_HALF_WIDTH, SKY_HALF_WIDTH);

        raceTime += dt;
        updateEntities();

        if (player.worldPos >= COURSE_LENGTH) finishRun();
      }
      if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);
      if (player.flash > 0) player.flash = Math.max(0, player.flash - dt);
      if (shakeTimer > 0) shakeTimer = Math.max(0, shakeTimer - dt);
      popups.forEach((p) => { p.life -= dt / p.maxLife; });
      popups = popups.filter((p) => p.life > 0);
    }

    // ============ draw ============
    function drawSky() {
      const groundFrac = clamp01((player.worldPos - CHUTE_OPEN_AT * 0.4) / (COURSE_LENGTH - CHUTE_OPEN_AT * 0.4));
      const grad = g.createLinearGradient(0, 0, 0, SCREEN_H);
      grad.addColorStop(0, "#2d6fc4");
      grad.addColorStop(0.55, `rgba(255,220,170,${0.2 + groundFrac * 0.5})`);
      grad.addColorStop(1, "#7fb864");
      g.fillStyle = grad;
      g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      g.fillStyle = "rgba(255,255,255,0.5)";
      for (let i = 0; i < 8; i++) {
        const cx = (i * 210 - player.worldPos * 0.05) % (SCREEN_W + 200) - 100;
        const cy = 60 + (i % 3) * 40;
        g.beginPath();
        g.ellipse(cx, cy, 50, 16, 0, 0, Math.PI * 2);
        g.fill();
      }
    }

    function drawGround() {
      const nearZ = player.worldPos - CAMERA_BACK + NEAR_PLANE;
      const farZ = player.worldPos - CAMERA_BACK + FAR_DRAW_DISTANCE;
      const groundHeight = -300 + (player.worldPos / COURSE_LENGTH) * 300;
      const nearL = project(-SKY_HALF_WIDTH - 200, nearZ, groundHeight);
      const nearR = project(SKY_HALF_WIDTH + 200, nearZ, groundHeight);
      const farL = project(-SKY_HALF_WIDTH - 200, farZ, groundHeight);
      const farR = project(SKY_HALF_WIDTH + 200, farZ, groundHeight);
      g.fillStyle = "#4a7c3d";
      g.beginPath();
      g.moveTo(nearL.x, nearL.y); g.lineTo(farL.x, farL.y); g.lineTo(farR.x, farR.y); g.lineTo(nearR.x, nearR.y);
      g.closePath(); g.fill();

      // landing target zone, only meaningfully visible once relatively close
      const targetP = project(0, COURSE_LENGTH, groundHeight);
      if (targetP.forward > NEAR_PLANE && targetP.forward < FAR_DRAW_DISTANCE) {
        const size = Math.max(14, 70 * targetP.scale);
        g.save();
        g.globalAlpha = clamp01(targetP.scale * 2);
        g.font = `${size}px sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("🎯", targetP.x, targetP.y);
        g.restore();
      }
    }

    function drawBirds() {
      const sorted = birds.slice().sort((a, b) => (b.z - a.z));
      sorted.forEach((b) => {
        if (b.hit) return;
        const forward = b.z - (player.worldPos - CAMERA_BACK);
        if (forward < NEAR_PLANE * 0.5 || forward > FAR_DRAW_DISTANCE) return;
        const p = project(b.x, b.z, 0);
        const size = Math.max(10, 36 * p.scale);
        g.save();
        g.globalAlpha = clamp01(p.scale * 3);
        g.font = `${size}px sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("🐦", p.x, p.y);
        g.restore();
      });
    }

    function drawRings() {
      rings.forEach((r) => {
        if (r.taken) return;
        const forward = r.z - (player.worldPos - CAMERA_BACK);
        if (forward < NEAR_PLANE * 0.5 || forward > FAR_DRAW_DISTANCE) return;
        const p = project(r.x, r.z, 0);
        const size = Math.max(10, 40 * p.scale);
        g.save();
        g.globalAlpha = clamp01(p.scale * 3);
        g.font = `${size}px sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("🟡", p.x, p.y);
        g.restore();
      });
    }

    function drawPopups() {
      popups.forEach((p) => {
        const proj = project(p.x, p.worldZ, 30);
        g.globalAlpha = clamp01(p.life);
        g.fillStyle = p.color;
        g.font = "700 15px sans-serif";
        g.textAlign = "center";
        g.fillText(p.text, proj.x, proj.y - p.life * 20);
        g.globalAlpha = 1;
      });
    }

    function drawDiver() {
      const p = project(player.x, player.worldPos, 0);
      const blink = player.flash > 0 && Math.floor(player.flash * 10) % 2 === 0;
      if (blink) return;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(player.lean * 0.22);
      g.font = `${Math.max(30, 60 * p.scale)}px sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(chuteOpen() ? "🪂" : "🤸", 0, 0);
      g.restore();
    }

    function drawHud() {
      g.textAlign = "left";
      g.font = "700 20px sans-serif";
      g.fillStyle = "#fff";
      g.fillText(`${raceTime.toFixed(2)}s`, 16, 30);

      const barW = 200;
      const progFrac = clamp01(player.worldPos / COURSE_LENGTH);
      g.font = "600 11px sans-serif";
      g.fillStyle = "rgba(255,255,255,0.85)";
      g.fillText(chuteOpen() ? "Chute Open" : "Altitude", 16, 50);
      g.fillStyle = "rgba(0,0,0,0.4)";
      g.fillRect(16, 56, barW, 10);
      g.fillStyle = chuteOpen() ? "#ffd166" : "#53e0ff";
      g.fillRect(16, 56, barW * progFrac, 10);

      g.textAlign = "right";
      g.font = "600 13px sans-serif";
      g.fillStyle = "rgba(255,255,255,0.9)";
      g.fillText(`Rings: ${ringsGrabbed}`, SCREEN_W - 16, 30);
      g.fillText(`Strikes: ${hits}`, SCREEN_W - 16, 50);
    }

    function draw() {
      g.clearRect(0, 0, SCREEN_W, SCREEN_H);
      g.save();
      if (shakeTimer > 0) {
        const s = shakeTimer * 14;
        g.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      }
      drawSky();
      drawGround();
      drawRings();
      drawBirds();
      drawPopups();
      drawDiver();
      if (running) drawHud();
      if (!running) {
        g.fillStyle = "rgba(10,20,45,0.25)";
        g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      }
      g.restore();
    }

    // ============ lifecycle ============
    function startGame() {
      resetState();
      running = true;
      over = false;
      ctx.setStatus("Go! Dodge the birds, grab the rings, stick the landing.");
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
    ctx.setStatus("Ready at the door.");
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
