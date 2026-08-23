// Shared engine: game registry + helper API given to every mini-game.
// Each game file calls MimiGames.register({...}) to add itself to the menu.
(function () {
  const registry = [];

  function register(def) {
    if (!def || !def.id) throw new Error("Game def needs an id");
    registry.push(def);
  }

  // Server address override — lets a single build (an Android app, a
  // static-hosted preview, anything) point its live API/WebSocket calls at a
  // different backend than the origin it was loaded from, entered by hand in
  // Settings. Exists specifically so an installed app doesn't need to be
  // rebuilt every time the backend's address changes (a home-network IP, a
  // temporary tunnel URL, ...) — the app shell stays the same, only this
  // localStorage value changes, and a reload picks it up. Empty/unset means
  // "use the same origin the page was loaded from", unchanged from before
  // this existed.
  const SERVER_OVERRIDE_KEY = "mimiServerOverride";
  function getServerOverride() {
    try {
      return (localStorage.getItem(SERVER_OVERRIDE_KEY) || "").trim().replace(/\/+$/, "");
    } catch (e) {
      return "";
    }
  }
  function getServerBase() {
    return getServerOverride();
  }
  function getServerWsBase() {
    const base = getServerOverride();
    if (!base) return "";
    return base.replace(/^http/, "ws");
  }

  function shuffle(arr, rng) {
    const r = rng || Math.random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  const SUITS = ["♠", "♥", "♦", "♣"];
  const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

  function newDeck() {
    const deck = [];
    for (const suit of SUITS) {
      for (let i = 0; i < RANKS.length; i++) {
        deck.push({
          suit,
          rank: RANKS[i],
          value: i + 1,
          color: suit === "♥" || suit === "♦" ? "red" : "black",
          id: suit + RANKS[i],
        });
      }
    }
    return deck;
  }
// Create a DOM element for a card. If faceDown is true, the card is shown back-side up.
  function cardEl(card, opts) {
    opts = opts || {};
    const el = document.createElement("div");
    el.className = "playing-card" + (card.color === "red" ? " red" : "") + (opts.faceDown ? " back" : "");
    if (!opts.faceDown) {
      el.innerHTML = `<div>${card.rank}</div><div style="font-size:1.4rem">${card.suit}</div>`;
    }
    if (opts.disabled) el.classList.add("disabled");
    return el;
  }

  function makeStorage(gameId) {
    const prefix = "mimi51:" + gameId + ":";
    return {
      get(key, dflt) {
        try {
          const raw = localStorage.getItem(prefix + key);
          return raw === null ? dflt : JSON.parse(raw);
        } catch (e) {
          return dflt;
        }
      },
      set(key, value) {
        try {
          localStorage.setItem(prefix + key, JSON.stringify(value));
        } catch (e) {
          /* ignore quota errors */
        }
      },
    };
  }

  let audioCtx = null;
  function getAudioCtx() {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  // freq, duration(s), waveform, volume(0-1), startDelay(s)
  function beep(freq, dur, type, volume, delay) {
    try {
      const ac = getAudioCtx();
      const t0 = ac.currentTime + (delay || 0);
      const d = dur || 0.15;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq || 440, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(volume ?? 0.06, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + d + 0.02);
    } catch (e) {
      /* audio not available */
    }
  }

  // Frequency sweep, e.g. for whoosh/slide/power-meter sounds.
  function sweep(freqFrom, freqTo, dur, type, volume, delay) {
    try {
      const ac = getAudioCtx();
      const t0 = ac.currentTime + (delay || 0);
      const d = dur || 0.2;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freqFrom, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), t0 + d);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(volume ?? 0.06, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + d + 0.02);
    } catch (e) {
      /* audio not available */
    }
  }

  // A short melodic sequence: notes = [[freq, dur, type?, volume?], ...] played back to back.
  function chime(notes, gap) {
    let t = 0;
    const g = gap ?? 0.09;
    notes.forEach(([freq, dur, type, volume]) => {
      beep(freq, dur, type, volume, t);
      t += (dur ?? 0.15) * 0.6 + g;
    });
  }

  const SOUND_PRESETS = {
    click: () => beep(520, 0.07, "square", 0.05),
    select: () => beep(660, 0.05, "sine", 0.04),
    tick: () => beep(880, 0.03, "square", 0.03),
    pop: () => beep(900, 0.06, "triangle", 0.06),
    hit: () => beep(180, 0.09, "square", 0.07),
    fail: () => sweep(300, 100, 0.28, "sawtooth", 0.06),
    lose: () => chime([[392, 0.18, "sawtooth"], [349, 0.18, "sawtooth"], [261, 0.32, "sawtooth"]]),
    success: () => chime([[660, 0.1], [880, 0.15]]),
    win: () => chime([[523, 0.11], [659, 0.11], [784, 0.11], [1047, 0.28]]),
    coin: () => chime([[988, 0.08, "square"], [1319, 0.22, "square"]], 0.03),
    notify: () => chime([[784, 0.09], [988, 0.16]], 0.02),
    swoosh: () => sweep(200, 900, 0.18, "sine", 0.05),
    powerUp: () => sweep(220, 1100, 0.35, "triangle", 0.06),
    error: () => { beep(180, 0.12, "square", 0.06); beep(140, 0.16, "square", 0.06, 0.11); },
  };

  function playSound(name) {
    (SOUND_PRESETS[name] || (() => beep(440, 0.1)))();
  }

  function vibrate(ms) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  function makeContext(gameId, statusEl) {
    return {
      shuffle,
      newDeck,
      cardEl,
      storage: makeStorage(gameId),
      playSound,
      tone: { beep, sweep, chime },
      vibrate,
      rng: Math.random,
      setStatus(text) {
        if (statusEl) statusEl.textContent = text || "";
      },
      showOverlay(opts) {
        window.MimiGames.showOverlay(opts);
      },
      confetti(container) {
        confettiBurst(container);
      },
      // Opt-in global leaderboard reporting — silently a no-op when not
      // signed in (leaderboards require an account, same as every other
      // profile-synced feature). The actual networking/session lookup is
      // owned by js/profiles.js, same as every other profile-adjacent
      // action; this is just a thin, convenient pass-through so games don't
      // each need their own copy of that logic.
      reportScore(value, opts) {
        window.MimiProfiles?.submitScore?.(gameId, value, (opts && opts.sortDir) || "desc");
      },
      // Whether the signed-in profile is a real, server-verified dev account
      // (see DEV_SIGNUP_PASSWORD_HASH in server.js — dev signup is
      // password-gated there, not just a client-side checkbox). A shared
      // way for any game to gate its own test/debug tools the same way
      // Kart Circuit's fly/speed cheats do, without each game re-reading
      // localStorage's mimiActiveSession itself.
      isDevProfile() {
        try {
          return Boolean(JSON.parse(localStorage.getItem("mimiActiveSession") || "null")?.dev);
        } catch (e) {
          return false;
        }
      },
      // Drops a small floating "Dev Cheats" panel into a game's own stage —
      // only for a signed-in dev profile (see isDevProfile above), a no-op
      // otherwise. `hacks` is [{ label, run }, ...]; each becomes a button
      // that calls run(buttonEl) on click — buttonEl is that same button,
      // there for toggle-style hacks that want to flip their own label
      // (e.g. "Invincible: Off" -> "Invincible: On"); one-shot hacks (add
      // score, win instantly, ...) can just ignore the argument. Appended
      // to `root` (the same element init(root, ctx) receives), so it's
      // removed automatically when app.js clears the stage on game close —
      // no cleanup of its own needed. Checked once, at call time — a game
      // should call this near the end of init(), not react to dev status
      // changing mid-session.
      devCheatPanel(root, hacks) {
        if (!this.isDevProfile() || !hacks || !hacks.length) return null;
        const panel = document.createElement("div");
        panel.className = "mimi-dev-cheat-panel";
        const title = document.createElement("p");
        title.className = "mimi-dev-cheat-title";
        title.textContent = "🛠️ Dev Cheats";
        panel.appendChild(title);
        hacks.forEach(({ label, run }) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn";
          btn.textContent = label;
          btn.addEventListener("click", () => run(btn));
          panel.appendChild(btn);
        });
        root.appendChild(panel);
        return panel;
      },
    };
  }

  function confettiBurst(container) {
    const colors = ["#ff4757", "#00d2ff", "#35d07f", "#ffd93d", "#a55eea"];
    const host = container || document.body;
    for (let i = 0; i < 24; i++) {
      const p = document.createElement("div");
      const size = 6 + Math.random() * 6;
      p.style.position = "absolute";
      p.style.left = 50 + (Math.random() * 60 - 30) + "%";
      p.style.top = "20%";
      p.style.width = size + "px";
      p.style.height = size + "px";
      p.style.background = colors[i % colors.length];
      p.style.borderRadius = "2px";
      p.style.pointerEvents = "none";
      p.style.transition = "transform 1s ease-out, opacity 1s ease-out";
      p.style.zIndex = 50;
      host.appendChild(p);
      requestAnimationFrame(() => {
        p.style.transform = `translate(${Math.random() * 200 - 100}px, ${200 + Math.random() * 150}px) rotate(${Math.random() * 360}deg)`;
        p.style.opacity = "0";
      });
      setTimeout(() => p.remove(), 1100);
    }
  }

  window.MimiGames = {
    register,
    getAll: () => registry.slice(),
    shuffle,
    newDeck,
    cardEl,
    makeContext,
    playSound,
    vibrate,
    getServerBase,
    getServerWsBase,
    showOverlay(opts) {
      const overlay = document.getElementById("overlay");
      document.getElementById("overlayTitle").textContent = opts.title || "";
      document.getElementById("overlaySubtitle").textContent = opts.subtitle || "";
      const btn = document.getElementById("overlayBtn");
      btn.textContent = opts.buttonText || "Play Again";
      overlay.classList.remove("hidden");
      btn.onclick = () => {
        overlay.classList.add("hidden");
        if (opts.onButton) opts.onButton();
      };
    },
  };
})();
