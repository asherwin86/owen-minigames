/* Keys — a hub-wide currency you earn by playing and spend inside games.
 *
 * The rule is deliberately simple and hard to game: play 5 *different* games in
 * a day and you're awarded 10 keys, once. Distinct games rather than a count of
 * launches, because otherwise opening and closing the same game five times
 * would pay out, which rewards nothing anyone would call playing.
 *
 * Where the balance lives: localStorage, keyed by whoever is signed in, so two
 * people sharing a device don't share a wallet and signing out doesn't hand
 * your keys to a guest. It is deliberately NOT on the server — keys unlock
 * cosmetics in a single-player game, so the worst case for a determined cheat
 * is that they give themselves skins in their own browser. Putting it behind an
 * account would mean an API, a rate limiter and a migration, for that.
 *
 * Games use it through the tiny surface at the bottom (window.MimiKeys); the
 * hub uses the same one to draw the dock button.
 */
(function () {
  "use strict";

  const STORE_PREFIX = "mimiKeys:";
  const DAILY_TARGET = 5;   // distinct games in a day…
  const DAILY_REWARD = 10;  // …pays this many keys

  const listeners = new Set();

  // Which wallet to use. Signing in switches wallets rather than merging them;
  // a guest gets their own. profiles.js owns this session object — read it
  // rather than duplicating the sign-in logic.
  function walletKey() {
    try {
      const session = JSON.parse(localStorage.getItem("mimiActiveSession") || "null");
      return STORE_PREFIX + (session && session.key ? session.key : "guest");
    } catch (e) {
      return STORE_PREFIX + "guest";
    }
  }

  function today() {
    // Local date, not UTC: "a day" should mean the player's day, so the reward
    // resets overnight where they are rather than at some hour of the afternoon.
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  function blank() {
    return { balance: 0, day: today(), played: [], awarded: false, spent: 0, earned: 0 };
  }

  function read() {
    let state;
    try {
      state = JSON.parse(localStorage.getItem(walletKey()) || "null");
    } catch (e) {
      state = null;
    }
    if (!state || typeof state.balance !== "number") state = blank();
    // A new day resets the quest but never the balance.
    if (state.day !== today()) {
      state.day = today();
      state.played = [];
      state.awarded = false;
    }
    if (!Array.isArray(state.played)) state.played = [];
    return state;
  }

  function write(state) {
    try {
      localStorage.setItem(walletKey(), JSON.stringify(state));
    } catch (e) {
      /* private mode or a full quota — the game still plays, you just don't
         accumulate keys, which is better than throwing mid-match */
    }
    listeners.forEach((fn) => {
      try { fn(state.balance); } catch (err) { /* one bad listener shouldn't stop the rest */ }
    });
  }

  /* Called when a game is opened. Returns the number of keys just awarded, so
   * the caller can say something about it. */
  function recordPlay(gameId) {
    if (!gameId) return 0;
    const state = read();
    if (state.played.includes(gameId)) { write(state); return 0; }
    state.played.push(gameId);
    let awarded = 0;
    if (!state.awarded && state.played.length >= DAILY_TARGET) {
      state.awarded = true;
      state.balance += DAILY_REWARD;
      state.earned += DAILY_REWARD;
      awarded = DAILY_REWARD;
    }
    write(state);
    return awarded;
  }

  window.MimiKeys = {
    DAILY_TARGET,
    DAILY_REWARD,
    balance() { return read().balance; },
    /* How far through today's quest you are, for the hub panel. */
    progress() {
      const state = read();
      return {
        played: state.played.length,
        target: DAILY_TARGET,
        awarded: state.awarded,
        reward: DAILY_REWARD,
        balance: state.balance,
        earned: state.earned,
        spent: state.spent,
      };
    },
    /* Returns false and changes nothing when you can't afford it, so callers
     * can branch on the result instead of checking the balance separately and
     * racing themselves. */
    spend(amount) {
      const cost = Math.max(0, Math.floor(amount));
      const state = read();
      if (state.balance < cost) return false;
      state.balance -= cost;
      state.spent += cost;
      write(state);
      return true;
    },
    add(amount) {
      const state = read();
      state.balance += Math.max(0, Math.floor(amount));
      state.earned += Math.max(0, Math.floor(amount));
      write(state);
      return state.balance;
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    recordPlay,
  };

  /* js/app.js fires this every time a game opens; listening for it means the
   * quest works for all 86 games without any of them knowing keys exist. */
  document.addEventListener("mimi:gameopen", (event) => {
    const id = event.detail && event.detail.id;
    const awarded = recordPlay(id);
    if (awarded) {
      window.MimiKeys.notifyAward(awarded);
    }
  });

  /* A small toast, because earning something with no acknowledgement feels like
   * nothing happened. Built here rather than in app.js so the whole feature —
   * rule, wallet, UI — lives in one file. */
  window.MimiKeys.notifyAward = function notifyAward(amount) {
    const toast = document.createElement("div");
    toast.className = "keys-toast";
    toast.textContent = `🔑 +${amount} keys — daily play bonus!`;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.classList.add("is-in"), 20);
    window.setTimeout(() => {
      toast.classList.remove("is-in");
      window.setTimeout(() => toast.remove(), 400);
    }, 4200);
  };

  /* ------------------------------------------------------------ the hub panel */
  function openPanel() {
    const p = window.MimiKeys.progress();
    const overlay = document.createElement("div");
    overlay.className = "updates-overlay keys-overlay";
    overlay.innerHTML = `
      <div class="updates-card" style="max-width:520px">
        <button class="help-close" type="button" aria-label="Close">✕</button>
        <div class="updates-header">
          <span class="updates-emoji">🔑</span>
          <div><h2>Keys</h2><p class="help-meta">Earn them by playing, spend them in games</p></div>
        </div>
        <div class="updates-list">
          <div class="keys-balance"><span>${p.balance}</span> keys</div>
          <div class="keys-quest">
            <p class="keys-quest-title">Daily play bonus</p>
            <p class="keys-quest-sub">Play ${p.target} different games in a day for ${p.reward} keys.</p>
            <div class="keys-bar"><i style="width:${Math.min(100, (p.played / p.target) * 100)}%"></i></div>
            <p class="keys-quest-state">${p.awarded
              ? `✅ Claimed today — come back tomorrow for ${p.reward} more.`
              : `${p.played} of ${p.target} games played today.`}</p>
          </div>
          <p class="keys-note">Spend keys in <strong>Rival Arena</strong> to open crates and unlock weapon skins. More games will take them later.</p>
          <p class="keys-note keys-note-dim">Earned all-time: ${p.earned} · Spent: ${p.spent}</p>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector(".help-close").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  }

  function syncButton() {
    const btn = document.getElementById("keysBtn");
    if (btn) btn.textContent = `🔑 ${read().balance}`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("keysBtn");
    if (!btn) return;
    btn.addEventListener("click", openPanel);
    syncButton();
    window.MimiKeys.onChange(syncButton);
    // The wallet follows whoever is signed in, and profiles.js can change that
    // at any time from its own panel — so re-read rather than assuming the
    // balance only moves when this file moves it.
    window.setInterval(syncButton, 4000);
  });
})();
