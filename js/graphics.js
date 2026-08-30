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

  /* Frame-rate cap.
   *
   * 0 means uncapped. Worth being straight about what that gets you: the games
   * draw on requestAnimationFrame, which the browser already ties to your
   * monitor's refresh, so "unlimited" means "we add no cap of our own" and your
   * display is still the ceiling. Rendering past it would burn CPU on frames
   * nobody ever sees.
   *
   * A cap is still genuinely useful in the other direction — holding a heavy
   * game to 30 keeps a laptop cool and quiet, and a steady 30 feels better than
   * an unstable 45. */
  const FPS_LIMITS = [
    { id: "30", label: "30", value: 30, desc: "Coolest and quietest" },
    { id: "60", label: "60", value: 60, desc: "Steady on most screens" },
    { id: "120", label: "120", value: 120, desc: "For a high-refresh display" },
    { id: "0", label: "Unlimited", value: 0, desc: "No cap — your display's refresh rate" },
  ];
  const FPS_KEY = "mimiFpsLimit";

  function fpsLimit() {
    try {
      const raw = localStorage.getItem(FPS_KEY);
      const found = FPS_LIMITS.find((l) => l.id === raw);
      return found ? found.value : 0;
    } catch (e) {
      return 0;
    }
  }

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
    FPS_LIMITS,
    fpsLimit,
    fpsLimitId() {
      try { return localStorage.getItem(FPS_KEY) || "0"; } catch (e) { return "0"; }
    },
    setFpsLimit(id) {
      if (!FPS_LIMITS.some((l) => l.id === id)) return;
      try { localStorage.setItem(FPS_KEY, id); } catch (e) { /* private mode */ }
    },
    /* Each caller gets its own limiter, so two loops running at once can't
     * starve each other by sharing one timestamp. Returns true when this frame
     * should be drawn; the caller must only advance its own clock when it is,
     * or the skipped time goes missing from its delta. */
    makeLimiter() {
      let due = 0;
      return function shouldDraw(now) {
        const limit = fpsLimit();
        if (!limit) { due = 0; return true; }
        const interval = 1000 / limit;
        if (!due) { due = now + interval; return true; }
        // 1 ms of slack absorbs ordinary timer jitter, which would otherwise
        // cost a whole frame at a cap close to the display's own rate.
        if (now + 1 < due) return false;
        // Advance the deadline by exactly one interval rather than resetting it
        // to `now`. A naive "has enough time passed since the last frame?" gate
        // can only ever produce integer divisors of the display rate — a 60 cap
        // on a 144 Hz screen measured 48 fps, because two source frames are too
        // soon and it had to wait for the third. Carrying the deadline lets it
        // alternate two and three and average the number actually asked for.
        due += interval;
        // After a stall (alt-tab, a long load) the deadline can fall far behind;
        // without this it would then run unthrottled catching up.
        if (due < now) due = now + interval;
        return true;
      };
    },
    setLevel(next) {
      if (!LEVELS[next]) return;
      try { localStorage.setItem(KEY, next); } catch (e) { /* private mode */ }
    },
  };
})();
