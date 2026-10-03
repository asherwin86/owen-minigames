/* Switch 2 home-menu shell.
 *
 * Two jobs, both purely presentational — no game or profile logic lives here:
 *
 *  1. Move the system buttons (Music, Settings, What's New, Download App,
 *     Profile, and Play Together once play-together.js adds it) out of the top
 *     bar and into the fixed bottom dock, the way the console keeps its system
 *     icons on a bar of their own. These are *moved*, never rebuilt: appendChild
 *     re-parents the live node, so every listener app.js / profiles.js /
 *     settings-panel.js / update-center.js bound to them still fires, and any
 *     code that looks them up by id still finds them.
 *
 *  2. Keep the top-right status cluster live — clock, and the real battery
 *     level where the browser exposes one.
 *
 * Runs before the feature scripts so the dock exists by the time
 * play-together.js injects its own button; the MutationObserver below catches
 * that one (and anything else added later) as it appears.
 */
(function () {
  "use strict";

  const dock = document.getElementById("switchDock");
  const topbar = document.getElementById("topbar");
  if (!dock) return;

  // id -> the label its dock icon shows on hover (CSS reads data-sw-label).
  // The buttons' own text keeps changing at runtime ("Music: On"/"Music: Off"),
  // and the dock hides that text, so the tooltip carries a stable name instead.
  const DOCK_BUTTONS = {
    musicBtn: "Music",
    settingsBtn: "Settings",
    keysBtn: "Keys",
    feedbackBtn: "Feedback",
    updatesBtn: "What's New",
    playTogetherBtn: "Play Together",
    leaderboardsBtn: "Leaderboards",
    achievementsBtn: "Achievements",
    friendsBtn: "Friends",
    messagesBtn: "Messages",
    profileBtn: "Profile",
    switch100Btn: "100 Mimi Games",
  };

  function adopt(el, label) {
    if (!el || el.dataset.swDocked === "1") return;
    el.dataset.swDocked = "1";
    el.dataset.swLabel = label;
    // Download App is a button inside a positioning wrapper that owns its
    // pop-up menu — the whole wrapper has to move, not just the button.
    const wrap = el.closest(".download-app-wrap");
    dock.appendChild(wrap || el);
  }

  function syncDock() {
    Object.entries(DOCK_BUTTONS).forEach(([id, label]) => adopt(document.getElementById(id), label));
    adopt(document.getElementById("downloadAppBtn"), "Download App");
  }

  // The sister arcade, 100 Mimi Games (a separate site).
  //  - In the Windows desktop app the button opens your copy of the 100 app and closes
  //    this one. The first time it asks where that app is (a normal file picker) and
  //    remembers; right-click the button to pick a different one. Picking and launching
  //    happen in the app's main process (electron/otherApp.js); the page only asks.
  //  - Everywhere else it jumps to the website: in this tab on the web (Back returns
  //    here), in the browser for the other installed copies.
  const OTHER_ARCADE_URL = "https://mimi-games-hzi0.onrender.com/";
  // ?fs=1 tells the other arcade it was reached by Switch, so it can go fullscreen (see armFullscreenOnArrival below).
  const OTHER_ARCADE_SWITCH_URL = OTHER_ARCADE_URL + "?fs=1";
  const switch100 = document.getElementById("switch100Btn");
  const winApp = () => {
    const a = window.mimiDesktop && window.mimiDesktop.otherApp;
    return a && a.supported ? a : null;
  };

  async function switchViaApp(app) {
    let r = await app.launch();
    if (!r.ok && r.needsChoose) {
      if (r.msg) alert(r.msg);
      const c = await app.choose();
      if (c.canceled) return;                       // changed their mind: stay here, say nothing
      if (!c.ok) { alert(c.msg || "Couldn't use that file."); return; }
      r = await app.launch();
    }
    if (!r.ok) alert(r.msg || "Couldn't start 100 Mimi Games.");
  }

  if (switch100) {
    if (winApp()) switch100.title = "Opens your 100 Mimi Games app and closes this one. Right-click to change where that app is.";
    switch100.addEventListener("click", async () => {
      const app = winApp();
      if (app) {
        try { await switchViaApp(app); return; } catch (e) { /* fall back to the website */ }
      }
      const installed = /Electron/i.test(navigator.userAgent || "")
        || (window.matchMedia && (matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches))
        || navigator.standalone === true;
      if (installed) {
        try { window.open(OTHER_ARCADE_SWITCH_URL, "_blank", "noopener"); return; } catch (e) { /* fall through */ }
      }
      location.href = OTHER_ARCADE_SWITCH_URL;
    });
    // Windows app only: choose where the other app is.
    switch100.addEventListener("contextmenu", async (e) => {
      const app = winApp();
      if (!app) return;
      e.preventDefault();
      const c = await app.choose();
      if (!c.ok && !c.canceled) alert(c.msg || "Couldn't use that file.");
    });
  }

  /* Fullscreen on arrival. When 100 Mimi Games sends you here with ?fs=1, this page goes
   * fullscreen so there is no browser bar. A browser only allows fullscreen after a tap or
   * key press, and that does not carry over to a new page, so: try straight away (some
   * browsers allow it); if refused, show a small hint and do it on the first tap or key
   * press. iPhone Safari has no fullscreen for web pages at all, so nothing happens there;
   * it only loses its bar as a Home Screen app. Installed copies already have no bar. */
  function armFullscreenOnArrival() {
    let params;
    try { params = new URLSearchParams(location.search); } catch (e) { return; }
    if (params.get("fs") !== "1") return;
    params.delete("fs");
    const rest = params.toString();
    try { history.replaceState(history.state, "", location.pathname + (rest ? "?" + rest : "") + location.hash); } catch (e) { /* no history API */ }

    const el = document.documentElement;
    const request = el.requestFullscreen || el.webkitRequestFullscreen;
    const installed = /Electron/i.test(navigator.userAgent || "")
      || (window.matchMedia && (matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches))
      || navigator.standalone === true;
    if (!request || document.fullscreenElement || installed) return;
    const go = () => {
      try { const r = request.call(el, { navigationUI: "hide" }); return r && r.then ? r : Promise.resolve(); } catch (e) { return Promise.reject(e); }
    };
    go().catch(() => {
      const hint = document.createElement("div");
      hint.textContent = "Tap anywhere for fullscreen";
      hint.setAttribute("role", "status");
      hint.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483000;padding:8px 16px;border-radius:999px;background:rgba(8,12,20,.85);border:1px solid rgba(255,255,255,.3);color:#fff;font:700 13px system-ui,sans-serif;pointer-events:none;";
      document.body.appendChild(hint);
      const events = ["pointerdown", "pointerup", "touchend", "mousedown", "keydown"];
      let timer = 0;
      let trying = false;
      const stop = () => { events.forEach((n) => removeEventListener(n, onGesture, true)); hint.remove(); clearTimeout(timer); };
      function onGesture(e) {
        if (e.type === "keydown" && e.key === "Escape") return;
        if (trying) return;
        trying = true;
        go().then(stop, () => { trying = false; });   // a press that does not count as a gesture is refused; wait for the next one
      }
      events.forEach((n) => addEventListener(n, onGesture, true));
      timer = setTimeout(stop, 10000);
    });
  }
  armFullscreenOnArrival();

  syncDock();
  // play-together.js (and anything else) adds its top-bar button after this
  // file runs, so keep watching for late arrivals rather than racing them.
  if (topbar) new MutationObserver(syncDock).observe(topbar, { childList: true, subtree: true });

  /* style.css strips the bar down to Music/Settings/Profile on the search-home
   * front page via `.topbar.search-mode #updatesBtn` — selectors that stop
   * matching the moment those buttons leave the top bar. Mirroring the class
   * onto the dock lets switch2.css re-state the same rule against the dock. */
  if (topbar) {
    const mirrorSearchMode = () => dock.classList.toggle("search-mode", topbar.classList.contains("search-mode"));
    mirrorSearchMode();
    new MutationObserver(mirrorSearchMode).observe(topbar, { attributes: true, attributeFilter: ["class"] });
  }

  /* --- background ------------------------------------------------------
   * css/switch2.css draws the whole backdrop; these two are the only parts
   * that need to know anything the stylesheet can't:
   *
   *   --sw-px/--sw-py  a few pixels of pointer parallax, so the colour mesh
   *                    and the dust drift against each other as you move
   *   --sw-hue         the hue of the game icon under the cursor, which the
   *                    mesh picks up — the room takes on the colour of what
   *                    you're about to play, the way the console's own home
   *                    screen shifts behind a highlighted title
   *
   * Both are custom properties, so this never touches layout or the DOM: the
   * compositor moves two already-painted layers. Skipped entirely for a coarse
   * pointer (there is no hover to follow on a touchscreen) and for anyone who
   * asked for reduced motion.
   */
  const wantsMotion = !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  if (wantsMotion) {
    const root = document.documentElement;
    let pending = false;
    let px = 0;
    let py = 0;

    window.addEventListener("pointermove", (event) => {
      // ±14px across the whole window — enough to feel like the backdrop has
      // depth, small enough that it never reads as the page wobbling.
      px = (event.clientX / window.innerWidth - 0.5) * 28;
      py = (event.clientY / window.innerHeight - 0.5) * 28;
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        root.style.setProperty("--sw-px", `${px.toFixed(1)}px`);
        root.style.setProperty("--sw-py", `${py.toFixed(1)}px`);
      });
    }, { passive: true });

    // Delegated rather than bound per tile: the grid is rebuilt on every
    // search keystroke and every category filter, and per-tile listeners would
    // have to be re-attached each time (or leak).
    document.addEventListener("pointerover", (event) => {
      const tile = event.target.closest?.(".game-tile, .continue-tile, .landing-mode-btn");
      if (!tile) return;
      // .game-tile carries --hue (js/app.js) — its position in the full game
      // list, the same number css/switch2.css turns into the icon's colour.
      const hue = getComputedStyle(tile).getPropertyValue("--hue").trim();
      if (!hue) return;
      root.style.setProperty("--sw-hue", `${Number(hue) * 47}deg`);
      // The tint field is invisible until something is hovered — see the
      // --sw-hue-a note in css/switch2.css.
      root.style.setProperty("--sw-hue-a", ".2");
    }, { passive: true });

    document.addEventListener("pointerout", (event) => {
      if (event.relatedTarget?.closest?.(".game-tile, .continue-tile")) return;
      root.style.removeProperty("--sw-hue-a");
    }, { passive: true });
  }

  const clockEl = document.getElementById("swClock");
  if (clockEl) {
    const tick = () => {
      const now = new Date();
      clockEl.textContent = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
    };
    tick();
    setInterval(tick, 15000);
  }

  /* Real battery level where the browser has the API (Chrome/Edge on a laptop,
   * a Steam Deck, an Android tablet). Everywhere else the markup's static full
   * battery just stays as it is — the cluster is decoration, not a feature to
   * gate anything on. */
  const battFill = document.getElementById("swBattFill");
  const battPct = document.getElementById("swBattPct");
  if (battFill && navigator.getBattery) {
    navigator.getBattery().then((battery) => {
      const render = () => {
        const level = Math.max(0, Math.min(1, battery.level));
        battFill.setAttribute("width", String(Math.round(level * 15) || 1));
        battFill.setAttribute("fill", battery.charging ? "#7ee81c" : level <= 0.15 ? "#ff3c28" : "#ffffff");
        if (battPct) battPct.textContent = `${Math.round(level * 100)}%`;
      };
      render();
      battery.addEventListener("levelchange", render);
      battery.addEventListener("chargingchange", render);
    }).catch(() => {
      /* permissions-policy can block it — the static markup is the fallback */
    });
  }
})();
