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
    updatesBtn: "What's New",
    playTogetherBtn: "Play Together",
    leaderboardsBtn: "Leaderboards",
    achievementsBtn: "Achievements",
    friendsBtn: "Friends",
    profileBtn: "Profile",
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
