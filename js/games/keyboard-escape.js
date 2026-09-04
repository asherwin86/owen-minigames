/* Keyboard Escape — a candy-obby speed runner.
 *
 * The genre: a line of oversized keycap platforms stretches out ahead, each
 * stamped with a letter. Press that exact key before the ring around it
 * empties and you hop forward, a little faster than last time. Guess wrong,
 * or freeze up, and you slip off the near edge and land back on the last
 * checkpoint — chocolate-brown tiles every five hops — a little slower than
 * you were. Three slips and the run's over.
 *
 * Physical keyboard players type the letter shown, and any other letter
 * counts as a slip — that's the actual "keyboard" test. There's no way to
 * show 26 keys on a touchscreen, so touch and gamepad get the same tile's
 * letter alongside three decoy letters as on-screen buttons instead: still a
 * genuine pick, just a multiple-choice one. Gamepad reaches those buttons
 * through the hub's own on-screen cursor (window.MimiPadCursor) rather than
 * custom button polling — this game is fundamentally a rapid menu-click, not
 * a twin-stick game, so the cursor the hub already ships for menus is the
 * right tool, and it's never suppressed here.
 */
MimiGames.register({
  id: "keyboard-escape",
  title: "Keyboard Escape",
  emoji: "🍬",
  category: "Action",
  players: "1P",
  howTo: "A line of candy keycaps stretches ahead. Type the letter shown on the next one before the ring runs out to hop forward and pick up speed. Wrong key, or too slow, and you slip back to the last checkpoint tile. Three slips ends the run. No keyboard handy? Tap the matching candy button instead — gamepad users can click it with the hub's usual pad cursor.",
  init(root, ctx) {
    const SCREEN_W = 900, SCREEN_H = 480;
    const TRACK_Y = SCREEN_H * 0.6;
    const TILE_GAP = 128;
    const TILE_SIZE = 72;
    const GEN_AHEAD = 10;
    const CHECKPOINT_EVERY = 5;
    const LIVES_START = 3;
    const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function clamp01(v) { return clamp(v, 0, 1); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function tileX(i) { return i * TILE_GAP; }
    function tileY(i) { return TRACK_Y + Math.sin(i * 0.7) * 10; }
    function isCheckpoint(i) { return i % CHECKPOINT_EVERY === 0; }

    // Speed level ramps difficulty (and reward) exactly like the genre's
    // "every hop = +1 speed" hook, floored so it never becomes unplayable.
    function reactionWindow(level) { return Math.max(0.55, 1.9 - level * 0.035); }
    function leapDuration(level) { return Math.max(0.15, 0.42 - level * 0.006); }
    function scrollSpeedFor(level) { return 260 + level * 9; }

    // ============ DOM ============
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "10px";

    const topRow = document.createElement("div");
    topRow.style.display = "flex";
    topRow.style.gap = "8px";
    topRow.style.flexWrap = "wrap";
    topRow.style.justifyContent = "center";
    const avatarBtn = document.createElement("button");
    avatarBtn.className = "btn";
    const startBtn = document.createElement("button");
    startBtn.className = "btn primary";
    startBtn.textContent = "Start Run";
    startBtn.onclick = startRun;
    topRow.append(avatarBtn, startBtn);

    const canvasWrap = document.createElement("div");
    canvasWrap.className = "mimi-fullscreen-stage";
    canvasWrap.style.position = "relative";
    canvasWrap.style.maxWidth = "100%";

    const canvas = document.createElement("canvas");
    canvas.width = SCREEN_W;
    canvas.height = SCREEN_H;
    canvas.style.borderRadius = "10px";
    canvas.style.border = "2px solid var(--border)";
    canvas.style.maxWidth = "100%";
    canvas.style.display = "block";
    const g = canvas.getContext("2d");
    canvasWrap.appendChild(canvas);

    const choiceRow = document.createElement("div");
    choiceRow.className = "ke-choices";

    wrap.append(topRow, canvasWrap, choiceRow);
    root.appendChild(wrap);

    function syncAvatarBtn() {
      avatarBtn.textContent = `${window.MimiAvatars ? window.MimiAvatars.currentEmoji() : "🍬"} Avatar`;
    }
    syncAvatarBtn();
    avatarBtn.onclick = () => {
      window.MimiAvatars?.openPicker({ title: "Pick your runner", onPick: syncAvatarBtn });
    };
    const unsubAvatar = window.MimiAvatars?.onChange(syncAvatarBtn);

    let extraLife = false;
    ctx.devCheatPanel(root, [
      { label: "Speed +5", run: () => { speedLevel += 5; } },
      { label: "Extra Life", run: () => { lives += 1; syncHearts(); } },
      { label: "Score +100", run: () => { score += 100; } },
    ]);

    // ============ state ============
    let tiles = [];
    let currentIndex = 0;
    let playerX = 0, playerY = tileY(0);
    let camX = 0;
    let phase = "idle"; // idle | waiting | leaping | falling | over
    let timer = 0;
    let windowTime = reactionWindow(0);
    let speedLevel = 0;
    let lastCheckpointIndex = 0;
    let lastCheckpointSpeed = 0;
    let lives = LIVES_START;
    let score = 0;
    let leapFrom = 0, leapTo = 0, leapT = 0;
    let fallT = 0;
    let target = null; // { letter, choices: [...] }
    let popups = [];
    let running = false;

    function ensureTiles(uptoIndex) {
      while (tiles.length <= uptoIndex + GEN_AHEAD) {
        const i = tiles.length;
        let letter;
        do { letter = LETTERS[Math.floor(Math.random() * LETTERS.length)]; }
        while (i > 0 && letter === tiles[i - 1].letter);
        tiles.push({ index: i, letter, checkpoint: isCheckpoint(i) });
      }
    }

    function pickChoices(letter) {
      const pool = LETTERS.filter((l) => l !== letter);
      const decoys = [];
      while (decoys.length < 3) {
        const l = pool[Math.floor(Math.random() * pool.length)];
        if (!decoys.includes(l)) decoys.push(l);
      }
      const choices = [letter, ...decoys];
      for (let i = choices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [choices[i], choices[j]] = [choices[j], choices[i]];
      }
      return choices;
    }

    function renderChoices() {
      choiceRow.innerHTML = "";
      if (!target || phase !== "waiting") return;
      target.choices.forEach((letter) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ke-choice";
        btn.textContent = letter;
        btn.addEventListener("click", () => attemptLetter(letter));
        choiceRow.appendChild(btn);
      });
    }

    function beginWaiting() {
      ensureTiles(currentIndex + 1);
      const next = tiles[currentIndex + 1];
      target = { letter: next.letter, choices: pickChoices(next.letter) };
      windowTime = reactionWindow(speedLevel);
      timer = windowTime;
      phase = "waiting";
      renderChoices();
    }

    function spawnPopup(text, color) {
      popups.push({ x: playerX, y: playerY - 50, life: 1, text, color: color || "#fff" });
    }

    function attemptLetter(letter) {
      if (phase !== "over" && !running) return;
      if (phase !== "waiting" || !target) return;
      if (letter === target.letter) succeed();
      else slip();
    }

    function succeed() {
      leapFrom = currentIndex;
      leapTo = currentIndex + 1;
      leapT = 0;
      phase = "leaping";
      choiceRow.innerHTML = "";
      speedLevel = Math.min(60, speedLevel + 1);
      const points = 10 + speedLevel * 2;
      score += points;
      spawnPopup(`+${points}`, "#7ee81c");
      ctx.playSound(isCheckpoint(leapTo) ? "success" : "pop");
    }

    function landLeap() {
      currentIndex = leapTo;
      playerX = tileX(currentIndex);
      playerY = tileY(currentIndex);
      if (isCheckpoint(currentIndex)) {
        lastCheckpointIndex = currentIndex;
        lastCheckpointSpeed = speedLevel;
        spawnPopup("Checkpoint!", "#ffd166");
      }
      beginWaiting();
    }

    function slip() {
      phase = "falling";
      fallT = 0;
      choiceRow.innerHTML = "";
      lives -= 1;
      syncHearts();
      ctx.playSound("error");
      ctx.vibrate(80);
    }

    function landFall() {
      currentIndex = lastCheckpointIndex;
      speedLevel = lastCheckpointSpeed;
      playerX = tileX(currentIndex);
      playerY = tileY(currentIndex);
      if (lives <= 0) { endRun(); return; }
      beginWaiting();
    }

    function heartsText() {
      let s = "";
      for (let i = 0; i < LIVES_START; i += 1) s += i < lives ? "❤️" : "🖤";
      return s;
    }
    function syncHearts() { /* drawn each frame in drawHud, nothing to sync separately */ }

    function resetState() {
      tiles = [];
      currentIndex = 0;
      ensureTiles(0);
      playerX = tileX(0);
      playerY = tileY(0);
      camX = playerX;
      speedLevel = 0;
      lastCheckpointIndex = 0;
      lastCheckpointSpeed = 0;
      lives = LIVES_START;
      score = 0;
      popups = [];
      leapT = 0; fallT = 0;
      phase = "idle";
    }

    function startRun() {
      resetState();
      running = true;
      beginWaiting();
      ctx.setStatus("Type the letter on the next candy tile!");
    }

    function endRun() {
      running = false;
      phase = "over";
      choiceRow.innerHTML = "";
      ctx.playSound("lose");
      const bestScore = ctx.storage.get("bestScore", 0);
      const bestDistance = ctx.storage.get("bestDistance", 0);
      const isNewBest = score > bestScore;
      ctx.storage.set("bestScore", Math.max(bestScore, Math.floor(score)));
      ctx.storage.set("bestDistance", Math.max(bestDistance, currentIndex));
      ctx.reportScore(Math.floor(score));
      ctx.setStatus(`Run over — Score: ${Math.floor(score)}, reached tile ${currentIndex}.`);
      window.setTimeout(() => {
        ctx.showOverlay({
          title: "Slipped Up!",
          subtitle: `Score: ${Math.floor(score)} · Tile ${currentIndex}${isNewBest ? " · New Best!" : ` · Best: ${Math.max(Math.floor(score), bestScore)}`}`,
          buttonText: "Run Again",
          onButton: startRun,
        });
      }, 400);
    }

    // ============ input ============
    function isTypingInField() {
      const tag = document.activeElement?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA";
    }
    function onKeydown(e) {
      if (e.repeat || isTypingInField()) return;
      const letter = e.key && e.key.length === 1 ? e.key.toUpperCase() : "";
      if (!LETTERS.includes(letter)) return;
      attemptLetter(letter);
    }
    document.addEventListener("keydown", onKeydown);

    // ============ update ============
    function update(dt) {
      if (!running) return;
      if (phase === "waiting") {
        timer -= dt;
        if (timer <= 0) slip();
      } else if (phase === "leaping") {
        leapT += dt / leapDuration(speedLevel);
        if (leapT >= 1) { leapT = 1; landLeap(); }
      } else if (phase === "falling") {
        fallT += dt / 0.55;
        if (fallT >= 1) { fallT = 1; landFall(); }
      }

      const desiredCam = playerX - SCREEN_W * 0.3;
      camX = lerp(camX, desiredCam, Math.min(1, dt * 6));

      popups.forEach((p) => { p.life -= dt * 1.1; p.y -= dt * 30; });
      popups = popups.filter((p) => p.life > 0);
    }

    // ============ draw ============
    function screenX(worldX) { return worldX - camX; }

    function drawBackground() {
      const grad = g.createLinearGradient(0, 0, 0, SCREEN_H);
      grad.addColorStop(0, "#ffd7ef");
      grad.addColorStop(1, "#c9b6ff");
      g.fillStyle = grad;
      g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      // slow parallax candy dots
      for (let i = 0; i < 26; i += 1) {
        const wx = Math.floor(camX * 0.4 / 220) * 220 + (i % 13) * 220;
        const sx = screenX(wx) * 0.4 + (camX * 0.6);
        const sy = 40 + ((i * 53) % 260);
        const size = 10 + (i % 3) * 6;
        g.globalAlpha = 0.35;
        g.font = `${size * 2}px sans-serif`;
        g.textAlign = "center";
        g.fillText(i % 2 === 0 ? "🍡" : "🍥", sx % (SCREEN_W + 200) - 100, sy);
      }
      g.globalAlpha = 1;
    }

    function drawTrack() {
      g.fillStyle = "rgba(255,255,255,0.35)";
      g.fillRect(0, TRACK_Y + TILE_SIZE * 0.55, SCREEN_W, 6);
    }

    function drawTile(i) {
      const sx = screenX(tileX(i));
      if (sx < -TILE_SIZE || sx > SCREEN_W + TILE_SIZE) return;
      const sy = tileY(i);
      const cp = tiles[i].checkpoint;
      const half = TILE_SIZE / 2;
      g.save();
      g.translate(sx, sy);
      const grad = g.createLinearGradient(0, -half, 0, half);
      if (cp) { grad.addColorStop(0, "#c98a4b"); grad.addColorStop(1, "#7a4a20"); }
      else { grad.addColorStop(0, "#ffffff"); grad.addColorStop(1, "#dfe3ee"); }
      g.fillStyle = grad;
      g.strokeStyle = cp ? "#ffd166" : "#9aa0b4";
      g.lineWidth = cp ? 3 : 2;
      const r = 14;
      g.beginPath();
      g.moveTo(-half + r, -half);
      g.arcTo(half, -half, half, half, r);
      g.arcTo(half, half, -half, half, r);
      g.arcTo(-half, half, -half, -half, r);
      g.arcTo(-half, -half, half, -half, r);
      g.closePath();
      g.fill();
      g.stroke();

      g.fillStyle = cp ? "#fff3d6" : "#2b2f3a";
      g.font = "800 30px sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(tiles[i].letter, 0, 2);
      g.restore();

      // ring countdown on the active target tile
      if (phase === "waiting" && i === currentIndex + 1) {
        const frac = clamp01(timer / windowTime);
        g.save();
        g.translate(sx, sy);
        g.beginPath();
        g.arc(0, 0, half + 10, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
        g.strokeStyle = frac > 0.5 ? "#35d07f" : frac > 0.25 ? "#ffd93d" : "#ff4757";
        g.lineWidth = 5;
        g.stroke();
        g.restore();
      }
    }

    function drawTiles() {
      const first = Math.max(0, currentIndex - 2);
      const last = Math.min(tiles.length - 1, currentIndex + GEN_AHEAD);
      for (let i = first; i <= last; i += 1) drawTile(i);
    }

    function drawPlayer() {
      let px, py, alpha = 1;
      if (phase === "leaping") {
        const t = leapT;
        px = lerp(tileX(leapFrom), tileX(leapTo), t);
        const yBase = lerp(tileY(leapFrom), tileY(leapTo), t);
        py = yBase - Math.sin(t * Math.PI) * 46;
      } else if (phase === "falling") {
        px = playerX;
        py = playerY + fallT * fallT * 140;
        alpha = 1 - fallT;
      } else {
        px = playerX;
        py = playerY + Math.sin(performance.now() / 260) * 3;
      }
      const sx = screenX(px);
      g.save();
      g.globalAlpha = alpha;
      g.font = "48px sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(window.MimiAvatars ? window.MimiAvatars.currentEmoji() : "🍬", sx, py - TILE_SIZE / 2 - 20);
      g.restore();
    }

    function drawPopups() {
      popups.forEach((p) => {
        g.globalAlpha = clamp01(p.life);
        g.fillStyle = p.color;
        g.font = "700 16px sans-serif";
        g.textAlign = "center";
        g.fillText(p.text, screenX(p.x), p.y);
      });
      g.globalAlpha = 1;
    }

    function drawHud() {
      g.textAlign = "left";
      g.font = "700 20px sans-serif";
      g.fillStyle = "#2b2135";
      g.fillText(`Score: ${Math.floor(score)}`, 16, 30);
      g.font = "600 12px sans-serif";
      g.fillText(`Tile ${currentIndex} · Speed x${speedLevel}`, 16, 50);

      g.textAlign = "right";
      g.font = "20px sans-serif";
      g.fillText(heartsText(), SCREEN_W - 16, 30);
    }

    function draw() {
      g.clearRect(0, 0, SCREEN_W, SCREEN_H);
      drawBackground();
      drawTrack();
      drawTiles();
      drawPlayer();
      drawPopups();
      if (running) {
        drawHud();
      } else {
        g.fillStyle = "rgba(40,20,50,0.35)";
        g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      }
    }

    // ============ lifecycle ============
    let lastTime = 0;
    let rafId = null;
    function loop(now) {
      const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0.016;
      lastTime = now;
      update(dt);
      draw();
      rafId = requestAnimationFrame(loop);
    }

    resetState();
    draw();
    ctx.setStatus("Click Start Run to begin.");
    rafId = requestAnimationFrame(loop);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      document.removeEventListener("keydown", onKeydown);
      if (unsubAvatar) unsubAvatar();
    };
  },
});
