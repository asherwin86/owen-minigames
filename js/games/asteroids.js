MimiGames.register({
  id: "asteroids",
  title: "Asteroids",
  emoji: "☄️",
  category: "Action",
  players: "1P",
  howTo: "Rotate with Left/Right (or A/D), thrust with Up (or W), fire with Space. Gamepad: D-pad to rotate/thrust, any face button to fire (Start un-hides the controller cursor if you need it). Destroy asteroids for points — big ones split into smaller ones. Avoid collisions; you have 3 lives. Screen wraps at the edges.",
  init(root, ctx) {
    const W = 480, H = 480;
    const SHIP_TURN_SPEED = 3.6; // rad/s
    const SHIP_THRUST = 220; // px/s^2
    const SHIP_MAX_SPEED = 320;
    const SHIP_FRICTION = 0.4; // per second, fraction of velocity lost
    const BULLET_SPEED = 420;
    const BULLET_LIFE = 0.9;
    const SHOOT_COOLDOWN = 0.22;
    const RESPAWN_INVULN = 2.2;

    const state = {
      score: 0,
      lives: 3,
      level: 1,
      running: false,
      over: false,
      invincible: false,
    };

    // --- persisted settings, Kart-Circuit-style: a small options panel on the
    // setup screen, toggle buttons that relabel themselves, saved across visits
    const SETTINGS_KEY = "asteroidsSettings";
    const DIFFICULTIES = {
      easy: { label: "Easy", startCount: 3, speedMult: 0.78, lives: 4 },
      normal: { label: "Normal", startCount: 4, speedMult: 1, lives: 3 },
      hard: { label: "Hard", startCount: 6, speedMult: 1.35, lives: 3 },
    };
    const settings = Object.assign(
      { difficulty: "normal", soundEnabled: true, shakeEnabled: true },
      ctx.storage.get(SETTINGS_KEY, {}),
    );
    function saveSettings() {
      ctx.storage.set(SETTINGS_KEY, settings);
    }
    function playSound(name) {
      if (settings.soundEnabled) ctx.playSound(name);
    }

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
      const next = keys[(keys.indexOf(settings.difficulty) + 1) % keys.length];
      settings.difficulty = next;
      saveSettings();
      syncSettingsUI();
    };

    const soundBtn = document.createElement("button");
    soundBtn.className = "btn";
    soundBtn.onclick = () => {
      settings.soundEnabled = !settings.soundEnabled;
      saveSettings();
      syncSettingsUI();
    };

    const shakeBtn = document.createElement("button");
    shakeBtn.className = "btn";
    shakeBtn.onclick = () => {
      settings.shakeEnabled = !settings.shakeEnabled;
      saveSettings();
      syncSettingsUI();
    };

    function syncSettingsUI() {
      difficultyBtn.textContent = `Difficulty: ${DIFFICULTIES[settings.difficulty].label}`;
      soundBtn.textContent = `Sound: ${settings.soundEnabled ? "On" : "Off"}`;
      shakeBtn.textContent = `Screen Shake: ${settings.shakeEnabled ? "On" : "Off"}`;
    }
    syncSettingsUI();

    settingsPanel.appendChild(difficultyBtn);
    settingsPanel.appendChild(soundBtn);
    settingsPanel.appendChild(shakeBtn);

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.style.background = "#05070d";
    canvas.style.border = "2px solid var(--border)";
    canvas.style.borderRadius = "10px";
    canvas.style.touchAction = "none";
    canvas.style.maxWidth = "100%";
    const g = canvas.getContext("2d");

    const hint = document.createElement("div");
    hint.style.color = "var(--text-dim)";
    hint.style.fontSize = ".8rem";
    hint.textContent = "Arrows/WASD to fly, Space to fire.";

    const touchRow = document.createElement("div");
    touchRow.style.display = "flex";
    touchRow.style.gap = "8px";
    touchRow.style.flexWrap = "wrap";
    touchRow.style.justifyContent = "center";
    const touchButtons = [
      ["◀", "left"], ["🔥 Thrust", "thrust"], ["▶", "right"], ["💥 Fire", "fire"],
    ];
    const touchState = { left: false, right: false, thrust: false, fire: false };
    touchButtons.forEach(([label, key]) => {
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = label;
      btn.style.touchAction = "none";
      const set = (v) => (e) => { e.preventDefault(); touchState[key] = v; };
      btn.addEventListener("pointerdown", set(true));
      btn.addEventListener("pointerup", set(false));
      btn.addEventListener("pointerleave", set(false));
      touchRow.appendChild(btn);
    });

    const restartBtn = document.createElement("button");
    restartBtn.className = "btn primary";
    restartBtn.textContent = "Start Game";
    restartBtn.onclick = startGame;

    wrap.appendChild(settingsPanel);
    wrap.appendChild(canvas);
    wrap.appendChild(hint);
    wrap.appendChild(touchRow);
    wrap.appendChild(restartBtn);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Invincible: Off",
        run(e) {
          state.invincible = !state.invincible;
          e.target.textContent = `Invincible: ${state.invincible ? "On" : "Off"}`;
        },
      },
      { label: "Add Score +500", run: () => { state.score += 500; updateStatus(); } },
    ]);

    let ship, bullets, asteroids, particles;
    let shakeTimer = 0;

    function resetShip() {
      ship = {
        x: W / 2, y: H / 2, angle: -Math.PI / 2,
        vx: 0, vy: 0, radius: 12,
        invuln: RESPAWN_INVULN, shootTimer: 0,
      };
    }

    function makeAsteroid(x, y, size) {
      // size: 3 = large, 2 = medium, 1 = small
      const speed = (30 + (4 - size) * 25 + Math.random() * 30) * DIFFICULTIES[settings.difficulty].speedMult;
      const angle = Math.random() * Math.PI * 2;
      const radius = size * 16;
      const points = [];
      const vertCount = 8 + Math.floor(Math.random() * 4);
      for (let i = 0; i < vertCount; i++) {
        const a = (i / vertCount) * Math.PI * 2;
        const r = radius * (0.75 + Math.random() * 0.45);
        points.push({ a, r });
      }
      return {
        x, y, size, radius,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        rotation: 0, rotSpeed: (Math.random() - 0.5) * 1.5,
        points,
      };
    }

    function spawnWave(count) {
      asteroids = [];
      for (let i = 0; i < count; i++) {
        let x, y;
        do {
          x = Math.random() * W;
          y = Math.random() * H;
        } while (Math.hypot(x - W / 2, y - H / 2) < 100);
        asteroids.push(makeAsteroid(x, y, 3));
      }
    }

    function wrapPos(obj) {
      if (obj.x < -obj.radius) obj.x = W + obj.radius;
      if (obj.x > W + obj.radius) obj.x = -obj.radius;
      if (obj.y < -obj.radius) obj.y = H + obj.radius;
      if (obj.y > H + obj.radius) obj.y = -obj.radius;
    }

    function spawnParticles(x, y, count, color) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const speed = 30 + Math.random() * 90;
        particles.push({
          x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
          life: 0.4 + Math.random() * 0.4, maxLife: 0.8, color,
        });
      }
    }

    const keys = new Set();
    function onKeydown(e) {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space", "KeyA", "KeyD", "KeyW"].includes(e.code)) {
        e.preventDefault();
      }
      keys.add(e.code);
    }
    function onKeyup(e) {
      keys.delete(e.code);
    }
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("keyup", onKeyup);

    function isLeft() { return keys.has("ArrowLeft") || keys.has("KeyA") || touchState.left; }
    function isRight() { return keys.has("ArrowRight") || keys.has("KeyD") || touchState.right; }
    function isThrust() { return keys.has("ArrowUp") || keys.has("KeyW") || touchState.thrust; }
    function isFire() { return keys.has("Space") || touchState.fire; }

    // Gamepad: the hub's site-wide D-pad-to-arrow-keys bridge (js/pad-cursor.js)
    // already turns/thrusts, so the only thing missing is Fire — reuse the
    // same touchState.fire flag the on-screen fire button sets, held (not
    // edge-triggered) so holding the button holds fire, same as Space.
    // Buttons 0 (B) and 9 (Start) are excluded: that same bridge reserves
    // them everywhere as "back to the game grid" and "un-hide the cursor".
    function pollGamepad() {
      if (typeof navigator.getGamepads !== "function") return;
      const pad = Array.from(navigator.getGamepads()).find((p) => p?.connected);
      touchState.fire = Boolean(pad && pad.buttons.some((button, index) => index !== 0 && index !== 9 && button?.pressed));
    }

    function fireBullet() {
      if (ship.shootTimer > 0) return;
      ship.shootTimer = SHOOT_COOLDOWN;
      bullets.push({
        x: ship.x + Math.cos(ship.angle) * ship.radius,
        y: ship.y + Math.sin(ship.angle) * ship.radius,
        vx: Math.cos(ship.angle) * BULLET_SPEED + ship.vx,
        vy: Math.sin(ship.angle) * BULLET_SPEED + ship.vy,
        life: BULLET_LIFE,
      });
      playSound("hit");
    }

    function splitAsteroid(asteroid) {
      spawnParticles(asteroid.x, asteroid.y, 10, "180,180,190");
      const points = asteroid.size === 3 ? 20 : asteroid.size === 2 ? 50 : 100;
      state.score += points;
      if (asteroid.size > 1) {
        for (let i = 0; i < 2; i++) {
          asteroids.push(makeAsteroid(asteroid.x, asteroid.y, asteroid.size - 1));
        }
      }
      playSound("pop");
    }

    function loseLife() {
      spawnParticles(ship.x, ship.y, 18, "255,150,80");
      playSound("fail");
      if (settings.shakeEnabled) shakeTimer = 0.35;
      state.lives -= 1;
      if (state.lives <= 0) {
        endGame();
      } else {
        resetShip();
      }
    }

    function update(dt) {
      updateStatus();
      shakeTimer = Math.max(0, shakeTimer - dt);
      if (!state.running) return;

      if (isLeft()) ship.angle -= SHIP_TURN_SPEED * dt;
      if (isRight()) ship.angle += SHIP_TURN_SPEED * dt;
      if (isThrust()) {
        ship.vx += Math.cos(ship.angle) * SHIP_THRUST * dt;
        ship.vy += Math.sin(ship.angle) * SHIP_THRUST * dt;
        if (Math.random() < 0.6) {
          spawnParticles(
            ship.x - Math.cos(ship.angle) * ship.radius,
            ship.y - Math.sin(ship.angle) * ship.radius,
            1, "255,200,80",
          );
        }
      }
      const speed = Math.hypot(ship.vx, ship.vy);
      if (speed > SHIP_MAX_SPEED) {
        ship.vx = (ship.vx / speed) * SHIP_MAX_SPEED;
        ship.vy = (ship.vy / speed) * SHIP_MAX_SPEED;
      }
      ship.vx *= 1 - SHIP_FRICTION * dt;
      ship.vy *= 1 - SHIP_FRICTION * dt;
      ship.x += ship.vx * dt;
      ship.y += ship.vy * dt;
      wrapPos(ship);
      ship.shootTimer = Math.max(0, ship.shootTimer - dt);
      ship.invuln = Math.max(0, ship.invuln - dt);
      if (isFire()) fireBullet();

      bullets.forEach((b) => {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        wrapPos({ ...b, radius: 0 });
        // wrap manually since spread above doesn't mutate b
        if (b.x < 0) b.x = W; else if (b.x > W) b.x = 0;
        if (b.y < 0) b.y = H; else if (b.y > H) b.y = 0;
      });
      bullets = bullets.filter((b) => b.life > 0);

      asteroids.forEach((a) => {
        a.x += a.vx * dt;
        a.y += a.vy * dt;
        a.rotation += a.rotSpeed * dt;
        wrapPos(a);
      });

      particles.forEach((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
      });
      particles = particles.filter((p) => p.life > 0);

      // bullet-asteroid collisions
      for (let i = asteroids.length - 1; i >= 0; i--) {
        const a = asteroids[i];
        for (let j = bullets.length - 1; j >= 0; j--) {
          const b = bullets[j];
          if (Math.hypot(a.x - b.x, a.y - b.y) < a.radius) {
            bullets.splice(j, 1);
            asteroids.splice(i, 1);
            splitAsteroid(a);
            break;
          }
        }
      }

      // ship-asteroid collisions
      if (ship.invuln <= 0 && !state.invincible) {
        for (const a of asteroids) {
          if (Math.hypot(a.x - ship.x, a.y - ship.y) < a.radius + ship.radius * 0.6) {
            loseLife();
            break;
          }
        }
      }

      if (asteroids.length === 0 && state.running) {
        state.level += 1;
        playSound("success");
        spawnWave(Math.min(3 + state.level, 9));
      }
    }

    function updateStatus() {
      ctx.setStatus(`Score: ${state.score} · Lives: ${state.lives} · Wave ${state.level}`);
    }

    function drawShip() {
      if (ship.invuln > 0 && Math.floor(ship.invuln * 8) % 2 === 0) return; // blink
      g.save();
      g.translate(ship.x, ship.y);
      g.rotate(ship.angle);
      g.strokeStyle = "#7fd8f5";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(14, 0);
      g.lineTo(-10, -9);
      g.lineTo(-5, 0);
      g.lineTo(-10, 9);
      g.closePath();
      g.stroke();
      if (isThrust() && state.running) {
        g.strokeStyle = "#ffb347";
        g.beginPath();
        g.moveTo(-5, -4);
        g.lineTo(-16 - Math.random() * 6, 0);
        g.lineTo(-5, 4);
        g.stroke();
      }
      g.restore();
    }

    function draw() {
      g.save();
      if (shakeTimer > 0) {
        const mag = shakeTimer * 14;
        g.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
      }
      g.fillStyle = "#05070d";
      g.fillRect(0, 0, W, H);

      // starfield
      g.fillStyle = "rgba(255,255,255,0.5)";
      for (let i = 0; i < 40; i++) {
        const sx = (i * 137.5) % W;
        const sy = (i * 71.3) % H;
        g.fillRect(sx, sy, 1, 1);
      }

      g.strokeStyle = "#c9ced8";
      g.lineWidth = 1.5;
      asteroids.forEach((a) => {
        g.save();
        g.translate(a.x, a.y);
        g.rotate(a.rotation);
        g.beginPath();
        a.points.forEach((p, i) => {
          const x = Math.cos(p.a) * p.r;
          const y = Math.sin(p.a) * p.r;
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        });
        g.closePath();
        g.stroke();
        g.restore();
      });

      g.fillStyle = "#ffe58a";
      bullets.forEach((b) => {
        g.beginPath();
        g.arc(b.x, b.y, 2.2, 0, Math.PI * 2);
        g.fill();
      });

      particles.forEach((p) => {
        const alpha = Math.max(0, p.life / p.maxLife);
        g.fillStyle = `rgba(${p.color},${alpha})`;
        g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      });

      if (state.running) drawShip();

      if (!state.running && !state.over) {
        g.fillStyle = "rgba(255,255,255,0.9)";
        g.font = "600 18px sans-serif";
        g.textAlign = "center";
        g.fillText("Press Start to launch", W / 2, H / 2);
      }
      g.restore();
    }

    function endGame() {
      state.running = false;
      state.over = true;
      const best = ctx.storage.get("best", 0);
      const newBest = Math.max(best, state.score);
      ctx.storage.set("best", newBest);
      playSound(state.score > best ? "win" : "lose");
      ctx.setStatus(`Game Over — Score: ${state.score} · Best: ${newBest}`);
      setTimeout(() => {
        ctx.showOverlay({
          title: "Game Over",
          subtitle: `Score: ${state.score} · Best: ${newBest}`,
          buttonText: "Play Again",
          onButton: startGame,
        });
      }, 400);
    }

    function startGame() {
      const diff = DIFFICULTIES[settings.difficulty];
      state.score = 0;
      state.lives = diff.lives;
      state.level = 1;
      state.running = true;
      state.over = false;
      bullets = [];
      particles = [];
      shakeTimer = 0;
      resetShip();
      spawnWave(diff.startCount);
      updateStatus();
    }

    let lastTime = 0;
    let rafId = null;
    function loop(now) {
      const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0.016;
      lastTime = now;
      pollGamepad();
      update(dt);
      draw();
      // the D-pad already flies via the hub's site-wide arrow-key bridge
      // (js/pad-cursor.js) and Fire is polled above — keep that bridge's own
      // gamepad cursor out of the way while actually playing
      window.MimiPadCursor?.setSuppressed(state.running);
      rafId = requestAnimationFrame(loop);
    }

    bullets = [];
    asteroids = [];
    particles = [];
    resetShip();
    draw();
    ctx.setStatus("Press Start to launch");
    rafId = requestAnimationFrame(loop);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.MimiPadCursor?.setSuppressed(false);
      document.removeEventListener("keydown", onKeydown);
      document.removeEventListener("keyup", onKeyup);
    };
  },
});
