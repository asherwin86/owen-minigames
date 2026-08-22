MimiGames.register({
  id: "coast-guard",
  title: "Coast Guard: Storm Rescue",
  emoji: "🚤",
  category: "Action",
  tags: ["3D"],
  players: "1P",
  howTo: "A first/third-person 3D boat rescue game. WASD/arrows to steer (Up/W throttle forward, Down/S reverse/brake, Left/Right turn — turning needs some speed, just like a real boat). You start with a couple of survivors already aboard. Get more by driving close to people stranded in open water OR waiting on the shore of one of the scattered islands, then bring everyone back to the flagged home island's dock to bank the save. The nautical map in the top-right always shows where to go next — a dashed line and label point at whichever matters right now (the nearest survivor, or the dock once you're carrying anyone) — plus every island, the storm, and an incoming tsunami's wavefront. Avoid debris — it damages your hull. A storm is rolling in: the longer it takes, the worse visibility, waves, and lightning get. Watch for tsunami warnings — a wave sweeps across the whole map, and anyone caught in open water takes it hard, but riding it out on an island keeps you safe. Save everyone before the disaster timer runs out. Touch: left side of the screen is a virtual throttle/steering stick. Gamepad supported (left stick to steer; Start un-hides the controller cursor if you need it).",
  init(root, ctx) {
    const SCREEN_W = 960, SCREEN_H = 600;
    const WORLD_SIZE = 4000;
    const HORIZON = SCREEN_H * 0.42;
    const PROJECTION = 280;

    const BOAT_TURN_RATE = 1.9; // rad/s at full speed
    const BOAT_ACCEL = 130;
    const BOAT_MAX_SPEED = 260;
    const BOAT_REVERSE_MAX = -90;
    const BOAT_DRAG = 0.55; // per second, fraction of forward speed lost
    const BOAT_LATERAL_GRIP = 2.4; // per second — a hull sheds sideways slip much faster than forward glide, which is what makes turning at speed feel like a real drift instead of an instant pivot
    const HULL_MAX = 100;
    const PICKUP_RADIUS = 60;
    const DOCK_RADIUS = 90;
    const BOAT_CAPACITY = 4;
    const STARTING_ABOARD = 2; // you're already mid-rescue when the disaster timer starts

    const SETTINGS_KEY = "coastGuardSettings";
    const DIFFICULTIES = {
      easy: { label: "Easy", survivors: 4, debris: 6, totalTime: 210, stormRate: 0.65, label2: "Calm-ish seas" },
      normal: { label: "Normal", survivors: 6, debris: 10, totalTime: 165, stormRate: 1, label2: "Real storm" },
      hard: { label: "Hard", survivors: 9, debris: 15, totalTime: 135, stormRate: 1.4, label2: "Hurricane" },
    };
    const settings = Object.assign({ difficulty: "normal", soundEnabled: true }, ctx.storage.get(SETTINGS_KEY, {}));
    function saveSettings() { ctx.storage.set(SETTINGS_KEY, settings); }
    function playSound(name) { if (settings.soundEnabled) ctx.playSound(name); }

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
      const d = DIFFICULTIES[settings.difficulty];
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
    canvas.style.background = "#123";
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
    // max-width/max-height alone never make a canvas GROW past its intrinsic
    // pixel size — only cap it — so entering fullscreen left the canvas tiny
    // in a corner of an otherwise-black screen. Compute the largest size that
    // fits the viewport while keeping the aspect ratio and set it explicitly.
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
    hint.textContent = "WASD/arrows to drive. Reach stranded survivors, then bring them to the dock. Touch: left side is throttle/steer.";

    const startBtn = document.createElement("button");
    startBtn.className = "btn primary";
    startBtn.textContent = "Launch Boat";
    startBtn.onclick = startGame;

    wrap.append(settingsPanel, canvasWrap, hint, startBtn);
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
        label: "Force Win",
        run() {
          if (!running || over) return;
          survivors.forEach((s) => { if (s.state === "stranded") s.state = "aboard"; });
          rescuedCount = totalToSave();
          boat.aboard = 0;
          endGame(true);
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
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD", "KeyW", "KeyS"].includes(e.code)) e.preventDefault();
      keys.add(e.code);
    }
    function onKeyup(e) { keys.delete(e.code); }
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("keyup", onKeyup);

    const JOYSTICK_MAX_RADIUS = 46;
    const joystick = { active: false, id: null, dx: 0, dy: 0, cx: 0, cy: 0, knobX: 0, knobY: 0 };
    function canvasPoint(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      return { x: ((clientX - rect.left) / rect.width) * SCREEN_W, y: ((clientY - rect.top) / rect.height) * SCREEN_H };
    }
    function onTouchStart(e) {
      if (!running) return;
      for (const t of e.changedTouches) {
        const p = canvasPoint(t.clientX, t.clientY);
        if (!joystick.active) {
          joystick.active = true;
          joystick.id = t.identifier;
          joystick.cx = p.x; joystick.cy = p.y;
          joystick.knobX = p.x; joystick.knobY = p.y;
          joystick.dx = 0; joystick.dy = 0;
        }
      }
      e.preventDefault();
    }
    function onTouchMove(e) {
      for (const t of e.changedTouches) {
        if (joystick.active && t.identifier === joystick.id) {
          const p = canvasPoint(t.clientX, t.clientY);
          let dx = p.x - joystick.cx, dy = p.y - joystick.cy;
          const dist = Math.hypot(dx, dy);
          if (dist > JOYSTICK_MAX_RADIUS) { dx = (dx / dist) * JOYSTICK_MAX_RADIUS; dy = (dy / dist) * JOYSTICK_MAX_RADIUS; }
          joystick.knobX = joystick.cx + dx; joystick.knobY = joystick.cy + dy;
          joystick.dx = dx / JOYSTICK_MAX_RADIUS; joystick.dy = dy / JOYSTICK_MAX_RADIUS;
        }
      }
      e.preventDefault();
    }
    function onTouchEnd(e) {
      for (const t of e.changedTouches) {
        if (joystick.active && t.identifier === joystick.id) { joystick.active = false; joystick.dx = 0; joystick.dy = 0; }
      }
    }
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);
    canvas.addEventListener("touchcancel", onTouchEnd);

    function applyDeadzone(v) { return Math.abs(v) < 0.16 ? 0 : v; }
    function pollGamepad() {
      if (typeof navigator.getGamepads !== "function") return { x: 0, y: 0 };
      const pad = Array.from(navigator.getGamepads()).find((p) => p && p.connected);
      if (!pad) return { x: 0, y: 0 };
      return { x: applyDeadzone(pad.axes[0] || 0), y: applyDeadzone(pad.axes[1] || 0) };
    }

    // ============ world ============
    function rand(a, b) { return a + Math.random() * (b - a); }
    const HOME_ISLAND = { x: WORLD_SIZE / 2, y: WORLD_SIZE - 210, radius: 160 };
    const DOCK = { x: HOME_ISLAND.x, y: HOME_ISLAND.y - HOME_ISLAND.radius - 20 };

    let boat, survivors, debris, islands, stormCells, tsunami, tsunamiQueue, sparks, popups, rainDrops, lightning, disasterTimer, totalTime, rescuedCount, lostCount, running, over, elapsed, camState;

    function tooCloseToIslands(x, y, margin, islandList) {
      return islandList.some((isl) => Math.hypot(x - isl.x, y - isl.y) < isl.radius + margin);
    }

    // total people to save this run: everyone out in the world PLUS whoever
    // you already had aboard when the clock started
    function totalToSave() {
      return DIFFICULTIES[settings.difficulty].survivors + STARTING_ABOARD;
    }

    function buildWorld() {
      const diff = DIFFICULTIES[settings.difficulty];
      totalTime = diff.totalTime;
      disasterTimer = totalTime;
      rescuedCount = 0;
      lostCount = 0;
      elapsed = 0;

      boat = {
        x: DOCK.x, y: DOCK.y - 140, angle: -Math.PI / 2,
        vx: 0, vy: 0, speed: 0, hull: HULL_MAX, aboard: STARTING_ABOARD, invuln: 1.2,
      };
      camState = { x: boat.x, y: boat.y, angle: boat.angle };

      // one fixed "home" island (the actual rescue destination — the dock
      // sits at its shore) plus a handful of scattered decorative/refuge
      // islands elsewhere, useful as safe ground when a tsunami hits AND as
      // a second source of survivors (some wait on the shore, not just
      // floating in open water)
      islands = [{ x: HOME_ISLAND.x, y: HOME_ISLAND.y, radius: HOME_ISLAND.radius, isHome: true, seed: 1 }];
      const islandCount = 3 + Math.floor(Math.random() * 2);
      for (let i = 0; i < islandCount; i++) {
        let x, y, tries = 0;
        do {
          x = rand(250, WORLD_SIZE - 250);
          y = rand(250, WORLD_SIZE - 550);
          tries += 1;
        } while (tries < 25 && tooCloseToIslands(x, y, 350, islands));
        islands.push({ x, y, radius: rand(75, 140), isHome: false, seed: Math.random() * 10 });
      }
      const waitingIslands = islands.filter((isl) => !isl.isHome);

      survivors = [];
      for (let i = 0; i < diff.survivors; i++) {
        let x, y, tries = 0;
        let atIsland = null;
        // about half wait on the shore of a scattered island instead of
        // floating in open water — the map (added to the HUD) marks which
        // islands currently have someone waiting
        if (waitingIslands.length && Math.random() < 0.45) {
          atIsland = waitingIslands[Math.floor(Math.random() * waitingIslands.length)];
          const edgeAngle = rand(0, Math.PI * 2);
          x = atIsland.x + Math.cos(edgeAngle) * (atIsland.radius + 18);
          y = atIsland.y + Math.sin(edgeAngle) * (atIsland.radius + 18);
        } else {
          do {
            x = rand(300, WORLD_SIZE - 300);
            y = rand(300, WORLD_SIZE - 500);
            tries += 1;
          } while (tries < 20 && tooCloseToIslands(x, y, 40, islands));
        }
        survivors.push({ x, y, state: "stranded", timeLeft: rand(80, totalTime), bobSeed: Math.random() * 10, atIsland });
      }
      debris = [];
      for (let i = 0; i < diff.debris; i++) {
        let x, y, tries = 0;
        do {
          x = rand(200, WORLD_SIZE - 200);
          y = rand(200, WORLD_SIZE - 400);
          tries += 1;
        } while (tries < 20 && tooCloseToIslands(x, y, 40, islands));
        debris.push({ x, y, radius: rand(22, 42), drift: rand(-8, 8), driftY: rand(-4, 4), bobSeed: Math.random() * 10 });
      }
      stormCells = [];
      for (let i = 0; i < 3; i++) {
        stormCells.push({
          x: rand(500, WORLD_SIZE - 500), y: rand(500, WORLD_SIZE - 500),
          radius: rand(400, 700), vx: rand(-6, 6), vy: rand(-6, 6),
        });
      }
      // tsunamis: scheduled as fractions of the disaster timer remaining at
      // which the warning starts counting down — harder runs get a second one
      tsunamiQueue = settings.difficulty === "hard" ? [0.62, 0.26] : settings.difficulty === "normal" ? [0.5] : [0.4];
      tsunami = null;
      sparks = []; popups = []; rainDrops = [];
      for (let i = 0; i < 140; i++) rainDrops.push({ x: Math.random() * SCREEN_W, y: Math.random() * SCREEN_H, len: rand(6, 16), speed: rand(500, 900) });
      lightning = 0;
    }

    function stormIntensityAt(x, y) {
      let best = 0;
      for (const c of stormCells) {
        const d = Math.hypot(x - c.x, y - c.y);
        const t = clamp01(1 - d / c.radius);
        if (t > best) best = t;
      }
      return best;
    }
    function clamp01(v) { return Math.max(0, Math.min(1, v)); }
    function globalStormLevel() {
      const diff = DIFFICULTIES[settings.difficulty];
      return clamp01(((totalTime - disasterTimer) / totalTime) * diff.stormRate);
    }

    function spawnPopup(x, y, text, color) { popups.push({ x, y, life: 1.1, maxLife: 1.1, text, color: color || "#fff" }); }
    function spawnSpark(x, y, color) { sparks.push({ x, y, life: 0.35, maxLife: 0.35, color: color || "255,255,255" }); }
    function pushFeed(text) { statusFeed.unshift({ text, life: 4.5 }); statusFeed = statusFeed.slice(0, 3); }
    let statusFeed = [];

    // ============ camera / projection (ground-plane pseudo-3D) ============
    function createCamera() {
      const speedFactor = clamp01(Math.abs(boat.speed) / BOAT_MAX_SPEED);
      const targetAngle = boat.angle;
      camState.angle = lerpAngle(camState.angle, targetAngle, 0.14);
      const forward = { x: Math.cos(camState.angle), y: Math.sin(camState.angle) };
      const right = { x: -forward.y, y: forward.x };
      const followDist = 150 + speedFactor * 40;
      const targetX = boat.x - forward.x * followDist;
      const targetY = boat.y - forward.y * followDist;
      camState.x = lerp(camState.x, targetX, 0.18);
      camState.y = lerp(camState.y, targetY, 0.18);
      const bob = Math.sin(elapsed * 1.6) * 3 + Math.sin(elapsed * 2.7) * 1.5;
      return {
        x: camState.x, y: camState.y, forward, right,
        height: 60 + bob, horizon: HORIZON, projection: PROJECTION, nearPlane: 20,
      };
    }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function lerpAngle(a, b, t) {
      let diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
      return a + diff * t;
    }
    function project(x, y, height, camera) {
      const dx = x - camera.x, dy = y - camera.y;
      const lateral = dx * camera.right.x + dy * camera.right.y;
      const forward = dx * camera.forward.x + dy * camera.forward.y;
      const trueDist = Math.hypot(dx, dy);
      const depth = Math.max(forward, trueDist * 0.5, camera.nearPlane * 0.6);
      const scale = Math.min(camera.projection / depth, 12);
      return {
        x: SCREEN_W / 2 + lateral * scale,
        y: camera.horizon + (camera.height - height) * scale,
        scale, depth, forward,
      };
    }
    // depth alone isn't enough to tell if something should actually be drawn:
    // it's clamped to always stay positive (so nearby points don't blow up in
    // scale), which means a point genuinely BEHIND the camera still gets a
    // valid depth/screen position instead of vanishing — that's what let the
    // dock (and anything else) stay visible no matter which way the boat
    // turned. Cull on the raw, unclamped forward component instead.
    function isBehindCamera(base, camera) {
      return base.forward < camera.nearPlane;
    }

    // ============ update ============
    function updateBoat(dt, camera) {
      const gp = pollGamepad();
      let throttle = 0, steer = 0;
      if (keys.has("KeyW") || keys.has("ArrowUp")) throttle += 1;
      if (keys.has("KeyS") || keys.has("ArrowDown")) throttle -= 1;
      if (keys.has("KeyA") || keys.has("ArrowLeft")) steer -= 1;
      if (keys.has("KeyD") || keys.has("ArrowRight")) steer += 1;
      throttle += -joystick.dy + -gp.y;
      steer += joystick.dx + gp.x;
      throttle = Math.max(-1, Math.min(1, throttle));
      steer = Math.max(-1, Math.min(1, steer));

      // thrust: applied along the CURRENT heading, into a real velocity
      // vector — not directly into position like before, which used to make
      // the boat move exactly where it's pointed with no momentum at all
      const thrustAccel = throttle > 0 ? BOAT_ACCEL : BOAT_ACCEL * 0.7;
      boat.vx += Math.cos(boat.angle) * throttle * thrustAccel * dt;
      boat.vy += Math.sin(boat.angle) * throttle * thrustAccel * dt;

      // decompose velocity into forward/lateral relative to heading and damp
      // them at different rates — a hull grips the water far harder moving
      // forward than sideways, so turning at speed now carries momentum
      // through the turn (real drift) instead of pivoting on the spot
      const fwd = { x: Math.cos(boat.angle), y: Math.sin(boat.angle) };
      const lat = { x: -fwd.y, y: fwd.x };
      let vForward = boat.vx * fwd.x + boat.vy * fwd.y;
      let vLateral = boat.vx * lat.x + boat.vy * lat.y;
      vForward *= 1 - BOAT_DRAG * dt;
      vLateral *= 1 - BOAT_LATERAL_GRIP * dt;
      vForward = Math.max(BOAT_REVERSE_MAX, Math.min(BOAT_MAX_SPEED, vForward));
      const maxLateral = BOAT_MAX_SPEED * 0.55;
      vLateral = Math.max(-maxLateral, Math.min(maxLateral, vLateral));
      boat.vx = fwd.x * vForward + lat.x * vLateral;
      boat.vy = fwd.y * vForward + lat.y * vLateral;
      boat.speed = vForward; // kept as a signed forward-speed for the camera, HUD-ish logic, and reverse detection below

      const turnAuthority = Math.min(1, Math.abs(vForward) / 40);
      boat.angle += steer * BOAT_TURN_RATE * turnAuthority * dt * (vForward < 0 ? -1 : 1);

      // storm push — an environmental current, so it nudges position
      // directly rather than fighting through the momentum model
      const storm = stormIntensityAt(boat.x, boat.y);
      if (storm > 0) {
        const pushAngle = elapsed * 0.7 + boat.x * 0.001;
        boat.x += Math.cos(pushAngle) * storm * 40 * dt;
        boat.y += Math.sin(pushAngle) * storm * 40 * dt;
      }

      boat.x += boat.vx * dt;
      boat.y += boat.vy * dt;
      boat.x = Math.max(40, Math.min(WORLD_SIZE - 40, boat.x));
      boat.y = Math.max(40, Math.min(WORLD_SIZE - 40, boat.y));
      boat.invuln = Math.max(0, boat.invuln - dt);

      // running aground: islands stop the boat (no hull damage — they're
      // meant to double as safe refuge from debris/tsunamis, not a hazard)
      for (const isl of islands) {
        const d = Math.hypot(boat.x - isl.x, boat.y - isl.y);
        const minDist = isl.radius + 20;
        if (d < minDist && d > 0.01) {
          boat.x = isl.x + ((boat.x - isl.x) / d) * minDist;
          boat.y = isl.y + ((boat.y - isl.y) / d) * minDist;
          boat.vx *= 0.4; boat.vy *= 0.4; boat.speed *= 0.4;
        }
      }

      // debris collision
      for (const d of debris) {
        d.x += d.drift * dt; d.y += d.driftY * dt;
        if (d.x < 100 || d.x > WORLD_SIZE - 100) d.drift *= -1;
        if (d.y < 100 || d.y > WORLD_SIZE - 100) d.driftY *= -1;
        const dist = Math.hypot(boat.x - d.x, boat.y - d.y);
        if (dist < d.radius + 22 && boat.invuln <= 0 && !devInvincible) {
          const dmg = 10 + storm * 10;
          boat.hull = Math.max(0, boat.hull - dmg);
          boat.vx *= 0.3; boat.vy *= 0.3; boat.speed *= 0.3;
          boat.invuln = 1;
          spawnSpark(boat.x, boat.y, "255,160,80");
          playSound("hit");
          pushFeed("Hit debris! Hull damaged.");
          if (boat.hull <= 0) endGame(false);
        }
      }

      // survivor pickup
      for (const s of survivors) {
        if (s.state !== "stranded") continue;
        if (boat.aboard >= BOAT_CAPACITY) continue;
        if (Math.hypot(boat.x - s.x, boat.y - s.y) < PICKUP_RADIUS) {
          s.state = "aboard";
          boat.aboard += 1;
          playSound("success");
          spawnPopup(s.x, s.y - 20, "Survivor aboard!", "#9bff8f");
          pushFeed(`Survivor picked up (${boat.aboard}/${BOAT_CAPACITY} aboard)`);
        }
      }
      // dock delivery
      if (boat.aboard > 0 && Math.hypot(boat.x - DOCK.x, boat.y - DOCK.y) < DOCK_RADIUS) {
        rescuedCount += boat.aboard;
        spawnPopup(DOCK.x, DOCK.y - 30, `+${boat.aboard} rescued!`, "#ffd166");
        playSound("win");
        pushFeed(`Delivered ${boat.aboard} to the dock — ${rescuedCount} saved so far.`);
        boat.aboard = 0;
        if (rescuedCount >= totalToSave()) endGame(true);
      }

      // lightning during storm
      const globalStorm = globalStormLevel();
      if (Math.random() < globalStorm * dt * 0.3) {
        lightning = 0.18;
        playSound("fail");
        if (storm > 0.5 && Math.random() < 0.4 && boat.invuln <= 0 && !devInvincible) {
          boat.hull = Math.max(0, boat.hull - 8);
          boat.invuln = 0.8;
          pushFeed("Struck by lightning!");
          if (boat.hull <= 0) endGame(false);
        }
      }
    }

    function updateSurvivors(dt) {
      const globalStorm = globalStormLevel();
      for (const s of survivors) {
        if (s.state !== "stranded") continue;
        s.timeLeft -= dt * (1 + globalStorm * 1.5);
        if (s.timeLeft <= 0) {
          s.state = "lost";
          lostCount += 1;
          pushFeed("A survivor was lost to the storm...");
          playSound("error");
        }
      }
    }

    // A tsunami is a wide wave-front that sweeps straight across the whole
    // map from one random side to the other over a few seconds, after a
    // telegraphed warning. Anyone caught in open water when it passes takes
    // heavy damage (or is lost, for a stranded survivor) — but islands are
    // high enough ground to ride it out safely, which is the whole point of
    // scattering them around: they're not just obstacles, they're shelter.
    function updateTsunami(dt) {
      if (!tsunami && tsunamiQueue.length && disasterTimer <= tsunamiQueue[0] * totalTime) {
        tsunamiQueue.shift();
        const angle = rand(0, Math.PI * 2);
        tsunami = {
          phase: "warning", warnTimer: 4.5, sweepTimer: 0, sweepDuration: 7,
          dir: { x: Math.cos(angle), y: Math.sin(angle) }, hitBoat: false,
        };
        playSound("fail");
        pushFeed("🌊 TSUNAMI INCOMING — get to an island!");
      }
      if (!tsunami) return;
      if (tsunami.phase === "warning") {
        tsunami.warnTimer -= dt;
        if (tsunami.warnTimer <= 0) {
          tsunami.phase = "active";
          playSound("fail");
          pushFeed("🌊 The wave has arrived!");
        }
        return;
      }
      // active: sweep a line perpendicular to tsunami.dir across the map
      tsunami.sweepTimer += dt;
      const waveProgress = tsunami.sweepTimer / tsunami.sweepDuration;
      const center = WORLD_SIZE / 2;
      tsunami.waveOffset = lerp(-WORLD_SIZE * 0.7, WORLD_SIZE * 0.7, clamp01(waveProgress));
      const boatProj = (boat.x - center) * tsunami.dir.x + (boat.y - center) * tsunami.dir.y;
      const bandHalf = 90;
      if (!tsunami.hitBoat && Math.abs(boatProj - tsunami.waveOffset) < bandHalf) {
        tsunami.hitBoat = true;
        const onIsland = tooCloseToIslands(boat.x, boat.y, 20, islands);
        if (onIsland) {
          pushFeed("Safe on the island as the wave passes.");
        } else if (boat.invuln <= 0 && !devInvincible) {
          boat.hull = Math.max(0, boat.hull - 35);
          boat.vx = 0; boat.vy = 0; boat.speed = 0;
          boat.x = Math.max(40, Math.min(WORLD_SIZE - 40, boat.x + tsunami.dir.x * 140));
          boat.y = Math.max(40, Math.min(WORLD_SIZE - 40, boat.y + tsunami.dir.y * 140));
          boat.invuln = 1.5;
          spawnPopup(boat.x, boat.y - 30, "Hit by the tsunami!", "#8ecbff");
          spawnSpark(boat.x, boat.y, "180,220,255");
          playSound("hit");
          pushFeed("Caught by the tsunami — heavy hull damage!");
          if (boat.hull <= 0) endGame(false);
        }
      }
      // stranded survivors caught in open water are swept away for good
      survivors.forEach((s) => {
        if (s.state !== "stranded" || s.tsunamiChecked === tsunami) return;
        const proj = (s.x - center) * tsunami.dir.x + (s.y - center) * tsunami.dir.y;
        if (Math.abs(proj - tsunami.waveOffset) < bandHalf) {
          s.tsunamiChecked = tsunami;
          if (!tooCloseToIslands(s.x, s.y, 20, islands)) {
            s.state = "lost";
            lostCount += 1;
            pushFeed("A survivor was swept away by the tsunami...");
          }
        }
      });
      if (waveProgress >= 1) tsunami = null;
    }

    function update(dt) {
      if (!running) return;
      elapsed += dt;
      disasterTimer = Math.max(0, disasterTimer - dt);
      const camera = createCamera();
      updateBoat(dt, camera);
      updateSurvivors(dt);
      updateTsunami(dt);
      stormCells.forEach((c) => {
        c.x += c.vx * dt; c.y += c.vy * dt;
        if (c.x < 0 || c.x > WORLD_SIZE) c.vx *= -1;
        if (c.y < 0 || c.y > WORLD_SIZE) c.vy *= -1;
      });
      sparks.forEach((s) => (s.life -= dt)); sparks = sparks.filter((s) => s.life > 0);
      popups.forEach((p) => { p.life -= dt; p.y -= dt * 14; }); popups = popups.filter((p) => p.life > 0);
      statusFeed.forEach((k) => (k.life -= dt)); statusFeed = statusFeed.filter((k) => k.life > 0);
      lightning = Math.max(0, lightning - dt * 2);

      const stranded = survivors.filter((s) => s.state === "stranded").length;
      if (disasterTimer <= 0) {
        if (stranded === 0 && boat.aboard === 0) endGame(true);
        else endGame(false);
      }
      updateStatus();
    }

    function updateStatus() {
      ctx.setStatus(`Rescued ${rescuedCount}/${totalToSave()} · Hull ${Math.round(boat.hull)}% · Aboard ${boat.aboard} · Storm in ${Math.ceil(disasterTimer)}s`);
    }

    // ============ draw ============
    function drawWater(camera) {
      const globalStorm = globalStormLevel();
      const skyDark = 0.15 + globalStorm * 0.55;
      const sky = g.createLinearGradient(0, 0, 0, HORIZON);
      sky.addColorStop(0, `rgba(${20 + skyDark * 20},${30 + skyDark * 10},${50 - skyDark * 20},1)`);
      sky.addColorStop(1, `rgba(${60 - skyDark * 30},${70 - skyDark * 30},${90 - skyDark * 30},1)`);
      g.fillStyle = sky;
      g.fillRect(0, 0, SCREEN_W, HORIZON);

      // distant storm clouds silhouette
      g.fillStyle = `rgba(20,24,34,${0.3 + globalStorm * 0.4})`;
      for (let i = 0; i < 6; i++) {
        const cx = (i * 190 + elapsed * 6) % (SCREEN_W + 200) - 100;
        g.beginPath();
        g.ellipse(cx, HORIZON - 30 - (i % 3) * 10, 90, 26, 0, 0, Math.PI * 2);
        g.fill();
      }

      for (let sy = Math.floor(HORIZON) + 1; sy < SCREEN_H; sy++) {
        const denom = sy - camera.horizon;
        if (denom <= 0.5) continue;
        const depth = (camera.projection * camera.height) / denom;
        const sampleX = camera.x + camera.forward.x * depth;
        const sampleY = camera.y + camera.forward.y * depth;
        const wave = Math.sin(sampleX * 0.012 + sampleY * 0.012 + elapsed * 1.4) * 0.5 +
          Math.sin(sampleX * 0.03 - sampleY * 0.02 + elapsed * 2.1) * 0.3;
        const fogDist = clamp01(1 - depth / (1600 - globalStorm * 900));
        const localStorm = stormIntensityAt(sampleX, sampleY);
        const dark = 0.5 + localStorm * 0.35;
        const r = Math.max(0, 18 + wave * 10 - dark * 10) * fogDist + (1 - fogDist) * (18 - skyDark * 10);
        const gr = Math.max(0, 50 + wave * 16 - dark * 18) * fogDist + (1 - fogDist) * (30 - skyDark * 10);
        const b = Math.max(0, 80 + wave * 18 - dark * 22) * fogDist + (1 - fogDist) * (45 - skyDark * 10);
        g.fillStyle = `rgb(${r | 0},${gr | 0},${b | 0})`;
        g.fillRect(0, sy, SCREEN_W, 1.5);
      }
    }

    function hexToRgb(hex) { const v = parseInt(hex.slice(1), 16); return `${(v >> 16) & 255},${(v >> 8) & 255},${v & 255}`; }

    function drawSprites(camera) {
      const sprites = [];
      const maxDepth = 1800;

      islands.forEach((isl) => {
        const base = project(isl.x, isl.y, 0, camera);
        if (isBehindCamera(base, camera)) return;
        if (base.depth > maxDepth * 1.4) return;
        if (base.x < -300 || base.x > SCREEN_W + 300) return;
        const size = Math.min(SCREEN_H * 2.5, Math.max(10, isl.radius * base.scale * 1.6));
        sprites.push({
          depth: base.depth, x: base.x, y: base.y, alpha: 1,
          draw: () => {
            g.fillStyle = "#c9a35a";
            g.beginPath();
            g.ellipse(0, 0, size, size * 0.4, 0, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = "#4a7a3a";
            g.beginPath();
            g.ellipse(0, -size * 0.1, size * 0.65, size * 0.3, 0, 0, Math.PI * 2);
            g.fill();
            // a palm tree or two, seeded so they don't jitter frame to frame
            const trunkColor = "#6b4a2a";
            const leafColor = "#3a6a2e";
            const treeCount = isl.isHome ? 3 : 1 + Math.round(isl.seed % 2);
            for (let i = 0; i < treeCount; i++) {
              const tx = (Math.sin(isl.seed * 7 + i * 2.3) * size * 0.4);
              const ty = -size * 0.12 - Math.cos(isl.seed * 5 + i) * size * 0.08;
              g.strokeStyle = trunkColor;
              g.lineWidth = Math.max(1, size * 0.03);
              g.beginPath();
              g.moveTo(tx, ty);
              g.lineTo(tx + size * 0.04, ty - size * 0.22);
              g.stroke();
              g.fillStyle = leafColor;
              g.beginPath();
              g.ellipse(tx + size * 0.04, ty - size * 0.24, size * 0.11, size * 0.06, 0.4, 0, Math.PI * 2);
              g.fill();
            }
            if (isl.isHome) {
              // a small marker flag so the destination island reads clearly
              // from a distance, distinct from the merely-decorative ones
              g.strokeStyle = "#8a6a3a";
              g.lineWidth = Math.max(1.5, size * 0.025);
              g.beginPath();
              g.moveTo(-size * 0.55, -size * 0.1);
              g.lineTo(-size * 0.55, -size * 0.5);
              g.stroke();
              g.fillStyle = "#ff4757";
              g.beginPath();
              g.moveTo(-size * 0.55, -size * 0.5);
              g.lineTo(-size * 0.3, -size * 0.42);
              g.lineTo(-size * 0.55, -size * 0.34);
              g.closePath();
              g.fill();
            }
          },
        });
      });

      debris.forEach((d) => {
        const base = project(d.x, d.y, 0, camera);
        if (isBehindCamera(base, camera)) return;
        if (base.depth > maxDepth) return;
        if (base.x < -100 || base.x > SCREEN_W + 100) return;
        const size = Math.min(SCREEN_H * 1.2, Math.max(4, d.radius * base.scale * 1.4));
        sprites.push({
          depth: base.depth, x: base.x, y: base.y, alpha: 1,
          draw: () => {
            g.fillStyle = "#5a4a3a";
            g.beginPath();
            g.ellipse(0, 0, size * 0.9, size * 0.4, 0, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = "#7a6a52";
            g.beginPath();
            g.ellipse(-size * 0.15, -size * 0.12, size * 0.3, size * 0.14, 0, 0, Math.PI * 2);
            g.fill();
          },
        });
      });

      survivors.forEach((s) => {
        if (s.state !== "stranded") return;
        const bob = Math.sin(elapsed * 3 + s.bobSeed) * 4;
        const base = project(s.x, s.y, bob, camera);
        if (isBehindCamera(base, camera)) return;
        if (base.depth > maxDepth) return;
        if (base.x < -80 || base.x > SCREEN_W + 80) return;
        const size = Math.min(SCREEN_H * 1.2, Math.max(6, 26 * base.scale * 1.4));
        const urgent = s.timeLeft < 25;
        sprites.push({
          depth: base.depth, x: base.x, y: base.y, alpha: 1,
          draw: () => {
            g.fillStyle = "#ff6b35";
            g.beginPath();
            g.arc(0, 0, size * 0.32, 0, Math.PI * 2);
            g.fill();
            g.strokeStyle = "#fff";
            g.lineWidth = Math.max(1, size * 0.08);
            g.stroke();
            g.fillStyle = "#f2d9c4";
            g.beginPath();
            g.arc(0, -size * 0.45, size * 0.16, 0, Math.PI * 2);
            g.fill();
            // waving arm
            const wave = Math.sin(elapsed * 6 + s.bobSeed) * 0.6;
            g.strokeStyle = "#f2d9c4";
            g.lineWidth = Math.max(1.5, size * 0.08);
            g.beginPath();
            g.moveTo(size * 0.1, -size * 0.4);
            g.lineTo(size * 0.35, -size * 0.75 - wave * size * 0.3);
            g.stroke();
            if (urgent) {
              g.fillStyle = `rgba(255,80,80,${0.5 + Math.sin(elapsed * 8) * 0.4})`;
              g.beginPath();
              g.arc(0, -size * 0.9, size * 0.12, 0, Math.PI * 2);
              g.fill();
            }
          },
        });
      });

      const dockBase = project(DOCK.x, DOCK.y, 0, camera);
      if (!isBehindCamera(dockBase, camera) && dockBase.depth < maxDepth &&
          dockBase.x > -200 && dockBase.x < SCREEN_W + 200) {
        const size = Math.min(SCREEN_H * 1.4, Math.max(20, 140 * dockBase.scale * 1.4));
        sprites.push({
          depth: dockBase.depth, x: dockBase.x, y: dockBase.y, alpha: 1,
          draw: () => {
            g.fillStyle = "#8a6a3a";
            g.fillRect(-size * 0.55, -size * 0.14, size * 1.1, size * 0.16);
            g.fillStyle = "#ffd166";
            g.fillRect(-size * 0.08, -size * 0.5, size * 0.16, size * 0.4);
            g.fillStyle = "#ff4757";
            g.beginPath();
            g.moveTo(size * 0.08, -size * 0.5);
            g.lineTo(size * 0.34, -size * 0.42);
            g.lineTo(size * 0.08, -size * 0.34);
            g.closePath();
            g.fill();
            g.fillStyle = "rgba(255,255,255,0.9)";
            g.font = `700 ${Math.max(8, size * 0.14)}px sans-serif`;
            g.textAlign = "center";
            g.fillText("DOCK", 0, size * 0.08);
          },
        });
      }

      sprites.sort((a, b) => b.depth - a.depth).forEach((sp) => {
        g.save();
        g.globalAlpha = sp.alpha;
        g.translate(sp.x, sp.y);
        sp.draw();
        g.restore();
      });
    }

    function drawRain() {
      const globalStorm = globalStormLevel();
      if (globalStorm < 0.05) return;
      g.strokeStyle = `rgba(200,220,255,${0.15 + globalStorm * 0.35})`;
      g.lineWidth = 1.4;
      rainDrops.forEach((d) => {
        d.y += d.speed * globalStorm * (1 / 60);
        d.x -= 60 * globalStorm * (1 / 60);
        if (d.y > SCREEN_H) { d.y = -10; d.x = Math.random() * SCREEN_W; }
        if (d.x < 0) d.x = SCREEN_W;
        g.beginPath();
        g.moveTo(d.x, d.y);
        g.lineTo(d.x - d.len * 0.3, d.y + d.len);
        g.stroke();
      });
    }

    function drawBoatCockpit() {
      const bob = Math.sin(elapsed * 1.6) * 4;
      const tilt = Math.sin(elapsed * 2.3) * 0.02;
      g.save();
      g.translate(SCREEN_W / 2, SCREEN_H - 30 + bob);
      g.rotate(tilt);
      g.fillStyle = "#e8734a";
      g.beginPath();
      g.moveTo(-140, 70);
      g.lineTo(140, 70);
      g.lineTo(90, 10);
      g.lineTo(-90, 10);
      g.closePath();
      g.fill();
      g.fillStyle = "#c85a35";
      g.fillRect(-60, -40, 120, 55);
      g.fillStyle = "#bcd8ea";
      g.fillRect(-45, -32, 90, 26);

      // rescued survivors currently aboard, sitting in the stern behind the
      // windshield — the whole point is to make "Aboard: 2/4" visible, not
      // just a HUD number
      for (let i = 0; i < boat.aboard; i++) {
        const px = -34 + i * 23;
        const py = 42 + Math.sin(elapsed * 5 + i * 2) * 1.5;
        g.fillStyle = "#ff6b35";
        g.beginPath();
        g.arc(px, py, 11, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#f2d9c4";
        g.beginPath();
        g.arc(px, py - 16, 7, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }

    // whichever destination actually matters right now: once you're carrying
    // anyone, getting them home outranks going after more people (especially
    // once the boat's full, where a lost survivor arrow would be actively
    // misleading — there's nowhere left to put them anyway)
    function priorityTarget() {
      if (boat.aboard > 0 && (boat.aboard >= BOAT_CAPACITY || !survivors.some((s) => s.state === "stranded"))) {
        return { x: DOCK.x, y: DOCK.y, label: "Home dock" };
      }
      const nearest = survivors.filter((s) => s.state === "stranded")
        .sort((a, b) => Math.hypot(a.x - boat.x, a.y - boat.y) - Math.hypot(b.x - boat.x, b.y - boat.y))[0];
      if (nearest) return { x: nearest.x, y: nearest.y, label: nearest.atIsland ? "Survivor on an island" : "Survivor in the water" };
      if (boat.aboard > 0) return { x: DOCK.x, y: DOCK.y, label: "Home dock" };
      return null;
    }

    // a full-world nautical-chart-style map (not a zoomed local radar) —
    // the whole point is answering "which island do I actually need to go
    // to", which needs the big picture, not just what's nearby
    function drawMiniMap() {
      const mapSize = 150;
      const mapX = SCREEN_W - mapSize - 16;
      const mapY = 16;
      const scale = mapSize / WORLD_SIZE;
      const toMap = (wx, wy) => ({ x: mapX + wx * scale, y: mapY + wy * scale });

      g.save();
      g.fillStyle = "rgba(8,16,28,0.78)";
      g.fillRect(mapX, mapY, mapSize, mapSize);
      g.beginPath();
      g.rect(mapX, mapY, mapSize, mapSize);
      g.clip();

      stormCells.forEach((c) => {
        const p = toMap(c.x, c.y);
        g.fillStyle = "rgba(130,130,160,0.22)";
        g.beginPath();
        g.arc(p.x, p.y, Math.max(2, c.radius * scale), 0, Math.PI * 2);
        g.fill();
      });

      islands.forEach((isl) => {
        const p = toMap(isl.x, isl.y);
        const hasWaiting = survivors.some((s) => s.atIsland === isl && s.state === "stranded");
        g.fillStyle = isl.isHome ? "#ffd166" : hasWaiting ? "#7fd88a" : "#4a6a3e";
        g.beginPath();
        g.arc(p.x, p.y, Math.max(2.5, isl.radius * scale), 0, Math.PI * 2);
        g.fill();
        if (isl.isHome) {
          g.strokeStyle = "#ff4757";
          g.lineWidth = 1.5;
          g.stroke();
        }
      });

      survivors.forEach((s) => {
        if (s.state !== "stranded" || s.atIsland) return;
        const p = toMap(s.x, s.y);
        g.fillStyle = "#ff6b35";
        g.beginPath();
        g.arc(p.x, p.y, 2, 0, Math.PI * 2);
        g.fill();
      });

      if (tsunami && tsunami.phase === "active") {
        const center = WORLD_SIZE / 2;
        const wx = center + tsunami.dir.x * tsunami.waveOffset;
        const wy = center + tsunami.dir.y * tsunami.waveOffset;
        const perp = { x: -tsunami.dir.y, y: tsunami.dir.x };
        const p1 = toMap(wx - perp.x * WORLD_SIZE, wy - perp.y * WORLD_SIZE);
        const p2 = toMap(wx + perp.x * WORLD_SIZE, wy + perp.y * WORLD_SIZE);
        g.strokeStyle = "rgba(150,200,235,0.9)";
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(p1.x, p1.y);
        g.lineTo(p2.x, p2.y);
        g.stroke();
      }

      const target = priorityTarget();
      if (target) {
        const p = toMap(target.x, target.y);
        g.strokeStyle = "rgba(255,255,255,0.6)";
        g.lineWidth = 1;
        g.setLineDash([3, 3]);
        const bp0 = toMap(boat.x, boat.y);
        g.beginPath();
        g.moveTo(bp0.x, bp0.y);
        g.lineTo(p.x, p.y);
        g.stroke();
        g.setLineDash([]);
      }

      const bp = toMap(boat.x, boat.y);
      g.save();
      g.translate(bp.x, bp.y);
      g.rotate(boat.angle);
      g.fillStyle = "#53e0ff";
      g.beginPath();
      g.moveTo(5, 0);
      g.lineTo(-4, -3.5);
      g.lineTo(-4, 3.5);
      g.closePath();
      g.fill();
      g.restore();

      g.restore();
      g.strokeStyle = "rgba(255,255,255,0.25)";
      g.lineWidth = 1.5;
      g.strokeRect(mapX, mapY, mapSize, mapSize);

      g.textAlign = "center";
      g.font = "600 9px sans-serif";
      g.fillStyle = "rgba(255,255,255,0.55)";
      g.fillText("MAP", mapX + mapSize / 2, mapY + mapSize + 12);
      if (target) {
        g.font = "700 10px sans-serif";
        g.fillStyle = "#ffd166";
        g.fillText(`→ ${target.label}`, mapX + mapSize / 2, mapY + mapSize + 25);
      }
    }

    function drawHud() {
      const diff = DIFFICULTIES[settings.difficulty];
      g.textAlign = "left";
      g.font = "700 13px sans-serif";
      g.fillStyle = "#f2f5ff";
      g.fillText(`Rescued ${rescuedCount}/${totalToSave()}`, 16, 24);
      const barW = 150;
      g.fillStyle = "rgba(0,0,0,0.5)";
      g.fillRect(16, 32, barW, 10);
      g.fillStyle = boat.hull > 40 ? "#9bff8f" : "#ff6b6b";
      g.fillRect(16, 32, barW * Math.max(0, boat.hull / HULL_MAX), 10);
      g.font = "600 11px sans-serif";
      g.fillStyle = "rgba(255,255,255,0.75)";
      g.fillText(`Hull ${Math.round(boat.hull)}%`, 16, 58);
      g.fillText(`Aboard: ${boat.aboard}/${BOAT_CAPACITY}`, 16, 74);

      g.textAlign = "left";
      g.font = "700 16px sans-serif";
      g.fillStyle = disasterTimer < 30 ? "#ff6b6b" : "#f2f5ff";
      const mm = Math.floor(disasterTimer / 60), ssec = Math.floor(disasterTimer % 60);
      g.fillText(`⛈ ${mm}:${String(ssec).padStart(2, "0")}`, 16, 100);

      drawMiniMap();

      g.textAlign = "left";
      g.font = "500 11px sans-serif";
      statusFeed.forEach((k, i) => {
        g.globalAlpha = Math.min(1, k.life);
        g.fillStyle = "rgba(255,255,255,0.85)";
        g.fillText(k.text, 16, SCREEN_H - 16 - i * 15);
        g.globalAlpha = 1;
      });
    }

    // renders the active tsunami as a tall wave-wall spanning the width of
    // the visible area at its current position, plus a warning banner while
    // it's still incoming — approximated as a handful of sampled points along
    // the sweep line near the boat rather than a true infinite wall, which is
    // more than enough given the camera's limited field of view
    function drawTsunami(camera) {
      if (!tsunami) return;
      if (tsunami.phase === "warning") {
        g.save();
        g.globalAlpha = 0.55 + Math.sin(elapsed * 6) * 0.35;
        g.fillStyle = "#ff6b6b";
        g.font = "700 22px sans-serif";
        g.textAlign = "center";
        g.fillText(`🌊 TSUNAMI IN ${Math.ceil(tsunami.warnTimer)}s — GET TO AN ISLAND`, SCREEN_W / 2, 56);
        g.restore();
        return;
      }
      const center = WORLD_SIZE / 2;
      const perp = { x: -tsunami.dir.y, y: tsunami.dir.x };
      const waveX = center + tsunami.dir.x * tsunami.waveOffset;
      const waveY = center + tsunami.dir.y * tsunami.waveOffset;
      const boatAlongPerp = (boat.x - waveX) * perp.x + (boat.y - waveY) * perp.y;
      const segments = 8;
      const spread = 800;
      const waveHeight = 130;
      const basePoints = [];
      const topPoints = [];
      for (let i = 0; i <= segments; i++) {
        const t = boatAlongPerp - spread + (spread * 2 * i) / segments;
        const wx = waveX + perp.x * t;
        const wy = waveY + perp.y * t;
        basePoints.push(project(wx, wy, 0, camera));
        topPoints.push(project(wx, wy, waveHeight + Math.sin(elapsed * 3 + i) * 12, camera));
      }
      g.save();
      g.fillStyle = "rgba(150,200,235,0.6)";
      g.beginPath();
      let started = false;
      topPoints.forEach((p, i) => {
        if (isBehindCamera(basePoints[i], camera)) return;
        if (!started) { g.moveTo(p.x, p.y); started = true; } else g.lineTo(p.x, p.y);
      });
      for (let i = basePoints.length - 1; i >= 0; i--) {
        if (isBehindCamera(basePoints[i], camera)) continue;
        g.lineTo(basePoints[i].x, basePoints[i].y);
      }
      g.closePath();
      if (started) g.fill();
      g.strokeStyle = "rgba(255,255,255,0.85)";
      g.lineWidth = 4;
      g.beginPath();
      started = false;
      topPoints.forEach((p, i) => {
        if (isBehindCamera(basePoints[i], camera)) return;
        if (!started) { g.moveTo(p.x, p.y); started = true; } else g.lineTo(p.x, p.y);
      });
      if (started) g.stroke();
      g.restore();

      const boatProj = (boat.x - center) * tsunami.dir.x + (boat.y - center) * tsunami.dir.y;
      const waveDist = Math.abs(boatProj - tsunami.waveOffset);
      if (waveDist < 400) {
        const closeness = 1 - clamp01(waveDist / 400);
        g.fillStyle = `rgba(120,180,220,${closeness * 0.35})`;
        g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      }
    }

    function draw() {
      if (!running) { g.fillStyle = "#123"; g.fillRect(0, 0, SCREEN_W, SCREEN_H); return; }
      const camera = createCamera();
      drawWater(camera);
      drawSprites(camera);
      drawTsunami(camera);
      drawRain();

      sparks.forEach((s) => {
        const p = project(s.x, s.y, 10, camera);
        g.fillStyle = `rgba(${s.color},${s.life / s.maxLife})`;
        g.beginPath();
        g.arc(p.x, p.y, 6 * (s.life / s.maxLife) + 2, 0, Math.PI * 2);
        g.fill();
      });
      popups.forEach((p) => {
        const proj = project(p.x, p.y, 30, camera);
        g.globalAlpha = Math.max(0, p.life / p.maxLife);
        g.fillStyle = p.color;
        g.font = "700 14px sans-serif";
        g.textAlign = "center";
        g.fillText(p.text, proj.x, proj.y);
        g.globalAlpha = 1;
      });

      drawBoatCockpit();
      drawHud();

      if (lightning > 0) {
        g.fillStyle = `rgba(255,255,255,${lightning * 1.4})`;
        g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      }

      if (joystick.active) {
        g.strokeStyle = "rgba(255,255,255,0.4)";
        g.lineWidth = 2;
        g.beginPath();
        g.arc(joystick.cx, joystick.cy, JOYSTICK_MAX_RADIUS, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = "rgba(255,255,255,0.55)";
        g.beginPath();
        g.arc(joystick.knobX, joystick.knobY, 16, 0, Math.PI * 2);
        g.fill();
      }
    }

    // ============ lifecycle ============
    function endGame(won) {
      if (over) return;
      running = false;
      over = true;
      const diff = DIFFICULTIES[settings.difficulty];
      playSound(won ? "win" : "lose");
      const best = ctx.storage.get("bestRescued", 0);
      if (rescuedCount > best) ctx.storage.set("bestRescued", rescuedCount);
      ctx.setStatus(won ? `All ${totalToSave()} people rescued!` : `Rescued ${rescuedCount}/${totalToSave()} — mission ended.`);
      setTimeout(() => {
        ctx.showOverlay({
          title: won ? "Everyone's Safe!" : (boat.hull <= 0 ? "Boat Lost" : "Storm Overtook You"),
          subtitle: won
            ? `You saved all ${totalToSave()} people before the storm hit full force.`
            : `${rescuedCount}/${totalToSave()} rescued, ${lostCount} lost to the storm. Best run: ${Math.max(rescuedCount, best)}.`,
          buttonText: "Try Again",
          onButton: startGame,
        });
      }, 500);
    }

    function startGame() {
      buildWorld();
      running = true;
      over = false;
      pushFeed("Storm inbound — get everyone to the dock!");
      updateStatus();
    }

    let lastTime = 0;
    let rafId = null;
    function loop(now) {
      const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0.016;
      lastTime = now;
      update(dt);
      draw();
      // this game reads the gamepad itself while the boat is out — keep the
      // hub's site-wide gamepad cursor (js/pad-cursor.js) out of the way so
      // it doesn't drift across the water on top of active gameplay
      window.MimiPadCursor?.setSuppressed(running && !over);
      rafId = requestAnimationFrame(loop);
    }

    running = false; over = false;
    buildWorld();
    draw();
    ctx.setStatus("Ready at the dock.");
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
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
    };
  },
});
