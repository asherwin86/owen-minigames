MimiGames.register({
  id: "bobsled-run",
  title: "Bobsled Run 3D",
  emoji: "🛷",
  category: "Sports",
  tags: ["3D"],
  players: "1P",
  howTo: "A pseudo-3D bobsled chute time trial. Left/Right or A/D to steer, no input to keep sliding — this track only speeds up. Stay off the icy chute walls; clipping one bounces you back and costs time. Hit a ⚡ boost pad for a burst of speed, but watch for pale ❄️ ice patches — your steering goes twitchy and less responsive while sliding over one. Reach the finish banner as fast as you can. Gamepad: D-pad left/right to steer (Start un-hides the controller cursor if you need it). Touch: drag left/right to steer.",
  init(root, ctx) {
    const SCREEN_W = 960, SCREEN_H = 600;
    const HORIZON_Y = SCREEN_H * 0.34;
    const CAM_HEIGHT = 64;
    const PROJECTION = 300;
    const CAMERA_BACK = 70;
    const NEAR_PLANE = 12;
    const FAR_DRAW_DISTANCE = 2400;

    const CHUTE_HALF_WIDTH = 150;
    const COURSE_LENGTH = 3400;

    const SPEED_MAX = 440;
    const SPEED_MIN = 120;
    const GRAVITY_ACCEL = 105;
    const TURN_ACCEL = 380;
    const TURN_MAX_VX = 210;
    const TURN_DRAG_VX = 5;
    const BOOST_KICK = 90;

    const WALL_BUMP_PENALTY = 1.0;
    const WALL_INVULN = 0.6;
    const BOOST_COOLDOWN_RADIUS = 24;
    const ICE_TURN_SCALE = 0.4;

    const SETTINGS_KEY = "bobsledRunSettings";
    const DIFFICULTIES = {
      easy: { label: "Easy", label2: "Practice Chute", iceDensity: 0.6 },
      normal: { label: "Normal", label2: "Olympic Run", iceDensity: 1 },
      hard: { label: "Hard", label2: "Black Ice", iceDensity: 1.5 },
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
    canvas.style.background = "#c9e4f5";
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
    hint.textContent = "Left/Right = steer. Stay off the walls, grab boosts, watch for ice.";

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
    startBtn.textContent = "Push Off";
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
      { label: "Speed Boost", run: () => { player.speed = SPEED_MAX; } },
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
    let invincible = false;
    let raceTime = 0;
    let bumps = 0;
    let boostsGrabbed = 0;
    let shakeTimer = 0;
    let popups = [];
    let boosts = [];
    let icePatches = [];

    const player = {
      x: 0,
      vx: 0,
      worldPos: 0,
      speed: 160,
      lean: 0,
      invuln: 0,
      flash: 0,
    };

    function spawnPopup(worldZ, x, text, color) {
      popups.push({ worldZ, x, life: 1, maxLife: 1, text, color: color || "#fff" });
    }

    function onIcePatch() {
      return icePatches.some((ice) => player.worldPos >= ice.zStart && player.worldPos <= ice.zEnd);
    }

    function buildCourse() {
      const diff = currentDiff();
      boosts = [];
      icePatches = [];
      let bz = 400;
      while (bz < COURSE_LENGTH - 300) {
        boosts.push({ z: bz, x: (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 60), taken: false });
        bz += 500 + Math.random() * 400;
      }
      let iz = 350;
      const iceCount = Math.round(6 * diff.iceDensity);
      for (let i = 0; i < iceCount; i++) {
        const zStart = iz;
        const zEnd = zStart + 140 + Math.random() * 100;
        icePatches.push({ zStart, zEnd });
        iz = zEnd + 250 + Math.random() * 250;
        if (iz > COURSE_LENGTH - 300) break;
      }
    }

    function resetState() {
      raceTime = 0;
      bumps = 0;
      boostsGrabbed = 0;
      shakeTimer = 0;
      popups = [];
      player.x = 0;
      player.vx = 0;
      player.worldPos = 0;
      player.speed = 160;
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
    function wallBump() {
      if (player.invuln > 0 || invincible) return;
      bumps += 1;
      raceTime += WALL_BUMP_PENALTY;
      player.vx *= -0.5;
      player.speed = Math.max(SPEED_MIN, player.speed * 0.7);
      player.invuln = WALL_INVULN;
      player.flash = WALL_INVULN;
      shakeTimer = 0.35;
      playSound("hit");
      ctx.setStatus(`Wall bump! +${WALL_BUMP_PENALTY.toFixed(1)}s penalty.`);
    }

    function updatePickups() {
      boosts.forEach((b) => {
        if (b.taken) return;
        if (Math.abs(b.z - player.worldPos) < BOOST_COOLDOWN_RADIUS && Math.abs(b.x - player.x) < 45) {
          b.taken = true;
          boostsGrabbed += 1;
          player.speed = Math.min(SPEED_MAX, player.speed + BOOST_KICK);
          spawnPopup(b.z, b.x, "+Boost!", "#7ee81c");
          playSound("powerUp");
        }
      });
    }

    function finishRun() {
      over = true;
      const finalTime = raceTime;
      playSound(bumps === 0 ? "success" : "lose");
      const best = ctx.storage.get("bestTime", null);
      const isNewBest = best === null || finalTime < best;
      if (isNewBest) ctx.storage.set("bestTime", finalTime);
      ctx.setStatus(`Finished — ${finalTime.toFixed(2)}s`);
      setTimeout(() => {
        ctx.showOverlay({
          title: "Finish!",
          subtitle: `Time: ${finalTime.toFixed(2)}s · Boosts: ${boostsGrabbed} · Wall Bumps: ${bumps}${isNewBest ? " · New Best!" : ` · Best: ${Math.min(finalTime, best).toFixed(2)}s`}`,
          buttonText: "Run Again",
          onButton: startGame,
        });
      }, 400);
    }

    function update(dt) {
      if (!running) return;
      if (!over) {
        player.speed += GRAVITY_ACCEL * dt;
        player.speed = clamp(player.speed, SPEED_MIN, SPEED_MAX);

        const icy = onIcePatch();
        const turnScale = icy ? ICE_TURN_SCALE : 1;
        if (heldLeft()) player.vx -= TURN_ACCEL * turnScale * dt;
        if (heldRight()) player.vx += TURN_ACCEL * turnScale * dt;
        if (!heldLeft() && !heldRight()) player.vx = lerp(player.vx, 0, Math.min(1, dt * TURN_DRAG_VX));
        if (icy) player.vx += Math.sin(performance.now() / 90 + player.worldPos) * 26 * dt;
        player.vx = clamp(player.vx, -TURN_MAX_VX, TURN_MAX_VX);
        player.lean = lerp(player.lean, clamp(player.vx / TURN_MAX_VX, -1, 1), Math.min(1, dt * 9));

        player.worldPos += player.speed * dt;
        player.x += player.vx * dt;
        if (player.x <= -CHUTE_HALF_WIDTH + 16) { player.x = -CHUTE_HALF_WIDTH + 16; wallBump(); }
        if (player.x >= CHUTE_HALF_WIDTH - 16) { player.x = CHUTE_HALF_WIDTH - 16; wallBump(); }

        raceTime += dt;
        updatePickups();

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
      const grad = g.createLinearGradient(0, 0, 0, HORIZON_Y);
      grad.addColorStop(0, "#8fc6ea");
      grad.addColorStop(1, "#e8f4fb");
      g.fillStyle = grad;
      g.fillRect(0, 0, SCREEN_W, HORIZON_Y);
      g.fillStyle = "rgba(255,255,255,0.85)";
      const parallax = (player.worldPos * 0.02) % 150;
      for (let i = -1; i < 8; i++) {
        const bx = i * 150 - parallax;
        const peakH = 34 + (((i * 43) % 46) + 46) % 46;
        g.beginPath();
        g.moveTo(bx, HORIZON_Y);
        g.lineTo(bx + 85, HORIZON_Y - peakH);
        g.lineTo(bx + 170, HORIZON_Y);
        g.closePath();
        g.fill();
      }
      g.fillStyle = "#dff0fb";
      g.fillRect(0, HORIZON_Y, SCREEN_W, SCREEN_H - HORIZON_Y);
    }

    function drawChute() {
      const nearZ = player.worldPos - CAMERA_BACK + NEAR_PLANE;
      const farZ = player.worldPos - CAMERA_BACK + FAR_DRAW_DISTANCE;
      const wallNearL = project(-CHUTE_HALF_WIDTH - 40, nearZ, 60);
      const wallNearR = project(CHUTE_HALF_WIDTH + 40, nearZ, 60);
      const wallFarL = project(-CHUTE_HALF_WIDTH - 40, farZ, 60);
      const wallFarR = project(CHUTE_HALF_WIDTH + 40, farZ, 60);
      const iceNearL = project(-CHUTE_HALF_WIDTH, nearZ, 0);
      const iceNearR = project(CHUTE_HALF_WIDTH, nearZ, 0);
      const iceFarL = project(-CHUTE_HALF_WIDTH, farZ, 0);
      const iceFarR = project(CHUTE_HALF_WIDTH, farZ, 0);

      g.fillStyle = "#a8c8de";
      g.beginPath();
      g.moveTo(wallNearL.x, wallNearL.y); g.lineTo(wallFarL.x, wallFarL.y); g.lineTo(iceFarL.x, iceFarL.y); g.lineTo(iceNearL.x, iceNearL.y);
      g.closePath(); g.fill();
      g.beginPath();
      g.moveTo(wallNearR.x, wallNearR.y); g.lineTo(wallFarR.x, wallFarR.y); g.lineTo(iceFarR.x, iceFarR.y); g.lineTo(iceNearR.x, iceNearR.y);
      g.closePath(); g.fill();

      g.fillStyle = "#eaf6ff";
      g.beginPath();
      g.moveTo(iceNearL.x, iceNearL.y); g.lineTo(iceFarL.x, iceFarL.y); g.lineTo(iceFarR.x, iceFarR.y); g.lineTo(iceNearR.x, iceNearR.y);
      g.closePath(); g.fill();

      // ice patch overlays, tinted a cooler blue along their z range
      icePatches.forEach((ice) => {
        const zN = Math.max(ice.zStart, player.worldPos - CAMERA_BACK + NEAR_PLANE);
        const zF = Math.min(ice.zEnd, player.worldPos - CAMERA_BACK + FAR_DRAW_DISTANCE);
        if (zF <= zN) return;
        const pL1 = project(-CHUTE_HALF_WIDTH, zN, 0), pR1 = project(CHUTE_HALF_WIDTH, zN, 0);
        const pL2 = project(-CHUTE_HALF_WIDTH, zF, 0), pR2 = project(CHUTE_HALF_WIDTH, zF, 0);
        g.fillStyle = "rgba(120,200,255,0.35)";
        g.beginPath();
        g.moveTo(pL1.x, pL1.y); g.lineTo(pL2.x, pL2.y); g.lineTo(pR2.x, pR2.y); g.lineTo(pR1.x, pR1.y);
        g.closePath(); g.fill();
      });

      g.strokeStyle = "#5590b8";
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(iceNearL.x, iceNearL.y); g.lineTo(iceFarL.x, iceFarL.y); g.stroke();
      g.beginPath(); g.moveTo(iceNearR.x, iceNearR.y); g.lineTo(iceFarR.x, iceFarR.y); g.stroke();

      if (COURSE_LENGTH - player.worldPos < FAR_DRAW_DISTANCE) {
        const fL = project(-CHUTE_HALF_WIDTH, COURSE_LENGTH, 60);
        const fR = project(CHUTE_HALF_WIDTH, COURSE_LENGTH, 60);
        const fLg = project(-CHUTE_HALF_WIDTH, COURSE_LENGTH, 0);
        const fRg = project(CHUTE_HALF_WIDTH, COURSE_LENGTH, 0);
        if (fL.forward > NEAR_PLANE) {
          g.fillStyle = "#ff3c28";
          g.beginPath();
          g.moveTo(fL.x, fL.y); g.lineTo(fR.x, fR.y); g.lineTo(fRg.x, fRg.y); g.lineTo(fLg.x, fLg.y);
          g.closePath(); g.fill();
          g.fillStyle = "#fff";
          g.font = `700 ${Math.max(10, 22 * fL.scale)}px sans-serif`;
          g.textAlign = "center";
          g.fillText("FINISH", (fL.x + fR.x) / 2, (fL.y + fR.y) / 2 + 6 * fL.scale);
        }
      }
    }

    function drawBoosts() {
      boosts.forEach((b) => {
        if (b.taken) return;
        const forward = b.z - (player.worldPos - CAMERA_BACK);
        if (forward < NEAR_PLANE * 0.5 || forward > FAR_DRAW_DISTANCE) return;
        const p = project(b.x, b.z, 0);
        const size = Math.max(9, 32 * p.scale);
        g.save();
        g.globalAlpha = clamp01(p.scale * 3);
        g.font = `${size}px sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "bottom";
        g.fillText("⚡", p.x, p.y + size * 0.1);
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

    function drawSled() {
      const p = project(player.x, player.worldPos, 0);
      const blink = player.flash > 0 && Math.floor(player.flash * 10) % 2 === 0;
      if (blink) return;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(player.lean * 0.22);
      g.font = `${Math.max(30, 58 * p.scale)}px sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "bottom";
      g.fillText("🛷", 0, 6);
      g.restore();
    }

    function drawHud() {
      g.textAlign = "left";
      g.font = "700 20px sans-serif";
      g.fillStyle = "#12202f";
      g.fillText(`${raceTime.toFixed(2)}s`, 16, 30);

      const barW = 200;
      const progFrac = clamp01(player.worldPos / COURSE_LENGTH);
      g.font = "600 11px sans-serif";
      g.fillStyle = "rgba(18,32,47,0.75)";
      g.fillText("Progress", 16, 50);
      g.fillStyle = "rgba(255,255,255,0.6)";
      g.fillRect(16, 56, barW, 10);
      g.fillStyle = "#00c3e3";
      g.fillRect(16, 56, barW * progFrac, 10);

      g.textAlign = "right";
      g.font = "600 13px sans-serif";
      g.fillStyle = "rgba(18,32,47,0.85)";
      g.fillText(`Bumps: ${bumps}`, SCREEN_W - 16, 30);
      g.fillText(`${Math.round(player.speed)} km/h`, SCREEN_W - 16, 50);

      if (onIcePatch() && running && !over) {
        g.textAlign = "center";
        g.font = "700 15px sans-serif";
        g.fillStyle = "#2a7db8";
        g.fillText("❄️ Ice — steering is twitchy!", SCREEN_W / 2, 40);
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
      drawChute();
      drawBoosts();
      drawPopups();
      drawSled();
      if (running) drawHud();
      if (!running) {
        g.fillStyle = "rgba(10,30,45,0.25)";
        g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      }
      g.restore();
    }

    // ============ lifecycle ============
    function startGame() {
      resetState();
      running = true;
      over = false;
      ctx.setStatus("Push off! Steer clear of the walls.");
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
    ctx.setStatus("Ready at the start gate.");
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
