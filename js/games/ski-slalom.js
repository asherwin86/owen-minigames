MimiGames.register({
  id: "ski-slalom",
  title: "Ski Slalom 3D",
  emoji: "⛷️",
  category: "Sports",
  tags: ["3D"],
  players: "1P",
  howTo: "A pseudo-3D downhill time trial. Left/Right or A/D to carve, Down/S to brake, no input to just tuck and accelerate. Ski between each pair of gate poles — clean gates shave time off your run, missed ones add a penalty. Clip a tree or rock and you'll wipe out (a time penalty and a moment to recover, but the run keeps going). Hit a ramp for big air — the longer you hang, the bigger the time bonus when you land. Reach the finish banner as fast as you can. Gamepad: D-pad left/right to carve, D-pad down to brake (Start un-hides the controller cursor if you need it). Touch: drag left/right to steer, hold BRAKE to slow down.",
  init(root, ctx) {
    const SCREEN_W = 960, SCREEN_H = 600;
    const HORIZON_Y = SCREEN_H * 0.34;
    // Same near-plane-clamped straight-corridor projection Bike Rush uses —
    // camera trails the player by a fixed offset so nothing close can ever
    // fail to project and vanish right when it matters.
    const CAM_HEIGHT = 70;
    const PROJECTION = 300;
    const CAMERA_BACK = 70;
    const NEAR_PLANE = 12;
    const FAR_DRAW_DISTANCE = 2400;

    const SLOPE_HALF_WIDTH = 260;
    const COURSE_LENGTH = 3600;

    const SPEED_MAX = 380;
    const SPEED_MIN = 55;
    const GRAVITY_ACCEL = 70;
    const BRAKE_DECEL = 240;
    const TURN_DRAG = 55; // carving bleeds a little speed, same as real skiing
    const TURN_ACCEL = 340;
    const TURN_MAX_VX = 190;
    const TURN_DRAG_VX = 5.5;

    const COLLISION_RANGE = 24;
    const GATE_HALF_GAP = 46;
    const GATE_CHECK_WINDOW = 22;
    const CRASH_PENALTY = 1.6;
    const MISS_GATE_PENALTY = 1.2;
    const CLEAN_GATE_BONUS = 0.35;
    const CRASH_INVULN = 1.1;
    const JUMP_DURATION = 1.15;
    const JUMP_HEIGHT = 90;

    const SETTINGS_KEY = "skiSlalomSettings";
    const DIFFICULTIES = {
      easy: { label: "Easy", label2: "Groomed Run", obstacleDensity: 0.7, gateGap: GATE_HALF_GAP * 1.25 },
      normal: { label: "Normal", label2: "Slalom Course", obstacleDensity: 1, gateGap: GATE_HALF_GAP },
      hard: { label: "Hard", label2: "Black Diamond", obstacleDensity: 1.4, gateGap: GATE_HALF_GAP * 0.78 },
    };
    const settings = Object.assign({ difficulty: "normal", soundEnabled: true }, ctx.storage.get(SETTINGS_KEY, {}));
    function saveSettings() { ctx.storage.set(SETTINGS_KEY, settings); }
    function playSound(name) { if (settings.soundEnabled) ctx.playSound(name); }
    function currentDiff() { return DIFFICULTIES[settings.difficulty]; }

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function clamp01(v) { return clamp(v, 0, 1); }
    function lerp(a, b, t) { return a + (b - a) * t; }

    // ============ wind/ski sound ============
    // A continuous filtered-noise "swoosh" that grows louder and hisses
    // higher-pitched with speed — skis don't have an engine, but they very
    // much make more noise the faster you're carving through snow.
    let audioCtx = null;
    let windSrc = null, windGain = null, windFilter = null;
    function getAudioCtx() {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      return audioCtx;
    }
    function startWindSound() {
      if (windSrc) return;
      try {
        const ac = getAudioCtx();
        const bufferSize = 2 * ac.sampleRate;
        const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        windSrc = ac.createBufferSource();
        windSrc.buffer = buffer;
        windSrc.loop = true;
        windFilter = ac.createBiquadFilter();
        windFilter.type = "bandpass";
        windFilter.frequency.value = 500;
        windFilter.Q.value = 0.7;
        windGain = ac.createGain();
        windGain.gain.value = 0;
        windSrc.connect(windFilter);
        windFilter.connect(windGain);
        windGain.connect(ac.destination);
        windSrc.start();
      } catch (e) { /* audio not available */ }
    }
    function stopWindSound() {
      try { windSrc?.stop(); } catch (e) { /* already stopped */ }
      windSrc = windGain = windFilter = null;
    }
    function updateWindSound() {
      if (!windSrc || !audioCtx) return;
      const ac = audioCtx;
      const on = settings.soundEnabled && running && !over;
      const speedFrac = clamp01((player.speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN));
      windFilter.frequency.setTargetAtTime(400 + speedFrac * 1400, ac.currentTime, 0.08);
      windGain.gain.setTargetAtTime(on ? 0.02 + speedFrac * 0.05 : 0, ac.currentTime, 0.1);
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
    canvas.style.background = "#bfe3ff";
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
    hint.textContent = "Left/Right = carve, Down = brake. Thread the gates, dodge the trees, catch the ramps.";

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
    const brakeBtn = touchBtn("✋ BRAKE");
    const rightBtn = touchBtn("▶");
    touchRow.append(leftBtn, brakeBtn, rightBtn);

    const startBtn = document.createElement("button");
    startBtn.className = "btn primary";
    startBtn.textContent = "Start Run";
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
      if (["ArrowLeft", "ArrowRight", "ArrowDown", "KeyA", "KeyD", "KeyS"].includes(code)) e.preventDefault();
      keys.add(code);
    }
    function onKeyup(e) { keys.delete(e.code); }
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("keyup", onKeyup);

    let touchLeftHeld = false, touchRightHeld = false, touchBrakeHeld = false;
    function heldLeft() { return keys.has("ArrowLeft") || keys.has("KeyA") || touchLeftHeld; }
    function heldRight() { return keys.has("ArrowRight") || keys.has("KeyD") || touchRightHeld; }
    function heldBrake() { return keys.has("ArrowDown") || keys.has("KeyS") || touchBrakeHeld; }

    function bindHold(el, onDown, onUp) {
      el.addEventListener("pointerdown", (e) => { e.preventDefault(); onDown(); });
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
      el.addEventListener("pointerleave", onUp);
    }
    bindHold(leftBtn, () => { touchLeftHeld = true; }, () => { touchLeftHeld = false; });
    bindHold(rightBtn, () => { touchRightHeld = true; }, () => { touchRightHeld = false; });
    bindHold(brakeBtn, () => { touchBrakeHeld = true; }, () => { touchBrakeHeld = false; });

    // ============ state ============
    let running = false;
    let over = false;
    let raceTime = 0;
    let falls = 0;
    let cleanGates = 0;
    let missedGates = 0;
    let shakeTimer = 0;
    let popups = [];
    let trees = [];
    let gates = [];
    let ramps = [];

    const player = {
      x: 0,
      vx: 0,
      worldPos: 0,
      speed: 140,
      lean: 0,
      invuln: 0,
      flash: 0,
      airTime: 0,
    };

    function spawnPopup(worldZ, x, text, color) {
      popups.push({ worldZ, x, life: 1, maxLife: 1, text, color: color || "#fff" });
    }

    function buildCourse() {
      const diff = currentDiff();
      trees = [];
      gates = [];
      ramps = [];
      const treeCount = Math.round(70 * diff.obstacleDensity);
      for (let i = 0; i < treeCount; i++) {
        const z = 260 + Math.random() * (COURSE_LENGTH - 400);
        const side = Math.random() < 0.5 ? -1 : 1;
        const x = side * (60 + Math.random() * (SLOPE_HALF_WIDTH - 40));
        trees.push({ z, x, kind: Math.random() < 0.6 ? "🌲" : "🪨", hit: false });
      }
      let gz = 320;
      let swing = 1;
      while (gz < COURSE_LENGTH - 200) {
        const centerX = swing * (60 + Math.random() * 80);
        gates.push({ z: gz, centerX, gap: diff.gateGap, resolved: false });
        swing *= -1;
        gz += 190 + Math.random() * 90;
      }
      let rz = 500;
      while (rz < COURSE_LENGTH - 300) {
        ramps.push({ z: rz, x: (Math.random() < 0.5 ? -1 : 1) * (30 + Math.random() * 100), used: false });
        rz += 700 + Math.random() * 500;
      }
    }

    function resetState() {
      raceTime = 0;
      falls = 0;
      cleanGates = 0;
      missedGates = 0;
      shakeTimer = 0;
      popups = [];
      player.x = 0;
      player.vx = 0;
      player.worldPos = 0;
      player.speed = 140;
      player.lean = 0;
      player.invuln = 0;
      player.flash = 0;
      player.airTime = 0;
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
    function crash() {
      if (player.invuln > 0 || invincible) return;
      falls += 1;
      raceTime += CRASH_PENALTY;
      player.speed = Math.max(SPEED_MIN, player.speed * 0.35);
      player.invuln = CRASH_INVULN;
      player.flash = CRASH_INVULN;
      shakeTimer = 0.4;
      playSound("hit");
      ctx.setStatus(`Wipeout! +${CRASH_PENALTY.toFixed(1)}s penalty.`);
    }

    function updateGatesAndRamps(dt) {
      gates.forEach((gt) => {
        if (gt.resolved) return;
        const rel = gt.z - player.worldPos;
        if (rel < -GATE_CHECK_WINDOW) {
          gt.resolved = true;
          const clean = Math.abs(player.x - gt.centerX) <= gt.gap;
          if (clean) {
            cleanGates += 1;
            raceTime = Math.max(0, raceTime - CLEAN_GATE_BONUS);
            spawnPopup(gt.z, gt.centerX, `-${CLEAN_GATE_BONUS.toFixed(1)}s Gate!`, "#53e0ff");
            playSound("tick");
          } else {
            missedGates += 1;
            raceTime += MISS_GATE_PENALTY;
            spawnPopup(gt.z, gt.centerX, `+${MISS_GATE_PENALTY.toFixed(1)}s Missed`, "#ff9f43");
            playSound("click");
          }
        }
      });
      ramps.forEach((r) => {
        if (r.used) return;
        const rel = Math.abs(r.z - player.worldPos);
        if (rel < 22 && Math.abs(player.x - r.x) < 40 && player.airTime <= 0) {
          r.used = true;
          player.airTime = JUMP_DURATION;
          player.invuln = Math.max(player.invuln, JUMP_DURATION);
          playSound("powerUp");
        }
      });
    }

    function updateCollisions() {
      if (player.airTime > 0 || player.invuln > 0) return;
      trees.forEach((t) => {
        if (t.hit) return;
        if (Math.abs(t.z - player.worldPos) < COLLISION_RANGE && Math.abs(t.x - player.x) < COLLISION_RANGE) {
          t.hit = true;
          crash();
        }
      });
    }

    function finishRun() {
      over = true;
      const finalTime = raceTime;
      playSound(falls === 0 ? "success" : "lose");
      const best = ctx.storage.get("bestTime", null);
      const isNewBest = best === null || finalTime < best;
      if (isNewBest) ctx.storage.set("bestTime", finalTime);
      ctx.setStatus(`Finished — ${finalTime.toFixed(2)}s`);
      setTimeout(() => {
        ctx.showOverlay({
          title: "Finish!",
          subtitle: `Time: ${finalTime.toFixed(2)}s · Gates: ${cleanGates}/${gates.length} · Falls: ${falls}${isNewBest ? " · New Best!" : ` · Best: ${Math.min(finalTime, best).toFixed(2)}s`}`,
          buttonText: "Ride Again",
          onButton: startGame,
        });
      }, 400);
    }

    function update(dt) {
      if (!running) return;
      if (!over) {
        if (player.airTime > 0) {
          player.airTime = Math.max(0, player.airTime - dt);
          player.speed = clamp(player.speed + GRAVITY_ACCEL * 0.4 * dt, SPEED_MIN, SPEED_MAX);
          if (player.airTime <= 0) {
            spawnPopup(player.worldPos, player.x, "Landed!", "#9bff8f");
          }
        } else {
          if (heldBrake()) {
            player.speed -= BRAKE_DECEL * dt;
          } else {
            player.speed += GRAVITY_ACCEL * dt;
          }
          let turning = false;
          if (heldLeft()) { player.vx -= TURN_ACCEL * dt; turning = true; }
          if (heldRight()) { player.vx += TURN_ACCEL * dt; turning = true; }
          if (turning) player.speed -= TURN_DRAG * dt;
          else player.vx = lerp(player.vx, 0, Math.min(1, dt * TURN_DRAG_VX));
          player.vx = clamp(player.vx, -TURN_MAX_VX, TURN_MAX_VX);
          player.speed = clamp(player.speed, SPEED_MIN, SPEED_MAX);
          player.lean = lerp(player.lean, clamp(player.vx / TURN_MAX_VX, -1, 1), Math.min(1, dt * 8));
        }

        player.worldPos += player.speed * dt;
        player.x += player.vx * dt;
        player.x = clamp(player.x, -SLOPE_HALF_WIDTH + 20, SLOPE_HALF_WIDTH - 20);

        raceTime += dt;
        updateGatesAndRamps(dt);
        updateCollisions();

        if (player.worldPos >= COURSE_LENGTH) finishRun();
      }
      updateWindSound();
      if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);
      if (player.flash > 0) player.flash = Math.max(0, player.flash - dt);
      if (shakeTimer > 0) shakeTimer = Math.max(0, shakeTimer - dt);
      popups.forEach((p) => { p.life -= dt / p.maxLife; });
      popups = popups.filter((p) => p.life > 0);
    }

    // ============ draw ============
    function drawSky() {
      const grad = g.createLinearGradient(0, 0, 0, HORIZON_Y);
      grad.addColorStop(0, "#4a9de0");
      grad.addColorStop(1, "#cfeeff");
      g.fillStyle = grad;
      g.fillRect(0, 0, SCREEN_W, HORIZON_Y);
      // distant mountain range, gently parallax-scrolling with distance
      g.fillStyle = "rgba(255,255,255,0.75)";
      const parallax = (player.worldPos * 0.02) % 160;
      for (let i = -1; i < 8; i++) {
        const bx = i * 160 - parallax;
        const peakH = 40 + (((i * 53) % 50) + 50) % 50;
        g.beginPath();
        g.moveTo(bx, HORIZON_Y);
        g.lineTo(bx + 80, HORIZON_Y - peakH);
        g.lineTo(bx + 160, HORIZON_Y);
        g.closePath();
        g.fill();
      }
      g.fillStyle = "#eaf6ff";
      g.fillRect(0, HORIZON_Y, SCREEN_W, SCREEN_H - HORIZON_Y);
    }

    function drawSlope() {
      const nearZ = player.worldPos - CAMERA_BACK + NEAR_PLANE;
      const farZ = player.worldPos - CAMERA_BACK + FAR_DRAW_DISTANCE;
      const nearL = project(-SLOPE_HALF_WIDTH - 80, nearZ, 0);
      const nearR = project(SLOPE_HALF_WIDTH + 80, nearZ, 0);
      const farL = project(-SLOPE_HALF_WIDTH - 80, farZ, 0);
      const farR = project(SLOPE_HALF_WIDTH + 80, farZ, 0);
      g.fillStyle = "#2f6b3c";
      g.beginPath();
      g.moveTo(nearL.x, nearL.y); g.lineTo(farL.x, farL.y); g.lineTo(farR.x, farR.y); g.lineTo(nearR.x, nearR.y);
      g.closePath(); g.fill();

      const slopeNearL = project(-SLOPE_HALF_WIDTH, nearZ, 0);
      const slopeNearR = project(SLOPE_HALF_WIDTH, nearZ, 0);
      const slopeFarL = project(-SLOPE_HALF_WIDTH, farZ, 0);
      const slopeFarR = project(SLOPE_HALF_WIDTH, farZ, 0);
      g.fillStyle = "#f4fbff";
      g.beginPath();
      g.moveTo(slopeNearL.x, slopeNearL.y); g.lineTo(slopeFarL.x, slopeFarL.y); g.lineTo(slopeFarR.x, slopeFarR.y); g.lineTo(slopeNearR.x, slopeNearR.y);
      g.closePath(); g.fill();

      g.strokeStyle = "rgba(0,90,60,0.5)";
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(slopeNearL.x, slopeNearL.y); g.lineTo(slopeFarL.x, slopeFarL.y); g.stroke();
      g.beginPath(); g.moveTo(slopeNearR.x, slopeNearR.y); g.lineTo(slopeFarR.x, slopeFarR.y); g.stroke();

      // finish banner
      if (COURSE_LENGTH - player.worldPos < FAR_DRAW_DISTANCE) {
        const fL = project(-SLOPE_HALF_WIDTH, COURSE_LENGTH, 60);
        const fR = project(SLOPE_HALF_WIDTH, COURSE_LENGTH, 60);
        const fLg = project(-SLOPE_HALF_WIDTH, COURSE_LENGTH, 0);
        const fRg = project(SLOPE_HALF_WIDTH, COURSE_LENGTH, 0);
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

    function drawTrees() {
      const sorted = trees.slice().sort((a, b) => b.z - a.z);
      sorted.forEach((t) => {
        const forward = t.z - (player.worldPos - CAMERA_BACK);
        if (forward < NEAR_PLANE * 0.5 || forward > FAR_DRAW_DISTANCE) return;
        const p = project(t.x, t.z, 0);
        const size = Math.max(9, 40 * p.scale);
        g.save();
        g.globalAlpha = clamp01(p.scale * 3);
        g.font = `${size}px sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "bottom";
        g.fillText(t.kind, p.x, p.y + size * 0.1);
        g.restore();
      });
    }

    function drawGates() {
      gates.forEach((gt) => {
        const forward = gt.z - (player.worldPos - CAMERA_BACK);
        if (forward < NEAR_PLANE * 0.5 || forward > FAR_DRAW_DISTANCE) return;
        const leftP = project(gt.centerX - gt.gap, gt.z, 0);
        const rightP = project(gt.centerX + gt.gap, gt.z, 0);
        const leftTop = project(gt.centerX - gt.gap, gt.z, 34);
        const rightTop = project(gt.centerX + gt.gap, gt.z, 34);
        const size = Math.max(8, 26 * leftP.scale);
        g.globalAlpha = clamp01(leftP.scale * 3);
        g.strokeStyle = gt.resolved ? "rgba(150,150,150,0.5)" : "#ff3c28";
        g.lineWidth = Math.max(1, 3 * leftP.scale);
        g.beginPath(); g.moveTo(leftP.x, leftP.y); g.lineTo(leftTop.x, leftTop.y); g.stroke();
        g.strokeStyle = gt.resolved ? "rgba(150,150,150,0.5)" : "#00c3e3";
        g.beginPath(); g.moveTo(rightP.x, rightP.y); g.lineTo(rightTop.x, rightTop.y); g.stroke();
        g.font = `${size}px sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "bottom";
        g.fillText("🚩", leftTop.x, leftTop.y + size * 0.3);
        g.fillText("🚩", rightTop.x, rightTop.y + size * 0.3);
        g.globalAlpha = 1;
      });
    }

    function drawRamps() {
      ramps.forEach((r) => {
        const forward = r.z - (player.worldPos - CAMERA_BACK);
        if (forward < NEAR_PLANE * 0.5 || forward > FAR_DRAW_DISTANCE) return;
        const p = project(r.x, r.z, 0);
        const size = Math.max(9, 34 * p.scale);
        g.globalAlpha = r.used ? 0.35 : clamp01(p.scale * 3);
        g.font = `${size}px sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "bottom";
        g.fillText("🛷", p.x, p.y + size * 0.1);
        g.globalAlpha = 1;
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

    function drawSkier() {
      const p = project(player.x, player.worldPos, 0);
      const blink = player.flash > 0 && Math.floor(player.flash * 10) % 2 === 0;
      // airborne: draw a shrinking shadow at ground level, skier offset upward
      // along a simple sine arc — a vertical cue Bike Rush's flat road never needs
      let liftPx = 0;
      if (player.airTime > 0) {
        const t = 1 - player.airTime / JUMP_DURATION;
        liftPx = Math.sin(t * Math.PI) * JUMP_HEIGHT * p.scale;
        g.save();
        g.globalAlpha = 0.35;
        g.fillStyle = "#1a2030";
        g.beginPath();
        g.ellipse(p.x, p.y, 18 * p.scale * (1 - Math.sin(t * Math.PI) * 0.4), 6 * p.scale, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      if (blink) return;
      g.save();
      g.translate(p.x, p.y - liftPx);
      g.rotate(player.lean * 0.24);
      g.font = `${Math.max(28, 58 * p.scale)}px sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "bottom";
      g.fillText("⛷️", 0, 6);
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
      g.fillText(`Falls: ${falls}`, SCREEN_W - 16, 30);
      g.fillText(`Gates: ${cleanGates}/${gates.filter((gt) => gt.resolved).length || 0}`, SCREEN_W - 16, 50);

      if (player.airTime > 0) {
        g.textAlign = "center";
        g.font = "700 16px sans-serif";
        g.fillStyle = "#ff3c28";
        g.fillText("Big Air!", SCREEN_W / 2, 40);
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
      drawSlope();
      drawTrees();
      drawGates();
      drawRamps();
      drawPopups();
      drawSkier();
      if (running) drawHud();
      if (!running) {
        g.fillStyle = "rgba(10,20,35,0.3)";
        g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      }
      g.restore();
    }

    // ============ lifecycle ============
    function startGame() {
      resetState();
      running = true;
      over = false;
      startWindSound(); // Start Run click is a real user gesture — safe to create/resume the AudioContext here
      ctx.setStatus("Go! Carve through the gates and reach the finish.");
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
    ctx.setStatus("Ready to ski.");
    rafId = requestAnimationFrame(loop);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.MimiPadCursor?.setSuppressed(false);
      stopWindSound();
      if (isFullscreenActive()) (document.exitFullscreen?.() || document.webkitExitFullscreen?.());
      document.removeEventListener("keydown", onKeydown);
      document.removeEventListener("keyup", onKeyup);
      document.removeEventListener("fullscreenchange", syncFullscreenBtn);
      document.removeEventListener("webkitfullscreenchange", syncFullscreenBtn);
      window.removeEventListener("resize", resizeCanvasForFullscreen);
    };
  },
});
