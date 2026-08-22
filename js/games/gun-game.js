MimiGames.register({
  id: "gun-game",
  title: "Gun Game Arena",
  emoji: "🔫",
  category: "Action",
  tags: ["3D"],
  players: "1-20P",
  howTo: "A first-person team deathmatch. WASD/arrows to move (arrows also turn), mouse to look (click the arena once to lock the mouse, click again to fire), Space also fires, 1/2/3 (or LB/RB on a gamepad, or the 🔄 button on touch) switch between your Primary, Secondary, and Melee weapons — pick your Primary in the lobby (better ones unlock as you win matches), Secondary (Pistol) and Melee (Knife) are always available, and you keep the same loadout for the whole match. First team to 30 kills wins. Health packs (glowing green crosses) are scattered around the map and heal you when you're hurt. Choose a map in the lobby — Crossfire, Twin Towers, or The Maze, each with a different layout. Gamepad supported (left stick move, right stick look, RT/A to fire; Start un-hides the controller cursor if you need it). On touch devices: drag the left half of the screen to move, drag the right half to look, tap 🔥 to fire, tap 🔄 to switch weapons. There's a Fullscreen button in the top-left of the arena too. Play solo against bots, or host/join a room over your network — set each team's size from 1 to 10 (1v1 up to 10v10, or lopsided sizes like 1v3), and empty slots fill in with bots.",
  init(root, ctx) {
    const SCREEN_W = 960, SCREEN_H = 540;
    const ARENA_W = 800, ARENA_H = 520;
    const FOV = 1.25; // ~72°
    const HALF_FOV = FOV / 2;
    const WALL_SCALE = 280;
    const PLAYER_RADIUS = 14;
    const BOT_RADIUS = 14;
    const MOVE_SPEED = 190;
    const TURN_SPEED = 2.4; // rad/s, keyboard/gamepad
    const MOUSE_SENSITIVITY = 0.0028;
    const BOT_DETECT_RANGE = 420;
    const HEALTH_MAX = 100;
    const RESPAWN_DELAY = 1.7;
    const STATE_HZ_MS = 80;

    const WEAPONS = [
      { name: "Pistol", color: "#cbd5e1", dmg: 34, cooldown: 0.38, spread: 0.05, range: 900, pellets: 1 },
      { name: "SMG", color: "#53e0ff", dmg: 16, cooldown: 0.1, spread: 0.1, range: 640, pellets: 1 },
      { name: "Shotgun", color: "#ffb347", dmg: 11, cooldown: 0.75, spread: 0.4, range: 300, pellets: 6 },
      { name: "Rifle", color: "#9bff8f", dmg: 40, cooldown: 0.26, spread: 0.02, range: 1000, pellets: 1 },
      { name: "Sniper", color: "#ff6b6b", dmg: 120, cooldown: 1.1, spread: 0.006, range: 1200, pellets: 1 },
      { name: "Knife", color: "#ffd166", dmg: 999, cooldown: 0.45, spread: 0, range: 42, pellets: 0, melee: true },
    ];

    const TEAM_COLOR = { red: "#ff6b6b", blue: "#53e0ff" };
    const BOT_NAMES = ["Rook", "Blaze", "Nova", "Drift", "Jinx", "Pulse", "Volt", "Ember", "Mint", "Axel"];

    // Loadout: a real team-deathmatch loadout instead of the old "every kill
    // auto-upgrades your one gun" ladder — pick a Primary before the match
    // and keep it, plus an always-available Secondary (Pistol) and Melee
    // (Knife) you can swap to any time with 1/2/3. Better primaries are
    // earned with match wins (the wins counter already existed, it just
    // wasn't spent on anything).
    const SECONDARY_TIER = 0; // Pistol
    const MELEE_TIER = WEAPONS.length - 1; // Knife
    const PRIMARY_TIERS = [1, 2, 3, 4]; // SMG, Shotgun, Rifle, Sniper
    const PRIMARY_WINS_REQUIRED = { 1: 0, 2: 3, 3: 6, 4: 10 };
    const KILL_TARGET = 30;
    function totalWins() { return ctx.storage.get("wins", 0); }
    function primaryUnlocked(tier) { return totalWins() >= PRIMARY_WINS_REQUIRED[tier]; }
    function clampPrimary(tier) {
      if (!PRIMARY_TIERS.includes(tier) || !primaryUnlocked(tier)) return PRIMARY_TIERS[0];
      return tier;
    }
    let selectedPrimary = clampPrimary(ctx.storage.get("gunGamePrimary", PRIMARY_TIERS[0]));
    function buildLoadout(primaryTier) { return [primaryTier, SECONDARY_TIER, MELEE_TIER]; }

    const SETTINGS_KEY = "gunGameSettings";
    const settings = Object.assign({ soundEnabled: true }, ctx.storage.get(SETTINGS_KEY, {}));
    function saveSettings() { ctx.storage.set(SETTINGS_KEY, settings); }
    function playSound(name) { if (settings.soundEnabled) ctx.playSound(name); }

    // the hub's profile system (js/profiles.js) shares this page's localStorage,
    // so prefill with whoever's signed in rather than making them retype it
    function activeProfileName() {
        try {
            const session = JSON.parse(localStorage.getItem("mimiActiveSession") || "null");
            return session?.name || null;
        } catch (e) {
            return null;
        }
    }

    // every map shares the same outer walls — only the interior layout
    // (and therefore the fair fights it produces) actually changes
    const BOUNDARY_WALLS = [
      { x: 0, y: 0, w: ARENA_W, h: 16 },
      { x: 0, y: ARENA_H - 16, w: ARENA_W, h: 16 },
      { x: 0, y: 0, w: 16, h: ARENA_H },
      { x: ARENA_W - 16, y: 0, w: 16, h: ARENA_H },
    ];

    // Maps to choose from in the lobby. Each one is just a different
    // interior obstacle layout (plus matching zones/pickup spots) — the
    // raycaster, spawn logic, and everything else is layout-agnostic and
    // already reads OBSTACLES/RED_ZONE/BLUE_ZONE/pickups as plain variables,
    // so switching maps is just swapping what those point to (applyMap,
    // below) rather than rewriting any rendering or gameplay code.
    const MAPS = {
      crossfire: {
        label: "Crossfire",
        desc: "The original layout — four corner blocks and a cross of cover in the middle.",
        obstacles: [
          { x: 150, y: 90, w: 90, h: 26 },
          { x: 560, y: 90, w: 90, h: 26 },
          { x: 150, y: 404, w: 90, h: 26 },
          { x: 560, y: 404, w: 90, h: 26 },
          { x: 375, y: 60, w: 26, h: 100 },
          { x: 375, y: 360, w: 26, h: 100 },
          { x: 375, y: 240, w: 26, h: 40 },
          { x: 250, y: 240, w: 100, h: 24 },
          { x: 450, y: 240, w: 100, h: 24 },
        ],
        redZone: { x0: 30, x1: 190, y0: 40, y1: 480 },
        blueZone: { x0: 610, x1: 770, y0: 40, y1: 480 },
        pickupSpots: [{ x: 400, y: 150 }, { x: 400, y: 370 }, { x: 270, y: 300 }, { x: 530, y: 300 }],
      },
      towers: {
        label: "Twin Towers",
        desc: "Two big central pillars split the arena into open flanking lanes — longer sightlines, favors the Rifle/Sniper.",
        obstacles: [
          { x: 300, y: 150, w: 70, h: 220 },
          { x: 430, y: 150, w: 70, h: 220 },
          { x: 190, y: 80, w: 60, h: 20 },
          { x: 190, y: 420, w: 60, h: 20 },
          { x: 550, y: 80, w: 60, h: 20 },
          { x: 550, y: 420, w: 60, h: 20 },
        ],
        redZone: { x0: 30, x1: 190, y0: 40, y1: 480 },
        blueZone: { x0: 610, x1: 770, y0: 40, y1: 480 },
        pickupSpots: [{ x: 400, y: 260 }, { x: 220, y: 260 }, { x: 580, y: 260 }, { x: 400, y: 60 }],
      },
      maze: {
        label: "The Maze",
        desc: "Tight symmetric corridors and a blocked-off center — close-range, favors the Shotgun/SMG.",
        obstacles: [
          { x: 120, y: 140, w: 140, h: 20 },
          { x: 120, y: 360, w: 140, h: 20 },
          { x: 540, y: 140, w: 140, h: 20 },
          { x: 540, y: 360, w: 140, h: 20 },
          { x: 340, y: 60, w: 20, h: 160 },
          { x: 340, y: 300, w: 20, h: 160 },
          { x: 440, y: 60, w: 20, h: 160 },
          { x: 440, y: 300, w: 20, h: 160 },
          { x: 372, y: 236, w: 56, h: 48 },
        ],
        redZone: { x0: 30, x1: 170, y0: 40, y1: 480 },
        blueZone: { x0: 630, x1: 770, y0: 40, y1: 480 },
        pickupSpots: [{ x: 190, y: 260 }, { x: 610, y: 260 }, { x: 400, y: 150 }, { x: 400, y: 370 }],
      },
    };
    const MAP_KEYS = Object.keys(MAPS);

    // Health packs: the only way to recover HP used to be dying and
    // respawning at full health, which made staying alive at low health
    // strictly worse than just diving in for a trade — these give a reason
    // to fight for map control around the center instead of just the two
    // team zones. Positions come from the selected map (applyMap, below) and
    // are clear of every wall in that map's own obstacle layout. Fully
    // deterministic (same countdown math everywhere, no extra network
    // messages needed): each client heals its OWN entities only — "me"
    // locally, and bots too if it's the host — the exact same ownership
    // split damage already uses, so results reach every peer through the
    // playerState/botState broadcasts that already exist.
    const PICKUP_HEAL = 45;
    const PICKUP_RESPAWN = 14;
    const PICKUP_RADIUS = 26;

    let currentMapKey = ctx.storage.get("gunGameMap", "crossfire");
    if (!MAPS[currentMapKey]) currentMapKey = "crossfire";
    let OBSTACLES = [];
    let RED_ZONE = null;
    let BLUE_ZONE = null;
    let pickups = [];
    function applyMap(key) {
      const map = MAPS[key] || MAPS.crossfire;
      currentMapKey = MAPS[key] ? key : "crossfire";
      OBSTACLES = [...BOUNDARY_WALLS, ...map.obstacles];
      RED_ZONE = map.redZone;
      BLUE_ZONE = map.blueZone;
      pickups = map.pickupSpots.map((p) => ({ ...p, active: true, respawnTimer: 0 }));
    }
    applyMap(currentMapKey);

    // --- lobby / network state ---
    let networkRole = "idle"; // idle | host | guest
    let networked = false;
    let socket = null;
    let selfId = "self";
    let roomCode = "";
    const remoteInfo = new Map(); // peerId -> { name, team }
    let myName = "Player";
    let myTeam = "red";
    const teamSize = { red: 1, blue: 1 };
    let matchRunning = false;
    let matchOver = false;
    let teamKills = { red: 0, blue: 0 };

    // --- entities ---
    let me, bots, remotePlayers, tracers, sparks, popups, killFeed;
    let pointerLocked = false;
    let hasEngagedLook = false;
    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    let lastStateSent = 0;

    // ============ DOM / lobby UI ============
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "10px";

    const lobby = document.createElement("div");
    lobby.style.display = "flex";
    lobby.style.flexDirection = "column";
    lobby.style.gap = "10px";
    lobby.style.alignItems = "center";
    lobby.style.width = "100%";
    lobby.style.maxWidth = "620px";

    const nameRow = document.createElement("div");
    nameRow.style.display = "flex";
    nameRow.style.gap = "8px";
    nameRow.style.flexWrap = "wrap";
    nameRow.style.justifyContent = "center";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "Your name";
    nameInput.maxLength = 14;
    nameInput.value = activeProfileName() || ctx.storage.get("name", "");
    const soundBtn = document.createElement("button");
    soundBtn.className = "btn";
    const soloBtn = document.createElement("button");
    soloBtn.className = "btn primary";
    soloBtn.textContent = "Play Solo (vs Bots)";
    const hostBtn = document.createElement("button");
    hostBtn.className = "btn";
    hostBtn.textContent = "Host Room";
    const codeInput = document.createElement("input");
    codeInput.type = "text";
    codeInput.placeholder = "Code";
    codeInput.maxLength = 4;
    codeInput.style.width = "70px";
    codeInput.style.textTransform = "uppercase";
    const joinBtn = document.createElement("button");
    joinBtn.className = "btn";
    joinBtn.textContent = "Join Room";
    nameRow.append(nameInput, soundBtn, soloBtn, hostBtn, codeInput, joinBtn);

    const netStatus = document.createElement("div");
    netStatus.style.color = "var(--text-dim)";
    netStatus.style.fontSize = ".8rem";
    netStatus.textContent = "Play solo, or host/join a room with friends on your network.";

    const roomInfo = document.createElement("div");
    roomInfo.style.display = "none";
    roomInfo.style.color = "var(--text-dim)";
    roomInfo.style.fontSize = ".8rem";
    roomInfo.style.textAlign = "center";

    // ---- map picker (host/solo only — guests get whatever the host picks
    // when the match actually starts) ----
    const mapSection = document.createElement("div");
    mapSection.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:4px";
    const mapSectionLabel = document.createElement("div");
    mapSectionLabel.style.cssText = "font-size:.78rem;font-weight:700;color:var(--text-dim)";
    mapSectionLabel.textContent = "Map";
    const mapRow = document.createElement("div");
    mapRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;justify-content:center";
    const mapButtons = {};
    MAP_KEYS.forEach((key) => {
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = MAPS[key].label;
      btn.title = MAPS[key].desc;
      btn.onclick = () => {
        if (networkRole !== "host" && networkRole !== "idle") return;
        currentMapKey = key;
        ctx.storage.set("gunGameMap", key);
        syncLobbyUI();
      };
      mapButtons[key] = btn;
      mapRow.appendChild(btn);
    });
    const mapDesc = document.createElement("div");
    mapDesc.style.cssText = "font-size:.72rem;color:var(--text-dim);max-width:420px;text-align:center";
    mapSection.append(mapSectionLabel, mapRow, mapDesc);

    // ---- loadout picker: Primary is your choice (better ones earned with
    // wins), Secondary (Pistol) and Melee (Knife) are always available —
    // switch freely between all three with 1/2/3 during the match, and keep
    // the same loadout the whole game instead of climbing a ladder ----
    const loadoutSection = document.createElement("div");
    loadoutSection.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:4px";
    const loadoutSectionLabel = document.createElement("div");
    loadoutSectionLabel.style.cssText = "font-size:.78rem;font-weight:700;color:var(--text-dim)";
    loadoutSectionLabel.textContent = "Primary Weapon";
    const loadoutRow = document.createElement("div");
    loadoutRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;justify-content:center";
    const loadoutButtons = [];
    PRIMARY_TIERS.forEach((tier) => {
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.onclick = () => {
        if (!primaryUnlocked(tier)) return;
        selectedPrimary = tier;
        ctx.storage.set("gunGamePrimary", tier);
        syncLobbyUI();
      };
      loadoutButtons.push(btn);
      loadoutRow.appendChild(btn);
    });
    const loadoutHint = document.createElement("div");
    loadoutHint.style.cssText = "font-size:.72rem;color:var(--text-dim);text-align:center";
    loadoutHint.textContent = "Secondary: Pistol · Melee: Knife — both always available, switch with 1/2/3 in-match.";
    loadoutSection.append(loadoutSectionLabel, loadoutRow, loadoutHint);

    const teamRow = document.createElement("div");
    teamRow.style.display = "flex";
    teamRow.style.gap = "14px";
    teamRow.style.flexWrap = "wrap";
    teamRow.style.justifyContent = "center";

    function makeTeamPanel(team) {
      const panel = document.createElement("div");
      panel.style.border = `2px solid ${TEAM_COLOR[team]}`;
      panel.style.borderRadius = "10px";
      panel.style.padding = "8px 12px";
      panel.style.minWidth = "220px";
      panel.style.textAlign = "center";
      const title = document.createElement("div");
      title.style.fontWeight = "700";
      title.style.color = TEAM_COLOR[team];
      title.textContent = team === "red" ? "Red Team" : "Blue Team";
      const joinTeamBtn = document.createElement("button");
      joinTeamBtn.className = "btn";
      joinTeamBtn.textContent = `Join ${team === "red" ? "Red" : "Blue"}`;
      joinTeamBtn.onclick = () => setMyTeam(team);
      const sizeRow = document.createElement("div");
      sizeRow.style.display = "flex";
      sizeRow.style.alignItems = "center";
      sizeRow.style.justifyContent = "center";
      sizeRow.style.gap = "6px";
      sizeRow.style.margin = "6px 0";
      const minusBtn = document.createElement("button");
      minusBtn.className = "btn";
      minusBtn.textContent = "−";
      minusBtn.onclick = () => changeTeamSize(team, -1);
      const sizeLabel = document.createElement("span");
      sizeLabel.style.minWidth = "70px";
      sizeLabel.style.display = "inline-block";
      const plusBtn = document.createElement("button");
      plusBtn.className = "btn";
      plusBtn.textContent = "+";
      plusBtn.onclick = () => changeTeamSize(team, 1);
      sizeRow.append(minusBtn, sizeLabel, plusBtn);
      const members = document.createElement("div");
      members.style.fontSize = ".75rem";
      members.style.color = "var(--text-dim)";
      panel.append(title, joinTeamBtn, sizeRow, members);
      return { panel, sizeLabel, members, minusBtn, plusBtn };
    }
    const redPanel = makeTeamPanel("red");
    const bluePanel = makeTeamPanel("blue");
    teamRow.append(redPanel.panel, bluePanel.panel);

    const startRow = document.createElement("div");
    startRow.style.display = "flex";
    startRow.style.gap = "8px";
    const startBtn = document.createElement("button");
    startBtn.className = "btn primary";
    startBtn.textContent = "Start Match";
    startBtn.onclick = startMatch;
    const leaveBtn = document.createElement("button");
    leaveBtn.className = "btn";
    leaveBtn.textContent = "Leave Room";
    leaveBtn.style.display = "none";
    leaveBtn.onclick = leaveRoom;
    startRow.append(startBtn, leaveBtn);

    lobby.append(nameRow, netStatus, roomInfo, mapSection, loadoutSection, teamRow, startRow);

    const canvasWrap = document.createElement("div");
    canvasWrap.className = "mimi-fullscreen-stage";
    canvasWrap.style.position = "relative";
    canvasWrap.style.maxWidth = "100%";
    canvasWrap.style.display = "none";

    const canvas = document.createElement("canvas");
    canvas.width = SCREEN_W;
    canvas.height = SCREEN_H;
    canvas.style.background = "#1b2032";
    canvas.style.border = "2px solid var(--border)";
    canvas.style.borderRadius = "10px";
    canvas.style.touchAction = "none";
    canvas.style.maxWidth = "100%";
    canvas.style.display = "block";
    canvas.style.cursor = "crosshair";
    const g = canvas.getContext("2d");

    // touch controls: left half of the canvas is a virtual joystick (move),
    // right half drags to look (mouse-look via Pointer Lock isn't available on
    // iOS/most tablets), plus a dedicated fire button — tapping the look zone
    // itself can't also fire, or you couldn't look and shoot independently
    const touchFireBtn = document.createElement("button");
    touchFireBtn.textContent = "🔥 FIRE";
    touchFireBtn.style.cssText = `
      position:absolute; right:18px; bottom:18px; width:84px; height:84px;
      border-radius:50%; border:3px solid rgba(255,255,255,0.55);
      background:rgba(255,90,40,0.55); color:#fff; font-weight:700; font-size:13px;
      touch-action:none; user-select:none; -webkit-user-select:none; z-index:5;
    `;
    const touchLookHint = document.createElement("div");
    touchLookHint.textContent = "Drag to look";
    touchLookHint.style.cssText = `
      position:absolute; left:50%; bottom:14px; transform:translateX(-50%);
      color:rgba(255,255,255,0.55); font-size:12px; font-weight:600;
      pointer-events:none; z-index:4;
    `;

    // cycles Primary → Secondary → Melee → Primary — a single compact button
    // rather than 3 separate ones, there's not much spare screen real estate
    // on a phone once the joystick zone, look zone, and fire button are all
    // already claiming their own share of it
    const touchSwitchBtn = document.createElement("button");
    touchSwitchBtn.textContent = "🔄";
    touchSwitchBtn.style.cssText = `
      position:absolute; right:24px; bottom:112px; width:52px; height:52px;
      border-radius:50%; border:2px solid rgba(255,255,255,0.5);
      background:rgba(30,40,60,0.6); color:#fff; font-size:20px;
      touch-action:none; user-select:none; -webkit-user-select:none; z-index:5;
    `;
    touchSwitchBtn.addEventListener("touchstart", (e) => { e.preventDefault(); cycleWeapon(1); }, { passive: false });

    const fullscreenBtn = document.createElement("button");
    fullscreenBtn.className = "btn";
    fullscreenBtn.textContent = "Fullscreen: Off";
    fullscreenBtn.style.cssText = "position:absolute; left:50%; top:8px; transform:translateX(-50%); z-index:5; opacity:0.85; font-size:12px; padding:4px 10px;";

    canvasWrap.append(canvas, touchFireBtn, touchSwitchBtn, touchLookHint, fullscreenBtn);
    if (!isTouchDevice) {
      touchFireBtn.style.display = "none";
      touchSwitchBtn.style.display = "none";
      touchLookHint.style.display = "none";
    }

    const backToLobbyBtn = document.createElement("button");
    backToLobbyBtn.className = "btn";
    backToLobbyBtn.textContent = "← Back to Lobby";
    backToLobbyBtn.onclick = () => stopMatch(false);

    wrap.append(lobby, canvasWrap, backToLobbyBtn);
    root.appendChild(wrap);
    backToLobbyBtn.style.display = "none";

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
          if (!matchRunning || matchOver) return;
          teamKills[myTeam] = KILL_TARGET;
          if (networked) netSend({ kind: "teamKills", red: teamKills.red, blue: teamKills.blue });
          updateStatus();
          declareMatchOver(myTeam, myName);
        },
      },
    ]);

    // ============ fullscreen ============
    function isFullscreenActive() {
      return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    }
    // max-width/max-height alone never make a canvas GROW past its intrinsic
    // pixel size (960x540 here) — only cap it — so entering fullscreen left
    // the canvas tiny in a corner of an otherwise-black screen. Compute the
    // largest size that fits the viewport while keeping the aspect ratio and
    // set it explicitly, same technique real game engines use.
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
      try {
        if (isFullscreenActive()) await exit();
        else await request();
      } catch (e) { /* user gesture requirements vary by browser; fail quietly */ }
      syncFullscreenBtn();
    }
    fullscreenBtn.onclick = toggleFullscreen;
    document.addEventListener("fullscreenchange", syncFullscreenBtn);
    document.addEventListener("webkitfullscreenchange", syncFullscreenBtn);
    window.addEventListener("resize", resizeCanvasForFullscreen);
    syncFullscreenBtn();

    function syncSettingsUI() {
      soundBtn.textContent = `Sound: ${settings.soundEnabled ? "On" : "Off"}`;
    }
    soundBtn.onclick = () => { settings.soundEnabled = !settings.soundEnabled; saveSettings(); syncSettingsUI(); };
    syncSettingsUI();

    function setMyTeam(team) {
      myTeam = team;
      if (networked) sendLobby();
      syncLobbyUI();
    }
    function changeTeamSize(team, delta) {
      const isHost = networkRole === "host" || networkRole === "idle";
      if (!isHost) return;
      teamSize[team] = Math.max(1, Math.min(10, teamSize[team] + delta));
      if (networked) sendMatchSize();
      syncLobbyUI();
    }

    function realCountOnTeam(team) {
      let n = myTeam === team ? 1 : 0;
      remoteInfo.forEach((p) => { if (p.team === team) n += 1; });
      return n;
    }

    function syncLobbyUI() {
      const isHostLike = networkRole === "host" || networkRole === "idle";
      redPanel.sizeLabel.textContent = `Red: ${teamSize.red}`;
      bluePanel.sizeLabel.textContent = `Blue: ${teamSize.blue}`;
      redPanel.minusBtn.disabled = redPanel.plusBtn.disabled = !isHostLike;
      bluePanel.minusBtn.disabled = bluePanel.plusBtn.disabled = !isHostLike;
      const redNames = ["You"].filter(() => myTeam === "red")
        .concat(Array.from(remoteInfo.values()).filter((p) => p.team === "red").map((p) => p.name));
      const blueNames = ["You"].filter(() => myTeam === "blue")
        .concat(Array.from(remoteInfo.values()).filter((p) => p.team === "blue").map((p) => p.name));
      redPanel.members.textContent = (redNames.length ? redNames.join(", ") : "—") +
        ` + ${Math.max(0, teamSize.red - realCountOnTeam("red"))} bots`;
      bluePanel.members.textContent = (blueNames.length ? blueNames.join(", ") : "—") +
        ` + ${Math.max(0, teamSize.blue - realCountOnTeam("blue"))} bots`;
      startBtn.style.display = isHostLike ? "" : "none";
      leaveBtn.style.display = networked ? "" : "none";
      // Host/Join were always clickable even while already in a room —
      // nothing stopped a stray click from opening a second connection and
      // joining the same room again as a ghost duplicate of yourself. Hide
      // them once connected; Leave Room (above) is the only way back.
      hostBtn.style.display = networked ? "none" : "";
      joinBtn.style.display = networked ? "none" : "";
      codeInput.style.display = networked ? "none" : "";
      if (networked) {
        roomInfo.style.display = "";
        roomInfo.textContent = `Room code: ${roomCode} — share this with friends on your network.` +
          (networkRole === "guest" ? " Waiting for the host to start." : "");
      } else {
        roomInfo.style.display = "none";
      }

      MAP_KEYS.forEach((key) => {
        const btn = mapButtons[key];
        btn.classList.toggle("primary", key === currentMapKey);
        btn.disabled = !isHostLike;
      });
      mapDesc.textContent = MAPS[currentMapKey].desc + (isHostLike ? "" : " (set by the host)");

      selectedPrimary = clampPrimary(selectedPrimary);
      loadoutButtons.forEach((btn, i) => {
        const tier = PRIMARY_TIERS[i];
        const unlocked = primaryUnlocked(tier);
        btn.disabled = !unlocked;
        btn.classList.toggle("primary", tier === selectedPrimary);
        btn.textContent = unlocked
          ? WEAPONS[tier].name
          : `🔒 ${WEAPONS[tier].name} (${PRIMARY_WINS_REQUIRED[tier]} wins)`;
      });
    }
    syncLobbyUI();

    // ============ geometry helpers ============
    function pointBlockedByObstacle(x, y, pad) {
      pad = pad || 0;
      for (const r of OBSTACLES) {
        if (x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad) return true;
      }
      return false;
    }
    function lineOfSight(x1, y1, x2, y2) {
      const dist = Math.hypot(x2 - x1, y2 - y1);
      const steps = Math.max(1, Math.floor(dist / 10));
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        if (pointBlockedByObstacle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 0)) return false;
      }
      return true;
    }
    function pushOutOfObstacles(entity, radius) {
      for (const r of OBSTACLES) {
        const cx = Math.max(r.x, Math.min(entity.x, r.x + r.w));
        const cy = Math.max(r.y, Math.min(entity.y, r.y + r.h));
        const dx = entity.x - cx, dy = entity.y - cy;
        const d = Math.hypot(dx, dy);
        if (d < radius && d > 0.001) {
          entity.x = cx + (dx / d) * radius;
          entity.y = cy + (dy / d) * radius;
        } else if (d <= 0.001) {
          entity.x += radius;
        }
      }
      entity.x = Math.max(radius + 2, Math.min(ARENA_W - radius - 2, entity.x));
      entity.y = Math.max(radius + 2, Math.min(ARENA_H - radius - 2, entity.y));
    }
    function pickSpawnInZone(zone, others) {
      let best = null, bestScore = -1;
      for (let i = 0; i < 24; i++) {
        const x = zone.x0 + Math.random() * (zone.x1 - zone.x0);
        const y = zone.y0 + Math.random() * (zone.y1 - zone.y0);
        if (pointBlockedByObstacle(x, y, 20)) continue;
        if (!others.length) return { x, y };
        let minDist = Infinity;
        others.forEach((o) => { minDist = Math.min(minDist, Math.hypot(x - o.x, y - o.y)); });
        if (minDist > bestScore) { bestScore = minDist; best = { x, y }; }
      }
      return best || { x: (zone.x0 + zone.x1) / 2, y: (zone.y0 + zone.y1) / 2 };
    }
    function zoneFor(team) { return team === "red" ? RED_ZONE : BLUE_ZONE; }

    // ray vs axis-aligned obstacle; returns {t, side} or null. side 1=vertical(E/W) face, 0=horizontal(N/S)
    function rayAABB(ox, oy, dx, dy, rect) {
      let tx1, tx2;
      if (dx === 0) {
        if (ox < rect.x || ox > rect.x + rect.w) return null;
        tx1 = -Infinity; tx2 = Infinity;
      } else {
        tx1 = (rect.x - ox) / dx; tx2 = (rect.x + rect.w - ox) / dx;
        if (tx1 > tx2) { const t = tx1; tx1 = tx2; tx2 = t; }
      }
      let ty1, ty2;
      if (dy === 0) {
        if (oy < rect.y || oy > rect.y + rect.h) return null;
        ty1 = -Infinity; ty2 = Infinity;
      } else {
        ty1 = (rect.y - oy) / dy; ty2 = (rect.y + rect.h - oy) / dy;
        if (ty1 > ty2) { const t = ty1; ty1 = ty2; ty2 = t; }
      }
      const tmin = Math.max(tx1, ty1);
      const tmax = Math.min(tx2, ty2);
      if (tmax < 0 || tmin > tmax) return null;
      const t = tmin >= 0 ? tmin : tmax;
      if (t < 0) return null;
      return { t, side: tmin === tx1 ? 1 : 0 };
    }
    function castWall(ox, oy, angle) {
      const dx = Math.cos(angle), dy = Math.sin(angle);
      let bestT = Infinity, bestSide = 0;
      for (const r of OBSTACLES) {
        const hit = rayAABB(ox, oy, dx, dy, r);
        if (hit && hit.t < bestT) { bestT = hit.t; bestSide = hit.side; }
      }
      return { t: bestT, side: bestSide };
    }

    // ============ entity factories ============
    function weaponOf(entity) { return WEAPONS[entity.weaponTier]; }
    function makeMe() {
      const sp = pickSpawnInZone(zoneFor(myTeam), []);
      const loadout = buildLoadout(clampPrimary(selectedPrimary));
      return {
        id: selfId, isPlayer: true, isBot: false, name: myName, team: myTeam,
        x: sp.x, y: sp.y, angle: myTeam === "red" ? 0 : Math.PI,
        health: HEALTH_MAX, loadout, equippedSlot: 0, weaponTier: loadout[0],
        cooldown: 0, respawnTimer: 0, alive: true,
      };
    }
    function makeBot(team, index, occupied) {
      const sp = pickSpawnInZone(zoneFor(team), occupied);
      const loadout = buildLoadout(PRIMARY_TIERS[index % PRIMARY_TIERS.length]);
      return {
        id: `bot-${team}-${index}`, isPlayer: false, isBot: true,
        name: BOT_NAMES[index % BOT_NAMES.length] + (team === "red" ? " R" : " B"),
        team, x: sp.x, y: sp.y, angle: Math.random() * Math.PI * 2,
        health: HEALTH_MAX, loadout, equippedSlot: 0, weaponTier: loadout[0], cooldown: Math.random() * 0.4,
        respawnTimer: 0, alive: true, state: "patrol", waypoint: null, targetId: null,
      };
    }
    function allEntities() {
      return [me, ...remotePlayers.values(), ...bots];
    }
    function findEntity(id) {
      if (id === selfId) return me;
      if (remotePlayers.has(id)) return remotePlayers.get(id);
      return bots.find((b) => b.id === id) || null;
    }
    function isHostRole() { return networkRole === "host" || networkRole === "idle"; }

    function respawnEntity(entity) {
      const others = allEntities().filter((e) => e !== entity && e.alive);
      const sp = pickSpawnInZone(zoneFor(entity.team), others);
      entity.x = sp.x; entity.y = sp.y;
      entity.health = HEALTH_MAX;
      entity.alive = true;
      entity.respawnTimer = 0;
      entity.cooldown = 0.3;
    }

    function updatePickups(dt) {
      pickups.forEach((p) => {
        if (p.active) return;
        p.respawnTimer -= dt;
        if (p.respawnTimer <= 0) p.active = true;
      });
    }

    // entity must be one this client actually owns the health of — see the
    // comment on the pickups array above for why that's "me" always, and
    // bots only for whoever's hosting
    function tryCollectPickup(entity) {
      if (!entity || !entity.alive || entity.health >= HEALTH_MAX) return;
      for (const p of pickups) {
        if (!p.active) continue;
        if (Math.hypot(entity.x - p.x, entity.y - p.y) > PICKUP_RADIUS) continue;
        p.active = false;
        p.respawnTimer = PICKUP_RESPAWN;
        entity.health = Math.min(HEALTH_MAX, entity.health + PICKUP_HEAL);
        if (entity === me) {
          playSound("powerUp");
          spawnPopup(entity.x, entity.y, `+${PICKUP_HEAL} HP`, "#9bff8f");
        }
        return;
      }
    }

    function spawnSpark(x, y, color) { sparks.push({ x, y, life: 0.25, maxLife: 0.25, color: color || "255,220,140" }); }
    function spawnPopup(x, y, text, color) { popups.push({ x, y, life: 0.9, maxLife: 0.9, text, color: color || "#f2f5ff" }); }
    function pushFeed(text) { killFeed.unshift({ text, life: 4.5 }); killFeed = killFeed.slice(0, 4); }

    // ============ damage / kill-credit (authority-aware) ============
    function localApplyDamage(entity, dmg) {
      if (!entity.alive) return false;
      if (entity === me && devInvincible) return false;
      entity.health -= dmg;
      spawnSpark(entity.x, entity.y, "255,255,255");
      if (entity.health <= 0) {
        entity.alive = false;
        entity.respawnTimer = RESPAWN_DELAY;
        spawnPopup(entity.x, entity.y - 20, entity.isPlayer && entity.id === selfId ? "You went down" : `${entity.name} down`, "#ff8a8a");
        return true;
      }
      return false;
    }

    // shooter and victim are LOCAL objects the caller already owns authority over
    // Broadcast whenever WE'RE the client that just counted a kill (see the
    // comment on creditKillLocal below for exactly which client that is per
    // kill) — every other client takes the max of what it already has vs.
    // what it receives, so an out-of-order message can only ever push a
    // team's count forward, never back it up.
    function bumpTeamKills(team) {
      teamKills[team] += 1;
      if (networked) netSend({ kind: "teamKills", red: teamKills.red, blue: teamKills.blue });
    }

    // creditKillLocal only ever runs on ONE client per kill — the killer's
    // own client for a human kill (relayed via the killCredit broadcast), or
    // the host for a bot kill (bots are host-authoritative) — never on
    // every peer at once, which is exactly why the score itself needs its
    // own explicit sync (bumpTeamKills) instead of just trusting local state.
    function creditKillLocal(killer, victimName) {
      bumpTeamKills(killer.team);
      const label = killer.team === "red" ? "Red" : "Blue";
      pushFeed(`${killer.id === selfId ? "You" : killer.name} eliminated ${victimName} (${weaponOf(killer).name}) — ${label} ${teamKills[killer.team]}/${KILL_TARGET}`);
      if (killer.id === selfId) playSound("success");
      if (teamKills[killer.team] >= KILL_TARGET) {
        declareMatchOver(killer.team, killer.name);
      }
    }

    function declareMatchOver(winningTeam, winnerName) {
      if (matchOver) return;
      if (networked) netSend({ kind: "matchOver", winningTeam, winnerName });
      endMatch(winningTeam, winnerName);
    }

    // Called when MY shot (hitscan, computed locally) lands on `target`.
    function registerHit(shooter, target, dmg) {
      spawnSpark(target.x, target.y, "255,255,255");
      if (!networked) {
        // fully local authority: apply immediately
        const died = localApplyDamage(target, dmg);
        if (shooter.id === selfId) playSound("hit");
        if (died && shooter !== target) creditKillLocal(shooter, target.id === selfId ? "you" : target.name);
        return;
      }
      // networked: only the owner of `target`'s health may apply it
      if (target.id === selfId) {
        const died = localApplyDamage(target, dmg);
        playSound("hit");
        if (died) netSend({ kind: "killCredit", killerId: shooter.id, victimName: "you" });
      } else if (target.isBot) {
        if (isHostRole()) {
          const died = localApplyDamage(target, dmg);
          if (shooter.id === selfId) playSound("hit");
          if (died && shooter !== target) creditKillLocal(shooter, target.name);
        } else {
          netSend({ kind: "botHit", botId: target.id, dmg, shooterId: shooter.id });
        }
      } else {
        // a remote human player owns their own health
        netSend({ kind: "hit", targetId: target.id, dmg, shooterId: shooter.id });
      }
    }

    function fireRayHitscan(shooter, angle, weapon) {
      const maxRange = weapon.range;
      const steps = Math.max(1, Math.floor(maxRange / 8));
      const dx = Math.cos(angle), dy = Math.sin(angle);
      let hitEntity = null;
      let endX = shooter.x + dx * maxRange, endY = shooter.y + dy * maxRange;
      const targets = allEntities().filter((e) => e !== shooter && e.alive && e.team !== shooter.team);
      for (let i = 1; i <= steps; i++) {
        const px = shooter.x + dx * (i / steps) * maxRange;
        const py = shooter.y + dy * (i / steps) * maxRange;
        if (pointBlockedByObstacle(px, py, 0)) { endX = px; endY = py; spawnSpark(px, py, "180,190,210"); break; }
        let hit = false;
        for (const t of targets) {
          const radius = t.isPlayer ? PLAYER_RADIUS : BOT_RADIUS;
          if (Math.hypot(px - t.x, py - t.y) < radius) { hitEntity = t; endX = px; endY = py; hit = true; break; }
        }
        if (hit) break;
      }
      tracers.push({ x1: shooter.x, y1: shooter.y, x2: endX, y2: endY, life: 0.12, maxLife: 0.12, color: weapon.color });
      if (hitEntity) registerHit(shooter, hitEntity, weapon.dmg);
    }

    function fireWeapon(shooter, aimAngle, accuracy) {
      const weapon = weaponOf(shooter);
      if (shooter.cooldown > 0 || !shooter.alive) return;
      shooter.cooldown = weapon.cooldown;

      if (weapon.melee) {
        const targets = allEntities().filter((e) => e !== shooter && e.alive && e.team !== shooter.team);
        let struck = false;
        for (const t of targets) {
          const d = Math.hypot(t.x - shooter.x, t.y - shooter.y);
          const angleTo = Math.atan2(t.y - shooter.y, t.x - shooter.x);
          const angleDiff = Math.abs(Math.atan2(Math.sin(angleTo - aimAngle), Math.cos(angleTo - aimAngle)));
          if (d < weapon.range && angleDiff < Math.PI / 2.2) {
            struck = true;
            registerHit(shooter, t, weapon.dmg);
          }
        }
        if (shooter.id === selfId) playSound(struck ? "hit" : "click");
        return;
      }

      const pellets = weapon.pellets || 1;
      const inaccuracy = 1 - (accuracy ?? 1);
      for (let i = 0; i < pellets; i++) {
        const spread = weapon.spread + inaccuracy * 0.35;
        const jitter = (Math.random() - 0.5) * 2 * spread;
        fireRayHitscan(shooter, aimAngle + jitter, weapon);
      }
      if (shooter.id === selfId) playSound("click");
    }

    function tryFireMe() {
      if (!matchRunning || matchOver || !me.alive) return;
      fireWeapon(me, me.angle, 1);
    }

    const SLOT_LABELS = ["Primary", "Secondary", "Melee"];
    function switchWeapon(slot) {
      if (!matchRunning || matchOver || !me || !me.alive || slot === me.equippedSlot) return;
      me.equippedSlot = slot;
      me.weaponTier = me.loadout[slot];
      me.cooldown = Math.max(me.cooldown, 0.18); // a beat to swap, so you can't insta-fire mid-switch
      playSound("click");
      updateStatus();
    }
    function cycleWeapon(delta) {
      if (!me) return;
      switchWeapon((me.equippedSlot + delta + 3) % 3);
    }

    // ============ bot AI (host-authoritative) ============
    function pickWaypoint() {
      for (let i = 0; i < 20; i++) {
        const x = 40 + Math.random() * (ARENA_W - 80);
        const y = 40 + Math.random() * (ARENA_H - 80);
        if (!pointBlockedByObstacle(x, y, 10)) return { x, y };
      }
      return { x: ARENA_W / 2, y: ARENA_H / 2 };
    }
    function nearestEnemy(bot) {
      let best = null, bestDist = Infinity;
      for (const e of allEntities()) {
        if (e === bot || !e.alive || e.team === bot.team) continue;
        const d = Math.hypot(e.x - bot.x, e.y - bot.y);
        if (d < bestDist) { bestDist = d; best = e; }
      }
      return best;
    }
    function updateBot(bot, dt) {
      if (!bot.alive) {
        bot.respawnTimer -= dt;
        if (bot.respawnTimer <= 0) respawnEntity(bot);
        return;
      }
      bot.cooldown = Math.max(0, bot.cooldown - dt);
      const target = nearestEnemy(bot);
      const canSee = target && lineOfSight(bot.x, bot.y, target.x, target.y) &&
        Math.hypot(target.x - bot.x, target.y - bot.y) < BOT_DETECT_RANGE;

      if (canSee) {
        const targetAngle = Math.atan2(target.y - bot.y, target.x - bot.x);
        const turn = 2.2 * dt;
        const diffAngle = Math.atan2(Math.sin(targetAngle - bot.angle), Math.cos(targetAngle - bot.angle));
        bot.angle += Math.max(-turn, Math.min(turn, diffAngle));
        const weapon = weaponOf(bot);
        const dist = Math.hypot(target.x - bot.x, target.y - bot.y);
        if (weapon.melee) {
          const dx = target.x - bot.x, dy = target.y - bot.y;
          const d = Math.hypot(dx, dy) || 1;
          bot.x += (dx / d) * 150 * dt;
          bot.y += (dy / d) * 150 * dt;
          if (dist < weapon.range * 0.8 && Math.abs(diffAngle) < 0.5) fireWeapon(bot, bot.angle, 0.75);
        } else if (dist < weapon.range * 0.85 && Math.abs(diffAngle) < 0.3) {
          fireWeapon(bot, bot.angle, 0.7);
          bot.x += Math.cos(bot.angle + Math.PI / 2) * 40 * dt * (bot.strafeDir || 1);
          bot.y += Math.sin(bot.angle + Math.PI / 2) * 40 * dt * (bot.strafeDir || 1);
        } else {
          const dx = target.x - bot.x, dy = target.y - bot.y;
          const d = Math.hypot(dx, dy) || 1;
          bot.x += (dx / d) * 110 * dt;
          bot.y += (dy / d) * 110 * dt;
        }
        if (Math.random() < 0.01) bot.strafeDir = (bot.strafeDir || 1) * -1;
      } else {
        if (!bot.waypoint || Math.hypot(bot.waypoint.x - bot.x, bot.waypoint.y - bot.y) < 12) bot.waypoint = pickWaypoint();
        const dx = bot.waypoint.x - bot.x, dy = bot.waypoint.y - bot.y;
        const d = Math.hypot(dx, dy) || 1;
        bot.angle = Math.atan2(dy, dx);
        bot.x += (dx / d) * 75 * dt;
        bot.y += (dy / d) * 75 * dt;
      }
      pushOutOfObstacles(bot, BOT_RADIUS);
    }

    // ============ input: keyboard / mouse / gamepad ============
    const keys = new Set();
    function isTypingInField() {
      const tag = document.activeElement?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA";
    }
    function onKeydown(e) {
      if (isTypingInField()) return;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "KeyA", "KeyD", "KeyW", "KeyS"].includes(e.code)) e.preventDefault();
      keys.add(e.code);
      if (e.code === "Space") tryFireMe();
      else if (e.code === "Digit1") switchWeapon(0);
      else if (e.code === "Digit2") switchWeapon(1);
      else if (e.code === "Digit3") switchWeapon(2);
    }
    function onKeyup(e) {
      // always clear on release (even if focus moved to a text field mid-press)
      // so a key can never get stuck "held" in the movement set
      keys.delete(e.code);
    }
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("keyup", onKeyup);

    function onCanvasClick() {
      if (!matchRunning) return;
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
      } else {
        tryFireMe();
      }
    }
    canvas.addEventListener("click", onCanvasClick);
    function onPointerLockChange() {
      pointerLocked = document.pointerLockElement === canvas;
      if (pointerLocked) hasEngagedLook = true;
    }
    document.addEventListener("pointerlockchange", onPointerLockChange);
    function onMouseMove(e) {
      if (!pointerLocked || !matchRunning) return;
      me.angle += e.movementX * MOUSE_SENSITIVITY;
    }
    document.addEventListener("mousemove", onMouseMove);

    // ============ touch controls (Pointer Lock isn't available on iOS/most
    // tablets, so mouse-look never engages there) ============
    const TOUCH_LOOK_SENSITIVITY = 0.006;
    const JOYSTICK_MAX_RADIUS = 46;
    const joystick = { active: false, id: null, dx: 0, dy: 0, cx: 0, cy: 0, knobX: 0, knobY: 0 };
    const lookTouch = { active: false, id: null, lastX: 0, lastY: 0 };
    let touchFiring = false;

    function canvasPoint(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * SCREEN_W,
        y: ((clientY - rect.top) / rect.height) * SCREEN_H,
      };
    }
    function onTouchStart(e) {
      if (!matchRunning) return;
      for (const t of e.changedTouches) {
        const p = canvasPoint(t.clientX, t.clientY);
        if (p.x < SCREEN_W / 2 && !joystick.active) {
          joystick.active = true;
          joystick.id = t.identifier;
          joystick.cx = p.x; joystick.cy = p.y;
          joystick.knobX = p.x; joystick.knobY = p.y;
          joystick.dx = 0; joystick.dy = 0;
        } else if (p.x >= SCREEN_W / 2 && !lookTouch.active) {
          lookTouch.active = true;
          lookTouch.id = t.identifier;
          lookTouch.lastX = t.clientX;
          lookTouch.lastY = t.clientY;
          hasEngagedLook = true;
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
        } else if (lookTouch.active && t.identifier === lookTouch.id) {
          const deltaX = t.clientX - lookTouch.lastX;
          const deltaY = t.clientY - lookTouch.lastY;
          lookTouch.lastX = t.clientX; lookTouch.lastY = t.clientY;
          if (matchRunning && me?.alive) me.angle += deltaX * TOUCH_LOOK_SENSITIVITY;
          void deltaY; // vertical look isn't modeled (2D-plane raycaster); horizontal only
        }
      }
      e.preventDefault();
    }
    function onTouchEnd(e) {
      for (const t of e.changedTouches) {
        if (joystick.active && t.identifier === joystick.id) {
          joystick.active = false; joystick.dx = 0; joystick.dy = 0;
        } else if (lookTouch.active && t.identifier === lookTouch.id) {
          lookTouch.active = false;
        }
      }
    }
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);
    canvas.addEventListener("touchcancel", onTouchEnd);

    function onFireTouchStart(e) { e.preventDefault(); touchFiring = true; tryFireMe(); }
    function onFireTouchEnd(e) { e.preventDefault(); touchFiring = false; }
    touchFireBtn.addEventListener("touchstart", onFireTouchStart, { passive: false });
    touchFireBtn.addEventListener("touchend", onFireTouchEnd);
    touchFireBtn.addEventListener("touchcancel", onFireTouchEnd);
    // also usable with a mouse (desktop testing / hybrid devices)
    touchFireBtn.addEventListener("mousedown", (e) => { e.preventDefault(); touchFiring = true; tryFireMe(); });
    window.addEventListener("mouseup", () => { touchFiring = false; });

    function applyDeadzone(v) { return Math.abs(v) < 0.16 ? 0 : v; }
    let gpBumperPrev = { lb: false, rb: false };
    function pollGamepad(dt) {
      if (typeof navigator.getGamepads !== "function") return { x: 0, y: 0 };
      const pad = Array.from(navigator.getGamepads()).find((p) => p && p.connected);
      if (!pad) return { x: 0, y: 0 };
      const lx = applyDeadzone(pad.axes[0] || 0), ly = applyDeadzone(pad.axes[1] || 0);
      const rx = applyDeadzone(pad.axes[2] || 0);
      if (matchRunning && me.alive) me.angle += rx * TURN_SPEED * 1.3 * dt;
      const fireHeld = pad.buttons[7]?.pressed || pad.buttons[0]?.pressed;
      if (fireHeld) tryFireMe();
      // LB/RB cycle through the 3 loadout slots — rising-edge only, or
      // holding one down would flip through weapons every single frame
      const lbHeld = Boolean(pad.buttons[4]?.pressed);
      const rbHeld = Boolean(pad.buttons[5]?.pressed);
      if (lbHeld && !gpBumperPrev.lb) cycleWeapon(-1);
      if (rbHeld && !gpBumperPrev.rb) cycleWeapon(1);
      gpBumperPrev = { lb: lbHeld, rb: rbHeld };
      return { x: lx, y: ly };
    }

    // ============ networking ============
    function netSend(pt) {
      if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "state", pt }));
    }
    function sendLobby() { netSend({ kind: "lobby", name: myName, team: myTeam }); }
    function sendMatchSize() { netSend({ kind: "matchSize", red: teamSize.red, blue: teamSize.blue }); }

    // Nothing stopped hostRoom()/joinRoomCode() from running again while
    // already connected — clicking Join Room (or Host Room) more than once
    // opened a brand-new WebSocket each time without ever closing the old
    // one, so the server saw each click as a fresh connection and added
    // another ghost copy of the same person to the room. connecting guards
    // against a click landing mid-handshake (before the first "joined"
    // reply flips networked to true); the networked check below and hiding
    // Host/Join once in a room (see syncLobbyUI) cover the rest.
    let connecting = false;
    function connect(onOpen) {
      if (socket) { try { socket.close(); } catch (e) { /* already closed */ } socket = null; }
      connecting = true;
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${location.host}/mp`);
      socket.addEventListener("open", () => onOpen(), { once: true });
      socket.addEventListener("message", (event) => {
        try { handleNetMessage(JSON.parse(event.data)); } catch (e) { /* ignore */ }
      });
      socket.addEventListener("close", () => {
        connecting = false;
        networked = false; networkRole = "idle"; socket = null;
        remoteInfo.clear(); remotePlayers.clear();
        netStatus.textContent = "Disconnected.";
        syncLobbyUI();
      });
      socket.addEventListener("error", () => { netStatus.textContent = "Connection error. Is the server reachable?"; });
    }
    function hostRoom() {
      if (networked || connecting) return;
      myName = nameInput.value.trim().slice(0, 14) || "Player";
      ctx.storage.set("name", myName);
      connect(() => socket.send(JSON.stringify({ type: "host", name: myName, color: TEAM_COLOR[myTeam] })));
    }
    function joinRoomCode(code) {
      if (networked || connecting) return;
      if (!code) { netStatus.textContent = "Enter a room code to join."; return; }
      myName = nameInput.value.trim().slice(0, 14) || "Player";
      ctx.storage.set("name", myName);
      connect(() => socket.send(JSON.stringify({ type: "join", room: code, name: myName, color: TEAM_COLOR[myTeam] })));
    }
    function leaveRoom() {
      if (socket) socket.close();
      networked = false; networkRole = "idle";
      remoteInfo.clear(); remotePlayers.clear();
      netStatus.textContent = "Play solo, or host/join a room with friends on your network.";
      syncLobbyUI();
    }
    hostBtn.onclick = hostRoom;
    joinBtn.onclick = () => joinRoomCode(codeInput.value.trim().toUpperCase());
    soloBtn.onclick = () => {
      myName = nameInput.value.trim().slice(0, 14) || "Player";
      ctx.storage.set("name", myName);
      netStatus.textContent = "Solo — set team sizes below and start when ready.";
    };

    function handleNetMessage(msg) {
      if (msg.type === "joined") {
        connecting = false;
        selfId = msg.id;
        networkRole = msg.isHost ? "host" : "guest";
        networked = true;
        roomCode = msg.room;
        remoteInfo.clear();
        msg.players.forEach((p) => { if (p.id !== selfId) remoteInfo.set(p.id, { name: p.name, team: "red" }); });
        netStatus.textContent = networkRole === "host" ? "Hosting — set sizes and start when ready." : "Connected — waiting for the host.";
        sendLobby();
        syncLobbyUI();
        return;
      }
      if (msg.type === "joinError") {
        // the server never joined this connection to a room on failure, so
        // the socket itself is still fine to reuse — just clear the guard so
        // a retry (with a corrected code) is allowed. connect() already
        // closes any stale socket first if the next attempt opens a new one.
        connecting = false;
        netStatus.textContent = msg.reason || "Could not join that room.";
        return;
      }
      if (msg.type === "playerJoined") {
        remoteInfo.set(msg.id, { name: msg.name, team: "red" });
        syncLobbyUI();
        if (networkRole === "host") { sendMatchSize(); }
        return;
      }
      if (msg.type === "playerLeft") {
        remoteInfo.delete(msg.id);
        remotePlayers.delete(msg.id);
        syncLobbyUI();
        return;
      }
      if (msg.type === "state" && msg.pt) {
        const pt = msg.pt;
        const fromId = msg.id;
        if (pt.kind === "lobby") {
          const entry = remoteInfo.get(fromId) || {};
          entry.name = pt.name; entry.team = pt.team;
          remoteInfo.set(fromId, entry);
          syncLobbyUI();
        } else if (pt.kind === "matchSize") {
          teamSize.red = pt.red; teamSize.blue = pt.blue;
          syncLobbyUI();
        } else if (pt.kind === "start") {
          beginMatchShared(pt.red, pt.blue, false, pt.map);
        } else if (pt.kind === "playerState") {
          if (!matchRunning) return;
          let rp = remotePlayers.get(fromId);
          if (!rp) { rp = { id: fromId, isPlayer: true, isBot: false }; remotePlayers.set(fromId, rp); }
          Object.assign(rp, { name: pt.name, team: pt.team, x: pt.x, y: pt.y, angle: pt.angle, health: pt.health, weaponTier: pt.weaponTier, alive: pt.alive });
        } else if (pt.kind === "botState" && !isHostRole()) {
          bots = pt.bots;
        } else if (pt.kind === "hit" && pt.targetId === selfId) {
          const died = localApplyDamage(me, pt.dmg);
          playSound("hit");
          if (died) netSend({ kind: "killCredit", killerId: pt.shooterId, victimName: "you" });
        } else if (pt.kind === "botHit" && isHostRole()) {
          const bot = bots.find((b) => b.id === pt.botId);
          if (bot) {
            const shooter = findEntity(pt.shooterId) || { id: pt.shooterId, name: "?" };
            const died = localApplyDamage(bot, pt.dmg);
            if (died) creditKillLocal(shooter, bot.name);
          }
        } else if (pt.kind === "killCredit") {
          if (pt.killerId === selfId) {
            creditKillLocal(me, pt.victimName);
          } else if (isHostRole()) {
            const bot = bots.find((b) => b.id === pt.killerId);
            if (bot) creditKillLocal(bot, pt.victimName);
          }
        } else if (pt.kind === "teamKills") {
          teamKills.red = Math.max(teamKills.red, pt.red);
          teamKills.blue = Math.max(teamKills.blue, pt.blue);
        } else if (pt.kind === "matchOver") {
          endMatch(pt.winningTeam, pt.winnerName);
        }
      }
    }

    // ============ match lifecycle ============
    function startMatch() {
      if (networked) netSend({ kind: "start", red: teamSize.red, blue: teamSize.blue, map: currentMapKey });
      beginMatchShared(teamSize.red, teamSize.blue, true, currentMapKey);
    }

    function beginMatchShared(redSize, blueSize, isStarter, mapKey) {
      teamSize.red = redSize; teamSize.blue = blueSize;
      applyMap(mapKey || currentMapKey);
      me = makeMe();
      remotePlayers = new Map();
      bots = [];
      if (isHostRole()) {
        const redOthers = [];
        const blueOthers = [];
        if (myTeam === "red") redOthers.push(me); else blueOthers.push(me);
        remoteInfo.forEach((p, id) => {
          const stub = { id, x: 0, y: 0 };
          if (p.team === "red") redOthers.push(stub); else blueOthers.push(stub);
        });
        const redBotCount = Math.max(0, redSize - redOthers.length);
        const blueBotCount = Math.max(0, blueSize - blueOthers.length);
        const placed = [...redOthers, ...blueOthers];
        for (let i = 0; i < redBotCount; i++) { const b = makeBot("red", i, placed); bots.push(b); placed.push(b); }
        for (let i = 0; i < blueBotCount; i++) { const b = makeBot("blue", i, placed); bots.push(b); placed.push(b); }
      }
      tracers = []; sparks = []; popups = []; killFeed = [];
      teamKills = { red: 0, blue: 0 };
      matchRunning = true;
      matchOver = false;
      lobby.style.display = "none";
      canvasWrap.style.display = "";
      backToLobbyBtn.style.display = "";
      pushFeed(`Match started — ${redSize}v${blueSize}. First team to ${KILL_TARGET} kills wins.`);
      updateStatus();
    }

    function endMatch(winningTeam, winnerName) {
      if (matchOver) return;
      matchRunning = false;
      matchOver = true;
      const youWon = winningTeam === myTeam;
      playSound(youWon ? "win" : "lose");
      const wins = ctx.storage.get("wins", 0);
      if (youWon) ctx.storage.set("wins", wins + 1);
      ctx.setStatus(youWon ? "Your team won!" : `${winningTeam === "red" ? "Red" : "Blue"} team won.`);
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
      setTimeout(() => {
        ctx.showOverlay({
          title: youWon ? "Victory!" : "Match Over",
          subtitle: `Final score — Red ${teamKills.red} · Blue ${teamKills.blue}. ${winningTeam === "red" ? "Red" : "Blue"} team reached ${KILL_TARGET} kills first.`,
          buttonText: "Back to Lobby",
          onButton: () => stopMatch(false),
        });
      }, 400);
    }

    function stopMatch() {
      matchRunning = false;
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
      lobby.style.display = "";
      canvasWrap.style.display = "none";
      backToLobbyBtn.style.display = "none";
      ctx.setStatus("");
      syncLobbyUI();
    }

    function updateStatus() {
      if (!matchRunning || !me) return;
      ctx.setStatus(`${myTeam === "red" ? "Red" : "Blue"} · ${SLOT_LABELS[me.equippedSlot]}: ${weaponOf(me).name} (1/2/3 to switch) · Red ${teamKills.red} – Blue ${teamKills.blue} (first to ${KILL_TARGET})`);
    }

    // ============ update ============
    function update(dt) {
      if (!matchRunning) return;
      const gp = pollGamepad(dt);

      if (touchFiring) tryFireMe();

      if (me.alive) {
        me.cooldown = Math.max(0, me.cooldown - dt);
        let dx = gp.x + joystick.dx, dy = gp.y + joystick.dy;
        if (keys.has("KeyA")) dx -= 1;
        if (keys.has("KeyD")) dx += 1;
        if (keys.has("KeyW") || keys.has("ArrowUp")) dy -= 1;
        if (keys.has("KeyS") || keys.has("ArrowDown")) dy += 1;
        if (keys.has("ArrowLeft")) me.angle -= TURN_SPEED * dt;
        if (keys.has("ArrowRight")) me.angle += TURN_SPEED * dt;
        const len = Math.hypot(dx, dy);
        if (len > 0.05) {
          const nx = dx / (len > 1 ? len : 1), ny = dy / (len > 1 ? len : 1);
          const fx = Math.cos(me.angle), fy = Math.sin(me.angle);
          const rx = -Math.sin(me.angle), ry = Math.cos(me.angle);
          me.x += (fx * -ny + rx * nx) * MOVE_SPEED * dt;
          me.y += (fy * -ny + ry * nx) * MOVE_SPEED * dt;
        }
        pushOutOfObstacles(me, PLAYER_RADIUS);
        tryCollectPickup(me);
      } else {
        me.respawnTimer -= dt;
        if (me.respawnTimer <= 0) respawnEntity(me);
      }

      updatePickups(dt);
      if (isHostRole()) bots.forEach((b) => { updateBot(b, dt); tryCollectPickup(b); });

      tracers.forEach((t) => (t.life -= dt)); tracers = tracers.filter((t) => t.life > 0);
      sparks.forEach((s) => (s.life -= dt)); sparks = sparks.filter((s) => s.life > 0);
      popups.forEach((p) => { p.life -= dt; p.y -= dt * 18; }); popups = popups.filter((p) => p.life > 0);
      killFeed.forEach((k) => (k.life -= dt)); killFeed = killFeed.filter((k) => k.life > 0);

      if (networked) {
        const now = performance.now();
        if (now - lastStateSent > STATE_HZ_MS) {
          lastStateSent = now;
          netSend({ kind: "playerState", name: myName, team: myTeam, x: me.x, y: me.y, angle: me.angle, health: me.health, weaponTier: me.weaponTier, alive: me.alive });
          if (isHostRole()) {
            netSend({ kind: "botState", bots: bots.map((b) => ({ id: b.id, name: b.name, team: b.team, x: b.x, y: b.y, angle: b.angle, health: b.health, weaponTier: b.weaponTier, alive: b.alive })) });
          }
        }
      }

      updateStatus();
    }

    // ============ render (first-person raycaster) ============
    function hexToRgb(hex) {
      const v = parseInt(hex.slice(1), 16);
      return `${(v >> 16) & 255},${(v >> 8) & 255},${v & 255}`;
    }
    function draw() {
      if (!matchRunning) {
        g.fillStyle = "#1b2032";
        g.fillRect(0, 0, SCREEN_W, SCREEN_H);
        return;
      }
      // sky / floor
      const skyGrad = g.createLinearGradient(0, 0, 0, SCREEN_H / 2);
      skyGrad.addColorStop(0, "#0e1830");
      skyGrad.addColorStop(1, "#223454");
      g.fillStyle = skyGrad;
      g.fillRect(0, 0, SCREEN_W, SCREEN_H / 2);
      const floorGrad = g.createLinearGradient(0, SCREEN_H / 2, 0, SCREEN_H);
      floorGrad.addColorStop(0, "#2a2f42");
      floorGrad.addColorStop(1, "#14161f");
      g.fillStyle = floorGrad;
      g.fillRect(0, SCREEN_H / 2, SCREEN_W, SCREEN_H / 2);

      const zBuffer = new Float64Array(SCREEN_W);
      for (let col = 0; col < SCREEN_W; col++) {
        const rayAngle = me.angle - HALF_FOV + (col / SCREEN_W) * FOV;
        const { t, side } = castWall(me.x, me.y, rayAngle);
        const perp = t * Math.cos(rayAngle - me.angle);
        zBuffer[col] = perp;
        if (!isFinite(perp)) continue;
        const wallH = Math.min(SCREEN_H * 2.2, (SCREEN_H * WALL_SCALE) / Math.max(1, perp));
        const fog = Math.max(0.18, 1 - perp / 950);
        const base = side === 1 ? 120 : 92;
        const shade = Math.round(base * fog);
        g.fillStyle = `rgb(${shade},${shade + 12},${shade + 30})`;
        g.fillRect(col, SCREEN_H / 2 - wallH / 2, 1.6, wallH);
      }

      // health pack pickups: same bearing/distance billboard projection and
      // zBuffer occlusion test as the player/bot sprites below, so one sitting
      // behind a wall is correctly hidden instead of drawing through it
      pickups
        .filter((p) => p.active)
        .map((p) => {
          const dx = p.x - me.x, dy = p.y - me.y;
          const dist = Math.hypot(dx, dy);
          let bearing = Math.atan2(dy, dx) - me.angle;
          bearing = Math.atan2(Math.sin(bearing), Math.cos(bearing));
          return { p, dist, bearing };
        })
        .filter((s) => Math.abs(s.bearing) < HALF_FOV + 0.25 && s.dist > 1)
        .sort((a, b) => b.dist - a.dist)
        .forEach(({ p, dist, bearing }) => {
          const perpDist = dist * Math.cos(bearing);
          if (perpDist < 1) return;
          const screenX = SCREEN_W / 2 + (bearing / HALF_FOV) * (SCREEN_W / 2);
          const col = Math.max(0, Math.min(SCREEN_W - 1, Math.round(screenX)));
          if (perpDist > zBuffer[col] + 3) return;
          const size = Math.max(5, Math.min(SCREEN_H * 0.9, (SCREEN_H * WALL_SCALE) / perpDist * 0.22));
          const bob = Math.sin(performance.now() * 0.004 + p.x * 0.05) * size * 0.12;
          const groundY = SCREEN_H / 2 + size * 0.55 + bob;
          g.save();
          g.translate(screenX, groundY);
          g.globalAlpha = Math.max(0.4, Math.min(1, 1 - perpDist / 900));
          g.beginPath();
          g.arc(0, 0, size * 0.55, 0, Math.PI * 2);
          g.fillStyle = "rgba(155,255,143,0.22)";
          g.fill();
          g.beginPath();
          g.arc(0, 0, size * 0.34, 0, Math.PI * 2);
          g.fillStyle = "#173622";
          g.fill();
          g.strokeStyle = "#9bff8f";
          g.lineWidth = Math.max(1.5, size * 0.07);
          g.stroke();
          g.strokeStyle = "#9bff8f";
          g.lineWidth = Math.max(2, size * 0.16);
          g.lineCap = "round";
          g.beginPath();
          g.moveTo(-size * 0.16, 0); g.lineTo(size * 0.16, 0);
          g.moveTo(0, -size * 0.16); g.lineTo(0, size * 0.16);
          g.stroke();
          g.restore();
        });

      // sprites (players + bots), farthest first
      const sprites = allEntities()
        .filter((e) => e !== me && e.alive)
        .map((e) => {
          const dx = e.x - me.x, dy = e.y - me.y;
          const dist = Math.hypot(dx, dy);
          let bearing = Math.atan2(dy, dx) - me.angle;
          bearing = Math.atan2(Math.sin(bearing), Math.cos(bearing));
          return { e, dist, bearing };
        })
        .filter((s) => Math.abs(s.bearing) < HALF_FOV + 0.25 && s.dist > 1)
        .sort((a, b) => b.dist - a.dist);

      sprites.forEach(({ e, dist, bearing }) => {
        const perpDist = dist * Math.cos(bearing);
        if (perpDist < 1) return;
        const screenX = SCREEN_W / 2 + (bearing / HALF_FOV) * (SCREEN_W / 2);
        const col = Math.max(0, Math.min(SCREEN_W - 1, Math.round(screenX)));
        if (perpDist > zBuffer[col] + 3) return;
        const size = Math.max(6, Math.min(SCREEN_H * 1.6, (SCREEN_H * WALL_SCALE) / perpDist * 0.42));
        const weapon = weaponOf(e);
        const groundY = SCREEN_H / 2 + size * 0.35;
        g.save();
        g.translate(screenX, groundY);
        g.fillStyle = TEAM_COLOR[e.team] || "#cccccc";
        g.beginPath();
        g.ellipse(0, -size * 0.32, size * 0.28, size * 0.42, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = weapon.color;
        g.lineWidth = Math.max(1.5, size * 0.05);
        g.stroke();
        g.beginPath();
        g.arc(0, -size * 0.78, size * 0.16, 0, Math.PI * 2);
        g.fillStyle = "#f2d9c4";
        g.fill();
        // health bar
        const barW = size * 0.6;
        g.fillStyle = "rgba(0,0,0,0.55)";
        g.fillRect(-barW / 2, -size * 1.05, barW, 4);
        g.fillStyle = e.health > 40 ? "#9bff8f" : "#ff6b6b";
        g.fillRect(-barW / 2, -size * 1.05, barW * Math.max(0, e.health / HEALTH_MAX), 4);
        g.fillStyle = "rgba(255,255,255,0.85)";
        g.font = `${Math.max(9, Math.min(14, size * 0.14))}px sans-serif`;
        g.textAlign = "center";
        g.fillText(e.name, 0, -size * 1.12);
        g.restore();
      });

      tracers.forEach((t) => {
        const dx1 = t.x1 - me.x, dy1 = t.y1 - me.y;
        const dx2 = t.x2 - me.x, dy2 = t.y2 - me.y;
        const b1 = Math.atan2(Math.sin(Math.atan2(dy1, dx1) - me.angle), Math.cos(Math.atan2(dy1, dx1) - me.angle));
        const b2 = Math.atan2(Math.sin(Math.atan2(dy2, dx2) - me.angle), Math.cos(Math.atan2(dy2, dx2) - me.angle));
        const d1 = Math.hypot(dx1, dy1) * Math.cos(b1), d2 = Math.hypot(dx2, dy2) * Math.cos(b2);
        if (d2 <= 0.5) return;
        const sx1 = SCREEN_W / 2 + (b1 / HALF_FOV) * (SCREEN_W / 2);
        const sx2 = SCREEN_W / 2 + (b2 / HALF_FOV) * (SCREEN_W / 2);
        const sy1 = SCREEN_H / 2 - Math.min(SCREEN_H, (SCREEN_H * WALL_SCALE) / Math.max(1, d1) * 0.02);
        const sy2 = SCREEN_H / 2;
        g.strokeStyle = `rgba(${hexToRgb(t.color)},${t.life / t.maxLife})`;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(sx1, sy1);
        g.lineTo(sx2, sy2);
        g.stroke();
      });

      // weapon viewmodel
      const weapon = weaponOf(me);
      g.fillStyle = weapon.color;
      g.fillRect(SCREEN_W / 2 - 8, SCREEN_H - 70, 16, 60);
      g.fillRect(SCREEN_W / 2 - 24, SCREEN_H - 34, 48, 20);

      // crosshair
      g.strokeStyle = "rgba(255,255,255,0.85)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(SCREEN_W / 2 - 10, SCREEN_H / 2); g.lineTo(SCREEN_W / 2 - 3, SCREEN_H / 2);
      g.moveTo(SCREEN_W / 2 + 3, SCREEN_H / 2); g.lineTo(SCREEN_W / 2 + 10, SCREEN_H / 2);
      g.moveTo(SCREEN_W / 2, SCREEN_H / 2 - 10); g.lineTo(SCREEN_W / 2, SCREEN_H / 2 - 3);
      g.moveTo(SCREEN_W / 2, SCREEN_H / 2 + 3); g.lineTo(SCREEN_W / 2, SCREEN_H / 2 + 10);
      g.stroke();

      popups.forEach((p) => {
        const dx = p.x - me.x, dy = p.y - me.y;
        let bearing = Math.atan2(dy, dx) - me.angle;
        bearing = Math.atan2(Math.sin(bearing), Math.cos(bearing));
        if (Math.abs(bearing) > HALF_FOV + 0.3) return;
        const sx = SCREEN_W / 2 + (bearing / HALF_FOV) * (SCREEN_W / 2);
        g.globalAlpha = Math.max(0, p.life / p.maxLife);
        g.fillStyle = p.color;
        g.font = "700 13px sans-serif";
        g.textAlign = "center";
        g.fillText(p.text, sx, SCREEN_H / 2 - 60);
        g.globalAlpha = 1;
      });

      // on-screen joystick indicator (touch only, while a thumb is on it)
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

      drawHud();

      if (!pointerLocked && !isTouchDevice && !hasEngagedLook) {
        g.fillStyle = "rgba(0,0,0,0.35)";
        g.fillRect(0, 0, SCREEN_W, SCREEN_H);
        g.fillStyle = "#fff";
        g.font = "700 18px sans-serif";
        g.textAlign = "center";
        g.fillText("Click the arena to look around", SCREEN_W / 2, SCREEN_H / 2);
        g.font = "500 13px sans-serif";
        g.fillText("(arrow keys turn too — mouse lock is optional)", SCREEN_W / 2, SCREEN_H / 2 + 22);
      }

      if (!me.alive && me.respawnTimer > 0) {
        g.fillStyle = "rgba(255,255,255,0.9)";
        g.font = "700 20px sans-serif";
        g.textAlign = "center";
        g.fillText(`Respawning in ${me.respawnTimer.toFixed(1)}s`, SCREEN_W / 2, SCREEN_H / 2 - 40);
      }
    }

    function drawHud() {
      const startX = 16, startY = 16;
      g.font = "700 13px sans-serif";
      g.textAlign = "left";
      g.fillStyle = TEAM_COLOR[myTeam];
      g.fillText(`${myTeam === "red" ? "RED" : "BLUE"} · ${weaponOf(me).name}`, startX, startY + 12);
      // loadout: which of the 3 kept-for-the-match slots is equipped right now
      me.loadout.forEach((tier, slot) => {
        const equipped = slot === me.equippedSlot;
        g.fillStyle = equipped ? WEAPONS[tier].color : "rgba(255,255,255,0.28)";
        g.font = `${equipped ? "700" : "500"} 10px sans-serif`;
        g.fillText(`${slot + 1}`, startX + slot * 58, startY + 27);
        g.fillText(WEAPONS[tier].name, startX + slot * 58 + 10, startY + 27);
        if (equipped) {
          g.strokeStyle = WEAPONS[tier].color;
          g.lineWidth = 1;
          g.strokeRect(startX + slot * 58 - 3, startY + 17, 54, 14);
        }
      });
      // health
      const barW = 140;
      g.fillStyle = "rgba(0,0,0,0.5)";
      g.fillRect(startX, startY + 38, barW, 10);
      g.fillStyle = me.health > 40 ? "#9bff8f" : "#ff6b6b";
      g.fillRect(startX, startY + 38, barW * Math.max(0, me.health / HEALTH_MAX), 10);

      // team score, front and center — this is what actually decides the match now
      g.textAlign = "center";
      g.font = "700 15px sans-serif";
      g.fillStyle = TEAM_COLOR.red;
      g.fillText(String(teamKills.red), SCREEN_W / 2 - 22, startY + 14);
      g.fillStyle = "rgba(255,255,255,0.6)";
      g.font = "600 11px sans-serif";
      g.fillText(`first to ${KILL_TARGET}`, SCREEN_W / 2, startY + 14);
      g.fillStyle = TEAM_COLOR.blue;
      g.font = "700 15px sans-serif";
      g.fillText(String(teamKills.blue), SCREEN_W / 2 + 22, startY + 14);

      g.textAlign = "right";
      g.font = "700 12px sans-serif";
      g.fillStyle = "rgba(255,255,255,0.7)";
      g.fillText("Combatants", SCREEN_W - 16, startY + 2);
      const sorted = allEntities().filter((e) => e !== me).sort((a, b) => TEAM_COLOR[a.team] < TEAM_COLOR[b.team] ? -1 : 1).slice(0, 8);
      sorted.forEach((e, i) => {
        g.fillStyle = TEAM_COLOR[e.team];
        g.font = "600 11px sans-serif";
        g.fillText(`${e.name}: ${weaponOf(e).name}`, SCREEN_W - 16, startY + 18 + i * 14);
      });

      g.textAlign = "left";
      g.font = "500 11px sans-serif";
      killFeed.forEach((k, i) => {
        g.globalAlpha = Math.min(1, k.life);
        g.fillStyle = "rgba(255,255,255,0.85)";
        g.fillText(k.text, 16, SCREEN_H - 16 - i * 15);
        g.globalAlpha = 1;
      });
    }

    let lastTime = 0;
    let rafId = null;
    function loop(now) {
      const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0.016;
      lastTime = now;
      update(dt);
      draw();
      // this game reads the gamepad itself once a match is live — keep the
      // hub's site-wide gamepad cursor (js/pad-cursor.js) out of the way so
      // it doesn't drift across the arena on top of active gameplay
      window.MimiPadCursor?.setSuppressed(matchRunning);
      rafId = requestAnimationFrame(loop);
    }

    remotePlayers = new Map();
    bots = []; tracers = []; sparks = []; popups = []; killFeed = [];
    draw();
    rafId = requestAnimationFrame(loop);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.MimiPadCursor?.setSuppressed(false);
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
      if (isFullscreenActive()) (document.exitFullscreen?.() || document.webkitExitFullscreen?.());
      if (socket) socket.close();
      document.removeEventListener("keydown", onKeydown);
      document.removeEventListener("keyup", onKeyup);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("fullscreenchange", syncFullscreenBtn);
      document.removeEventListener("webkitfullscreenchange", syncFullscreenBtn);
      window.removeEventListener("resize", resizeCanvasForFullscreen);
      canvas.removeEventListener("click", onCanvasClick);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
    };
  },
});
