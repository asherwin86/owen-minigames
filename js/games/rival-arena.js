/* Rival Arena — a fast 3D arena shooter.
 *
 * Distinct from Gun Game Arena, which is still here: that one is a raycaster
 * (a 2D grid drawn as walls) whose strength is networked team play with up to
 * 20 people. This is a genuine 3D engine — real height, ramps, catwalks,
 * verticality you can shoot across — built for speed and for the crate/skin
 * loop. Keeping both means nobody loses the networked mode to get this.
 *
 * Three.js is loaded on demand, the same as js/games/block-realm.js and for the
 * same reason: it's 670 KB the hub's other 85 games have no use for, so it is
 * not in index.html. The copy is the one vendored for Kart Circuit.
 *
 * Crates spend keys (js/keys.js) and pay out weapon skins. The skins are
 * cosmetic on purpose — they change the colour and the trim of the gun in your
 * hands and nothing else. A currency that bought damage would turn "play five
 * games a day" into a requirement rather than a reward.
 */
MimiGames.register({
  id: "rival-arena",
  title: "Rival Arena",
  emoji: "🎯",
  category: "Action",
  tags: ["3D"],
  players: "1P",
  howTo:
    "A fast 3D arena shooter against bots. Click the arena to lock the mouse, then WASD to move, mouse to aim, left-click to fire, right-click to aim down sights, R to reload, Shift to sprint, Ctrl to crouch, Space to jump. 1-4 swap weapons — SMG, Rifle, Shotgun and Sniper all handle differently, and the Sniper gets a real scope. Aiming tightens your spread a lot, so it's worth it on every gun. Gamepad: left stick moves, right stick looks, RT fires, LT aims, A jumps, X reloads, LB/RB swap weapons, Start pauses. Touch: drag the left half to move, the right half to look, and use the buttons for fire, aim, jump, reload and swap. Gamepad and touch both get aim assist, the same way a console shooter does — mouse and keyboard don't, because they don't need it. First to the elimination target wins; kills in quick succession build a streak. Esc pauses. Spend 🔑 keys in the lobby's crate to unlock weapon skins — you earn keys by playing 5 different games in a day anywhere in the hub.",

  init(root, ctx) {
    const gameView = document.getElementById("gameView");
    if (gameView) gameView.classList.add("wide-stage");

    /* ------------------------------------------------------------- weapons */
    // rpm drives the fire interval; spread is radians of cone at the muzzle.
    const WEAPONS = [
      { id: "smg", name: "SMG", emoji: "🔫", damage: 17, rpm: 750, spread: 0.036, mag: 30, reload: 1.5, auto: true, pellets: 1, range: 60, recoil: 0.010, adsFov: 55 },
      { id: "rifle", name: "Rifle", emoji: "🎖️", damage: 28, rpm: 420, spread: 0.017, mag: 24, reload: 1.9, auto: true, pellets: 1, range: 110, recoil: 0.016, adsFov: 45 },
      { id: "shotgun", name: "Shotgun", emoji: "💥", damage: 13, rpm: 105, spread: 0.10, mag: 6, reload: 2.4, auto: false, pellets: 8, range: 28, recoil: 0.05, adsFov: 62 },
      { id: "sniper", name: "Sniper", emoji: "🎯", damage: 95, rpm: 48, spread: 0.002, mag: 5, reload: 2.7, auto: false, pellets: 1, range: 200, recoil: 0.07, adsFov: 16, scope: true },
    ];

    // Rarity drives both the odds and how loud the reveal is.
    const RARITIES = [
      { id: "common", name: "Common", weight: 58, color: "#b7c0d0" },
      { id: "rare", name: "Rare", weight: 26, color: "#4aa3ff" },
      { id: "epic", name: "Epic", weight: 12, color: "#b45cff" },
      { id: "legendary", name: "Legendary", weight: 4, color: "#ffb02e" },
    ];

    const SKINS = [
      { id: "standard", name: "Standard", rarity: "common", body: 0x39404f, trim: 0x6f7b90 },
      { id: "sand", name: "Desert", rarity: "common", body: 0xb59a63, trim: 0x6d5b39 },
      { id: "forest", name: "Woodland", rarity: "common", body: 0x4d6b3a, trim: 0x2e4022 },
      { id: "carbon", name: "Carbon", rarity: "common", body: 0x24262b, trim: 0x4c525c },
      { id: "arctic", name: "Arctic", rarity: "rare", body: 0xd8e6f0, trim: 0x7d93a6 },
      { id: "crimson", name: "Crimson", rarity: "rare", body: 0xb5232f, trim: 0x5e1018 },
      { id: "ocean", name: "Tidal", rarity: "rare", body: 0x1b7fa8, trim: 0x0c4258 },
      { id: "toxic", name: "Toxic", rarity: "epic", body: 0x7ee81c, trim: 0x2f5c08 },
      { id: "violet", name: "Nebula", rarity: "epic", body: 0x8a3dd8, trim: 0x3d1868 },
      { id: "inferno", name: "Inferno", rarity: "epic", body: 0xff5a1f, trim: 0x7a2405 },
      { id: "gold", name: "Gilded", rarity: "legendary", body: 0xffc42e, trim: 0x8a5c00 },
      { id: "prism", name: "Prismatic", rarity: "legendary", body: 0x2ee6d0, trim: 0xff4fa3 },
    ];
    const CRATE_COST = 8;

    const MODES = {
      skirmish: { label: "Skirmish", desc: "5 bots · first to 15", bots: 5, target: 15, botSkill: 0.55 },
      standard: { label: "Standard", desc: "7 bots · first to 25", bots: 7, target: 25, botSkill: 0.7 },
      chaos: { label: "Chaos", desc: "10 bots · first to 40", bots: 10, target: 40, botSkill: 0.82 },
    };

    /* ------------------------------------------------------------ saved data */
    const OWNED_KEY = "ownedSkins";
    const EQUIP_KEY = "equippedSkins";
    function ownedSkins() {
      const saved = ctx.storage.get(OWNED_KEY);
      // Standard is owned from the start, or a new player has a gun with no skin.
      return Array.isArray(saved) && saved.length ? saved : ["standard"];
    }
    function equipped() {
      const saved = ctx.storage.get(EQUIP_KEY);
      return saved && typeof saved === "object" ? saved : {};
    }
    function skinFor(weaponId) {
      const skinId = equipped()[weaponId] || "standard";
      return SKINS.find((s) => s.id === skinId) || SKINS[0];
    }

    /* -------------------------------------------------------------- markup */
    const wrap = document.createElement("div");
    wrap.className = "ra-wrap";
    wrap.innerHTML = `
      <style>
        /* Fills most of the window rather than sitting in a small box — an
           arena shooter needs the screen. Drops the rounded corner in
           fullscreen, where a floating card would look wrong. */
        .ra-wrap { position: relative; width: 100%; height: min(86vh, 900px); border-radius: 14px;
                   overflow: hidden; background: #0b0e15; user-select: none; }
        .ra-wrap:fullscreen { height: 100vh; border-radius: 0; }
        .ra-full { position: absolute; left: 12px; top: 10px; z-index: 5; width: 38px; height: 38px;
                   border-radius: 10px; border: 1px solid rgba(255,255,255,.22); background: rgba(10,14,24,.6);
                   color: #fff; font-size: 1rem; cursor: pointer; }
        .ra-full:hover { background: rgba(10,14,24,.9); border-color: #fff; }
        .ra-wrap canvas { display: block; width: 100%; height: 100%; }
        .ra-panel { position: absolute; inset: 0; display: flex; align-items: flex-start; justify-content: center;
                    overflow-y: auto; padding: 16px 0; z-index: 6;
                    background: linear-gradient(160deg, rgba(10,14,24,.95), rgba(6,8,14,.98)); }
        .ra-card { width: min(620px, 94%); padding: 20px 24px; margin: auto; }
        .ra-card h3 { margin: 0 0 3px; font-size: 1.5rem; }
        .ra-sub { margin: 0 0 16px; color: var(--text-dim); font-size: .87rem; }
        .ra-label { display: block; font-size: .72rem; letter-spacing: .11em; text-transform: uppercase;
                    color: var(--text-dim); margin: 0 0 7px; font-weight: 800; }
        .ra-row { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 8px; margin-bottom: 15px; }
        .ra-guns { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 8px; margin-bottom: 15px; }
        .ra-opt { padding: 11px 12px; border-radius: 12px; border: 2px solid var(--border); text-align: left;
                  background: rgba(255,255,255,.05); color: var(--text); cursor: pointer; font: inherit; }
        .ra-opt strong { display: block; font-size: .93rem; }
        .ra-opt span { font-size: .74rem; color: var(--text-dim); }
        .ra-opt.is-on { border-color: var(--accent2); background: rgba(0,195,227,.14); }
        .ra-gun-stats { display: flex; gap: 3px; margin-top: 6px; }
        .ra-gun-stats i { height: 4px; flex: 1; border-radius: 2px; background: rgba(255,255,255,.16); }
        .ra-gun-stats i.on { background: var(--accent2); }
        .ra-crate { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 16px;
                    border: 2px solid rgba(255,209,102,.4); background: rgba(255,209,102,.08); margin-bottom: 14px; }
        .ra-crate-icon { font-size: 2.2rem; }
        .ra-crate-body { flex: 1; }
        .ra-crate-body strong { display: block; }
        .ra-crate-body span { font-size: .78rem; color: var(--text-dim); }
        .ra-toggle { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px;
                     border: 2px solid var(--border); background: rgba(255,255,255,.05); cursor: pointer;
                     margin-bottom: 14px; }
        .ra-toggle.is-on { border-color: #ffd166; background: rgba(255,209,102,.13); }
        .ra-toggle .ra-sw { width: 40px; height: 22px; border-radius: 999px; background: rgba(255,255,255,.18);
                            position: relative; flex: 0 0 auto; transition: background .15s; }
        .ra-toggle .ra-sw::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px;
                                   border-radius: 50%; background: #fff; transition: transform .15s; }
        .ra-toggle.is-on .ra-sw { background: #ffd166; }
        .ra-toggle.is-on .ra-sw::after { transform: translateX(18px); }
        .ra-tg-desc { font-size: .76rem; color: var(--text-dim); }
        .ra-mp { border: 2px solid var(--border); border-radius: 14px; padding: 12px 14px; margin-bottom: 15px; }
        .ra-mp-row { display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
        .ra-mp-row .btn { flex: 1; min-width: 110px; }
        .ra-mp-row input { width: 90px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--border);
                           background: rgba(255,255,255,.06); color: var(--text); font: inherit; text-transform: uppercase; }
        .ra-net-status { margin: 8px 0; font-size: .84rem; color: var(--text-dim); }
        .ra-skins { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 15px; }
        .ra-skin { width: 42px; height: 42px; border-radius: 10px; border: 2px solid transparent; cursor: pointer;
                   position: relative; padding: 0; }
        .ra-skin.is-locked { opacity: .22; cursor: not-allowed; }
        .ra-skin.is-on { border-color: #fff; box-shadow: 0 0 0 2px rgba(255,255,255,.3); }
        .ra-actions { display: flex; gap: 10px; flex-wrap: wrap; }
        .ra-hud { position: absolute; inset: 0; pointer-events: none; z-index: 3; font-variant-numeric: tabular-nums; }
        .ra-cross { position: absolute; left: 50%; top: 50%; width: 22px; height: 22px; margin: -11px 0 0 -11px; }
        .ra-cross i { position: absolute; background: rgba(255,255,255,.85); box-shadow: 0 0 2px #000; }
        .ra-cross i:nth-child(1) { left: 10px; top: 0; width: 2px; height: 7px; }
        .ra-cross i:nth-child(2) { left: 10px; bottom: 0; width: 2px; height: 7px; }
        .ra-cross i:nth-child(3) { top: 10px; left: 0; height: 2px; width: 7px; }
        .ra-cross i:nth-child(4) { top: 10px; right: 0; height: 2px; width: 7px; }
        .ra-hit { position: absolute; left: 50%; top: 50%; margin: -13px 0 0 -13px; width: 26px; height: 26px;
                  opacity: 0; transition: opacity .1s; }
        .ra-hit.on { opacity: 1; }
        .ra-hit::before, .ra-hit::after { content: ""; position: absolute; left: 11px; top: 2px; width: 3px; height: 22px;
                                          background: #ff5a5a; border-radius: 2px; }
        .ra-hit::before { transform: rotate(45deg); } .ra-hit::after { transform: rotate(-45deg); }
        .ra-bottom { position: absolute; right: 16px; bottom: 14px; text-align: right;
                     text-shadow: 0 2px 6px rgba(0,0,0,.9); }
        .ra-ammo { font-size: 2rem; font-weight: 900; line-height: 1; }
        .ra-ammo small { font-size: .95rem; opacity: .65; font-weight: 700; }
        .ra-gunname { font-size: .78rem; color: var(--text-dim); letter-spacing: .08em; text-transform: uppercase; }
        .ra-left { position: absolute; left: 16px; bottom: 14px; text-shadow: 0 2px 6px rgba(0,0,0,.9); }
        .ra-hpbar { width: 190px; height: 11px; border-radius: 999px; background: rgba(255,255,255,.16); overflow: hidden; }
        .ra-hpbar i { display: block; height: 100%; background: linear-gradient(90deg, #7ee81c, #35d07f); transition: width .12s; }
        .ra-hplabel { font-size: .78rem; font-weight: 800; margin-bottom: 4px; }
        .ra-score { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); display: flex; gap: 16px;
                    padding: 7px 18px; border-radius: 999px; background: rgba(8,10,18,.66); font-weight: 800;
                    font-size: .95rem; }
        .ra-score b { color: #7ee81c; } .ra-score i { color: #ff6b6b; font-style: normal; }
        .ra-feed { position: absolute; right: 16px; top: 52px; display: flex; flex-direction: column; gap: 4px;
                   align-items: flex-end; }
        .ra-feed div { padding: 4px 10px; border-radius: 7px; background: rgba(8,10,18,.72); font-size: .78rem; }
        .ra-streak { position: absolute; left: 50%; top: 64px; transform: translateX(-50%); font-size: 1.1rem;
                     font-weight: 900; color: #ffd166; text-shadow: 0 2px 8px #000; opacity: 0; transition: opacity .2s; }
        .ra-streak.on { opacity: 1; }
        .ra-hint { position: absolute; left: 50%; top: 55%; transform: translateX(-50%); padding: 9px 18px;
                   border-radius: 999px; background: rgba(8,10,18,.8); font-size: .85rem; }
        .ra-hint.off { display: none; }
        .ra-dmg { position: absolute; font-weight: 900; font-size: 1rem; color: #ffd166; text-shadow: 0 2px 5px #000;
                  pointer-events: none; }
        .ra-load { position: absolute; inset: 0; display: grid; place-items: center; color: var(--text-dim); z-index: 8; }
        /* Scoped sniper: a black surround with a thin ring and cross, which is
           what actually reads as "looking down a scope" rather than a zoom. */
        .ra-scope { position: absolute; inset: 0; opacity: 0; transition: opacity .12s; pointer-events: none;
                    background: radial-gradient(circle at 50% 50%, transparent 0 26%, rgba(0,0,0,.97) 27%); }
        .ra-scope.on { opacity: 1; }
        .ra-scope i { position: absolute; inset: 0; }
        .ra-scope i::before, .ra-scope i::after { content: ""; position: absolute; background: rgba(255,255,255,.5); }
        .ra-scope i::before { left: 50%; top: 0; bottom: 0; width: 1px; }
        .ra-scope i::after { top: 50%; left: 0; right: 0; height: 1px; }
        /* The crosshair tightens as you aim, which is the readout for spread. */
        .ra-hud.ra-aiming .ra-cross i:nth-child(1) { top: 4px; height: 4px; }
        .ra-hud.ra-aiming .ra-cross i:nth-child(2) { bottom: 4px; height: 4px; }
        .ra-hud.ra-aiming .ra-cross i:nth-child(3) { left: 4px; width: 4px; }
        .ra-hud.ra-aiming .ra-cross i:nth-child(4) { right: 4px; width: 4px; }
        .ra-cross i { transition: all .12s; }
        .ra-touch { position: absolute; right: 12px; bottom: 12px; display: flex; gap: 8px; z-index: 4; }
        .ra-touch button { width: 54px; height: 54px; border-radius: 50%; border: 2px solid rgba(255,255,255,.3);
                           background: rgba(10,14,24,.66); color: #fff; font-size: 1.2rem; }
        .ra-touch button.ra-fire { width: 72px; height: 72px; background: rgba(255,90,90,.34); }
        .ra-touch button.on { border-color: #ffd166; background: rgba(255,209,102,.3); }
        .ra-reveal { text-align: center; padding: 8px 0 4px; }
        .ra-reveal-chip { display: inline-block; padding: 6px 16px; border-radius: 999px; font-weight: 900;
                          color: #10141c; margin-bottom: 8px; }
      </style>
      <div class="ra-load" id="raLoad">Loading the arena…</div>`;
    root.appendChild(wrap);

    let disposed = false;
    const teardown = [];
    function on(target, type, fn, opts) {
      target.addEventListener(type, fn, opts);
      teardown.push(() => target.removeEventListener(type, fn, opts));
    }

    function loadThree() {
      if (window.THREE) return Promise.resolve(window.THREE);
      if (!window.__brThreeLoading) {
        window.__brThreeLoading = new Promise((resolve, reject) => {
          const tag = document.createElement("script");
          tag.src = "games/mario-kart/three.min.js?v=20260815a-vendor";
          tag.onload = () => resolve(window.THREE);
          tag.onerror = () => reject(new Error("could not load the 3D library"));
          document.head.appendChild(tag);
        });
      }
      return window.__brThreeLoading;
    }

    loadThree().then((THREE) => {
      if (disposed) return;
      wrap.querySelector("#raLoad").remove();
      // Rethrow asynchronously so a bug in start() reaches window.onerror
      // instead of being swallowed by this promise chain — which is exactly
      // how a broken selector silently ate half the lobby.
      try { start(THREE); } catch (err) { setTimeout(() => { throw err; }); throw err; }
    }).catch((err) => {
      const el = wrap.querySelector("#raLoad");
      if (el) el.textContent = `Couldn't load the 3D library — ${err.message}.`;
    });

    /* ============================================================== the game */
    function start(THREE) {
      const canvas = document.createElement("canvas");
      wrap.appendChild(canvas);
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setPixelRatio(window.MimiGfx ? window.MimiGfx.pixelRatio() : Math.min(window.devicePixelRatio || 1, 1.5));
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x121a2a);
      scene.fog = new THREE.Fog(0x121a2a, 40, 150);
      const camera = new THREE.PerspectiveCamera(80, 16 / 9, 0.1, 400); // FOV is driven by aiming, see HIP_FOV
      const gunCamera = new THREE.PerspectiveCamera(60, 16 / 9, 0.01, 10);

      scene.add(new THREE.HemisphereLight(0x9fc4ff, 0x2a2f3a, 0.9));
      const key = new THREE.DirectionalLight(0xffffff, 1.1);
      key.position.set(30, 60, 20);
      scene.add(key);
      scene.add(new THREE.AmbientLight(0xffffff, 0.28));

      const hud = document.createElement("div");
      hud.className = "ra-hud";
      hud.innerHTML = `
        <div class="ra-cross"><i></i><i></i><i></i><i></i></div>
        <div class="ra-hit"></div>
        <div class="ra-score"><b>You 0</b><i>Bots 0</i></div>
        <div class="ra-feed"></div>
        <div class="ra-streak"></div>
        <div class="ra-left"><div class="ra-hplabel">100 HP</div><div class="ra-hpbar"><i style="width:100%"></i></div></div>
        <div class="ra-bottom"><div class="ra-ammo">30<small>/30</small></div><div class="ra-gunname">SMG</div></div>
        <div class="ra-scope"><i></i></div>
        <button class="ra-full" type="button" title="Fullscreen" style="pointer-events:auto">\u26F6</button>
        <div class="ra-hint">Click to lock the mouse</div>`;
      wrap.appendChild(hud);
      const el = {
        hit: hud.querySelector(".ra-hit"),
        score: hud.querySelector(".ra-score"),
        feed: hud.querySelector(".ra-feed"),
        streak: hud.querySelector(".ra-streak"),
        hp: hud.querySelector(".ra-hpbar i"),
        hpLabel: hud.querySelector(".ra-hplabel"),
        ammo: hud.querySelector(".ra-ammo"),
        gunName: hud.querySelector(".ra-gunname"),
        hint: hud.querySelector(".ra-hint"),
        scope: hud.querySelector(".ra-scope"),
        full: hud.querySelector(".ra-full"),
      };

      /* Fullscreen. Requested on the wrapper rather than the canvas so the HUD,
       * the lobby panel and the touch buttons come with it — fullscreening the
       * canvas alone would leave you in a match with no crosshair or ammo. */
      function toggleFullscreen() {
        const el = wrap;
        if (document.fullscreenElement === el) document.exitFullscreen?.();
        else (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
      }
      el.full.addEventListener("click", (e) => { e.stopPropagation(); toggleFullscreen(); });
      on(document, "fullscreenchange", () => {
        el.full.textContent = document.fullscreenElement === wrap ? "\u2715" : "\u26F6";
        // The renderer has no idea the element resized; without this the view
        // stays letterboxed at the old aspect ratio.
        resize();
      });

      const panel = document.createElement("div");
      panel.className = "ra-panel";
      wrap.appendChild(panel);

      /* ----------------------------------------------------------- the map
       * Boxes only, placed by hand: an arena wants deliberate sightlines and
       * cover you can learn, which procedural scatter does not give you. Each
       * entry is [x, y, z, width, height, depth]. */
      const ARENA = 46;
      const BOXES = [
        [0, 1.5, -14, 10, 3, 3], [0, 1.5, 14, 10, 3, 3],
        [-14, 1.5, 0, 3, 3, 10], [14, 1.5, 0, 3, 3, 10],
        [0, 2.5, 0, 12, 5, 12],                                  // central block
        [-9, 1, -9, 4, 2, 4], [9, 1, -9, 4, 2, 4],
        [-9, 1, 9, 4, 2, 4], [9, 1, 9, 4, 2, 4],
        [-19, 2, -19, 6, 4, 6], [19, 2, 19, 6, 4, 6],
        [19, 1.2, -17, 5, 2.4, 5], [-19, 1.2, 17, 5, 2.4, 5],
        [0, 0.5, -21, 16, 1, 3], [0, 0.5, 21, 16, 1, 3],         // low ramp-ish steps
        [-21, 0.5, 0, 3, 1, 16], [21, 0.5, 0, 3, 1, 16],
      ];
      const colliders = [];
      const mapGroup = new THREE.Group();
      scene.add(mapGroup);

      function buildMap() {
        const floor = new THREE.Mesh(
          new THREE.BoxGeometry(ARENA * 2, 1, ARENA * 2),
          new THREE.MeshLambertMaterial({ color: 0x2b3348 }),
        );
        floor.position.y = -0.5;
        mapGroup.add(floor);
        // A grid of slightly darker tiles so movement reads — a flat plane with
        // no texture gives no sense of speed at all.
        const tile = new THREE.Mesh(
          new THREE.PlaneGeometry(ARENA * 2, ARENA * 2, 24, 24),
          new THREE.MeshBasicMaterial({ color: 0x3d4762, wireframe: true, transparent: true, opacity: 0.35 }),
        );
        tile.rotation.x = -Math.PI / 2;
        tile.position.y = 0.02;
        mapGroup.add(tile);

        const wallMat = new THREE.MeshLambertMaterial({ color: 0x394463 });
        const boxMat = new THREE.MeshLambertMaterial({ color: 0x4a5675 });
        const trimMat = new THREE.MeshLambertMaterial({ color: 0x00c3e3 });

        BOXES.forEach(([x, y, z, w, h, d]) => {
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMat);
          mesh.position.set(x, y, z);
          mapGroup.add(mesh);
          // A bright lip on top of every crate: it marks what you can stand on
          // and, more usefully, reads as an edge when you're strafing past it.
          const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.12, d + 0.12), trimMat);
          lip.position.set(x, y + h / 2, z);
          mapGroup.add(lip);
          colliders.push({ x, y, z, w, h, d });
        });

        // Perimeter
        const H = 8;
        [[0, H / 2, -ARENA, ARENA * 2, H, 1], [0, H / 2, ARENA, ARENA * 2, H, 1],
         [-ARENA, H / 2, 0, 1, H, ARENA * 2], [ARENA, H / 2, 0, 1, H, ARENA * 2]].forEach(([x, y, z, w, h, d]) => {
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
          mesh.position.set(x, y, z);
          mapGroup.add(mesh);
          colliders.push({ x, y, z, w, h, d });
        });
      }
      buildMap();

      /* ------------------------------------------------------------- player */
      const P = {
        x: 0, y: 1.7, z: 30, vy: 0, yaw: Math.PI, pitch: 0,
        hp: 100, onGround: true, crouch: false, weapon: 0,
        ammo: WEAPONS.map((w) => w.mag), reloading: 0, lastShot: 0,
        kills: 0, deaths: 0, streak: 0, lastKill: 0, recoil: 0,
        ads: 0,      // 0..1, how far scoped in — animated, not a boolean, so
                     // the zoom and the gun sliding to centre can ease
      };
      const HIP_FOV = 80;
      const EYE = 1.62, CROUCH_EYE = 1.05, RADIUS = 0.42;
      let mode = MODES.standard;
      let botScore = 0;
      let running = false;
      let raf = 0;

      /* ------------------------------------------------------------ the gun
       * A few boxes parented to the gun camera. It doesn't need to be a model —
       * what sells a shooter is that the thing in your hands moves: it sways
       * when you turn, bobs when you walk and kicks when it fires. */
      const gunGroup = new THREE.Group();
      const gunParts = { body: null, trim: null };
      function buildGun() {
        gunGroup.clear();
        const skin = skinFor(WEAPONS[P.weapon].id);
        const bodyMat = new THREE.MeshLambertMaterial({ color: skin.body });
        const trimMat = new THREE.MeshLambertMaterial({ color: skin.trim });
        const w = WEAPONS[P.weapon];
        const len = w.id === "sniper" ? 1.5 : w.id === "shotgun" ? 1.0 : 0.85;
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, len), bodyMat);
        body.position.set(0, 0, -len / 2);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.26, 0.14), trimMat);
        grip.position.set(0, -0.17, -0.08);
        const sight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.22), trimMat);
        sight.position.set(0, 0.1, -len * 0.55);
        gunGroup.add(body, grip, sight);
        if (w.id === "sniper") {
          const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.36, 10), trimMat);
          scope.rotation.x = Math.PI / 2;
          scope.position.set(0, 0.13, -0.5);
          gunGroup.add(scope);
        }
        gunParts.body = body;
        gunGroup.position.set(0.22, -0.19, -0.05);
        gunCamera.add(gunGroup);
      }
      const gunScene = new THREE.Scene();
      gunScene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.2));
      gunScene.add(gunCamera);
      buildGun();

      const muzzle = new THREE.PointLight(0xffcc66, 0, 4);
      gunCamera.add(muzzle);
      muzzle.position.set(0.22, -0.15, -0.9);

      /* --------------------------------------------------------------- bots */
      const bots = [];
      const botGeo = new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.42, 1.0, 4, 8) : new THREE.CylinderGeometry(0.42, 0.42, 1.7, 8);
      function spawnPoint() {
        // Anywhere on the ring, away from the middle, and not inside a crate.
        for (let tries = 0; tries < 40; tries += 1) {
          const a = Math.random() * Math.PI * 2;
          const r = 20 + Math.random() * 20;
          const x = Math.cos(a) * r, z = Math.sin(a) * r;
          if (!hitsCollider(x, 1, z, 0.6)) return { x, z };
        }
        return { x: 0, z: 28 };
      }
      function addBot(index) {
        const mat = new THREE.MeshLambertMaterial({ color: [0xff5a5a, 0xff8a3d, 0xd45cff, 0x4aa3ff, 0xff4fa3][index % 5] });
        const mesh = new THREE.Mesh(botGeo, mat);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.4, 0.44), mat);
        head.position.y = 0.95;
        mesh.add(head);
        scene.add(mesh);
        const at = spawnPoint();
        const bot = {
          mesh, x: at.x, z: at.z, y: 0.85, hp: 100, alive: true,
          cool: Math.random() * 2, respawn: 0,
          foe: null, retarget: 0,   // free-for-all targeting, see the frame loop
          name: ["Volt", "Ash", "Rook", "Jinx", "Nova", "Kite", "Mako", "Pyra", "Zed", "Wisp"][index % 10],
        };
        bots.push(bot);
        return bot;
      }

      /* ---------------------------------------------------------- collisions */
      function hitsCollider(x, y, z, radius) {
        for (let i = 0; i < colliders.length; i += 1) {
          const c = colliders[i];
          const hw = c.w / 2 + radius, hh = c.h / 2, hd = c.d / 2 + radius;
          if (x > c.x - hw && x < c.x + hw && z > c.z - hd && z < c.z + hd
              && y > c.y - hh && y < c.y + hh) return c;
        }
        return null;
      }
      // Height of whatever you'd be standing on at (x, z), so you can walk up
      // onto the crates instead of bumping into them like walls.
      function groundAt(x, z, fromY) {
        let top = 0;
        colliders.forEach((c) => {
          const hw = c.w / 2 + RADIUS, hd = c.d / 2 + RADIUS;
          if (x > c.x - hw && x < c.x + hw && z > c.z - hd && z < c.z + hd) {
            const t = c.y + c.h / 2;
            if (t <= fromY + 0.35 && t > top) top = t;
          }
        });
        return top;
      }

      /* --------------------------------------------------------------- input */
      const keys = new Set();
      let firing = false;
      let aiming = false;
      /* Which device is actually being used. Aim assist is deliberately only
       * applied for a gamepad or a touchscreen — that's the bargain every
       * console shooter makes, because a thumbstick and a thumb simply cannot
       * match a mouse for fine aim. Giving it to a mouse player too would just
       * be an aimbot. It flips the moment you use a different device, so
       * picking up a controller mid-match works without a setting. */
      let inputMode = "mouse";
      // Auto-shoot: fires for you whenever an enemy is genuinely under the
      // crosshair. Off by default on a mouse and on by default for touch, where
      // holding a fire button while also dragging to aim is the awkward part.
      // On by default for pad/touch (which is the point of it) but always
      // overridable — some people would rather it stayed out of the way.
      let aimAssistOn = ctx.storage.get("aimAssist", true);
      let autoShoot = ctx.storage.get("autoShoot", null);
      if (autoShoot === null) {
        autoShoot = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
      }

      on(window, "keydown", (e) => {
        if (!running) return;
        if (e.code === "Escape") { pause(); return; }
        if (/^Digit[1-4]$/.test(e.code)) { switchWeapon(Number(e.code.slice(5)) - 1); return; }
        if (e.code === "KeyR") startReload();
        if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
        keys.add(e.code);
      });
      on(window, "keyup", (e) => keys.delete(e.code));
      on(canvas, "mousedown", (e) => {
        if (!running) return;
        inputMode = "mouse";
        if (document.pointerLockElement !== canvas) { canvas.requestPointerLock(); return; }
        if (e.button === 0) { firing = true; tryShoot(); }
        if (e.button === 2) aiming = true;
      });
      on(window, "mouseup", (e) => {
        if (e.button === 2) aiming = false; else firing = false;
      });
      on(canvas, "contextmenu", (e) => e.preventDefault());
      on(document, "pointerlockchange", () => {
        const locked = document.pointerLockElement === canvas;
        el.hint.classList.toggle("off", locked);
        if (!locked) { firing = false; aiming = false; }
      });
      on(document, "mousemove", (e) => {
        if (document.pointerLockElement !== canvas) return;
        inputMode = "mouse";
        // Aiming slows the look speed, which is what makes a scope usable.
        const sens = 0.0022 * (1 - P.ads * 0.55);
        P.yaw -= e.movementX * sens;
        P.pitch = Math.max(-1.5, Math.min(1.5, P.pitch - e.movementY * sens));
      });
      on(canvas, "wheel", (e) => {
        if (!running) return;
        e.preventDefault();
        switchWeapon((P.weapon + (e.deltaY > 0 ? 1 : -1) + WEAPONS.length) % WEAPONS.length);
      }, { passive: false });

      function switchWeapon(index) {
        if (index === P.weapon) return;
        P.weapon = index;
        P.reloading = 0;
        buildGun();
        syncHud();
      }
      function startReload() {
        const w = WEAPONS[P.weapon];
        if (P.reloading > 0 || P.ammo[P.weapon] >= w.mag) return;
        P.reloading = w.reload;
      }

      /* -------------------------------------------------------------- combat */
      const tracers = [];
      function addTracer(from, to, color) {
        const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }));
        scene.add(line);
        tracers.push({ line, life: 0.07 });
      }

      function damageNumber(amount, headshot) {
        const d = document.createElement("div");
        d.className = "ra-dmg";
        d.textContent = headshot ? `${amount} HS!` : amount;
        if (headshot) d.style.color = "#ff5a5a";
        d.style.left = `${48 + Math.random() * 8}%`;
        d.style.top = `${44 + Math.random() * 6}%`;
        hud.appendChild(d);
        let t = 0;
        const step = () => {
          t += 0.05;
          d.style.transform = `translateY(${-t * 34}px)`;
          d.style.opacity = String(Math.max(0, 1 - t));
          if (t < 1) requestAnimationFrame(step); else d.remove();
        };
        requestAnimationFrame(step);
      }

      function feed(text) {
        const line = document.createElement("div");
        line.textContent = text;
        el.feed.appendChild(line);
        if (el.feed.children.length > 5) el.feed.firstChild.remove();
        window.setTimeout(() => line.remove(), 5000);
      }

      // Ray against the arena boxes, so shots stop at cover instead of passing
      // through it. Slab method, nearest hit wins.
      function rayWorld(origin, dir, maxDist) {
        let nearest = maxDist;
        colliders.forEach((c) => {
          const inv = [1 / dir.x, 1 / dir.y, 1 / dir.z];
          const lo = [(c.x - c.w / 2 - origin.x) * inv[0], (c.y - c.h / 2 - origin.y) * inv[1], (c.z - c.d / 2 - origin.z) * inv[2]];
          const hi = [(c.x + c.w / 2 - origin.x) * inv[0], (c.y + c.h / 2 - origin.y) * inv[1], (c.z + c.d / 2 - origin.z) * inv[2]];
          let tmin = -Infinity, tmax = Infinity;
          for (let a = 0; a < 3; a += 1) {
            const t1 = Math.min(lo[a], hi[a]), t2 = Math.max(lo[a], hi[a]);
            tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
          }
          if (tmax >= Math.max(0, tmin) && tmin < nearest && tmin > 0) nearest = tmin;
        });
        return nearest;
      }

      function tryShoot() {
        const w = WEAPONS[P.weapon];
        const now = performance.now();
        if (P.reloading > 0 || now - P.lastShot < 60000 / w.rpm) return;
        if (P.ammo[P.weapon] <= 0) { startReload(); return; }
        P.lastShot = now;
        P.ammo[P.weapon] -= 1;
        P.recoil = Math.min(0.22, P.recoil + w.recoil * 3);
        P.pitch = Math.min(1.5, P.pitch + w.recoil);
        muzzle.intensity = 3.2;
        ctx.tone?.beep?.(w.id === "sniper" ? 90 : 210, 0.04);

        const origin = new THREE.Vector3(P.x, P.y, P.z);
        for (let pellet = 0; pellet < w.pellets; pellet += 1) {
          // Hip-fire is loose, aimed is tight — the entire reason to scope in.
          const spread = w.spread * (keys.has("ShiftLeft") ? 1.7 : 1) * (1 - P.ads * 0.72);
          const dir = new THREE.Vector3(
            -Math.sin(P.yaw) * Math.cos(P.pitch) + (Math.random() - 0.5) * spread,
            Math.sin(P.pitch) + (Math.random() - 0.5) * spread,
            -Math.cos(P.yaw) * Math.cos(P.pitch) + (Math.random() - 0.5) * spread,
          ).normalize();

          const wallDist = rayWorld(origin, dir, w.range);
          let best = null, bestT = wallDist;
          let bestPeer = null;
          peers.forEach((peer, id) => {
            if (peer.hp <= 0) return;
            const to = new THREE.Vector3(peer.x - origin.x, peer.y - 0.4 - origin.y, peer.z - origin.z);
            const along = to.dot(dir);
            if (along < 0 || along > bestT) return;
            if (to.clone().sub(dir.clone().multiplyScalar(along)).length() > 0.6) return;
            bestPeer = { id, peer }; best = null; bestT = along;
          });
          bots.forEach((bot) => {
            if (!bot.alive) return;
            // Capsule approximated as a sphere at the body and a smaller one at
            // the head — enough for headshots to feel like a real distinction
            // without a full capsule intersection test.
            [{ y: bot.y, r: 0.55, head: false }, { y: bot.y + 0.95, r: 0.3, head: true }].forEach((part) => {
              const to = new THREE.Vector3(bot.x - origin.x, part.y - origin.y, bot.z - origin.z);
              const along = to.dot(dir);
              if (along < 0 || along > bestT) return;
              const perp = to.clone().sub(dir.clone().multiplyScalar(along)).length();
              if (perp <= part.r) { best = { bot, head: part.head }; bestPeer = null; bestT = along; }
            });
          });

          const end = origin.clone().add(dir.clone().multiplyScalar(Math.min(bestT, w.range)));
          addTracer(new THREE.Vector3(P.x + 0.2, P.y - 0.2, P.z), end, (best || bestPeer) ? 0xffd166 : 0x8fb8ff);
          if (best) hitBot(best.bot, Math.round(w.damage * (best.head ? 2.1 : 1)), best.head);
          else if (bestPeer) {
            // The shooter decides the hit and reports it. Without an
            // authoritative server there is no better option, and for a casual
            // arena it beats having no online play at all.
            const dmg = Math.round(w.damage);
            bestPeer.peer.hp = Math.max(0, bestPeer.peer.hp - dmg);
            damageNumber(dmg, false);
            el.hit.classList.add("on");
            window.setTimeout(() => el.hit.classList.remove("on"), 90);
            netSend({ type: "shot", target: bestPeer.id, damage: dmg, from: playerName() });
            if (bestPeer.peer.hp <= 0) { P.kills += 1; feed(`You eliminated ${bestPeer.peer.name}`); syncHud(); }
          }
        }
        if (P.ammo[P.weapon] === 0) startReload();
        syncHud();
      }

      /* A bot dying has to be handled two ways: killed by you, which scores and
       * builds a streak, or killed by another bot, which is just something that
       * happened in the arena. Same death, different bookkeeping. */
      function killBot(bot) {
        bot.alive = false;
        bot.mesh.visible = false;
        bot.respawn = 3;
        bot.foe = null;
      }

      function botKilledBot(attacker, victim) {
        killBot(victim);
        feed(`${attacker.name} eliminated ${victim.name}`);
      }

      function hitBot(bot, amount, head) {
        bot.hp -= amount;
        el.hit.classList.add("on");
        window.setTimeout(() => el.hit.classList.remove("on"), 90);
        damageNumber(amount, head);
        if (bot.hp <= 0) {
          killBot(bot);
          P.kills += 1;
          const now = performance.now();
          P.streak = now - P.lastKill < 5000 ? P.streak + 1 : 1;
          P.lastKill = now;
          if (P.streak >= 2) {
            el.streak.textContent = `${P.streak}× STREAK!`;
            el.streak.classList.add("on");
            window.setTimeout(() => el.streak.classList.remove("on"), 1600);
          }
          feed(`You eliminated ${bot.name}`);
          ctx.tone?.chime?.([[660, 0.08], [880, 0.1]]);
          syncHud();
          if (P.kills >= mode.target) endMatch(true);
        }
      }

      function hurtPlayer(amount, fromName) {
        P.hp -= amount;
        ctx.vibrate?.(30);
        if (P.hp <= 0) {
          P.hp = 100;
          P.deaths += 1;
          botScore += 1;
          const at = spawnPoint();
          P.x = at.x; P.z = at.z; P.y = 1.7;
          P.streak = 0;
          feed(`${fromName} eliminated you`);
          if (botScore >= mode.target) endMatch(false);
        }
        syncHud();
      }

      function syncHud() {
        const w = WEAPONS[P.weapon];
        el.ammo.innerHTML = `${P.reloading > 0 ? "…" : P.ammo[P.weapon]}<small>/${w.mag}</small>`;
        el.gunName.textContent = `${w.emoji} ${w.name}`;
        el.hp.style.width = `${Math.max(0, P.hp)}%`;
        el.hpLabel.textContent = `${Math.max(0, Math.round(P.hp))} HP`;
        el.score.innerHTML = `<b>You ${P.kills}</b><i>Bots ${botScore}</i>`;
      }

      /* --------------------------------------------------------------- lobby */
      function optionRow(options, current, onPick, cls) {
        const row = document.createElement("div");
        row.className = cls;
        Object.entries(options).forEach(([k, meta]) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "ra-opt" + (k === current ? " is-on" : "");
          b.innerHTML = "<strong></strong><span></span>";
          b.querySelector("strong").textContent = meta.label;
          b.querySelector("span").textContent = meta.desc;
          b.onclick = () => {
            row.querySelectorAll(".ra-opt").forEach((x) => x.classList.remove("is-on"));
            b.classList.add("is-on");
            onPick(k);
          };
          row.appendChild(b);
        });
        return row;
      }

      function showLobby(resultText) {
        running = false;
        if (document.pointerLockElement === canvas) document.exitPointerLock();
        panel.style.display = "flex";
        panel.innerHTML = "";
        const card = document.createElement("div");
        card.className = "ra-card";
        panel.appendChild(card);

        let modeKey = Object.keys(MODES).find((k) => MODES[k] === mode) || "standard";
        card.innerHTML = `<h3>🎯 Rival Arena</h3><p class="ra-sub">${resultText || "Fast 3D arena combat. Pick a match, pick a gun, drop in."}</p>`;

        const modeLabel = document.createElement("p");
        modeLabel.className = "ra-label";
        modeLabel.textContent = "Match";
        card.appendChild(modeLabel);
        card.appendChild(optionRow(MODES, modeKey, (k) => { mode = MODES[k]; modeKey = k; }, "ra-row"));

        const gunLabel = document.createElement("p");
        gunLabel.className = "ra-label";
        gunLabel.textContent = "Starting weapon (swap any time with 1-4)";
        card.appendChild(gunLabel);
        const guns = document.createElement("div");
        guns.className = "ra-guns";
        WEAPONS.forEach((w, i) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "ra-opt" + (i === P.weapon ? " is-on" : "");
          // Four bars: damage, rate, range, accuracy — enough to tell them
          // apart at a glance without a spreadsheet.
          const bars = (n) => Array.from({ length: 4 }, (_, k) => `<i class="${k < n ? "on" : ""}"></i>`).join("");
          b.innerHTML = `<strong>${w.emoji} ${w.name}</strong>
            <div class="ra-gun-stats">${bars(Math.min(4, Math.round(w.damage / 25) + 1))}</div>
            <div class="ra-gun-stats">${bars(Math.min(4, Math.round(w.rpm / 200) + 1))}</div>
            <div class="ra-gun-stats">${bars(Math.min(4, Math.round(w.range / 55) + 1))}</div>`;
          b.onclick = () => {
            guns.querySelectorAll(".ra-opt").forEach((x) => x.classList.remove("is-on"));
            b.classList.add("is-on");
            P.weapon = i;
            buildGun();
            renderSkins();
          };
          guns.appendChild(b);
        });
        card.appendChild(guns);

        /* crate */
        const crate = document.createElement("div");
        crate.className = "ra-crate";
        const keysAvailable = () => (window.MimiKeys ? window.MimiKeys.balance() : 0);
        function paintCrate() {
          crate.innerHTML = `<span class="ra-crate-icon">🎁</span>
            <span class="ra-crate-body"><strong>Weapon crate — ${CRATE_COST} 🔑</strong>
            <span>You have ${keysAvailable()} keys. Play 5 different games in a day for 10 more.</span></span>`;
          const open = document.createElement("button");
          open.type = "button";
          open.className = "btn primary";
          open.textContent = "Open";
          open.disabled = keysAvailable() < CRATE_COST;
          open.onclick = openCrate;
          crate.appendChild(open);
        }
        function openCrate() {
          if (!window.MimiKeys || !window.MimiKeys.spend(CRATE_COST)) return;
          // Weighted by rarity, then a skin of that rarity you don't already own
          // where possible — a crate that keeps handing back duplicates while
          // you still have locked skins feels broken even when it's "fair".
          const roll = Math.random() * RARITIES.reduce((s, r) => s + r.weight, 0);
          let acc = 0;
          const rarity = RARITIES.find((r) => (acc += r.weight) >= roll) || RARITIES[0];
          const owned = ownedSkins();
          const pool = SKINS.filter((s) => s.rarity === rarity.id);
          const fresh = pool.filter((s) => !owned.includes(s.id));
          const won = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length ? fresh.length : pool.length))];
          const duplicate = owned.includes(won.id);
          if (!duplicate) ctx.storage.set(OWNED_KEY, owned.concat(won.id));
          const meta = RARITIES.find((r) => r.id === won.rarity);
          const reveal = document.createElement("div");
          reveal.className = "ra-reveal";
          reveal.innerHTML = `<span class="ra-reveal-chip" style="background:${meta.color}">${meta.name}</span>
            <div style="font-weight:800;font-size:1.1rem">${won.name}</div>
            <div style="font-size:.82rem;color:var(--text-dim)">${duplicate ? "Duplicate — already unlocked" : "New skin unlocked!"}</div>`;
          crate.after(reveal);
          window.setTimeout(() => reveal.remove(), 4500);
          // Longer and higher the rarer it is — the reveal should sound like
          // it matters more when it does.
          const fanfare = { common: [[440, 0.09]], rare: [[523, 0.09], [659, 0.11]],
            epic: [[523, 0.08], [659, 0.08], [784, 0.14]],
            legendary: [[523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.22]] };
          ctx.tone?.chime?.(fanfare[won.rarity] || fanfare.common);
          paintCrate();
          renderSkins();
        }
        paintCrate();
        card.appendChild(crate);
        // The balance can change while this screen is open — a crate opened
        // here, or the daily bonus landing from another tab — and a button
        // whose disabled state was decided once at render time then lies about
        // whether you can afford it.
        if (window.MimiKeys) {
          const stop = window.MimiKeys.onChange(() => {
            if (crate.isConnected) paintCrate(); else stop();
          });
          teardown.push(stop);
        }

        const assistLabel = document.createElement("p");
        assistLabel.className = "ra-label";
        assistLabel.textContent = "Aim help";
        card.appendChild(assistLabel);

        function toggleRow(on, title, desc, onFlip) {
          const row = document.createElement("div");
          row.className = "ra-toggle" + (on ? " is-on" : "");
          // Addressed by class, not by a "span span span" descendant chain —
          // that needed three levels of nesting, the markup has two, so it
          // matched nothing and threw. showLobby() is called from inside a
          // promise chain, so the throw was swallowed and the whole lower half
          // of the lobby silently failed to render with no error anywhere.
          row.innerHTML = `<span class="ra-sw"></span><span><strong class="ra-tg-title"></strong><br>
            <span class="ra-tg-desc"></span></span>`;
          row.querySelector(".ra-tg-title").textContent = title;
          row.querySelector(".ra-tg-desc").textContent = desc;
          row.onclick = () => { const next = !row.classList.contains("is-on"); row.classList.toggle("is-on", next); onFlip(next); };
          card.appendChild(row);
          return row;
        }
        toggleRow(autoShoot, "Auto-shoot", "Fires by itself when an enemy is under your crosshair",
          (v) => { autoShoot = v; ctx.storage.set("autoShoot", v); });
        toggleRow(aimAssistOn, "Aim assist", "Controller and touch only \u2014 slows and nudges your aim near a target",
          (v) => { aimAssistOn = v; ctx.storage.set("aimAssist", v); });

        /* ---- online / wireless ---- */
        const mpLabel = document.createElement("p");
        mpLabel.className = "ra-label";
        mpLabel.textContent = "Play with others";
        card.appendChild(mpLabel);
        const mp = document.createElement("div");
        mp.className = "ra-mp";
        mp.innerHTML = `
          <div class="ra-mp-row">
            <button type="button" class="btn" data-mp="regional">\u{1F4CD} Regional</button>
            <button type="button" class="btn" data-mp="global">\u{1F310} Global</button>
          </div>
          <div class="ra-mp-row">
            <button type="button" class="btn" data-mp="host">\u{1F4E1} Host a room</button>
            <input type="text" maxlength="4" placeholder="Code" aria-label="Room code" />
            <button type="button" class="btn" data-mp="join">Join</button>
          </div>
          <p id="raNetStatus" class="ra-net-status">Play solo against bots, or connect with others.</p>
          <button type="button" class="btn" data-mp="leave">Leave</button>`;
        card.appendChild(mp);
        const codeInput = mp.querySelector("input");
        mp.querySelectorAll("button").forEach((b) => {
          b.onclick = () => {
            const act = b.dataset.mp;
            if (act === "regional" || act === "global") netMatchmake(act);
            if (act === "host") netHost();
            if (act === "join") netJoin(codeInput.value.trim());
            if (act === "leave") { netDisconnect(); setNetStatus("Left. Playing solo against bots."); }
          };
        });
        if (net.room) {
          setNetStatus(net.scope
            ? `Connected \u2014 ${peers.size + 1} players.`
            : `Room ${net.room} \u2014 ${peers.size + 1} connected.`);
        }

        const skinLabel = document.createElement("p");
        skinLabel.className = "ra-label";
        skinLabel.textContent = "Skin for this weapon";
        card.appendChild(skinLabel);
        const skinRow = document.createElement("div");
        skinRow.className = "ra-skins";
        card.appendChild(skinRow);
        function renderSkins() {
          const owned = ownedSkins();
          const current = equipped()[WEAPONS[P.weapon].id] || "standard";
          skinRow.innerHTML = "";
          SKINS.forEach((s) => {
            const b = document.createElement("button");
            b.type = "button";
            const locked = !owned.includes(s.id);
            b.className = "ra-skin" + (locked ? " is-locked" : "") + (s.id === current ? " is-on" : "");
            b.style.background = `linear-gradient(135deg, #${s.body.toString(16).padStart(6, "0")}, #${s.trim.toString(16).padStart(6, "0")})`;
            b.title = locked ? `${s.name} — locked` : s.name;
            if (!locked) {
              b.onclick = () => {
                const next = equipped();
                next[WEAPONS[P.weapon].id] = s.id;
                ctx.storage.set(EQUIP_KEY, next);
                buildGun();
                renderSkins();
              };
            }
            skinRow.appendChild(b);
          });
        }
        renderSkins();

        const actions = document.createElement("div");
        actions.className = "ra-actions";
        const play = document.createElement("button");
        play.type = "button";
        play.className = "btn primary";
        play.textContent = "Drop in";
        play.onclick = startMatch;
        actions.appendChild(play);
        card.appendChild(actions);
      }

      function startMatch() {
        bots.forEach((b) => scene.remove(b.mesh));
        bots.length = 0;
        for (let i = 0; i < mode.bots; i += 1) addBot(i);
        P.hp = 100; P.kills = 0; P.deaths = 0; P.streak = 0;
        P.ammo = WEAPONS.map((w) => w.mag);
        P.reloading = 0;
        botScore = 0;
        const at = spawnPoint();
        P.x = at.x; P.z = at.z; P.y = 1.7;
        el.feed.innerHTML = "";
        buildGun();
        syncHud();
        panel.style.display = "none";
        running = true;
        ctx.setStatus(`${mode.label} — first to ${mode.target}.`);
        // Guarded: an auto-start from the matchmaking countdown isn't a user
        // gesture, and the browser rejects the request with an uncaught error.
        // The click-to-lock hint stays up, which is the right fallback anyway.
        try {
          const p = canvas.requestPointerLock();
          if (p && typeof p.catch === "function") p.catch(() => {});
        } catch (e) { /* needs a click first — the hint says so */ }
      }

      function endMatch(won) {
        running = false;
        if (document.pointerLockElement === canvas) document.exitPointerLock();
        ctx.reportScore?.(P.kills);
        if (won) ctx.confetti?.(wrap);
        showLobby(won
          ? `You won ${P.kills}–${botScore}. Nice shooting.`
          : `The bots took it ${botScore}–${P.kills}. Run it back?`);
      }

      function pause() {
        running = false;
        if (document.pointerLockElement === canvas) document.exitPointerLock();
        showLobby(`Paused — you're ${P.kills}–${botScore}.`);
      }

      /* ------------------------------------------------------------- gamepad
       * Polled rather than event-driven, because the Gamepad API has no events
       * for axes — you read the current state each frame or you read nothing.
       * The hub's own pad cursor (js/pad-cursor.js) drives menus; this is the
       * in-match read, and it only runs while a match is live so the two never
       * fight over the same stick. */
      let assistFriction = 1;   // declared here because readGamepad() below reads it
      const PAD = { fire: 7, ads: 6, jump: 0, reload: 2, prev: 4, next: 5, pause: 9, crouch: 10 };
      let padPrev = {};
      function readGamepad(dt) {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        let pad = null;
        for (let i = 0; i < pads.length; i += 1) if (pads[i] && pads[i].connected) { pad = pads[i]; break; }
        if (!pad) return null;

        // Sticks rest slightly off centre on most pads, so anything inside the
        // deadzone is thrown away; the cube curve then gives fine control near
        // the middle and full speed at the edge.
        const dead = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
        const curve = (v) => v * v * v;
        const lx = dead(pad.axes[0] || 0);
        const ly = dead(pad.axes[1] || 0);
        const rx = dead(pad.axes[2] || 0);
        const ry = dead(pad.axes[3] || 0);
        if (lx || ly || rx || ry) inputMode = "pad";

        const held = (i) => Boolean(pad.buttons[i] && pad.buttons[i].pressed);
        const tapped = (i) => { const now = held(i); const was = padPrev[i]; padPrev[i] = now; return now && !was; };
        // Triggers report as analog on most pads; treat a light pull as held.
        const trigger = (i) => (pad.buttons[i] ? pad.buttons[i].value > 0.3 || pad.buttons[i].pressed : false);

        if (held(PAD.fire) || trigger(PAD.fire)) { inputMode = "pad"; if (!firing) { firing = true; tryShoot(); } }
        else if (firing && inputMode === "pad") firing = false;
        aiming = trigger(PAD.ads) || held(PAD.ads) ? true : (inputMode === "pad" ? false : aiming);
        if (tapped(PAD.jump)) keys.add("Space"); else if (!held(PAD.jump)) keys.delete("Space");
        if (tapped(PAD.reload)) startReload();
        if (tapped(PAD.prev)) switchWeapon((P.weapon - 1 + WEAPONS.length) % WEAPONS.length);
        if (tapped(PAD.next)) switchWeapon((P.weapon + 1) % WEAPONS.length);
        if (tapped(PAD.pause)) { pause(); return null; }
        if (held(PAD.crouch)) keys.add("ControlLeft"); else keys.delete("ControlLeft");

        // assistFriction is set by aimAssist() from the previous frame — one
        // frame of lag is imperceptible and avoids ordering the two passes.
        const look = 2.6 * (1 - P.ads * 0.5) * assistFriction * dt;
        P.yaw -= curve(rx) * look * 1.6;
        P.pitch = Math.max(-1.5, Math.min(1.5, P.pitch - curve(ry) * look));
        return { moveX: lx, moveZ: -ly };
      }

      /* ---------------------------------------------------------- aim assist
       * What a console shooter actually means by "aim assist": not a bot that
       * snaps to heads, but two gentle nudges that make a thumbstick or a thumb
       * competitive with a mouse.
       *
       *   1. friction — when the crosshair is already near an enemy, look speed
       *      is scaled down so you don't slide straight past them
       *   2. magnetism — a slow pull toward the nearest visible enemy inside a
       *      narrow cone, strong enough to help and far too weak to aim for you
       *
       * Only ever applied for pad and touch (see inputMode), never for a mouse.
       * It also refuses to help through walls, so it can't reveal anyone. */
      const ASSIST_CONE = 0.16;     // radians; roughly a thumb's width on screen
      function aimAssist(dt) {
        assistFriction = 1;
        if (!aimAssistOn || inputMode === "mouse") return;
        const origin = new THREE.Vector3(P.x, P.y, P.z);
        const aim = new THREE.Vector3(
          -Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), -Math.cos(P.yaw) * Math.cos(P.pitch),
        );
        let best = null;
        let bestAngle = ASSIST_CONE;
        bots.forEach((bot) => {
          if (!bot.alive) return;
          const to = new THREE.Vector3(bot.x - P.x, bot.y + 0.35 - P.y, bot.z - P.z);
          const dist = to.length();
          if (dist > 70) return;
          to.normalize();
          const angle = Math.acos(Math.max(-1, Math.min(1, to.dot(aim))));
          if (angle > bestAngle) return;
          if (rayWorld(origin, to, dist) < dist - 0.8) return; // behind cover
          bestAngle = angle;
          best = { to, angle, dist };
        });
        if (!best) return;
        // Closer to centre = more friction, so the crosshair settles rather
        // than being dragged.
        assistFriction = 0.45 + 0.55 * (best.angle / ASSIST_CONE);
        const pull = (1 - best.angle / ASSIST_CONE) * (aiming ? 3.1 : 1.9) * dt;
        const wantYaw = Math.atan2(-best.to.x, -best.to.z);
        const wantPitch = Math.asin(Math.max(-1, Math.min(1, best.to.y)));
        let dYaw = wantYaw - P.yaw;
        while (dYaw > Math.PI) dYaw -= Math.PI * 2;
        while (dYaw < -Math.PI) dYaw += Math.PI * 2;
        P.yaw += dYaw * Math.min(1, pull);
        P.pitch += (wantPitch - P.pitch) * Math.min(1, pull);
      }

      /* Fires when something is actually under the crosshair — a much tighter
       * cone than aim assist uses, and it still respects the weapon's fire rate,
       * ammo and reload because it goes through tryShoot() like any other shot.
       * It will not shoot through walls. */
      const AUTO_CONE = 0.045;
      function autoShootTick() {
        if (!autoShoot || P.reloading > 0 || P.ammo[P.weapon] <= 0) return;
        const w = WEAPONS[P.weapon];
        const origin = new THREE.Vector3(P.x, P.y, P.z);
        const aim = new THREE.Vector3(
          -Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), -Math.cos(P.yaw) * Math.cos(P.pitch),
        );
        for (let i = 0; i < bots.length; i += 1) {
          const bot = bots[i];
          if (!bot.alive) continue;
          const to = new THREE.Vector3(bot.x - P.x, bot.y + 0.35 - P.y, bot.z - P.z);
          const dist = to.length();
          if (dist > w.range) continue;
          to.normalize();
          if (Math.acos(Math.max(-1, Math.min(1, to.dot(aim)))) > AUTO_CONE) continue;
          if (rayWorld(origin, to, dist) < dist - 0.8) continue;
          tryShoot();
          return;
        }
      }

      /* ----------------------------------------------------------- touch
       * Left half of the screen drags to move, right half drags to look, with
       * on-screen buttons for the rest. Multi-touch, so moving and looking at
       * the same time works — tracking each touch by its identifier rather than
       * assuming one finger. */
      let touchMove = null;   // { id, ox, oy, x, y }
      let touchLook = null;
      function bindTouch() {
        const onStart = (e) => {
          inputMode = "touch";
          for (const t of e.changedTouches) {
            const left = t.clientX - canvas.getBoundingClientRect().left < canvas.clientWidth / 2;
            if (left && !touchMove) touchMove = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
            else if (!left && !touchLook) touchLook = { id: t.identifier, x: t.clientX, y: t.clientY };
          }
          e.preventDefault();
        };
        const onMove = (e) => {
          for (const t of e.changedTouches) {
            if (touchMove && t.identifier === touchMove.id) { touchMove.x = t.clientX; touchMove.y = t.clientY; }
            if (touchLook && t.identifier === touchLook.id) {
              const look = 0.005 * (1 - P.ads * 0.5) * assistFriction;
              P.yaw -= (t.clientX - touchLook.x) * look;
              P.pitch = Math.max(-1.5, Math.min(1.5, P.pitch - (t.clientY - touchLook.y) * look));
              touchLook.x = t.clientX; touchLook.y = t.clientY;
            }
          }
          e.preventDefault();
        };
        const onEnd = (e) => {
          for (const t of e.changedTouches) {
            if (touchMove && t.identifier === touchMove.id) touchMove = null;
            if (touchLook && t.identifier === touchLook.id) touchLook = null;
          }
        };
        on(canvas, "touchstart", onStart, { passive: false });
        on(canvas, "touchmove", onMove, { passive: false });
        on(canvas, "touchend", onEnd);
        on(canvas, "touchcancel", onEnd);

        const bar = document.createElement("div");
        bar.className = "ra-touch";
        bar.innerHTML = `<button data-t="ads">\u{1F50D}</button><button data-t="jump">\u2B06</button>
          <button data-t="reload">\u{1F504}</button><button data-t="swap">\u{1F52B}</button>
          <button data-t="fire" class="ra-fire">\u{1F525}</button>`;
        wrap.appendChild(bar);
        bar.querySelectorAll("button").forEach((b) => {
          const act = b.dataset.t;
          const down = (e) => {
            e.preventDefault();
            inputMode = "touch";
            if (act === "fire") { firing = true; tryShoot(); }
            if (act === "ads") { aiming = !aiming; b.classList.toggle("on", aiming); }
            if (act === "jump") keys.add("Space");
            if (act === "reload") startReload();
            if (act === "swap") switchWeapon((P.weapon + 1) % WEAPONS.length);
          };
          const up = () => { if (act === "fire") firing = false; if (act === "jump") keys.delete("Space"); };
          b.addEventListener("touchstart", down, { passive: false });
          b.addEventListener("touchend", up);
          b.addEventListener("mousedown", down);
          b.addEventListener("mouseup", up);
        });
      }
      // Only built on a device that actually has a touchscreen, so a desktop
      // player never gets a row of thumb buttons over their view.
      if (window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window) bindTouch();

      /* --------------------------------------------------- online / wireless
       * Built on the same relay server.js already runs for Kart Circuit and
       * Play Together, so there is no new backend: `host`/`join` give you a
       * 4-letter room code on your own network, and `matchmake` puts you in
       * with strangers regionally or globally.
       *
       * The model is deliberately simple — every client simulates its own
       * player and broadcasts its position; remote players are drawn but not
       * simulated, and hits are decided by whoever fired. Authoritative
       * simulation would mean a real game server, which this project does not
       * have and does not need for a casual arena.
       */
      let net = { socket: null, id: null, room: null, host: false, scope: null };
      const peers = new Map();   // id -> { name, x, y, z, yaw, hp, mesh, last }

      function serverWsBase() {
        try {
          const base = (localStorage.getItem("mimiServerOverride") || "").trim().replace(/\/+$/, "");
          if (base) return base.replace(/^http/, "ws");
        } catch (e) { /* fall through to the page's own origin */ }
        return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`;
      }

      function localRegion() {
        try { return (Intl.DateTimeFormat().resolvedOptions().timeZone || "").split("/")[0] || "Global"; }
        catch (e) { return "Global"; }
      }

      function playerName() {
        try {
          const ses = JSON.parse(localStorage.getItem("mimiActiveSession") || "null");
          return (ses && ses.name) || "Player";
        } catch (e) { return "Player"; }
      }

      function netConnect(onOpen) {
        netDisconnect();
        const socket = new WebSocket(`${serverWsBase()}/mp`);
        net.socket = socket;
        socket.addEventListener("open", () => onOpen(socket), { once: true });
        socket.addEventListener("message", (ev) => {
          let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
          netHandle(msg);
        });
        socket.addEventListener("close", () => {
          net.socket = null; net.room = null; net.id = null;
          peers.forEach((p) => scene.remove(p.mesh));
          peers.clear();
          setNetStatus("Disconnected.");
        });
        socket.addEventListener("error", () => setNetStatus("Couldn't reach the server."));
      }

      function netDisconnect() {
        if (net.socket) { try { net.socket.close(); } catch (e) { /* already gone */ } }
        net.socket = null; net.room = null; net.id = null; net.host = false; net.scope = null;
        peers.forEach((p) => scene.remove(p.mesh));
        peers.clear();
      }

      function netSend(obj) {
        if (net.socket && net.socket.readyState === WebSocket.OPEN) net.socket.send(JSON.stringify(obj));
      }

      function setNetStatus(text) {
        const elx = panel.querySelector("#raNetStatus");
        if (elx) elx.textContent = text;
      }

      function peerMesh(name) {
        const mat = new THREE.MeshLambertMaterial({ color: 0x4aa3ff });
        const mesh = new THREE.Mesh(botGeo, mat);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.4, 0.44), mat);
        head.position.y = 0.95;
        mesh.add(head);
        scene.add(mesh);
        return mesh;
      }

      function netHandle(msg) {
        if (msg.type === "joined") {
          net.id = msg.id; net.room = msg.room; net.host = Boolean(msg.isHost);
          (msg.players || []).forEach((pl) => {
            if (pl.id === net.id) return;
            peers.set(pl.id, { name: pl.name, x: 0, y: 1, z: 0, yaw: 0, hp: 100, mesh: peerMesh(pl.name) });
          });
          setNetStatus(net.scope
            ? `Searching \u2014 ${peers.size + 1} in the lobby.`
            : `Room ${net.room} \u2014 ${peers.size + 1} connected.${net.host ? " You're the host." : ""}`);
        } else if (msg.type === "joinError") {
          setNetStatus(msg.reason || "Couldn't join that room.");
          netDisconnect();
        } else if (msg.type === "playerJoined") {
          peers.set(msg.id, { name: msg.name, x: 0, y: 1, z: 0, yaw: 0, hp: 100, mesh: peerMesh(msg.name) });
          feed(`${msg.name} joined`);
          setNetStatus(`${net.scope ? "Searching" : `Room ${net.room}`} \u2014 ${peers.size + 1} connected.`);
        } else if (msg.type === "playerLeft") {
          const p = peers.get(msg.id);
          if (p) { scene.remove(p.mesh); peers.delete(msg.id); feed(`${p.name} left`); }
          setNetStatus(`${net.scope ? "Searching" : `Room ${net.room}`} \u2014 ${peers.size + 1} connected.`);
        } else if (msg.type === "state") {
          const p = peers.get(msg.id);
          if (p) { p.x = msg.x; p.y = msg.y; p.z = msg.z; p.yaw = msg.yaw; p.hp = msg.hp; }
        } else if (msg.type === "shot") {
          // Someone else's shot that landed on us. Damage is applied by the
          // shooter's client and simply reported, which is the trade this
          // makes for having no authoritative server.
          if (msg.target === net.id) hurtPlayer(msg.damage, msg.from || "A rival");
        } else if (msg.type === "matchStatus") {
          setNetStatus(`${msg.scope === "regional" ? `Regional \u00b7 ${msg.region}` : "Global"} \u2014 `
            + `${msg.players}/${msg.max} players${msg.startsIn ? ` \u00b7 starting in ${msg.startsIn}s` : ""}`);
        } else if (msg.type === "matchGo" || msg.type === "raceStart") {
          if (!running) startMatch();
        } else if (msg.type === "hostPromoted") {
          net.host = true;
          feed("You're the host now.");
        }
      }

      function netHost() {
        netConnect((sock) => {
          net.scope = null;
          sock.send(JSON.stringify({ type: "host", name: playerName(), color: "#4aa3ff" }));
        });
        setNetStatus("Creating a room\u2026");
      }
      function netJoin(code) {
        if (!code) { setNetStatus("Enter a room code."); return; }
        netConnect((sock) => {
          net.scope = null;
          sock.send(JSON.stringify({ type: "join", room: code.toUpperCase(), name: playerName(), color: "#4aa3ff" }));
        });
        setNetStatus(`Joining ${code.toUpperCase()}\u2026`);
      }
      function netMatchmake(scope) {
        netConnect((sock) => {
          net.scope = scope;
          sock.send(JSON.stringify({
            type: "matchmake", scope, region: localRegion(), name: playerName(), color: "#4aa3ff",
          }));
        });
        setNetStatus("Searching for players\u2026");
      }

      // Position broadcast, rate-limited: 15/s is plenty for bodies this size
      // and keeps the relay from carrying a frame's worth of traffic per client.
      let netClock = 0;
      function netTick(dt) {
        if (!net.room) return;
        netClock += dt;
        if (netClock < 1 / 15) return;
        netClock = 0;
        netSend({ type: "state", x: P.x, y: P.y, z: P.z, yaw: P.yaw, hp: P.hp });
      }

      function syncPeerMeshes() {
        peers.forEach((p) => {
          p.mesh.position.set(p.x, p.y - 0.75, p.z);
          p.mesh.rotation.y = p.yaw;
          p.mesh.visible = p.hp > 0;
        });
      }

      /* ---------------------------------------------------------------- loop */
      function resize() {
        const w = wrap.clientWidth || 960;
        const h = wrap.clientHeight || 540;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        gunCamera.aspect = w / h;
        gunCamera.updateProjectionMatrix();
      }
      on(window, "resize", resize);
      resize();

      let last = performance.now();
      let bob = 0;

      function frame(now) {
        raf = requestAnimationFrame(frame);
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        // This game reads the gamepad itself during a match (see readGamepad),
        // so the hub's pad cursor is suppressed while one is live and handed
        // back in the lobby and pause screen, where you need it to press
        // buttons with a controller. Set every frame rather than on transitions
        // so it can't get stuck on if a match ends down an unusual path.
        window.MimiPadCursor?.setSuppressed(running);
        if (!running) { renderer.render(scene, camera); return; }

        const padInput = readGamepad(dt);
        if (!running) return;   // pause() may have fired from the pad this frame
        aimAssist(dt);

        // Scoping in and out is eased rather than snapped: the FOV change, the
        // gun sliding to centre and the spread tightening all ride on this one
        // number so they can never disagree with each other.
        const wantAds = aiming && P.reloading <= 0 ? 1 : 0;
        P.ads += (wantAds - P.ads) * Math.min(1, dt * 11);
        const w0 = WEAPONS[P.weapon];
        const wantFov = HIP_FOV + (w0.adsFov - HIP_FOV) * P.ads;
        if (Math.abs(camera.fov - wantFov) > 0.05) {
          camera.fov = wantFov;
          camera.updateProjectionMatrix();
        }
        // A scoped sniper hides the viewmodel behind its scope overlay, the way
        // every shooter does — you're looking down the tube, not at the gun.
        const scoped = Boolean(w0.scope) && P.ads > 0.72;
        gunGroup.visible = !scoped;
        if (el.scope) el.scope.classList.toggle("on", scoped);
        hud.classList.toggle("ra-aiming", P.ads > 0.5);

        /* player movement */
        const sprint = keys.has("ShiftLeft") && !P.crouch && P.ads < 0.3;
        P.crouch = keys.has("ControlLeft") || keys.has("KeyC");
        const speed = (P.crouch ? 3 : sprint ? 9.5 : 6.4) * (1 - P.ads * 0.45) * dt;
        let fx = 0, fz = 0;
        if (keys.has("KeyW") || keys.has("ArrowUp")) fz += 1;
        if (keys.has("KeyS") || keys.has("ArrowDown")) fz -= 1;
        if (keys.has("KeyA") || keys.has("ArrowLeft")) fx -= 1;
        if (keys.has("KeyD") || keys.has("ArrowRight")) fx += 1;
        if (padInput) { fx += padInput.moveX; fz += padInput.moveZ; }
        if (touchMove) {
          // Virtual stick: how far the finger has travelled from where it
          // landed, capped so a long drag isn't faster than a short one.
          const dxs = (touchMove.x - touchMove.ox) / 60;
          const dys = (touchMove.y - touchMove.oy) / 60;
          fx += Math.max(-1, Math.min(1, dxs));
          fz += Math.max(-1, Math.min(1, -dys));
        }
        const len = Math.max(1, Math.hypot(fx, fz));
        const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
        const dx = ((fz / len) * -sin + (fx / len) * cos) * speed;
        const dz = ((fz / len) * -cos - (fx / len) * sin) * speed;

        const feetY = P.y - (P.crouch ? CROUCH_EYE : EYE);
        if (!hitsCollider(P.x + dx, feetY + 0.9, P.z, RADIUS)) P.x += dx;
        if (!hitsCollider(P.x, feetY + 0.9, P.z + dz, RADIUS)) P.z += dz;
        P.x = Math.max(-ARENA + 1, Math.min(ARENA - 1, P.x));
        P.z = Math.max(-ARENA + 1, Math.min(ARENA - 1, P.z));

        const ground = groundAt(P.x, P.z, feetY);
        if (keys.has("Space") && P.onGround) { P.vy = 6.2; P.onGround = false; }
        P.vy -= 20 * dt;
        let newFeet = feetY + P.vy * dt;
        if (newFeet <= ground) { newFeet = ground; P.vy = 0; P.onGround = true; }
        P.y = newFeet + (P.crouch ? CROUCH_EYE : EYE);

        if ((fx || fz) && P.onGround) bob += dt * (sprint ? 13 : 9);

        /* firing + reload */
        const w = WEAPONS[P.weapon];
        autoShootTick();
        if (firing && w.auto) tryShoot();
        else if (firing && !w.auto && inputMode !== "mouse") tryShoot(); // pad/touch hold-to-fire respects the weapon's own rate limit
        if (P.reloading > 0) {
          P.reloading -= dt;
          if (P.reloading <= 0) { P.reloading = 0; P.ammo[P.weapon] = w.mag; syncHud(); }
        }
        P.recoil *= Math.pow(0.02, dt);
        muzzle.intensity *= Math.pow(0.0005, dt);

        /* bots — a free-for-all, not everyone ganging up on the player.
         *
         * Each bot picks the nearest enemy it can actually see, which may be
         * another bot, and re-picks every couple of seconds or when its target
         * dies. That alone changes the feel completely: fights break out across
         * the map, you can round a corner onto two bots already shooting each
         * other, and being the only target stops being the whole game. */
        bots.forEach((bot) => {
          if (!bot.alive) {
            bot.respawn -= dt;
            if (bot.respawn <= 0) {
              const at = spawnPoint();
              bot.x = at.x; bot.z = at.z; bot.hp = 100; bot.alive = true; bot.mesh.visible = true;
              bot.retarget = 0;
            }
            return;
          }

          bot.retarget -= dt;
          const targetGone = bot.foe && bot.foe !== "player" && !bot.foe.alive;
          if (bot.retarget <= 0 || !bot.foe || targetGone) {
            bot.retarget = 2 + Math.random() * 2.5;
            const origin = new THREE.Vector3(bot.x, bot.y + 0.5, bot.z);
            let bestFoe = null;
            let bestScore = Infinity;
            const consider = (pos, ref) => {
              const d = Math.hypot(pos.x - bot.x, pos.z - bot.z);
              if (d < 0.5) return;
              const dir = new THREE.Vector3(pos.x - bot.x, pos.y - bot.y - 0.5, pos.z - bot.z).normalize();
              // Something it can see is worth chasing; something it can't is a
              // fallback so a bot never stands still with nothing to do.
              const visible = rayWorld(origin, dir, d) >= d - 0.8;
              const score = d + (visible ? 0 : 60);
              if (score < bestScore) { bestScore = score; bestFoe = ref; }
            };
            if (P.hp > 0) consider({ x: P.x, y: P.y - 0.4, z: P.z }, "player");
            bots.forEach((other) => {
              if (other === bot || !other.alive) return;
              consider({ x: other.x, y: other.y + 0.4, z: other.z }, other);
            });
            bot.foe = bestFoe;
          }

          const foe = bot.foe;
          if (!foe) return;
          const fx = foe === "player" ? P.x : foe.x;
          const fy = foe === "player" ? P.y - 0.4 : foe.y + 0.4;
          const fz = foe === "player" ? P.z : foe.z;

          const toX = fx - bot.x, toZ = fz - bot.z;
          const dist = Math.hypot(toX, toZ) || 1;
          const want = dist > 16 ? 1 : dist < 7 ? -0.6 : 0;
          const strafe = Math.sin(now / 900 + bot.x) * 0.7;
          const bs = 3.6 * dt;
          const nx = bot.x + ((toX / dist) * want + (-toZ / dist) * strafe) * bs;
          const nz = bot.z + ((toZ / dist) * want + (toX / dist) * strafe) * bs;
          if (!hitsCollider(nx, bot.y, nz, 0.5)) { bot.x = nx; bot.z = nz; }
          bot.y = groundAt(bot.x, bot.z, bot.y) + 0.85;
          bot.mesh.position.set(bot.x, bot.y, bot.z);
          bot.mesh.lookAt(fx, bot.y, fz);

          bot.cool -= dt;
          if (bot.cool <= 0) {
            bot.cool = 0.55 + Math.random() * 1.1;
            const origin = new THREE.Vector3(bot.x, bot.y + 0.5, bot.z);
            const dir = new THREE.Vector3(fx - bot.x, fy - bot.y - 0.5, fz - bot.z).normalize();
            // Only fire with a clear line, or bots snipe each other and you
            // through the middle of the map's biggest cover block.
            if (rayWorld(origin, dir, dist) >= dist - 0.6 && Math.random() < mode.botSkill) {
              addTracer(origin, new THREE.Vector3(fx, fy, fz), foe === "player" ? 0xff6b6b : 0xffb35a);
              const dmg = 6 + Math.random() * 9;
              if (foe === "player") {
                hurtPlayer(dmg, bot.name);
              } else {
                foe.hp -= dmg;
                if (foe.hp <= 0) botKilledBot(bot, foe);
              }
            }
          }
        });

        /* tracers fade */
        for (let i = tracers.length - 1; i >= 0; i -= 1) {
          tracers[i].life -= dt;
          if (tracers[i].life <= 0) {
            scene.remove(tracers[i].line);
            tracers[i].line.geometry.dispose();
            tracers[i].line.material.dispose();
            tracers.splice(i, 1);
          }
        }

        /* camera + viewmodel */
        camera.position.set(P.x, P.y + Math.sin(bob) * 0.045, P.z);
        camera.rotation.set(P.pitch, P.yaw, 0, "YXZ");
        gunGroup.position.set(
          0.22 + Math.sin(bob) * 0.012,
          -0.19 + Math.cos(bob * 2) * 0.009 - P.recoil * 0.35,
          -0.05 + P.recoil * 0.5,
        );
        gunGroup.rotation.set(P.recoil * 1.1, P.reloading > 0 ? Math.sin(now / 90) * 0.35 : 0, 0);

        netTick(dt);
        syncPeerMeshes();

        renderer.render(scene, camera);
        // The viewmodel is drawn in its own pass with the depth buffer cleared,
        // which is how every shooter stops the gun in your hands clipping into
        // a wall you're standing next to.
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(gunScene, gunCamera);
        renderer.autoClear = true;
      }

      showLobby();
      raf = requestAnimationFrame(frame);

      teardown.push(() => {
        cancelAnimationFrame(raf);
        netDisconnect();
        // Leaving mid-match must not strand the hub without its cursor.
        window.MimiPadCursor?.setSuppressed(false);
        if (document.pointerLockElement === canvas) document.exitPointerLock();
        tracers.forEach((t) => { t.line.geometry.dispose(); t.line.material.dispose(); });
        mapGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        botGeo.dispose();
        renderer.dispose();
      });
    }

    return () => {
      disposed = true;
      teardown.forEach((fn) => { try { fn(); } catch (e) { /* keep going */ } });
      if (gameView) gameView.classList.remove("wide-stage");
    };
  },
});
