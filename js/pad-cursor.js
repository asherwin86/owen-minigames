// Site-wide gamepad support: a controller-driven mouse cursor for the whole hub.
// Two movement modes, picked in ⚙️ Settings: Mouse (default) has the left
// stick move the pointer smoothly, like a real mouse; Select instead jumps
// the cursor directly to the next selectable thing in whichever direction
// the stick is tilted — no gliding in between. Right stick scrolls, D-pad
// sends arrow-key events (snake, 2048, pong, maze...) in either mode. Click,
// Back to Grid, and Unlock Cursor are all remappable from the hub's ⚙️
// Settings panel (same settings panel style as Kart Circuit's own gamepad
// settings), since non-standard controllers (flight sticks/HOTAS units)
// don't have their defaults at the same indexes — full pointer+mouse event
// synthesis, so canvas games with pointer handlers work, plus real
// mouseenter/mouseleave/over/out so hover-reactive JS (not just CSS :hover,
// which no synthetic input can ever trigger) behaves the way it would for a
// genuine mouse. The cursor crosses freely in and out of embedded game
// frames (Kart Circuit): clicks and scrolling are forwarded into the
// frame's own document, and Select mode's candidate search reaches in there
// too.
(function () {
  // Same Nintendo-style button naming Kart Circuit's own gamepad settings
  // use (games/mario-kart/game.js) — one consistent vocabulary across the
  // hub and every game, instead of each place inventing its own labels.
  const GAMEPAD_BUTTON_NAMES = ["B", "A", "Y", "X", "L", "R", "ZL", "ZR", "−", "+", "L3", "R3", "D-Up", "D-Down", "D-Left", "D-Right", "Home"];
  function gamepadButtonName(index, isStandard = true) {
    if (!isStandard) return `Button ${index}`;
    return GAMEPAD_BUTTON_NAMES[index] || `B${index}`;
  }

  const DEFAULT_CLICK_BUTTONS = [6, 1]; // LT/ZL and A — standard-mapping gamepads only
  const DEFAULT_BACK_BUTTONS = [0]; // B
  const DEFAULT_UNLOCK_BUTTONS = [9]; // + (Start/Options) on a standard-mapping gamepad
  const REMAPPABLE = [
    { key: "clickButtons", label: "Click", defaults: DEFAULT_CLICK_BUTTONS, hint: "If the cursor moves but can't click anything (common on flight sticks/HOTAS), set this to a button it actually has." },
    { key: "backButtons", label: "Back to Grid", defaults: DEFAULT_BACK_BUTTONS, hint: "Closes the current game and returns to the game grid, from anywhere." },
    { key: "unlockButtons", label: "Unlock Cursor", defaults: DEFAULT_UNLOCK_BUTTONS, hint: "Games that read the controller directly (Gun Game Arena, Bike Rush, Asteroids...) hide this cursor while you play — press this to bring it back for a menu or setting without unplugging the controller." },
  ];
  const DPAD_KEYS = [[12, "ArrowUp"], [13, "ArrowDown"], [14, "ArrowLeft"], [15, "ArrowRight"]];
  // which action (a REMAPPABLE key) is currently waiting for a button press,
  // or null — only one row can listen at a time, same as Kart Circuit's panel
  let remapListening = null;
  let remapPrevPressed = new Set();
  // manual override: a game that suppresses the cursor (see setSuppressed
  // below) still needs some way back to it — to pause, change a setting, or
  // just quit — without unplugging the controller. Unlock Cursor toggles it
  // back on regardless of what the game requested; toggling it off again (or
  // the game itself ending) hands control back to the automatic suppression.
  let manualUnlock = false;
  let unlockPrevPressed = false;

  const cursor = document.createElement("div");
  cursor.className = "pad-cursor hidden";
  cursor.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2 L20 11.5 L12.5 13.2 L9.5 21 Z" fill="#ffffff" stroke="#0a1020" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  document.body.appendChild(cursor);

  const state = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    visible: false,
    clickHeld: false,
    backHeld: false,
    drag: null, // { el, iframe }
    dpad: {},
    last: 0,
  };

  // user prefs: pointer size/speed and the click button, shared with Kart
  // Circuit via localStorage. clickButtons defaults to LT/ZL + A, which only
  // exist at those indexes on a "standard"-mapping gamepad (Xbox/PS-style).
  // Flight sticks and other exotic controllers (a Thrustmaster HOTAS, say)
  // report as non-standard — their raw button order has nothing to do with
  // that layout — so the click button is remappable below.
  const PREFS_KEY = "mimiPadCursor";
  // mode: "mouse" (default) is the analog-stick-as-mouse behavior described
  // above — smooth, continuous, goes wherever the stick points. "select" is
  // a different model entirely, closer to how a TV/console menu works: the
  // stick doesn't move the cursor by itself, it jumps between selectable
  // things (buttons, tiles, links) — tilt a direction and the cursor snaps
  // straight to the next one that way, immediately, no gliding across the
  // screen in between. Some people find hitting a specific small button
  // with analog drift fiddly; select mode trades that precision problem for
  // "which thing is selected" being unambiguous at every moment instead.
  const PREFS_DEFAULTS = { size: 1, speed: 1, mode: "mouse", clickButtons: DEFAULT_CLICK_BUTTONS, backButtons: DEFAULT_BACK_BUTTONS, unlockButtons: DEFAULT_UNLOCK_BUTTONS };
  function loadPrefs() {
    try {
      return { ...PREFS_DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
    } catch (e) {
      return { ...PREFS_DEFAULTS };
    }
  }
  let prefs = loadPrefs();
  window.addEventListener("storage", (e) => {
    if (e.key === PREFS_KEY) prefs = loadPrefs();
  });
  function savePrefs(next) {
    prefs = { ...prefs, ...next };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* private mode */ }
  }

  // settings UI (sliders + remap rows), rendered into the dedicated Settings
  // overlay (js/settings-panel.js opens/closes it; this file just owns what's
  // inside #settingsBody)
  let prefsSection = null;

  function renderCursorPrefs() {
    const body = document.getElementById("settingsBody");
    if (!body) return;
    if (!prefsSection) {
      prefsSection = document.createElement("div");
      body.appendChild(prefsSection);
    }
    prefsSection.innerHTML = '<p class="pt-status" style="margin-bottom:10px"><strong>Gamepad</strong> — controls for the hub itself (also applies in Kart Circuit). Every canvas game with its own gamepad support reads the D-pad and face buttons directly and isn\'t affected by these. If the cursor doesn\'t respond right after plugging a controller in, press any button on it once — browsers only make a gamepad visible to a page after it sees a real button press, so tilting the stick alone doesn\'t activate it.</p>'
      + '<p id="padCursorDiag" class="pt-status" style="margin-bottom:10px;font-family:monospace;font-size:.75rem;white-space:pre-wrap"></p>';
    [["size", "Size", 0.7, 2.5], ["speed", "Speed", 0.3, 2.5]].forEach(([key, label, min, max]) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:8px";
      const tag = document.createElement("span");
      tag.className = "pt-status";
      tag.style.margin = "0";
      tag.style.minWidth = "52px";
      tag.textContent = label;
      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = String(min);
      slider.max = String(max);
      slider.step = "0.1";
      slider.value = String(prefs[key]);
      slider.style.cssText = "flex:1;accent-color:#53e0ff";
      const readout = document.createElement("span");
      readout.className = "pt-status";
      readout.style.margin = "0";
      readout.style.minWidth = "38px";
      readout.textContent = `${Number(prefs[key]).toFixed(1)}×`;
      slider.addEventListener("input", () => {
        const value = parseFloat(slider.value);
        savePrefs({ [key]: value });
        readout.textContent = `${value.toFixed(1)}×`;
      });
      row.appendChild(tag);
      row.appendChild(slider);
      row.appendChild(readout);
      if (key === "speed" && prefs.mode === "select") row.style.display = "none";
      prefsSection.appendChild(row);
    });

    // Mouse mode (default) vs Select mode — see the comment above
    // PREFS_DEFAULTS for what each one actually does.
    const modeRow = document.createElement("div");
    modeRow.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:4px";
    const modeTag = document.createElement("span");
    modeTag.className = "pt-status";
    modeTag.style.margin = "0";
    modeTag.style.minWidth = "52px";
    modeTag.textContent = "Mode";
    const modeButtons = document.createElement("div");
    modeButtons.style.cssText = "display:flex;gap:8px;flex:1";
    [["mouse", "🖱️ Mouse"], ["select", "🎯 Select"]].forEach(([value, label]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn" + (prefs.mode === value ? " primary" : "");
      btn.style.flex = "1";
      btn.textContent = label;
      btn.addEventListener("click", () => {
        if (prefs.mode === value) return;
        savePrefs({ mode: value });
        selectedEl = null;
        selectDir = null;
        selectRepeatTimer = 0;
        renderCursorPrefs();
      });
      modeButtons.appendChild(btn);
    });
    modeRow.appendChild(modeTag);
    modeRow.appendChild(modeButtons);
    prefsSection.appendChild(modeRow);
    const modeHint = document.createElement("p");
    modeHint.className = "pt-status";
    modeHint.style.cssText = "margin:2px 0 10px;opacity:.75;font-size:.8em";
    modeHint.textContent = prefs.mode === "select"
      ? "Select: tilt the stick toward the button/tile you want — the cursor jumps straight to it, no drifting across the screen in between. Same click button as always to activate it."
      : "Mouse: the stick moves the cursor smoothly, like a real mouse.";
    prefsSection.appendChild(modeHint);

    // Remappable actions — same "click a row, press a button" pattern as
    // Kart Circuit's own gamepad settings (games/mario-kart/game.js), and
    // the same button naming, so this reads as one consistent system rather
    // than a different remap UI in every place a controller matters.
    const firstPad = typeof navigator.getGamepads === "function"
      ? Array.from(navigator.getGamepads()).find((p) => p?.connected)
      : null;
    const isStandard = !firstPad || firstPad.mapping === "standard";
    REMAPPABLE.forEach(({ key, label, hint }) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:4px";
      const tag = document.createElement("span");
      tag.className = "pt-status";
      tag.style.margin = "0";
      tag.style.minWidth = "94px";
      tag.textContent = label;
      const binding = document.createElement("button");
      binding.type = "button";
      binding.className = "btn";
      binding.style.flex = "1";
      binding.textContent = remapListening === key
        ? "Press a button on your controller…"
        : (prefs[key] || []).map((i) => gamepadButtonName(i, isStandard)).join(" / ") || "—";
      binding.addEventListener("click", () => {
        remapListening = remapListening === key ? null : key;
        renderCursorPrefs();
      });
      row.appendChild(tag);
      row.appendChild(binding);
      prefsSection.appendChild(row);

      const hintEl = document.createElement("p");
      hintEl.className = "pt-status";
      hintEl.style.cssText = "margin:2px 0 10px;opacity:.75;font-size:.8em";
      hintEl.textContent = hint;
      prefsSection.appendChild(hintEl);
    });

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "btn";
    resetBtn.textContent = "Reset gamepad bindings to defaults";
    resetBtn.addEventListener("click", () => {
      remapListening = null;
      savePrefs(Object.fromEntries(REMAPPABLE.map((r) => [r.key, r.defaults])));
      renderCursorPrefs();
    });
    prefsSection.appendChild(resetBtn);
  }

  let hoveredEl = null;
  let hoveredIframe = null;
  // elementFromPoint returns the deepest node (often an icon/text span
  // *inside* a button), so walk up to the nearest interactive ancestor
  // rather than requiring the cursor to be over the button's own hit area
  function findInteractive(el) {
    return el?.closest?.("button, a, input, select, textarea, [role='button'], [tabindex]") || null;
  }
  // A real mouse crossing onto/off of an element fires mouseover/mouseout
  // (bubbling) and mouseenter/mouseleave (not) as it goes, and CSS :hover
  // updates for free. Browsers only ever match :hover from genuine input —
  // there's no way around that for a synthetic pointer, faked or not — so
  // that part's still done by hand with a class. But nothing stops sending
  // the real events too, which is what actually drives most hover-reactive
  // JS (tooltips, custom dropdowns, etc.), not just CSS — so this fires
  // those the same way a real mouse would, on the same target/coords synth()
  // already uses for click/move, it just needed the hover target's iframe
  // too (a plain element reference isn't enough to place events correctly
  // inside an embedded game's own document).
  function setHover(target) {
    const el = target?.el ?? null;
    const iframe = target?.iframe ?? null;
    const next = findInteractive(el);
    if (next === hoveredEl) return;
    if (hoveredEl) {
      synth(hoveredEl, hoveredIframe, "out", 0);
      hoveredEl.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false, view: hoveredIframe ? hoveredIframe.contentWindow : window }));
      hoveredEl.classList.remove("pad-hover-target");
    }
    if (next) {
      synth(next, iframe, "over", 0);
      next.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false, view: iframe ? iframe.contentWindow : window }));
      next.classList.add("pad-hover-target");
    }
    hoveredEl = next;
    hoveredIframe = next ? iframe : null;
  }

  function hide() {
    state.last = 0;
    setHover(null);
    if (!state.visible) return;
    state.visible = false;
    cursor.classList.add("hidden");
  }

  // Resolve what's under the cursor, descending into same-origin iframes so the
  // pointer works inside embedded games too.
  function resolveTarget() {
    let el = document.elementFromPoint(state.x, state.y);
    if (el && cursor.contains(el)) el = null;
    if (el && el.tagName === "IFRAME" && el.contentDocument) {
      const iframe = el;
      const rect = iframe.getBoundingClientRect();
      const localX = state.x - rect.left;
      const localY = state.y - rect.top;
      const inner = iframe.contentDocument.elementFromPoint(localX, localY);
      if (inner) return { el: inner, iframe, cx: localX, cy: localY };
    }
    return { el, iframe: null, cx: state.x, cy: state.y };
  }

  // ---------- Select Mode: jump the cursor directly to the next selectable
  // element in the direction the stick is tilted, instead of gliding there.
  const SELECTABLE_SELECTOR = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [role="button"], [tabindex]';
  let selectedEl = null;
  let selectDir = null;
  let selectRepeatTimer = 0;
  const SELECT_REPEAT_DELAY = 0.36; // seconds before the first repeat while held
  const SELECT_REPEAT_RATE = 0.15; // seconds between repeats after that

  function selectableCandidates() {
    const out = [];
    function collect(doc, iframe) {
      const offsetX = iframe ? iframe.getBoundingClientRect().left : 0;
      const offsetY = iframe ? iframe.getBoundingClientRect().top : 0;
      doc.querySelectorAll(SELECTABLE_SELECTOR).forEach((el) => {
        if (el.tabIndex === -1) return;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        out.push({ el, iframe, cx: offsetX + rect.left + rect.width / 2, cy: offsetY + rect.top + rect.height / 2 });
      });
    }
    collect(document, null);
    // reach into the embedded game frame too, same as resolveTarget() does —
    // skipped mid-race/fullscreen since the whole cursor is suppressed then
    // anyway (see the cursorSuppressed check in the main loop)
    const frame = document.querySelector("#gameStage iframe");
    if (frame && frame.contentDocument) collect(frame.contentDocument, frame);
    // the private page viewer (index.html) used to be reachable here too,
    // back when its frame had allow-same-origin — it's allow-scripts now
    // instead (most real sites need JS to render at all), and deliberately
    // NOT combined with allow-same-origin (that pairing would let a
    // script-enabled frame reach into the hub's own origin), so
    // contentDocument is always null here now and this is a permanent
    // no-op — left in rather than special-cased out, since it's how the
    // exact same fallback already behaves for any other cross-origin frame
    const pageFrame = document.querySelector("#pageViewFrame");
    if (pageFrame && !pageFrame.classList.contains("hidden") && pageFrame.contentDocument) collect(pageFrame.contentDocument, pageFrame);
    return out;
  }

  // Picks the best candidate in `dir` from wherever's currently selected —
  // "best" meaning roughly in that direction (within a ~70° cone) and, among
  // those, closest. Falls back to whatever's nearest the cursor if nothing
  // is selected yet (first press after switching into Select mode, or the
  // previously-selected element navigated away/disappeared).
  function moveSelection(dir) {
    const candidates = selectableCandidates();
    if (!candidates.length) return false;
    const origin = selectedEl ? candidates.find((c) => c.el === selectedEl) : null;
    if (!origin) {
      const nearest = candidates.reduce((best, c) => {
        const d = Math.hypot(c.cx - state.x, c.cy - state.y);
        return !best || d < best.d ? { ...c, d } : best;
      }, null);
      selectedEl = nearest.el;
      state.x = nearest.cx;
      state.y = nearest.cy;
      return true;
    }
    const dx = { right: 1, left: -1, up: 0, down: 0 }[dir];
    const dy = { right: 0, left: 0, up: -1, down: 1 }[dir];
    let best = null;
    let bestScore = Infinity;
    candidates.forEach((c) => {
      if (c.el === origin.el) return;
      const vx = c.cx - origin.cx;
      const vy = c.cy - origin.cy;
      const dist = Math.hypot(vx, vy);
      if (dist < 2) return;
      const alignment = (vx / dist) * dx + (vy / dist) * dy; // 1 = straight ahead, 0 = perpendicular
      if (alignment < 0.35) return;
      const score = dist / alignment;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    });
    if (!best) return false;
    selectedEl = best.el;
    state.x = best.cx;
    state.y = best.cy;
    return true;
  }

  // Returns true the tick a jump actually happened (so the caller knows to
  // re-hover/move-synth at the new position), same contract as the `moved`
  // flag Mouse mode already computes from raw stick deflection.
  function updateSelectMode(mx, my, dt) {
    const magnitude = Math.max(Math.abs(mx), Math.abs(my));
    if (magnitude === 0) {
      selectDir = null;
      selectRepeatTimer = 0;
      return false;
    }
    const dir = Math.abs(mx) > Math.abs(my) ? (mx > 0 ? "right" : "left") : my > 0 ? "down" : "up";
    let shouldMove = false;
    if (dir !== selectDir) {
      selectDir = dir;
      selectRepeatTimer = SELECT_REPEAT_DELAY;
      shouldMove = true;
    } else {
      selectRepeatTimer -= dt;
      if (selectRepeatTimer <= 0) {
        selectRepeatTimer = SELECT_REPEAT_RATE;
        shouldMove = true;
      }
    }
    return shouldMove ? moveSelection(dir) : false;
  }

  function localCoords(iframe) {
    if (!iframe) return { cx: state.x, cy: state.y };
    const rect = iframe.getBoundingClientRect();
    return { cx: state.x - rect.left, cy: state.y - rect.top };
  }

  function synth(el, iframe, phase, buttons) {
    if (!el) return;
    const { cx, cy } = localCoords(iframe);
    const base = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0, buttons, view: iframe ? iframe.contentWindow : window };
    try {
      el.dispatchEvent(new PointerEvent("pointer" + phase, { ...base, pointerId: 7, pointerType: "mouse", isPrimary: true }));
    } catch (e) { /* older browser without PointerEvent constructor */ }
    el.dispatchEvent(new MouseEvent("mouse" + phase, base));
  }

  function synthClick(el, iframe) {
    if (!el) return;
    const { cx, cy } = localCoords(iframe);
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0, view: iframe ? iframe.contentWindow : window }));
  }

  function scrollAt(target, delta) {
    // scroll the nearest scrollable ancestor of whatever's under the cursor
    let el = target.el;
    while (el) {
      if (el.scrollHeight > el.clientHeight + 4) {
        const style = (el.ownerDocument.defaultView || window).getComputedStyle(el);
        if (/(auto|scroll)/.test(style.overflowY) || el === el.ownerDocument.scrollingElement) {
          el.scrollTop += delta;
          return;
        }
      }
      el = el.parentElement;
    }
    const win = target.iframe ? target.iframe.contentWindow : window;
    win.scrollBy(0, delta);
  }

  function sendKey(type, code) {
    document.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }));
  }

  function embeddedGameRacing() {
    // while Kart Circuit is mid-race (its setup overlay hidden), keep the cursor
    // out of the way — A/LT are game controls there, not clicks
    const frame = document.querySelector("#gameStage iframe");
    if (!frame || !frame.contentDocument) return false;
    const overlay = frame.contentDocument.getElementById("overlay");
    return Boolean(overlay && overlay.classList.contains("hidden"));
  }

  function embeddedFrameFullscreen() {
    // when the embedded game's own element goes fullscreen, the Fullscreen
    // API hides everything else in THIS (the hub's) document — including our
    // cursor, a sibling of the iframe — so it'd be invisible and stale-firing
    // clicks at coordinates the user can't see. The game takes over its own
    // cursor in that state instead (see updatePadCursor in mario-kart/game.js).
    const frame = document.querySelector("#gameStage iframe");
    const doc = frame?.contentDocument;
    return Boolean(doc && (doc.fullscreenElement || doc.webkitFullscreenElement));
  }

  // Games that run directly in the hub's DOM (not an isolated iframe like
  // Kart Circuit) and read the gamepad themselves — Gun Game Arena, Coast
  // Guard, Bike Rush, Flappy Wings, Asteroids, Pinball, Block Drop, Sprint
  // Race — have no iframe boundary for embeddedGameRacing() to detect, so
  // without this the cursor kept drifting across the canvas on top of
  // active gameplay the whole time a controller was connected. Each of
  // those games calls MimiPadCursor.setSuppressed(true) once real play
  // starts and (false) back at its own setup/game-over screen, same as
  // Kart Circuit's overlay does implicitly via embeddedGameRacing().
  let suppressed = false;
  window.MimiPadCursor = {
    setSuppressed(v) {
      suppressed = Boolean(v);
      if (!suppressed) manualUnlock = false; // don't carry a stale override into the next game
      // don't jump back to wherever Select mode was pointing in a screen
      // that's no longer showing — the origin-lookup in moveSelection()
      // would already fall back gracefully, but starting fresh from
      // wherever the cursor visually is now reads better than picking
      // between two arbitrary stale candidates
      selectedEl = null;
      selectDir = null;
    },
  };

  renderCursorPrefs();

  setInterval(() => {
    if (typeof navigator.getGamepads !== "function") return;
    // Some setups (DS4Windows, Steam Input, other virtual-controller
    // drivers) register a second, inert gamepad slot alongside the real
    // one — just grabbing the first "connected" pad can silently lock onto
    // that dead slot forever, showing the cursor (a gamepad IS connected)
    // but never moving (that particular slot never reports real input).
    // When more than one pad is connected, prefer whichever one is
    // actually showing live input right now; only fall back to "just the
    // first connected pad" when nothing is currently active on any of them.
    //
    // The axis half of that check used the same 0.22 dead zone the cursor's
    // own movement uses — which turned out to pick the wrong pad in a
    // different way: a virtual-joystick device (vJoy and similar) can sit
    // at a slightly off-center default that clears 0.22 permanently, with
    // nothing actually touching it. That pad then wins "active" every tick
    // regardless of whether the real controller is currently being used,
    // and the cursor drifts in whatever direction the phantom axis happens
    // to be stuck at (confirmed live: cursor creeping upward with no stick
    // input at all). Buttons first — a virtual device reporting a phantom
    // button held down is far less common than a phantom axis offset — and
    // a much higher bar for axis-only activity, since deliberate stick
    // input reads close to full deflection, not a small static drift.
    const connectedPads = Array.from(navigator.getGamepads()).filter((p) => p?.connected);
    const pad = connectedPads.length <= 1
      ? connectedPads[0]
      : connectedPads.find((p) => p.buttons.some((b) => b?.pressed))
        || connectedPads.find((p) => p.axes.some((a) => Math.abs(a ?? 0) > 0.6))
        || connectedPads[0];

    // Temporary live diagnostic — only does anything while Settings is open
    // to a session actively debugging "the cursor won't move" reports, so
    // it's a no-op (one no-op DOM lookup per tick) the rest of the time.
    const diag = document.getElementById("padCursorDiag");
    if (diag) {
      diag.textContent = connectedPads.length === 0
        ? "No gamepad detected as connected."
        : connectedPads.map((p, i) => `[${i}]${p === pad ? " (active)" : ""} "${p.id}" mapping=${p.mapping || "(none)"} axes=${p.axes.map((a) => a.toFixed(2)).join(",")}`).join("\n");
    }

    if (!pad) {
      hide();
      state.clickHeld = false;
      state.drag = null;
      unlockPrevPressed = false;
      return;
    }

    // Unlock Cursor toggles the manual override — checked before the
    // suppression branch below, or there'd be no way to ever press it while
    // a game has the cursor hidden. Only does anything while a game has
    // actually suppressed the cursor, so it's a no-op the rest of the time.
    const unlockPressed = (prefs.unlockButtons || DEFAULT_UNLOCK_BUTTONS).some((i) => pad.buttons[i]?.pressed);
    if (unlockPressed && !unlockPrevPressed && suppressed) manualUnlock = !manualUnlock;
    unlockPrevPressed = unlockPressed;

    // Suppression only hides the CURSOR (a game reading the gamepad itself
    // doesn't want it drifting across the screen) — it must never also stop
    // the D-pad/Back dispatch further down. Bike Rush, for one, has no
    // native gamepad polling of its own at all; it's driven entirely by the
    // D-pad-to-arrow-keys bridge below, while also suppressing the cursor
    // while riding. An early `return` here used to skip that bridge
    // entirely the moment a ride (or Snake, or anything else) got
    // suppressed, which made the D-pad go completely dead right when it was
    // needed most. So: bail out of the cursor-only work below, but always
    // fall through to D-pad/Back at the bottom of this tick regardless.
    const cursorSuppressed = (suppressed && !manualUnlock) || embeddedGameRacing() || embeddedFrameFullscreen();
    if (cursorSuppressed) {
      hide();
      state.clickHeld = false;
      state.drag = null;
    } else if (remapListening) {
      // remap capture: the first newly-pressed button becomes that action's binding
      for (let b = 0; b < pad.buttons.length; b += 1) {
        if (pad.buttons[b]?.pressed && !remapPrevPressed.has(b)) {
          savePrefs({ [remapListening]: [b] });
          remapListening = null;
          renderCursorPrefs();
          break;
        }
      }
      remapPrevPressed = new Set(pad.buttons.map((btn, i) => (btn?.pressed ? i : null)).filter((i) => i !== null));
    } else {
      remapPrevPressed = new Set();

      const now = performance.now();
      const dt = state.last ? Math.min(0.1, (now - state.last) / 1000) : 0.033;
      state.last = now;

      const dead = 0.22;
      // Left stick is axes[0]/[1] under Chromium's "standard" gamepad
      // mapping, but a controller the browser doesn't recognize well enough
      // to remap (pad.mapping === "" rather than "standard" — some 8BitDo
      // pads even in their Xbox-compatible mode) reports raw axis indices
      // instead, and the left stick can land on axes[2]/[3] there. Try 0/1
      // first (the common case); only fall back to 2/3 when the pad isn't
      // standard-mapped AND 0/1 are both sitting dead while 2/3 have signal
      // — so a real standard controller is never affected by this at all.
      let axisX = pad.axes[0] ?? 0;
      let axisY = pad.axes[1] ?? 0;
      // The 8BitDo quirk this fallback was written for reports exactly 4
      // axes (left X/Y, right X/Y, no separate trigger axes) with the left
      // stick landing on 2/3 instead of 0/1. A controller reporting more
      // than 4 — a raw/proprietary HID report rather than that specific
      // quirk — can't be assumed to follow the same layout at all: confirmed
      // live, a 9-axis "Unknown Gamepad" had a real, correctly-centered
      // stick on 0/1 already, but an analog trigger sitting on axis 3
      // permanently pinned at -1.00 (a normal "not pressed" resting value
      // for a trigger reported as an axis) — which this fallback mistook
      // for stick Y, driving the cursor upward at full speed with the stick
      // untouched. Restricted to the exact 4-axis shape the quirk actually
      // has; anything else just keeps 0/1, even if that reads as dead,
      // rather than confidently grabbing the wrong axis.
      if (pad.mapping !== "standard" && pad.axes.length === 4 && Math.abs(axisX) <= dead && Math.abs(axisY) <= dead) {
        const altX = pad.axes[2] ?? 0;
        const altY = pad.axes[3] ?? 0;
        if (Math.abs(altX) > dead || Math.abs(altY) > dead) {
          axisX = altX;
          axisY = altY;
        }
      }
      const mx = Math.abs(axisX) > dead ? axisX : 0;
      const my = Math.abs(axisY) > dead ? axisY : 0;
      let moved;
      if (prefs.mode === "select") {
        moved = updateSelectMode(mx, my, dt);
      } else {
        moved = mx !== 0 || my !== 0;
        const speed = 640 * prefs.speed;
        state.x = Math.max(0, Math.min(window.innerWidth - 2, state.x + mx * speed * dt));
        state.y = Math.max(0, Math.min(window.innerHeight - 2, state.y + my * speed * dt));
      }

      if (!state.visible) {
        state.visible = true;
        cursor.classList.remove("hidden");
      }
      cursor.style.transform = `translate(${state.x}px, ${state.y}px) scale(${prefs.size})`;
      cursor.style.transformOrigin = "0 0";

      const target = resolveTarget();
      setHover(target);

      // Right-stick Y for scrolling — same axes[3] pitfall as the left
      // stick above: on a non-standard pad reporting more than 4 axes,
      // that index isn't reliably a stick at all (it was a trigger,
      // permanently pinned near -1, on the controller that surfaced this).
      // Unconditional before this fix, so a standard-mapped pad (where
      // axes[3] is always genuinely right-stick Y) is unaffected either way.
      const rightStickTrustworthy = pad.mapping === "standard" || pad.axes.length === 4;
      const sy = rightStickTrustworthy && Math.abs(pad.axes[3] ?? 0) > dead ? pad.axes[3] : 0;
      if (sy !== 0 && target.el) scrollAt(target, sy * 900 * dt);

      // hover / drag moves
      if (moved) {
        if (state.drag) {
          synth(state.drag.el, state.drag.iframe, "move", 1);
        } else {
          synth(target.el, target.iframe, "move", 0);
        }
      }

      // click / drag with LT or A
      const clickPressed = (prefs.clickButtons || DEFAULT_CLICK_BUTTONS).some((i) => pad.buttons[i]?.pressed);
      if (clickPressed && !state.clickHeld) {
        state.drag = target.el ? { el: target.el, iframe: target.iframe } : null;
        if (state.drag) synth(state.drag.el, state.drag.iframe, "down", 1);
        cursor.classList.add("clicking");
      } else if (!clickPressed && state.clickHeld) {
        const upTarget = state.drag || { el: target.el, iframe: target.iframe };
        synth(upTarget.el, upTarget.iframe, "up", 0);
        // requestFullscreen() needs real input activation, which a synthetic
        // click dispatched into the iframe never carries (Kart Circuit's own
        // fullscreen button included) — call the game's toggle function instead
        // so it actually has a chance of working.
        const fsButton = upTarget.el?.closest?.("#fullScreenButton");
        if (fsButton && upTarget.iframe?.contentWindow?.toggleFullScreen) {
          upTarget.iframe.contentWindow.toggleFullScreen("gamepad");
        } else {
          synthClick(upTarget.el, upTarget.iframe);
        }
        state.drag = null;
        cursor.classList.remove("clicking");
      }
      state.clickHeld = clickPressed;
    }

    // D-pad -> arrow keys, and Back to Grid -> Escape, run every tick
    // regardless of cursor suppression (see comment above) — these are
    // harmless no-ops wherever nothing is listening for them (e.g. while a
    // Kart Circuit race is mid-flight in its own iframe), and essential
    // wherever a hub-native game's only input path IS this bridge.
    DPAD_KEYS.forEach(([index, code]) => {
      const pressed = Boolean(pad.buttons[index]?.pressed);
      if (pressed !== Boolean(state.dpad[index])) {
        state.dpad[index] = pressed;
        sendKey(pressed ? "keydown" : "keyup", code);
      }
    });

    const backPressed = (prefs.backButtons || DEFAULT_BACK_BUTTONS).some((i) => pad.buttons[i]?.pressed);
    if (backPressed && !state.backHeld) {
      sendKey("keydown", "Escape");
    }
    state.backHeld = backPressed;
  }, 33);
})();
