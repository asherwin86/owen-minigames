/* Keys — a hub-wide currency you earn by playing and spend inside games.
 *
 * The rule is deliberately simple and hard to game: play 5 *different* games in
 * a day and you're awarded 10 keys, once. Distinct games rather than a count of
 * launches, because otherwise opening and closing the same game five times
 * would pay out, which rewards nothing anyone would call playing.
 *
 * Where the balance lives: localStorage first, keyed by whoever is signed in,
 * so two people sharing a device don't share a wallet and signing out doesn't
 * hand your keys to a guest. That's still the source of truth for every read
 * and spend — games never wait on the network for it. When signed in, it's
 * *also* backed up to the account (server.js's "sync-keys" profile action,
 * mirroring how avatar/kartColor already follow you) so a new device picks up
 * your real balance instead of starting at zero. The merge always takes
 * whichever side is higher, so it only ever restores a balance, never erases
 * one — the worst case for a determined cheat is still just giving themselves
 * a bigger number in their own browser, same as before; the backup doesn't
 * change that trust model, it just means losing your browser data no longer
 * loses your keys too.
 *
 * Games use it through the tiny surface at the bottom (window.MimiKeys); the
 * hub uses the same one to draw the dock button.
 */
(function () {
  "use strict";

  const STORE_PREFIX = "mimiKeys:";
  const DAILY_TARGET = 5;   // distinct games in a day…
  const DAILY_REWARD = 10;  // …pays this many keys
  // Kept in sync by hand with MAX_KEYS_BALANCE in server.js — see that
  // constant's comment for why. Clamped here too so a huge/bogus value never
  // even reaches localStorage, let alone the network.
  const MAX_BALANCE = 1000000;

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

  function session() {
    try {
      return JSON.parse(localStorage.getItem("mimiActiveSession") || "null");
    } catch (e) {
      return null;
    }
  }
  // Same dev test the rest of the hub uses: a real, server-verified dev
  // account (dev signup is password-gated in server.js), not a client-side
  // checkbox anyone could tick.
  function isDev() {
    return Boolean(session() && session().dev);
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
    publish(state.balance);
    listeners.forEach((fn) => {
      try { fn(state.balance); } catch (err) { /* one bad listener shouldn't stop the rest */ }
    });
    syncToServer(state.balance);
  }

  /* Fire-and-forget backup to the signed-in account. Never awaited by a
   * caller and never throws outward — a failed sync just means the balance
   * stays local-only until the next successful one, same as any other
   * best-effort background sync in this hub. Takes the merged (higher-of-
   * both) balance the server hands back and folds it into localStorage too,
   * so a device that's behind (e.g. just signed in fresh) catches up. */
  function syncToServer(localBalance) {
    if (!window.MimiProfiles?.isSignedIn?.()) return;
    window.MimiProfiles.syncKeys(localBalance).then((res) => {
      if (!res || !res.ok || typeof res.balance !== "number") return;
      if (res.balance === localBalance) return;
      const state = read();
      if (state.balance === res.balance) return;
      state.balance = res.balance;
      try { localStorage.setItem(walletKey(), JSON.stringify(state)); } catch (e) { /* ignore */ }
      publish(state.balance);
      listeners.forEach((fn) => {
        try { fn(state.balance); } catch (err) { /* one bad listener shouldn't stop the rest */ }
      });
    }).catch(() => { /* offline or server unreachable — try again next write */ });
  }

  /* The keys leaderboard rides on the hub's existing leaderboard system rather
   * than a new API: profiles.js already has a submit/read pair backed by the
   * server, and "keys" is just another board id to it. Silently a no-op when
   * nobody's signed in, exactly like every other leaderboard here. */
  const BOARD_ID = "keys";
  let lastPublished = null;
  function publish(balance) {
    if (balance === lastPublished) return;
    lastPublished = balance;
    window.MimiProfiles?.submitScore?.(BOARD_ID, balance, "desc");
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
    /* Dev only. Guarded here as well as in the UI, because a function that
     * rewrites the balance shouldn't be callable from the console by anyone who
     * happens to find it. */
    devSet(amount) {
      if (!isDev()) return false;
      const state = read();
      const next = Math.min(MAX_BALANCE, Math.max(0, Math.floor(amount) || 0));
      if (next > state.balance) state.earned += next - state.balance;
      state.balance = next;
      write(state);
      // devSet can lower a balance (the "Clear"/"Set" buttons), and the
      // regular sync in write() only ever merges upward — so a deliberate
      // decrease needs its own force-set call, or the next sync would just
      // pull the old higher server value straight back down to overwrite it.
      window.MimiProfiles?.devSetKeys?.(next).catch?.(() => {});
      return true;
    },
    isDev,
    add(amount) {
      const state = read();
      state.balance = Math.min(MAX_BALANCE, state.balance + Math.max(0, Math.floor(amount)));
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
      <div class="updates-card" style="max-width:540px">
        <button class="help-close" type="button" aria-label="Close">\u2715</button>
        <div class="updates-header">
          <span class="updates-emoji">\u{1F511}</span>
          <div><h2>Keys</h2><p class="help-meta">Earn them by playing, spend them in games</p></div>
        </div>
        <div class="updates-list">
          <div class="keys-balance"><span>${p.balance}</span> keys</div>
          <div class="keys-quest">
            <p class="keys-quest-title">Daily play bonus</p>
            <p class="keys-quest-sub">Play ${p.target} different games in a day for ${p.reward} keys.</p>
            <div class="keys-bar"><i style="width:${Math.min(100, (p.played / p.target) * 100)}%"></i></div>
            <p class="keys-quest-state">${p.awarded
              ? `\u2705 Claimed today \u2014 come back tomorrow for ${p.reward} more.`
              : `${p.played} of ${p.target} games played today.`}</p>
          </div>
          <p class="keys-note">Spend keys in <strong>Rival Arena</strong> to open crates and unlock weapon skins. More games will take them later.</p>
          <div class="keys-board">
            <p class="keys-quest-title">\u{1F3C6} Top key holders</p>
            <div class="keys-board-body"><p class="profile-status">Loading\u2026</p></div>
          </div>
          <div class="keys-dev"></div>
          <p class="keys-note keys-note-dim">Earned all-time: ${p.earned} \u00b7 Spent: ${p.spent}</p>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector(".help-close").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

    renderBoard(overlay.querySelector(".keys-board-body"));
    renderDevTools(overlay.querySelector(".keys-dev"), overlay);
  }

  /* The board is the hub's ordinary leaderboard system read back under the
   * "keys" id — so it needs an account and a server, and says so plainly rather
   * than showing an empty list when neither is available. */
  async function renderBoard(host) {
    if (!host) return;
    if (!window.MimiProfiles?.getLeaderboardTop) {
      host.innerHTML = "";
      const note = document.createElement("p");
      note.className = "profile-note";
      note.textContent = "Leaderboards need the full hosted version.";
      host.appendChild(note);
      return;
    }
    const mine = window.MimiProfiles.getSessionKey?.();
    const result = await window.MimiProfiles.getLeaderboardTop(BOARD_ID, 20);
    host.innerHTML = "";
    if (!result || !result.ok) {
      const note = document.createElement("p");
      note.className = "profile-note";
      note.textContent = mine ? "Couldn't load the board right now." : "Sign in to appear on the board.";
      host.appendChild(note);
      return;
    }
    if (!result.entries.length) {
      const note = document.createElement("p");
      note.className = "profile-note";
      note.textContent = "Nobody's on this board yet \u2014 be the first.";
      host.appendChild(note);
      return;
    }
    result.entries.forEach((entry, i) => {
      const row = document.createElement("div");
      row.className = "keys-row" + (entry.key === mine ? " is-me" : "");
      const rank = document.createElement("span");
      rank.className = "keys-rank";
      rank.textContent = ["\u{1F947}", "\u{1F948}", "\u{1F949}"][i] || `${i + 1}`;
      const name = document.createElement("strong");
      name.textContent = entry.name || "Player";
      const score = document.createElement("span");
      score.className = "keys-score";
      score.textContent = `\u{1F511} ${entry.score}`;
      row.append(rank, name, score);
      host.appendChild(row);
    });
  }

  /* Dev tools. Only a real, server-verified dev account sees these — the same
   * gate Kart Circuit's cheats and the hub's admin panel use. They exist so the
   * crate economy can be exercised without grinding five games a day first. */
  function renderDevTools(host, overlay) {
    if (!host || !isDev()) return;
    host.innerHTML = `
      <p class="keys-quest-title">\u{1F6E0}\uFE0F Dev tools</p>
      <p class="keys-quest-sub">Only you can see this \u2014 it's gated on a verified dev account.</p>
      <div class="keys-dev-row">
        <input type="number" min="0" step="1" value="${window.MimiKeys.balance()}" aria-label="Set key balance" />
        <button type="button" class="btn" data-act="set">Set</button>
        <button type="button" class="btn" data-act="give">+25</button>
        <button type="button" class="btn" data-act="zero">Clear</button>
      </div>`;
    const input = host.querySelector("input");
    const refresh = () => {
      input.value = window.MimiKeys.balance();
      const b = overlay.querySelector(".keys-balance span");
      if (b) b.textContent = window.MimiKeys.balance();
      renderBoard(overlay.querySelector(".keys-board-body"));
    };
    host.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const act = btn.dataset.act;
        if (act === "set") window.MimiKeys.devSet(Number(input.value) || 0);
        if (act === "give") window.MimiKeys.devSet(window.MimiKeys.balance() + 25);
        if (act === "zero") window.MimiKeys.devSet(0);
        refresh();
      });
    });
  }

  function syncButton() {
    const btn = document.getElementById("keysBtn");
    if (btn) btn.textContent = `🔑 ${read().balance}`;
  }

  // Detects a sign-in (or a switch between accounts) and pulls the backed-up
  // balance down right away, rather than waiting for the next local write to
  // happen to trigger a sync. Polled alongside syncButton below rather than
  // on its own event, since nothing in this hub currently fires one for
  // "sign-in changed" — see profiles.js.
  let lastSyncedWallet = null;
  function checkSignIn() {
    const wallet = walletKey();
    if (wallet === lastSyncedWallet) return;
    lastSyncedWallet = wallet;
    if (window.MimiProfiles?.isSignedIn?.()) syncToServer(read().balance);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("keysBtn");
    checkSignIn();
    if (!btn) return;
    btn.addEventListener("click", openPanel);
    syncButton();
    window.MimiKeys.onChange(syncButton);
    // The wallet follows whoever is signed in, and profiles.js can change that
    // at any time from its own panel — so re-read rather than assuming the
    // balance only moves when this file moves it.
    window.setInterval(() => { syncButton(); checkSignIn(); }, 4000);
  });
})();
