/* A frame-rate counter for the whole hub.
 *
 * One fixed-position readout on the top-level page, so it shows on the search
 * home screen, the game shelf, inside any game, and over Kart Circuit's iframe
 * — nothing has to opt in, and no game needs to know it exists.
 *
 * Measured from requestAnimationFrame on this page. That is the honest number
 * for anything drawn here: a canvas game runs its own loop, but every frame
 * still reaches the screen through the same compositor, so the rate a rAF
 * observes is the rate you are actually seeing. The one thing it can't measure
 * from the outside is Kart Circuit's iframe, which schedules its own frames —
 * it will still read the page's rate, which in practice tracks it closely.
 *
 * The loop only runs while the counter is on. Off, this file costs nothing but
 * the listener that turns it back on.
 */
(function () {
  "use strict";

  const KEY = "mimiShowFps";
  let el = null;
  let raf = 0;
  let frames = 0;
  let since = 0;
  let worst = Infinity;

  function enabled() {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function ensureEl() {
    if (el) return el;
    el = document.createElement("div");
    el.className = "fps-meter";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    return el;
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    frames += 1;
    if (!since) since = now;
    const elapsed = now - since;
    if (elapsed < 500) return;
    const fps = Math.round((frames * 1000) / elapsed);
    frames = 0;
    since = now;
    // A rolling worst case alongside the current number, because the figure
    // that matters when something stutters is the dip, and an average hides it.
    worst = Math.min(worst, fps);
    const node = ensureEl();
    node.textContent = `${fps} FPS`;
    // Colour-coded so it's readable at a glance without stopping to think.
    node.dataset.tier = fps >= 50 ? "good" : fps >= 30 ? "ok" : "bad";
    node.title = `Lowest seen: ${worst} FPS — click to reset`;
  }

  function start() {
    if (raf) return;
    frames = 0;
    since = 0;
    worst = Infinity;
    const node = ensureEl();
    node.hidden = false;
    node.textContent = "— FPS";
    node.onclick = () => { worst = Infinity; };
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (el) el.hidden = true;
  }

  function apply() {
    if (enabled()) start(); else stop();
  }

  window.MimiFps = {
    isOn: enabled,
    setEnabled(on) {
      try {
        localStorage.setItem(KEY, on ? "1" : "0");
      } catch (e) {
        /* private mode — the toggle just won't persist */
      }
      apply();
    },
  };

  // Another tab changing the setting should be reflected here too.
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) apply();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply);
  } else {
    apply();
  }
})();
