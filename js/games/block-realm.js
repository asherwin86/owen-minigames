/* Block Realm — a voxel sandbox.
 *
 * A real chunked voxel engine rather than a blocky-looking 2D game: seeded
 * terrain, per-face meshing with ambient occlusion, AABB physics against the
 * voxel grid, DDA block picking, and worlds that survive a reload.
 *
 * Two deliberate choices worth knowing about:
 *
 * 1. Three.js is loaded ON DEMAND, not by index.html. The hub already parses
 *    ~1.5 MB of JavaScript on every page load, and this file's renderer needs a
 *    670 KB library that 84 other games have no use for. Loading it when the
 *    game opens keeps that cost on the people who actually play it. The copy is
 *    the one already vendored for Kart Circuit — a second one would be 670 KB
 *    of duplicate bytes in the repo and another thing to keep in step.
 *
 * 2. Every texture is drawn here at runtime into a canvas atlas. No image
 *    assets to ship, load, cache-bust or 404 — and it's what makes the Vibrant
 *    Vision toggle possible at all, since "vibrant" is a different palette
 *    baked into the same atlas rather than a post-processing filter.
 */
MimiGames.register({
  id: "block-realm",
  title: "Block Realm",
  emoji: "⛏️",
  category: "Action",
  tags: ["3D"],
  players: "1P",
  howTo:
    "A voxel sandbox. Create a world (pick a seed, a world type and a game mode), then click the view to look around with the mouse. WASD to walk, Space to jump, Shift to sneak. Left-click breaks a block, right-click places the one selected in your hotbar — 1-9 or the scroll wheel to choose it. In Creative you fly (double-tap Space, then Space up and Shift down) and have unlimited blocks; in Survival blocks take time to break, go into your hotbar as you mine them, and a long fall hurts. Esc opens the pause menu, where you can toggle Vibrant Vision — a richer palette, sunlight, sky and fog. Worlds and everything you build in them are saved.",

  init(root, ctx) {
    /* ---------------------------------------------------------------- setup */
    const gameView = document.getElementById("gameView");
    if (gameView) gameView.classList.add("wide-stage");

    const CHUNK = 16;          // blocks per chunk edge
    const HEIGHT = 48;         // world height in blocks
    const SEA_LEVEL = 20;
    const VIEW_CHUNKS = 3;     // render radius, in chunks
    const REACH = 6;           // how far you can break/place, in blocks

    // Block ids. 0 is air. `tiles` is [top, side, bottom] into the atlas.
    const AIR = 0;
    const BLOCKS = [
      null,
      { id: 1, name: "Grass", tiles: [0, 1, 2], hardness: 0.6 },
      { id: 2, name: "Dirt", tiles: [2, 2, 2], hardness: 0.5 },
      { id: 3, name: "Stone", tiles: [3, 3, 3], hardness: 1.5 },
      { id: 4, name: "Sand", tiles: [4, 4, 4], hardness: 0.5 },
      { id: 5, name: "Log", tiles: [6, 5, 6], hardness: 1.0 },
      { id: 6, name: "Leaves", tiles: [7, 7, 7], hardness: 0.3 },
      { id: 7, name: "Planks", tiles: [8, 8, 8], hardness: 1.0 },
      { id: 8, name: "Cobble", tiles: [9, 9, 9], hardness: 1.6 },
      { id: 9, name: "Brick", tiles: [10, 10, 10], hardness: 1.8 },
      { id: 10, name: "Glass", tiles: [11, 11, 11], hardness: 0.4, glassy: true },
      { id: 11, name: "Water", tiles: [12, 12, 12], hardness: Infinity, liquid: true },
      { id: 12, name: "Snow", tiles: [13, 13, 13], hardness: 0.4 },
      { id: 13, name: "Gravel", tiles: [14, 14, 14], hardness: 0.6 },
      { id: 14, name: "Bedrock", tiles: [15, 15, 15], hardness: Infinity },
    ];
    // Water you can swim through; glass and water don't hide the faces behind
    // them, so both need the see-through mesh rather than the solid one.
    const isSolid = (id) => id !== AIR && !BLOCKS[id].liquid;
    const isOpaque = (id) => id !== AIR && !BLOCKS[id].liquid && !BLOCKS[id].glassy;
    const HOTBAR = [1, 2, 3, 4, 5, 7, 8, 9, 10];

    const WORLD_TYPES = {
      normal: { label: "Normal", desc: "Rolling hills, lakes and trees" },
      flat: { label: "Superflat", desc: "One endless plain — good for building" },
      islands: { label: "Islands", desc: "Scattered land in a wide ocean" },
      amplified: { label: "Amplified", desc: "Absurd cliffs and deep valleys" },
    };
    const MODES = {
      survival: { label: "Survival", desc: "Blocks take time to mine, and falling hurts" },
      creative: { label: "Creative", desc: "Fly, unlimited blocks, instant mining" },
    };

    /* ------------------------------------------------------------- seeded RNG
     * mulberry32: tiny, fast, and — the reason it's here — deterministic, so a
     * seed always rebuilds exactly the same world. */
    function mulberry32(a) {
      return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    function hashSeed(text) {
      let h = 2166136261;
      for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    }

    /* Value noise with smoothstep interpolation, summed over octaves. Cheaper
     * than simplex and entirely good enough for terrain at this scale. */
    function makeNoise(seed) {
      const rand = mulberry32(seed);
      const perm = new Uint8Array(512);
      const base = new Uint8Array(256);
      for (let i = 0; i < 256; i += 1) base[i] = i;
      for (let i = 255; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1));
        const t = base[i]; base[i] = base[j]; base[j] = t;
      }
      for (let i = 0; i < 512; i += 1) perm[i] = base[i & 255];
      const at = (x, z) => perm[(perm[x & 255] + (z & 255)) & 255] / 255;
      const smooth = (t) => t * t * (3 - 2 * t);
      function noise2(x, z) {
        const xi = Math.floor(x), zi = Math.floor(z);
        const xf = smooth(x - xi), zf = smooth(z - zi);
        const a = at(xi, zi), b = at(xi + 1, zi), c = at(xi, zi + 1), d = at(xi + 1, zi + 1);
        return (a + (b - a) * xf) + ((c + (d - c) * xf) - (a + (b - a) * xf)) * zf;
      }
      return function fbm(x, z, octaves, scale) {
        let total = 0, amp = 1, freq = 1 / scale, norm = 0;
        for (let o = 0; o < octaves; o += 1) {
          total += noise2(x * freq, z * freq) * amp;
          norm += amp;
          amp *= 0.5;
          freq *= 2;
        }
        return total / norm;
      };
    }

    /* -------------------------------------------------------------- textures
     * Each block face is a 16x16 tile drawn into one 4x4 atlas. `vibrant`
     * pushes saturation and adds a stronger highlight — the same geometry with
     * a different atlas is most of what Vibrant Vision is. */
    function buildAtlas(vibrant) {
      const TILE = 16, COLS = 4;
      const canvas = document.createElement("canvas");
      canvas.width = TILE * COLS;
      canvas.height = TILE * COLS;
      const g = canvas.getContext("2d");
      const rand = mulberry32(1337);

      // [base, speckle] per tile, in HSL so "vibrant" is one multiplier.
      const P = (h, s, l) => [h, vibrant ? Math.min(100, s * 1.55) : s * 0.82, vibrant ? l : l * 0.92];
      const TILES = [
        [P(104, 42, 42), 7],   // 0 grass top
        [P(96, 26, 34), 6],    // 1 grass side
        [P(28, 32, 32), 7],    // 2 dirt
        [P(220, 5, 48), 6],    // 3 stone
        [P(46, 46, 72), 5],    // 4 sand
        [P(26, 34, 30), 9],    // 5 log side
        [P(34, 40, 46), 6],    // 6 log top
        [P(112, 44, 32), 11],  // 7 leaves
        [P(32, 46, 56), 6],    // 8 planks
        [P(220, 4, 40), 8],    // 9 cobble
        [P(12, 46, 42), 5],    // 10 brick
        [P(190, 45, 78), 3],   // 11 glass
        [P(210, 70, 46), 5],   // 12 water
        [P(200, 12, 92), 4],   // 13 snow
        [P(30, 10, 44), 8],    // 14 gravel
        [P(0, 0, 14), 4],      // 15 bedrock
      ];

      TILES.forEach(([[h, s, l], speckle], index) => {
        const ox = (index % COLS) * TILE;
        const oy = Math.floor(index / COLS) * TILE;
        g.fillStyle = `hsl(${h}, ${s}%, ${l}%)`;
        g.fillRect(ox, oy, TILE, TILE);
        // Per-pixel speckle is what stops a flat colour reading as plastic.
        for (let y = 0; y < TILE; y += 1) {
          for (let x = 0; x < TILE; x += 1) {
            const d = (rand() - 0.5) * speckle * 2;
            g.fillStyle = `hsl(${h}, ${s}%, ${Math.max(2, Math.min(96, l + d))}%)`;
            g.fillRect(ox + x, oy + y, 1, 1);
          }
        }
        if (index === 1) { // grass side: a lip of grass over dirt
          g.fillStyle = `hsl(28, ${TILES[2][0][1]}%, ${TILES[2][0][2]}%)`;
          g.fillRect(ox, oy + 5, TILE, TILE - 5);
          for (let x = 0; x < TILE; x += 1) {
            const drop = 3 + Math.floor(rand() * 3);
            g.fillStyle = `hsl(${TILES[0][0][0]}, ${TILES[0][0][1]}%, ${TILES[0][0][2]}%)`;
            g.fillRect(ox + x, oy, 1, drop + 2);
          }
        }
        if (index === 8) { // planks: horizontal boards
          g.fillStyle = "rgba(0,0,0,.28)";
          [0, 5, 10, 15].forEach((y) => g.fillRect(ox, oy + y, TILE, 1));
        }
        if (index === 10) { // brick: staggered courses
          g.fillStyle = "rgba(240,235,225,.5)";
          for (let y = 0; y < TILE; y += 4) {
            g.fillRect(ox, oy + y, TILE, 1);
            g.fillRect(ox + ((y / 4) % 2 ? 4 : 11), oy + y, 1, 4);
          }
        }
        if (index === 9) { // cobble: blobby stones
          for (let i = 0; i < 9; i += 1) {
            g.fillStyle = `rgba(0,0,0,${0.1 + rand() * 0.22})`;
            g.fillRect(ox + Math.floor(rand() * 12), oy + Math.floor(rand() * 12), 3 + Math.floor(rand() * 3), 3);
          }
        }
        if (index === 11) { // glass: a pane border and a highlight streak
          g.clearRect(ox + 1, oy + 1, TILE - 2, TILE - 2);
          g.fillStyle = "rgba(255,255,255,.5)";
          g.fillRect(ox, oy, TILE, 1); g.fillRect(ox, oy + TILE - 1, TILE, 1);
          g.fillRect(ox, oy, 1, TILE); g.fillRect(ox + TILE - 1, oy, 1, TILE);
          g.fillRect(ox + 3, oy + 3, 1, 6);
        }
      });
      return canvas;
    }

    /* ------------------------------------------------------------------- DOM */
    const wrap = document.createElement("div");
    wrap.className = "br-wrap";
    wrap.innerHTML = `
      <style>
        .br-wrap { position: relative; width: 100%; height: min(72vh, 680px); border-radius: 14px;
                   overflow: hidden; background: #0d1017; font-family: inherit; user-select: none; }
        .br-wrap canvas { display: block; width: 100%; height: 100%; }
        /* align-items:flex-start, not center: a centred flex child taller than
           its scrolling parent has its overflow clipped off the top and can't
           be scrolled to — which put the Create World button permanently out of
           reach on shorter windows. margin:auto on the child still centres it
           when it does fit. */
        .br-panel { position: absolute; inset: 0; display: flex; align-items: flex-start; justify-content: center;
                    background: linear-gradient(160deg, rgba(12,16,26,.94), rgba(8,10,18,.97));
                    overflow-y: auto; padding: 16px 0; z-index: 5; }
        .br-card { width: min(560px, 92%); padding: 20px 24px; margin: auto; }
        .br-card h3 { margin: 0 0 4px; font-size: 1.5rem; }
        .br-card p.br-sub { margin: 0 0 18px; color: var(--text-dim); font-size: .88rem; }
        .br-field { margin-bottom: 13px; }
        .br-field > label { display: block; font-size: .74rem; letter-spacing: .1em; text-transform: uppercase;
                            color: var(--text-dim); margin-bottom: 7px; font-weight: 700; }
        .br-field input { width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border);
                          background: rgba(255,255,255,.06); color: var(--text); font: inherit; }
        .br-seed-row { display: flex; gap: 8px; }
        .br-opts { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }
        .br-opt { text-align: left; padding: 11px 13px; border-radius: 12px; border: 2px solid var(--border);
                  background: rgba(255,255,255,.05); color: var(--text); cursor: pointer; font: inherit; }
        .br-opt strong { display: block; font-size: .96rem; }
        .br-opt span { font-size: .76rem; color: var(--text-dim); }
        .br-opt.is-on { border-color: var(--accent2); background: rgba(0,195,227,.14); }
        .br-toggle { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px;
                     border: 2px solid var(--border); background: rgba(255,255,255,.05); cursor: pointer; }
        .br-toggle.is-on { border-color: #ffd166; background: rgba(255,209,102,.14); }
        .br-toggle .br-sw { width: 40px; height: 22px; border-radius: 999px; background: rgba(255,255,255,.18);
                            position: relative; flex: 0 0 auto; transition: background .15s; }
        .br-toggle .br-sw::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px;
                                   border-radius: 50%; background: #fff; transition: transform .15s; }
        .br-toggle.is-on .br-sw { background: #ffd166; }
        .br-toggle.is-on .br-sw::after { transform: translateX(18px); }
        .br-actions { display: flex; gap: 10px; margin-top: 18px; flex-wrap: wrap; }
        .br-worlds { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; max-height: 150px; overflow: auto; }
        .br-world { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 10px;
                    border: 1px solid var(--border); background: rgba(255,255,255,.04); cursor: pointer; color: var(--text); font: inherit; text-align: left; }
        .br-world strong { flex: 1; font-size: .9rem; }
        .br-world small { color: var(--text-dim); font-size: .74rem; }
        .br-del { border: none; background: none; color: var(--text-dim); cursor: pointer; padding: 2px 6px; border-radius: 6px; }
        .br-del:hover { color: #ff6b6b; background: rgba(255,107,107,.12); }
        .br-hud { position: absolute; inset: 0; pointer-events: none; z-index: 3; }
        .br-hotbar { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); display: flex; gap: 4px; }
        .br-slot { width: 46px; height: 46px; border-radius: 8px; border: 2px solid rgba(255,255,255,.25);
                   background: rgba(10,14,22,.6); display: grid; place-items: center; position: relative; }
        .br-slot.is-on { border-color: #fff; background: rgba(255,255,255,.18); }
        .br-slot i { width: 26px; height: 26px; border-radius: 4px; display: block; }
        .br-slot b { position: absolute; right: 3px; bottom: 1px; font-size: .66rem; font-weight: 700;
                     text-shadow: 0 1px 2px #000; }
        .br-stat { position: absolute; left: 12px; top: 10px; font-size: .78rem; line-height: 1.5;
                   color: #dfe7f5; text-shadow: 0 1px 3px rgba(0,0,0,.85); }
        .br-hearts { position: absolute; left: 50%; bottom: 66px; transform: translateX(-50%); font-size: .95rem;
                     letter-spacing: 1px; text-shadow: 0 1px 3px #000; }
        .br-cross { position: absolute; left: 50%; top: 50%; width: 18px; height: 18px; margin: -9px 0 0 -9px;
                    opacity: .8; }
        .br-cross::before, .br-cross::after { content: ""; position: absolute; background: #fff; }
        .br-cross::before { left: 8px; top: 0; width: 2px; height: 18px; }
        .br-cross::after { top: 8px; left: 0; height: 2px; width: 18px; }
        .br-hint { position: absolute; left: 50%; top: 58%; transform: translateX(-50%); padding: 9px 16px;
                   border-radius: 999px; background: rgba(8,10,18,.78); font-size: .84rem; }
        .br-hint.is-off { display: none; }
        .br-load { position: absolute; inset: 0; display: grid; place-items: center; color: var(--text-dim);
                   font-size: .9rem; z-index: 6; }
      </style>
      <div class="br-load" id="brLoad">Loading the world builder…</div>
    `;
    root.appendChild(wrap);

    /* -------------------------------------------------- lazy-load the library */
    const THREE_SRC = "games/mario-kart/three.min.js?v=20260815a-vendor";
    function loadThree() {
      if (window.THREE) return Promise.resolve(window.THREE);
      // A second copy of this tag elsewhere on the page would re-parse 670 KB,
      // so an in-flight load is shared rather than started again.
      if (!window.__brThreeLoading) {
        window.__brThreeLoading = new Promise((resolve, reject) => {
          const tag = document.createElement("script");
          tag.src = THREE_SRC;
          tag.onload = () => resolve(window.THREE);
          tag.onerror = () => reject(new Error("could not load the 3D library"));
          document.head.appendChild(tag);
        });
      }
      return window.__brThreeLoading;
    }

    /* --------------------------------------------------------------- lifecycle */
    let disposed = false;
    const teardown = [];
    function on(target, type, fn, opts) {
      target.addEventListener(type, fn, opts);
      teardown.push(() => target.removeEventListener(type, fn, opts));
    }

    loadThree().then((THREE) => {
      if (disposed) return;
      wrap.querySelector("#brLoad").remove();
      start(THREE);
    }).catch((err) => {
      const load = wrap.querySelector("#brLoad");
      if (load) load.textContent = `Couldn't load the 3D library — ${err.message}.`;
    });

    /* ============================================================= the game */
    function start(THREE) {
      const SAVE_KEY = "worlds";
      const loadWorlds = () => {
        const saved = ctx.storage.get(SAVE_KEY);
        return Array.isArray(saved) ? saved : [];
      };
      const saveWorlds = (list) => ctx.storage.set(SAVE_KEY, list.slice(0, 12));

      let world = null;      // the active world record
      let running = false;
      let raf = 0;

      /* ------------------------------------------------------- world creation */
      const panel = document.createElement("div");
      panel.className = "br-panel";
      wrap.appendChild(panel);

      function optionGrid(options, current, onPick) {
        const grid = document.createElement("div");
        grid.className = "br-opts";
        Object.entries(options).forEach(([key, meta]) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "br-opt" + (key === current ? " is-on" : "");
          b.innerHTML = `<strong></strong><span></span>`;
          b.querySelector("strong").textContent = meta.label;
          b.querySelector("span").textContent = meta.desc;
          b.onclick = () => {
            current = key;
            grid.querySelectorAll(".br-opt").forEach((el) => el.classList.remove("is-on"));
            b.classList.add("is-on");
            onPick(key);
          };
          grid.appendChild(b);
        });
        return grid;
      }

      function showMenu() {
        running = false;
        exitPointerLock();
        panel.style.display = "flex";
        panel.innerHTML = "";
        const card = document.createElement("div");
        card.className = "br-card";
        panel.appendChild(card);

        const worlds = loadWorlds();
        let draft = {
          name: `World ${worlds.length + 1}`,
          seed: String(Math.floor(Math.random() * 1e9)),
          type: "normal",
          mode: "survival",
          vibrant: true,
        };

        const head = document.createElement("div");
        head.innerHTML = `<h3>⛏️ Block Realm</h3><p class="br-sub">Build a world, then break it apart.</p>`;
        card.appendChild(head);

        if (worlds.length) {
          const label = document.createElement("label");
          label.textContent = "Your worlds";
          label.style.cssText = "display:block;font-size:.74rem;letter-spacing:.1em;text-transform:uppercase;color:var(--text-dim);margin-bottom:7px;font-weight:700";
          card.appendChild(label);
          const list = document.createElement("div");
          list.className = "br-worlds";
          worlds.forEach((w, i) => {
            const row = document.createElement("button");
            row.type = "button";
            row.className = "br-world";
            row.innerHTML = `<strong></strong><small></small><span class="br-del" title="Delete">✕</span>`;
            row.querySelector("strong").textContent = w.name;
            row.querySelector("small").textContent =
              `${WORLD_TYPES[w.type]?.label || w.type} · ${MODES[w.mode]?.label || w.mode}`;
            row.onclick = (e) => {
              if (e.target.classList.contains("br-del")) {
                e.stopPropagation();
                const next = loadWorlds();
                next.splice(i, 1);
                saveWorlds(next);
                showMenu();
                return;
              }
              enterWorld(w);
            };
            list.appendChild(row);
          });
          card.appendChild(list);
        }

        const nameField = document.createElement("div");
        nameField.className = "br-field";
        nameField.innerHTML = `<label>World name</label><input type="text" maxlength="24" />`;
        const nameInput = nameField.querySelector("input");
        nameInput.value = draft.name;
        nameInput.oninput = () => { draft.name = nameInput.value.trim() || "World"; };
        card.appendChild(nameField);

        const seedField = document.createElement("div");
        seedField.className = "br-field";
        seedField.innerHTML = `<label>Seed</label><div class="br-seed-row"><input type="text" maxlength="24" /><button type="button" class="btn">🎲</button></div>`;
        const seedInput = seedField.querySelector("input");
        seedInput.value = draft.seed;
        seedInput.oninput = () => { draft.seed = seedInput.value; };
        seedField.querySelector("button").onclick = () => {
          draft.seed = String(Math.floor(Math.random() * 1e9));
          seedInput.value = draft.seed;
        };
        card.appendChild(seedField);

        const typeField = document.createElement("div");
        typeField.className = "br-field";
        typeField.innerHTML = `<label>World type</label>`;
        typeField.appendChild(optionGrid(WORLD_TYPES, draft.type, (k) => { draft.type = k; }));
        card.appendChild(typeField);

        const modeField = document.createElement("div");
        modeField.className = "br-field";
        modeField.innerHTML = `<label>Game mode</label>`;
        modeField.appendChild(optionGrid(MODES, draft.mode, (k) => { draft.mode = k; }));
        card.appendChild(modeField);

        const vibField = document.createElement("div");
        vibField.className = "br-field";
        vibField.innerHTML = `<label>Graphics</label>`;
        const vib = document.createElement("div");
        vib.className = "br-toggle is-on";
        vib.innerHTML = `<span class="br-sw"></span><span><strong>Vibrant Vision</strong><br><span style="font-size:.76rem;color:var(--text-dim)">Saturated palette, sunlight, sky and distance fog</span></span>`;
        vib.onclick = () => {
          draft.vibrant = !draft.vibrant;
          vib.classList.toggle("is-on", draft.vibrant);
        };
        vibField.appendChild(vib);
        card.appendChild(vibField);

        const actions = document.createElement("div");
        actions.className = "br-actions";
        const create = document.createElement("button");
        create.type = "button";
        create.className = "btn primary";
        create.textContent = "Create World";
        create.onclick = () => {
          const record = { ...draft, id: `w${Date.now()}`, edits: {} };
          const list = loadWorlds();
          list.unshift(record);
          saveWorlds(list);
          enterWorld(record);
        };
        actions.appendChild(create);
        card.appendChild(actions);
      }

      /* --------------------------------------------------------- renderer/HUD */
      const canvas = document.createElement("canvas");
      wrap.insertBefore(canvas, panel);
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 260);
      const chunkRoot = new THREE.Group();
      scene.add(chunkRoot);

      const hud = document.createElement("div");
      hud.className = "br-hud";
      hud.innerHTML = `<div class="br-cross"></div><div class="br-stat"></div>
        <div class="br-hearts"></div><div class="br-hotbar"></div>
        <div class="br-hint">Click to look around</div>`;
      wrap.insertBefore(hud, panel);
      const statEl = hud.querySelector(".br-stat");
      const heartsEl = hud.querySelector(".br-hearts");
      const hotbarEl = hud.querySelector(".br-hotbar");
      const hintEl = hud.querySelector(".br-hint");

      const highlight = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
        new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 }),
      );
      highlight.visible = false;
      scene.add(highlight);

      let atlasTexture = null;
      let solidMaterial = null;
      let glassMaterial = null;
      let sun = null;
      let hemi = null;
      let ambient = null;
      let sky = null;

      function buildMaterials(vibrant) {
        if (atlasTexture) atlasTexture.dispose();
        atlasTexture = new THREE.CanvasTexture(buildAtlas(vibrant));
        // Nearest filtering is the whole blocky look; without it the atlas
        // turns to mush and neighbouring tiles bleed into each other.
        atlasTexture.magFilter = THREE.NearestFilter;
        atlasTexture.minFilter = THREE.NearestFilter;
        atlasTexture.generateMipmaps = false;
        if (THREE.SRGBColorSpace) atlasTexture.colorSpace = THREE.SRGBColorSpace;

        if (solidMaterial) solidMaterial.dispose();
        if (glassMaterial) glassMaterial.dispose();
        // vertexColors carries the baked ambient occlusion computed while meshing.
        solidMaterial = new THREE.MeshLambertMaterial({ map: atlasTexture, vertexColors: true });
        glassMaterial = new THREE.MeshLambertMaterial({
          map: atlasTexture, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false,
        });
      }

      function buildLighting(vibrant) {
        [sun, hemi, ambient, sky].forEach((o) => { if (o) scene.remove(o); });
        if (vibrant) {
          // Sun + sky bounce + a gradient dome, and fog tinted to match the
          // horizon so distance dissolves into the sky rather than into grey.
          sun = new THREE.DirectionalLight(0xfff2d0, 1.45);
          sun.position.set(60, 100, 30);
          hemi = new THREE.HemisphereLight(0x9fd8ff, 0x4a6b3a, 0.85);
          ambient = new THREE.AmbientLight(0xffffff, 0.28);
          scene.fog = new THREE.Fog(0x8fc9f0, VIEW_CHUNKS * CHUNK * 0.55, VIEW_CHUNKS * CHUNK * 1.5);
          renderer.setClearColor(0x8fc9f0, 1);
          const skyGeo = new THREE.SphereGeometry(220, 18, 12);
          const skyMat = new THREE.ShaderMaterial({
            side: THREE.BackSide, depthWrite: false, fog: false,
            uniforms: { top: { value: new THREE.Color(0x2f7fd6) }, bottom: { value: new THREE.Color(0xbfe6ff) } },
            vertexShader: "varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
            fragmentShader: "varying float h; uniform vec3 top; uniform vec3 bottom; void main(){ gl_FragColor = vec4(mix(bottom, top, clamp(h*1.4+0.15,0.0,1.0)), 1.0); }",
          });
          sky = new THREE.Mesh(skyGeo, skyMat);
        } else {
          sun = new THREE.DirectionalLight(0xffffff, 0.75);
          sun.position.set(50, 90, 25);
          hemi = new THREE.HemisphereLight(0xbfc6d2, 0x555a5e, 0.5);
          ambient = new THREE.AmbientLight(0xffffff, 0.5);
          scene.fog = new THREE.Fog(0x9aa4b2, VIEW_CHUNKS * CHUNK * 0.6, VIEW_CHUNKS * CHUNK * 1.4);
          renderer.setClearColor(0x9aa4b2, 1);
          sky = null;
        }
        [sun, hemi, ambient, sky].forEach((o) => { if (o) scene.add(o); });
        if (renderer.toneMapping !== undefined) {
          renderer.toneMapping = vibrant && THREE.ACESFilmicToneMapping ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
          renderer.toneMappingExposure = vibrant ? 1.15 : 1;
        }
      }

      /* ------------------------------------------------------------ the world */
      const chunks = new Map();          // "cx,cz" -> { blocks, meshes, built }
      let noise = null;
      let contNoise = null;
      let edits = {};                     // "x,y,z" -> block id, the player's changes

      const chunkKey = (cx, cz) => `${cx},${cz}`;
      const idx = (x, y, z) => (y * CHUNK + z) * CHUNK + x;

      function terrainHeight(x, z) {
        if (world.type === "flat") return SEA_LEVEL;
        if (world.type === "amplified") {
          return Math.round(10 + noise(x, z, 5, 46) * 34);
        }
        let h = Math.round(SEA_LEVEL - 4 + noise(x, z, 4, 60) * 16);
        if (world.type === "islands") {
          // A second, much larger-scale noise decides land from ocean, so the
          // islands are genuinely separated rather than just bumpier terrain.
          const mask = contNoise(x, z, 2, 220);
          h = Math.round(SEA_LEVEL - 9 + (h - (SEA_LEVEL - 9)) * Math.max(0, (mask - 0.42) * 3.2));
        }
        return Math.max(1, Math.min(HEIGHT - 6, h));
      }

      // Deterministic per-column hash, so trees land in the same place every
      // time a chunk is rebuilt without storing anything.
      function treeAt(x, z) {
        const h = hashSeed(`${world.seed}:t:${x}:${z}`);
        return (h % 101) < 2;
      }

      function generateChunk(cx, cz) {
        const blocks = new Uint8Array(CHUNK * CHUNK * HEIGHT);
        for (let x = 0; x < CHUNK; x += 1) {
          for (let z = 0; z < CHUNK; z += 1) {
            const wx = cx * CHUNK + x;
            const wz = cz * CHUNK + z;
            const h = terrainHeight(wx, wz);
            const beach = h <= SEA_LEVEL + 1;
            for (let y = 0; y <= h; y += 1) {
              let id;
              if (y === 0) id = 14;                       // bedrock floor
              else if (y === h) id = beach ? 4 : (h > SEA_LEVEL + 12 ? 12 : 1);
              else if (y > h - 4) id = beach ? 4 : 2;
              else id = 3;
              blocks[idx(x, y, z)] = id;
            }
            for (let y = h + 1; y <= SEA_LEVEL; y += 1) blocks[idx(x, y, z)] = 11; // water
            // Trees, only on grass that's clear of the water line.
            if (world.type !== "flat" && !beach && h > SEA_LEVEL && h < HEIGHT - 10 && treeAt(wx, wz)) {
              const trunk = 4 + (hashSeed(`${wx}:${wz}`) % 3);
              for (let t = 1; t <= trunk; t += 1) blocks[idx(x, h + t, z)] = 5;
              for (let ly = -2; ly <= 1; ly += 1) {
                const r = ly >= 0 ? 1 : 2;
                for (let lx = -r; lx <= r; lx += 1) {
                  for (let lz = -r; lz <= r; lz += 1) {
                    if (Math.abs(lx) === r && Math.abs(lz) === r) continue;
                    const px = x + lx, pz = z + lz, py = h + trunk + ly;
                    if (px < 0 || pz < 0 || px >= CHUNK || pz >= CHUNK || py >= HEIGHT) continue;
                    if (blocks[idx(px, py, pz)] === AIR) blocks[idx(px, py, pz)] = 6;
                  }
                }
              }
            }
          }
        }
        return blocks;
      }

      function getChunk(cx, cz) {
        const key = chunkKey(cx, cz);
        let chunk = chunks.get(key);
        if (!chunk) {
          chunk = { cx, cz, blocks: generateChunk(cx, cz), meshes: null, dirty: true, top: 0 };
          // Replay the player's edits over freshly generated terrain — this is
          // what makes builds survive walking away and coming back, and a reload.
          Object.keys(edits).forEach((k) => {
            const [ex, ey, ez] = k.split(",").map(Number);
            if (Math.floor(ex / CHUNK) === cx && Math.floor(ez / CHUNK) === cz) {
              const lx = ex - cx * CHUNK, lz = ez - cz * CHUNK;
              if (ey >= 0 && ey < HEIGHT) chunk.blocks[idx(lx, ey, lz)] = edits[k];
            }
          });
          // The tallest block in the chunk, so meshing can stop there instead of
          // walking 20-odd levels of empty sky in every one of 256 columns.
          let top = 0;
          for (let i = chunk.blocks.length - 1; i >= 0; i -= 1) {
            if (chunk.blocks[i] !== AIR) { top = Math.floor(i / (CHUNK * CHUNK)); break; }
          }
          chunk.top = Math.min(HEIGHT - 1, top + 1);
          chunks.set(key, chunk);
        }
        return chunk;
      }

      function getBlock(x, y, z) {
        if (y < 0 || y >= HEIGHT) return AIR;
        const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
        const key = chunkKey(cx, cz);
        const chunk = chunks.get(key);
        if (!chunk) return AIR; // ungenerated: treated as open, so edges still mesh
        return chunk.blocks[idx(x - cx * CHUNK, y, z - cz * CHUNK)];
      }

      function setBlock(x, y, z, id) {
        if (y < 1 || y >= HEIGHT) return;
        const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
        const chunk = getChunk(cx, cz);
        chunk.blocks[idx(x - cx * CHUNK, y, z - cz * CHUNK)] = id;
        if (id !== AIR && y >= chunk.top) chunk.top = Math.min(HEIGHT - 1, y + 1);
        chunk.dirty = true;
        edits[`${x},${y},${z}`] = id;
        // A block on a chunk seam changes what its neighbour should draw.
        const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
        if (lx === 0) markDirty(cx - 1, cz);
        if (lx === CHUNK - 1) markDirty(cx + 1, cz);
        if (lz === 0) markDirty(cx, cz - 1);
        if (lz === CHUNK - 1) markDirty(cx, cz + 1);
      }
      function markDirty(cx, cz) {
        const chunk = chunks.get(chunkKey(cx, cz));
        if (chunk) chunk.dirty = true;
      }

      /* ------------------------------------------------------------- meshing */
      // Corner order is counter-clockwise seen from outside the block, so the
      // default winding faces the right way and back-face culling works.
      const FACES = [
        { dir: [0, 1, 0], tile: 0, corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
        { dir: [0, -1, 0], tile: 2, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
        { dir: [0, 0, 1], tile: 1, corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
        { dir: [0, 0, -1], tile: 1, corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
        { dir: [1, 0, 0], tile: 1, corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
        { dir: [-1, 0, 0], tile: 1, corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
      ];
      const UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
      const AO_LEVELS = [0.5, 0.7, 0.86, 1];
      const ATLAS_COLS = 4;

      function buildChunkMesh(chunk) {
        if (chunk.meshes) {
          chunk.meshes.forEach((m) => { chunkRoot.remove(m); m.geometry.dispose(); });
        }
        /* Meshing asks for a neighbouring block roughly 300,000 times per chunk
         * (six faces per block, plus three more per vertex for ambient
         * occlusion). Going through getBlock() for each one built a `${cx},${cz}`
         * string and hit a Map every single time, which was slow enough that
         * generating the world outran the frame budget by an order of magnitude.
         * Gathering the 3x3 block arrays around this chunk once, up front, turns
         * every one of those lookups into integer maths on a typed array. */
        const around = [];
        for (let dz = -1; dz <= 1; dz += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const n = chunks.get(chunkKey(chunk.cx + dx, chunk.cz + dz));
            around[(dz + 1) * 3 + (dx + 1)] = n ? n.blocks : null;
          }
        }
        // lx/lz may be -1..CHUNK; anything further out isn't reachable from a
        // face or an AO corner of a block inside this chunk.
        const near = (lx, y, lz) => {
          if (y < 0 || y >= HEIGHT) return AIR;
          const dx = lx < 0 ? -1 : lx >= CHUNK ? 1 : 0;
          const dz = lz < 0 ? -1 : lz >= CHUNK ? 1 : 0;
          const blocks = around[(dz + 1) * 3 + (dx + 1)];
          if (!blocks) return AIR;
          return blocks[(y * CHUNK + (lz - dz * CHUNK)) * CHUNK + (lx - dx * CHUNK)];
        };
        const buffers = {
          solid: { pos: [], uv: [], col: [], idx: [] },
          glass: { pos: [], uv: [], col: [], idx: [] },
        };
        const ox = chunk.cx * CHUNK;
        const oz = chunk.cz * CHUNK;

        const topY = Math.max(chunk.top, SEA_LEVEL);
        for (let x = 0; x < CHUNK; x += 1) {
          for (let z = 0; z < CHUNK; z += 1) {
            for (let y = 0; y <= topY; y += 1) {
              const id = chunk.blocks[idx(x, y, z)];
              if (id === AIR) continue;
              const def = BLOCKS[id];
              const seeThrough = def.glassy || def.liquid;
              const target = seeThrough ? buffers.glass : buffers.solid;
              const wx = ox + x, wz = oz + z;

              FACES.forEach((face) => {
                const lx = x + face.dir[0], ny = y + face.dir[1], lz = z + face.dir[2];
                const neighbour = near(lx, ny, lz);
                // Solid blocks hide behind anything opaque; see-through blocks
                // additionally hide behind *their own kind*, so a lake isn't a
                // grid of internal faces.
                if (seeThrough ? (neighbour === id || isOpaque(neighbour)) : isOpaque(neighbour)) return;

                const tile = def.tiles[face.tile];
                const tu = (tile % ATLAS_COLS) / ATLAS_COLS;
                const tv = 1 - (Math.floor(tile / ATLAS_COLS) + 1) / ATLAS_COLS;
                const start = target.pos.length / 3;
                const inPlane = [0, 1, 2].filter((a) => face.dir[a] === 0);

                face.corners.forEach((corner, ci) => {
                  target.pos.push(wx + corner[0], y + corner[1], wz + corner[2]);
                  target.uv.push(tu + UV[ci][0] / ATLAS_COLS, tv + UV[ci][1] / ATLAS_COLS);

                  // Ambient occlusion: darken a vertex by how many of the three
                  // blocks touching it, on the outside of this face, are solid.
                  // It costs nothing at runtime (baked into vertex colours) and
                  // does more for the look than any light in the scene.
                  let shade = 1;
                  if (!seeThrough) {
                    const t1 = [0, 0, 0]; t1[inPlane[0]] = corner[inPlane[0]] ? 1 : -1;
                    const t2 = [0, 0, 0]; t2[inPlane[1]] = corner[inPlane[1]] ? 1 : -1;
                    const s1 = isSolid(near(lx + t1[0], ny + t1[1], lz + t1[2])) ? 1 : 0;
                    const s2 = isSolid(near(lx + t2[0], ny + t2[1], lz + t2[2])) ? 1 : 0;
                    const cn = isSolid(near(lx + t1[0] + t2[0], ny + t1[1] + t2[1], lz + t1[2] + t2[2])) ? 1 : 0;
                    shade = AO_LEVELS[(s1 && s2) ? 0 : 3 - (s1 + s2 + cn)];
                  }
                  // A flat directional tint on top of AO, so the six sides of a
                  // cube read apart even under perfectly even lighting.
                  const facing = face.dir[1] === 1 ? 1 : face.dir[1] === -1 ? 0.62 : (face.dir[0] !== 0 ? 0.8 : 0.88);
                  const v = shade * facing;
                  target.col.push(v, v, v);
                });
                target.idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
              });
            }
          }
        }

        chunk.meshes = [];
        [["solid", solidMaterial], ["glass", glassMaterial]].forEach(([name, material]) => {
          const b = buffers[name];
          if (!b.idx.length) return;
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
          geo.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
          geo.setAttribute("color", new THREE.Float32BufferAttribute(b.col, 3));
          geo.setIndex(b.idx);
          geo.computeVertexNormals();
          const mesh = new THREE.Mesh(geo, material);
          mesh.renderOrder = name === "glass" ? 1 : 0;
          chunkRoot.add(mesh);
          chunk.meshes.push(mesh);
        });
        chunk.dirty = false;
      }

      function rebuildAll() {
        chunks.forEach((chunk) => { chunk.dirty = true; });
      }

      /* -------------------------------------------------------------- player */
      const player = {
        x: 8, y: 40, z: 8, vx: 0, vy: 0, vz: 0,
        yaw: 0, pitch: 0, onGround: false, flying: false, health: 10, fallStart: null,
      };
      const WIDTH = 0.6, TALL = 1.8, EYE = 1.62;
      let slot = 0;
      const counts = new Array(HOTBAR.length).fill(0);
      let breaking = null;   // { x, y, z, progress }

      function blockAABB(x, y, z) {
        return isSolid(getBlock(Math.floor(x), Math.floor(y), Math.floor(z)));
      }
      function collides(px, py, pz) {
        const r = WIDTH / 2;
        for (let x = Math.floor(px - r); x <= Math.floor(px + r); x += 1) {
          for (let z = Math.floor(pz - r); z <= Math.floor(pz + r); z += 1) {
            for (let y = Math.floor(py); y <= Math.floor(py + TALL - 0.01); y += 1) {
              if (isSolid(getBlock(x, y, z))) return true;
            }
          }
        }
        return false;
      }
      // Resolved one axis at a time — trying to resolve all three together is
      // what makes a player stick on flat walls or climb them.
      function moveAxis(axis, amount) {
        if (!amount) return;
        const next = { x: player.x, y: player.y, z: player.z };
        next[axis] += amount;
        if (!collides(next.x, next.y, next.z)) {
          player[axis] = next[axis];
        } else {
          if (axis === "y") {
            if (amount < 0) {
              player.onGround = true;
              if (player.fallStart !== null && world.mode === "survival") {
                const drop = player.fallStart - player.y;
                if (drop > 4) damage(Math.floor(drop - 3));
                player.fallStart = null;
              }
            }
            player.vy = 0;
          }
        }
      }

      function damage(amount) {
        player.health = Math.max(0, player.health - amount);
        ctx.vibrate?.(40);
        if (player.health <= 0) respawn();
      }
      function respawn() {
        player.health = 10;
        player.vx = player.vy = player.vz = 0;
        placeAtSurface();
        ctx.setStatus("You blacked out and woke up at the surface.");
      }
      function placeAtSurface() {
        const h = terrainHeight(Math.floor(player.x), Math.floor(player.z));
        player.y = Math.max(h + 2, SEA_LEVEL + 2);
        player.fallStart = null;
      }

      /* ------------------------------------------------------------- picking
       * Amanatides & Woo voxel traversal: step to the next grid plane each
       * iteration, so every block along the ray is visited exactly once and
       * nothing is missed at a glancing angle the way fixed-step sampling does. */
      function pick() {
        const dir = new THREE.Vector3(
          -Math.sin(player.yaw) * Math.cos(player.pitch),
          Math.sin(player.pitch),
          -Math.cos(player.yaw) * Math.cos(player.pitch),
        );
        let x = Math.floor(player.x), y = Math.floor(player.y + EYE), z = Math.floor(player.z);
        const step = [Math.sign(dir.x), Math.sign(dir.y), Math.sign(dir.z)];
        const origin = [player.x, player.y + EYE, player.z];
        const cell = [x, y, z];
        const d = [dir.x, dir.y, dir.z];
        const tMax = [0, 0, 0], tDelta = [0, 0, 0];
        for (let a = 0; a < 3; a += 1) {
          if (d[a] === 0) { tMax[a] = Infinity; tDelta[a] = Infinity; continue; }
          const bound = cell[a] + (step[a] > 0 ? 1 : 0);
          tMax[a] = (bound - origin[a]) / d[a];
          tDelta[a] = Math.abs(1 / d[a]);
        }
        let prev = null;
        for (let i = 0; i < REACH * 4; i += 1) {
          const id = getBlock(cell[0], cell[1], cell[2]);
          if (id !== AIR && !BLOCKS[id].liquid) {
            return { x: cell[0], y: cell[1], z: cell[2], prev };
          }
          prev = [cell[0], cell[1], cell[2]];
          const axis = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
          if (tMax[axis] > REACH) break;
          cell[axis] += step[axis];
          tMax[axis] += tDelta[axis];
        }
        return null;
      }

      /* ---------------------------------------------------------------- input */
      const keys = new Set();
      let lastSpace = 0;

      on(window, "keydown", (e) => {
        if (!running) return;
        if (e.code === "Escape") { showPause(); return; }
        if (/^Digit[1-9]$/.test(e.code)) { slot = Number(e.code.slice(5)) - 1; renderHotbar(); return; }
        if (e.code === "Space") {
          const now = performance.now();
          if (world.mode === "creative" && now - lastSpace < 320) {
            player.flying = !player.flying;
            player.vy = 0;
            ctx.setStatus(player.flying ? "Flying." : "Walking.");
          }
          lastSpace = now;
        }
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
        keys.add(e.code);
      });
      on(window, "keyup", (e) => keys.delete(e.code));

      on(canvas, "mousedown", (e) => {
        if (!running) return;
        if (document.pointerLockElement !== canvas) { canvas.requestPointerLock(); return; }
        if (e.button === 2) placeBlock();
        else if (e.button === 0) breaking = { started: performance.now(), progress: 0 };
      });
      on(window, "mouseup", () => { breaking = null; });
      on(canvas, "contextmenu", (e) => e.preventDefault());
      on(canvas, "wheel", (e) => {
        if (!running) return;
        e.preventDefault();
        slot = (slot + (e.deltaY > 0 ? 1 : -1) + HOTBAR.length) % HOTBAR.length;
        renderHotbar();
      }, { passive: false });

      on(document, "pointerlockchange", () => {
        const locked = document.pointerLockElement === canvas;
        hintEl.classList.toggle("is-off", locked);
        if (!locked) breaking = null;
      });
      on(document, "mousemove", (e) => {
        if (document.pointerLockElement !== canvas) return;
        player.yaw -= e.movementX * 0.0022;
        player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch - e.movementY * 0.0022));
      });
      function exitPointerLock() {
        if (document.pointerLockElement === canvas) document.exitPointerLock();
      }

      function placeBlock() {
        const hit = pick();
        if (!hit || !hit.prev) return;
        const id = HOTBAR[slot];
        if (world.mode === "survival" && counts[slot] <= 0) {
          ctx.setStatus(`No ${BLOCKS[id].name} left — mine some first.`);
          return;
        }
        const [px, py, pz] = hit.prev;
        // Don't let the player entomb themselves — a block inside your own
        // hitbox means instant suffocation and no way out.
        const r = WIDTH / 2;
        const insidePlayer = px >= Math.floor(player.x - r) && px <= Math.floor(player.x + r)
          && pz >= Math.floor(player.z - r) && pz <= Math.floor(player.z + r)
          && py >= Math.floor(player.y) && py <= Math.floor(player.y + TALL - 0.01);
        if (insidePlayer) return;
        setBlock(px, py, pz, id);
        if (world.mode === "survival") { counts[slot] -= 1; renderHotbar(); }
        ctx.tone?.beep?.(240, 0.03);
      }

      function finishBreak(hit) {
        const id = getBlock(hit.x, hit.y, hit.z);
        if (id === AIR || BLOCKS[id].hardness === Infinity) return;
        setBlock(hit.x, hit.y, hit.z, AIR);
        if (world.mode === "survival") {
          // Grass and stone drop what they'd drop in the genre: dirt and cobble.
          const dropId = id === 1 ? 2 : id === 3 ? 8 : id;
          const at = HOTBAR.indexOf(dropId);
          if (at >= 0) { counts[at] += 1; renderHotbar(); }
        }
        ctx.tone?.beep?.(150, 0.04);
      }

      /* ------------------------------------------------------------------ HUD */
      function blockSwatch(id) {
        // A one-tile crop of the atlas, so a hotbar icon is literally the
        // texture the block is made of and can never drift from it.
        const def = BLOCKS[id];
        const tile = def.tiles[0];
        const size = 16;
        const c = document.createElement("canvas");
        c.width = c.height = size;
        const g = c.getContext("2d");
        g.imageSmoothingEnabled = false;
        g.drawImage(atlasTexture.image, (tile % ATLAS_COLS) * size, Math.floor(tile / ATLAS_COLS) * size, size, size, 0, 0, size, size);
        return c.toDataURL();
      }
      function renderHotbar() {
        hotbarEl.innerHTML = "";
        HOTBAR.forEach((id, i) => {
          const el = document.createElement("div");
          el.className = "br-slot" + (i === slot ? " is-on" : "");
          const icon = document.createElement("i");
          icon.style.background = `url(${blockSwatch(id)}) center/cover`;
          icon.style.imageRendering = "pixelated";
          el.appendChild(icon);
          if (world.mode === "survival") {
            const n = document.createElement("b");
            n.textContent = counts[i] || "";
            el.appendChild(n);
          }
          el.title = BLOCKS[id].name;
          hotbarEl.appendChild(el);
        });
      }
      let hudCache = "";
      function renderHud() {
        const key = `${player.x.toFixed(1)}|${player.y.toFixed(1)}|${player.z.toFixed(1)}|${slot}|${player.health}|${world.vibrant}|${world.mode}`;
        if (key === hudCache) return; // 60 DOM rebuilds a second, for text that rarely changes
        hudCache = key;
        statEl.innerHTML = "";
        const lines = [
          `${world.name} · ${MODES[world.mode].label}`,
          `XYZ ${player.x.toFixed(1)} ${player.y.toFixed(1)} ${player.z.toFixed(1)}`,
          `${BLOCKS[HOTBAR[slot]].name}${world.vibrant ? " · Vibrant Vision" : ""}`,
        ];
        lines.forEach((t) => {
          const d = document.createElement("div");
          d.textContent = t;
          statEl.appendChild(d);
        });
        heartsEl.textContent = world.mode === "survival"
          ? "❤️".repeat(Math.ceil(player.health / 2)) + "🖤".repeat(5 - Math.ceil(player.health / 2))
          : "";
      }

      /* ------------------------------------------------------------ pause menu */
      function showPause() {
        running = false;
        exitPointerLock();
        panel.style.display = "flex";
        panel.innerHTML = "";
        const card = document.createElement("div");
        card.className = "br-card";
        card.innerHTML = `<h3>Paused</h3><p class="br-sub">${world.name} — ${WORLD_TYPES[world.type].label}, seed ${world.seed}</p>`;
        panel.appendChild(card);

        const controls = document.createElement("div");
        controls.style.cssText = "font-size:.85rem;line-height:1.9;color:var(--text-dim);margin-bottom:16px";
        controls.innerHTML = `
          <div><b style="color:var(--text)">WASD</b> move · <b style="color:var(--text)">Space</b> jump · <b style="color:var(--text)">Shift</b> sneak</div>
          <div><b style="color:var(--text)">Mouse</b> look · <b style="color:var(--text)">Left-click</b> break · <b style="color:var(--text)">Right-click</b> place</div>
          <div><b style="color:var(--text)">1-9</b> or <b style="color:var(--text)">scroll</b> pick a block · <b style="color:var(--text)">Esc</b> pause</div>
          ${world.mode === "creative" ? '<div><b style="color:var(--text)">Double-tap Space</b> fly · then Space up, Shift down</div>' : ""}`;
        card.appendChild(controls);

        const vib = document.createElement("div");
        vib.className = "br-toggle" + (world.vibrant ? " is-on" : "");
        vib.innerHTML = `<span class="br-sw"></span><span><strong>Vibrant Vision</strong><br><span style="font-size:.76rem;color:var(--text-dim)">Saturated palette, sunlight, sky and distance fog</span></span>`;
        vib.onclick = () => {
          world.vibrant = !world.vibrant;
          vib.classList.toggle("is-on", world.vibrant);
          applyGraphics();
          persist();
        };
        card.appendChild(vib);

        const modeWrap = document.createElement("div");
        modeWrap.style.marginTop = "14px";
        modeWrap.innerHTML = `<label style="display:block;font-size:.74rem;letter-spacing:.1em;text-transform:uppercase;color:var(--text-dim);margin-bottom:7px;font-weight:700">Game mode</label>`;
        modeWrap.appendChild(optionGrid(MODES, world.mode, (k) => {
          world.mode = k;
          if (k === "survival") player.flying = false;
          renderHotbar();
          persist();
        }));
        card.appendChild(modeWrap);

        const actions = document.createElement("div");
        actions.className = "br-actions";
        const resume = document.createElement("button");
        resume.type = "button";
        resume.className = "btn primary";
        resume.textContent = "Resume";
        resume.onclick = () => { panel.style.display = "none"; running = true; canvas.requestPointerLock(); };
        const quit = document.createElement("button");
        quit.type = "button";
        quit.className = "btn";
        quit.textContent = "Save & quit to worlds";
        quit.onclick = () => { persist(); showMenu(); };
        actions.append(resume, quit);
        card.appendChild(actions);
      }

      function persist() {
        const list = loadWorlds();
        const at = list.findIndex((w) => w.id === world.id);
        // Only the blocks the player actually changed are stored — the rest is
        // regenerated from the seed, which is the whole point of having one.
        const record = { ...world, edits, spawn: { x: player.x, y: player.y, z: player.z } };
        if (at >= 0) list[at] = record; else list.unshift(record);
        saveWorlds(list);
      }

      function applyGraphics() {
        buildMaterials(world.vibrant);
        buildLighting(world.vibrant);
        // Materials are referenced by every chunk mesh, so they all have to be
        // rebuilt against the new ones.
        chunks.forEach((chunk) => { chunk.dirty = true; });
        renderHotbar();
      }

      /* ------------------------------------------------------------ world load */
      function enterWorld(record) {
        world = { ...record };
        edits = record.edits ? { ...record.edits } : {};
        noise = makeNoise(hashSeed(String(world.seed)));
        contNoise = makeNoise(hashSeed(`${world.seed}:continent`));
        chunks.forEach((chunk) => {
          if (chunk.meshes) chunk.meshes.forEach((m) => { chunkRoot.remove(m); m.geometry.dispose(); });
        });
        chunks.clear();
        counts.fill(world.mode === "creative" ? 0 : 0);
        player.health = 10;
        player.flying = false;
        player.yaw = 0;
        player.pitch = 0;
        if (record.spawn) {
          player.x = record.spawn.x; player.y = record.spawn.y; player.z = record.spawn.z;
        } else {
          player.x = 8.5; player.z = 8.5;
        }
        applyGraphics();
        // The spawn column has to exist before we can stand on it.
        getChunk(Math.floor(player.x / CHUNK), Math.floor(player.z / CHUNK));
        if (!record.spawn) placeAtSurface();
        renderHotbar();
        panel.style.display = "none";
        running = true;
        ctx.setStatus(`${world.name} — ${MODES[world.mode].label}. Click to look around.`);
        canvas.requestPointerLock();
      }

      /* ----------------------------------------------------------------- loop */
      function resize() {
        const w = wrap.clientWidth || 960;
        const h = wrap.clientHeight || 540;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      on(window, "resize", resize);
      resize();

      let last = performance.now();
      let saveTimer = 0;

      function frame(now) {
        raf = requestAnimationFrame(frame);
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        if (!running) { renderer.render(scene, camera); return; }

        /* movement */
        const speed = player.flying ? 14 : (keys.has("ShiftLeft") && !player.flying ? 2.2 : 5.4);
        let fx = 0, fz = 0;
        if (keys.has("KeyW") || keys.has("ArrowUp")) fz += 1;
        if (keys.has("KeyS") || keys.has("ArrowDown")) fz -= 1;
        if (keys.has("KeyA") || keys.has("ArrowLeft")) fx -= 1;
        if (keys.has("KeyD") || keys.has("ArrowRight")) fx += 1;
        const len = Math.hypot(fx, fz) || 1;
        const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
        const dx = ((fz / len) * -sin + (fx / len) * cos) * speed * dt;
        const dz = ((fz / len) * -cos - (fx / len) * sin) * speed * dt;

        if (player.flying) {
          player.vy = 0;
          if (keys.has("Space")) player.y += speed * dt;
          if (keys.has("ShiftLeft")) player.y -= speed * dt;
        } else {
          const inWater = getBlock(Math.floor(player.x), Math.floor(player.y + 0.5), Math.floor(player.z)) === 11;
          player.vy -= (inWater ? 9 : 26) * dt;
          if (inWater) player.vy = Math.max(player.vy, -2.4);
          if (keys.has("Space")) {
            if (player.onGround) { player.vy = 8.4; player.onGround = false; player.fallStart = player.y; }
            else if (inWater) player.vy = 3.4;
          }
          if (player.vy < -0.1 && player.fallStart === null) player.fallStart = player.y;
          player.onGround = false;
          moveAxis("y", player.vy * dt);
        }
        moveAxis("x", dx);
        moveAxis("z", dz);
        if (player.y < -8) { damage(world.mode === "survival" ? 10 : 0); respawn(); }

        /* block targeting and breaking */
        const hit = pick();
        if (hit) {
          highlight.visible = true;
          highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
        } else {
          highlight.visible = false;
        }
        if (breaking && hit) {
          const id = getBlock(hit.x, hit.y, hit.z);
          const hardness = BLOCKS[id]?.hardness ?? Infinity;
          if (world.mode === "creative") { finishBreak(hit); breaking = null; }
          else if (hardness !== Infinity) {
            breaking.progress += dt / hardness;
            if (breaking.progress >= 1) { finishBreak(hit); breaking = { started: now, progress: 0 }; }
          }
        }

        /* stream chunks around the player */
        const pcx = Math.floor(player.x / CHUNK);
        const pcz = Math.floor(player.z / CHUNK);
        let budget = 2; // chunks meshed per frame — more than this and it hitches
        for (let r = 0; r <= VIEW_CHUNKS && budget > 0; r += 1) {
          for (let cx = pcx - r; cx <= pcx + r && budget > 0; cx += 1) {
            for (let cz = pcz - r; cz <= pcz + r && budget > 0; cz += 1) {
              if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) !== r) continue;
              const chunk = getChunk(cx, cz);
              if (!chunk.dirty) continue;
              // The seams need the neighbours' block data present, or the edge
              // faces mesh against "air" and you get walls at every chunk border.
              for (let dx = -1; dx <= 1; dx += 1) for (let dz = -1; dz <= 1; dz += 1) getChunk(cx + dx, cz + dz);
              buildChunkMesh(chunk);
              budget -= 1;
            }
          }
        }
        // Drop chunks that fell out of range, or memory grows without bound as
        // you walk.
        chunks.forEach((chunk, key) => {
          if (Math.max(Math.abs(chunk.cx - pcx), Math.abs(chunk.cz - pcz)) > VIEW_CHUNKS + 1) {
            if (chunk.meshes) chunk.meshes.forEach((m) => { chunkRoot.remove(m); m.geometry.dispose(); });
            chunks.delete(key);
          }
        });

        camera.position.set(player.x, player.y + EYE, player.z);
        camera.rotation.set(player.pitch, player.yaw, 0, "YXZ");
        if (sky) sky.position.copy(camera.position);

        renderHud();
        renderer.render(scene, camera);

        saveTimer += dt;
        if (saveTimer > 8) { saveTimer = 0; persist(); }
      }

      showMenu();
      raf = requestAnimationFrame(frame);

      teardown.push(() => {
        cancelAnimationFrame(raf);
        if (world) persist();
        exitPointerLock();
        chunks.forEach((chunk) => {
          if (chunk.meshes) chunk.meshes.forEach((m) => m.geometry.dispose());
        });
        chunks.clear();
        if (atlasTexture) atlasTexture.dispose();
        if (solidMaterial) solidMaterial.dispose();
        if (glassMaterial) glassMaterial.dispose();
        highlight.geometry.dispose();
        highlight.material.dispose();
        renderer.dispose();
      });
    }

    /* ------------------------------------------------------------- teardown */
    return () => {
      disposed = true;
      teardown.forEach((fn) => {
        try { fn(); } catch (e) { /* keep tearing the rest down */ }
      });
      if (gameView) gameView.classList.remove("wide-stage");
    };
  },
});
