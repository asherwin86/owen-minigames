/* Ads for the hub: a banner under the game grid, a video ad between games, and an optional "watch a video, get keys" button.
 *
 * Nothing here does anything unless the server says so. GET /api/ads-config answers provider "off" by default (see "Ads." in
 * server.js for the settings), and the static GitHub Pages copy has no server at all, so on both the page stays exactly as it was.
 *
 * Design rules, because this is a kids' games site:
 *  - Nothing from an ad network is loaded until the visitor has said yes in the notice below. "No thanks" means no requests to them at all.
 *  - Child-directed treatment and non-personalised ads are ON unless the owner turns them off (MIMI_ADS_CHILD_DIRECTED=0).
 *  - No ads while a game is being played. The video ad runs after you close a game (every Nth close, never closer than a minimum gap), and the
 *    rewarded video only ever runs because the player pressed its button.
 *  - "Ad choices" under the banner takes the choice back.
 *
 * Providers: "adsense" (Google AdSense for the banner, and its H5 Games Ads API, adBreak(), for the video ads) and "demo" (labelled fake
 * ads drawn locally, so the whole flow can be seen and tested without an ad account). */
(function () {
  "use strict";

  const CONSENT_KEY = "mimiAdsConsent";   // "yes" | "no"; absent = not asked yet
  const REWARD_KEY = "mimiAdsRewards";    // { day: "YYYY-MM-DD", count: n }: rewarded videos watched today

  let cfg = null;
  let active = false;                     // consent given and a provider set up
  let closes = 0;                         // games closed this visit
  let lastAdAt = Date.now();              // so the first ad can't appear within minSeconds of arriving
  let adsenseLoaded = false;
  const reward = { show: null, asked: false, listeners: new Set() };   // the AdSense "play the rewarded ad now" callback, once one is ready

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode: the choice just won't be remembered */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* same */ } },
  };

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  const today = () => new Date().toLocaleDateString("en-CA");   // YYYY-MM-DD in the player's own time zone

  function rewardsLeft() {
    let rec = null;
    try { rec = JSON.parse(store.get(REWARD_KEY) || "null"); } catch (e) { rec = null; }
    const used = rec && rec.day === today() ? Number(rec.count) || 0 : 0;
    return Math.max(0, cfg.rewardDailyMax - used);
  }

  function grantReward() {
    if (rewardsLeft() <= 0 || !window.MimiKeys || !window.MimiKeys.add) return false;
    let rec = null;
    try { rec = JSON.parse(store.get(REWARD_KEY) || "null"); } catch (e) { rec = null; }
    const count = (rec && rec.day === today() ? Number(rec.count) || 0 : 0) + 1;
    store.set(REWARD_KEY, JSON.stringify({ day: today(), count }));
    window.MimiKeys.add(cfg.rewardKeys);
    const toast = el("div", "keys-toast", `\u{1F511} +${cfg.rewardKeys} keys — thanks for watching!`);
    document.body.appendChild(toast);
    window.setTimeout(() => toast.classList.add("is-in"), 20);
    window.setTimeout(() => { toast.classList.remove("is-in"); window.setTimeout(() => toast.remove(), 400); }, 4200);
    return true;
  }

  // the hub's background music stops while an ad plays
  const pauseHub = () => { try { window.MimiHubAudio && window.MimiHubAudio.setInGame(true); } catch (e) { /* no audio */ } };
  const resumeHub = () => { try { window.MimiHubAudio && window.MimiHubAudio.setInGame(false); } catch (e) { /* no audio */ } };

  /* ------------------------------------------------------------------ demo provider */

  /* A fake "video" ad: a few seconds of moving shapes on a canvas, clearly labelled. Interstitials can be skipped after three seconds;
   * a rewarded one must be watched to the end (closing it early gives no reward). Resolves "viewed", "skipped" or "dismissed". */
  function demoAd(rewarded) {
    return new Promise((resolve) => {
      const total = rewarded ? 6 : 5, skipAt = rewarded ? Infinity : 3;
      const overlay = el("div", "mimi-ad-overlay");
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "Advertisement (demo)");
      const card = el("div", "mimi-ad-card");
      const label = el("div", "mimi-ad-label", "Ad · demo");
      const canvas = el("canvas", "mimi-ad-canvas");
      canvas.width = 480; canvas.height = 270;
      const foot = el("div", "mimi-ad-foot");
      const status = el("span", "mimi-ad-status", "");
      const btn = el("button", "mimi-ad-btn", rewarded ? "Close (no reward)" : "Skip");
      btn.type = "button";
      btn.hidden = !rewarded;
      foot.append(status, btn);
      card.append(label, canvas, foot);
      overlay.appendChild(card);
      document.body.appendChild(overlay);

      const g = canvas.getContext("2d");
      const started = performance.now();
      let raf = 0, finished = false;
      const finish = (result) => {
        if (finished) return;
        finished = true;
        cancelAnimationFrame(raf);
        document.removeEventListener("keydown", onKey, true);
        overlay.remove();
        resolve(result);
      };
      const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); if (rewarded) finish("dismissed"); else if ((performance.now() - started) / 1000 >= skipAt) finish("skipped"); } };
      document.addEventListener("keydown", onKey, true);
      btn.addEventListener("click", () => finish(rewarded ? "dismissed" : "skipped"));

      const frame = (now) => {
        const t = (now - started) / 1000;
        if (t >= total) { finish("viewed"); return; }
        g.fillStyle = `hsl(${(t * 40) % 360}, 60%, 24%)`;
        g.fillRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < 6; i++) {
          g.fillStyle = `hsla(${(i * 60 + t * 90) % 360}, 80%, 60%, .8)`;
          g.beginPath();
          g.arc(80 + i * 64 + Math.sin(t * 2 + i) * 30, 135 + Math.cos(t * 3 + i) * 70, 26 + (i % 3) * 8, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = "#fff";
        g.font = "bold 26px sans-serif";
        g.textAlign = "center";
        g.fillText("Your video ad here", canvas.width / 2, 138);
        g.fillStyle = "rgba(255,255,255,.35)";
        g.fillRect(0, canvas.height - 6, canvas.width * (t / total), 6);
        const left = Math.ceil(total - t);
        status.textContent = rewarded ? `Reward in ${left}s` : (t >= skipAt ? "You can skip now" : `Skip in ${Math.ceil(skipAt - t)}s`);
        if (!rewarded && t >= skipAt) btn.hidden = false;
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      card.tabIndex = -1;
      (btn.hidden ? card : btn).focus();
    });
  }

  /* ------------------------------------------------------------------ AdSense provider */

  function loadAdsense() {
    if (adsenseLoaded) return;
    adsenseLoaded = true;
    window.adsbygoogle = window.adsbygoogle || [];
    // Google's H5 Games Ads API: adBreak()/adConfig() just queue their arguments until the library has loaded.
    window.adBreak = window.adConfig = function (options) { window.adsbygoogle.push(options); };
    if (cfg.childDirected) window.adsbygoogle.requestNonPersonalizedAds = 1;
    const s = document.createElement("script");
    s.async = true;
    s.crossOrigin = "anonymous";
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(cfg.client);
    s.setAttribute("data-ad-frequency-hint", Math.max(30, cfg.minSeconds) + "s");
    if (cfg.test) s.setAttribute("data-adbreak-test", "on");
    if (cfg.childDirected) s.setAttribute("data-tag-for-child-directed-treatment", "1");
    document.head.appendChild(s);
    window.adConfig({ preloadAdBreaks: "on", sound: "on", onReady: function () {} });
  }

  // Asks AdSense for a rewarded video; when one is ready it hands us a function that plays it. Called when the keys panel opens, not at page load.
  function prepareReward() {
    reward.asked = true;
    reward.show = null;
    window.adBreak({
      type: "reward",
      name: "bonus-keys",
      beforeAd: pauseHub,
      afterAd: resumeHub,
      beforeReward: function (showAdFn) { reward.show = showAdFn; refreshRewardButtons(); },
      adViewed: function () { grantReward(); },
      adDismissed: function () {},
      adBreakDone: function (info) {
        reward.show = null;
        refreshRewardButtons();
        const viewed = info && info.breakStatus === "viewed";
        window.setTimeout(prepareReward, viewed ? 2000 : 30000);   // line up the next one; wait longer if there was nothing to show
      },
    });
  }

  /* ------------------------------------------------------------------ banner, notice, rewarded button */

  function renderBanner() {
    const host = document.getElementById("adBanner");
    if (!host) return;
    host.textContent = "";
    if (cfg.provider === "demo") {
      host.appendChild(el("div", "ad-demo-banner", "Advertisement (demo): your banner ad would be here"));
    } else if (cfg.provider === "adsense" && cfg.bannerSlot) {
      const ins = el("ins", "adsbygoogle");
      ins.style.display = "block";
      ins.setAttribute("data-ad-client", cfg.client);
      ins.setAttribute("data-ad-slot", cfg.bannerSlot);
      ins.setAttribute("data-ad-format", "horizontal");
      ins.setAttribute("data-full-width-responsive", "true");
      if (cfg.test) ins.setAttribute("data-adtest", "on");
      host.appendChild(ins);
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* the library isn't there (blocked): leave the space empty */ }
    } else {
      return;                                       // video ads only: no banner space
    }
    const choices = el("button", "ad-choices", "Ad choices");
    choices.type = "button";
    choices.addEventListener("click", () => {
      store.del(CONSENT_KEY);
      location.reload();                            // reload so nothing from an ad network stays loaded while the question is asked again
    });
    host.appendChild(choices);
    host.hidden = false;
    host.classList.remove("hidden");
  }

  function showNotice() {
    if (document.getElementById("adConsent")) return;
    const bar = el("div", "ad-consent");
    bar.id = "adConsent";
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-label", "Ads");
    const text = el("p", "ad-consent-text");
    text.append("This site can show ads, which help pay for it. They are set up for children's content (not personalised). ");
    const link = el("a", "", "Privacy");
    link.href = "/privacy.html";
    link.target = "_blank";
    link.rel = "noopener";
    text.appendChild(link);
    const yes = el("button", "ad-consent-yes", "Show ads");
    const no = el("button", "ad-consent-no", "No thanks");
    yes.type = no.type = "button";
    const decide = (choice) => {
      store.set(CONSENT_KEY, choice);
      bar.remove();
      if (choice === "yes") activate();
    };
    yes.addEventListener("click", () => decide("yes"));
    no.addEventListener("click", () => decide("no"));
    bar.append(text, yes, no);
    document.body.appendChild(bar);
  }

  function refreshRewardButtons() { reward.listeners.forEach((fn) => fn()); }

  /* Puts the "watch a video, get keys" control into `host` (the keys panel calls this). Does nothing while ads are inactive. */
  function mountReward(host) {
    if (!host || !active) return;
    host.textContent = "";
    const btn = el("button", "ads-reward-btn");
    btn.type = "button";
    const note = el("p", "ads-reward-note", "Ads are optional. Watching one is a way to earn keys; you can turn ads off with Ad choices on the game menu.");
    host.append(btn, note);

    const refresh = () => {
      if (!host.isConnected) { reward.listeners.delete(refresh); return; }
      const left = rewardsLeft();
      if (left <= 0) { btn.disabled = true; btn.textContent = "▶ More videos tomorrow"; }
      else if (cfg.provider === "adsense" && !reward.show) { btn.disabled = true; btn.textContent = "▶ Looking for a video…"; }
      else { btn.disabled = false; btn.textContent = `▶ Watch a short video: +${cfg.rewardKeys} keys (${left} left today)`; }
    };
    reward.listeners.add(refresh);
    refresh();
    if (cfg.provider === "adsense" && !reward.asked) prepareReward();

    btn.addEventListener("click", async () => {
      if (btn.disabled) return;
      if (cfg.provider === "demo") {
        btn.disabled = true;
        pauseHub();
        const result = await demoAd(true);
        resumeHub();
        if (result === "viewed") grantReward();
        refreshRewardButtons();
      } else if (reward.show) {
        const play = reward.show;
        reward.show = null;
        refreshRewardButtons();
        play();
      }
    });
  }

  /* ------------------------------------------------------------------ between games */

  async function showInterstitial() {
    if (!active) return;
    lastAdAt = Date.now();
    if (cfg.provider === "demo") {
      pauseHub();
      await demoAd(false);
      resumeHub();
    } else if (cfg.provider === "adsense" && typeof window.adBreak === "function") {
      window.adBreak({ type: "next", name: "after-game", beforeAd: pauseHub, afterAd: resumeHub, adBreakDone: function () {} });
    }
  }

  document.addEventListener("mimi:gameclose", () => {
    if (!active) return;
    closes += 1;
    if (closes % cfg.every !== 0) return;
    if (Date.now() - lastAdAt < cfg.minSeconds * 1000) return;
    showInterstitial();
  });

  /* ------------------------------------------------------------------ start-up */

  function activate() {
    if (active) return;
    active = true;
    if (cfg.provider === "adsense") loadAdsense();
    renderBanner();
    document.dispatchEvent(new CustomEvent("mimi:adsready"));
  }

  async function init() {
    if (window.MIMI_STATIC_MODE === true) return;
    let data = null;
    try {
      const base = (window.MimiGames && window.MimiGames.getServerBase && window.MimiGames.getServerBase()) || "";
      const res = await fetch(base + "/api/ads-config", { cache: "no-store" });
      if (res.ok) data = await res.json();
    } catch (e) { /* no server, or it is down: no ads */ }
    if (!data || !data.ok || (data.provider !== "adsense" && data.provider !== "demo")) return;
    cfg = data;
    const choice = store.get(CONSENT_KEY);
    if (choice === "yes") activate();
    else if (choice !== "no") showNotice();
  }

  window.MimiAds = {
    isActive: () => active,
    config: () => cfg,
    mountReward,
    showInterstitial,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
