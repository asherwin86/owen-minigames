/* Graphics quality — one hub-wide setting the 3D games read.
 *
 * The three heavy games each used to hard-code their own resolution cap and
 * draw distance, tuned for the weakest machine anyone might use. That leaves a
 * capable PC rendering at half the pixels it could for no reason, and gives
 * someone on a laptop no way to turn anything down.
 *
 * Deliberately three coarse steps rather than a pile of sliders: pixel ratio
 * and draw distance are the two knobs that actually move the frame rate, and
 * everything else is noise next to them.
 */
(function () {
  "use strict";

  const KEY = "mimiGfx";
  const LEVELS = {
    balanced: { label: "Balanced", desc: "Lowest load — for older machines", dpr: 1, view: 2, shadows: false },
    high: { label: "High", desc: "The default", dpr: 1.5, view: 3, shadows: false },
    ultra: { label: "Ultra", desc: "Full resolution and draw distance", dpr: 2, view: 5, shadows: true },
  };

  function level() {
    try {
      const v = localStorage.getItem(KEY);
      return LEVELS[v] ? v : "high";
    } catch (e) {
      return "high";
    }
  }

  window.MimiGfx = {
    LEVELS,
    level,
    settings() { return LEVELS[level()]; },
    /* What a renderer should pass to setPixelRatio: the level's cap, still
     * bounded by the display's own ratio, since rendering above it is pure
     * waste. */
    pixelRatio() { return Math.min(window.devicePixelRatio || 1, LEVELS[level()].dpr); },
    viewDistance() { return LEVELS[level()].view; },
    setLevel(next) {
      if (!LEVELS[next]) return;
      try { localStorage.setItem(KEY, next); } catch (e) { /* private mode */ }
    },
  };
})();
