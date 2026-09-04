/* Avatars — a small, shared "which little guy is running around" picker.
 *
 * Built for Keyboard Escape (where the avatar IS the player sprite), but kept
 * as its own file with a tiny surface (window.MimiAvatars) so any other game
 * can drop in the same picker later without copying this logic. Nothing here
 * requires a game to opt in — a game that never calls it just never shows the
 * button, exactly like js/keys.js works for games that don't spend keys.
 *
 * Storage follows js/keys.js's pattern on purpose: keyed by whoever is
 * signed in (or "guest"), so two people sharing a device don't inherit each
 * other's pick, and it's read fresh every time rather than cached, so
 * switching accounts mid-session picks up the right avatar immediately.
 */
(function () {
  "use strict";

  const STORE_PREFIX = "mimiAvatar:";
  const listeners = new Set();

  const LIST = [
    { id: "candy", emoji: "🍬", label: "Candy" },
    { id: "lollipop", emoji: "🍭", label: "Lollipop" },
    { id: "cupcake", emoji: "🧁", label: "Cupcake" },
    { id: "donut", emoji: "🍩", label: "Donut" },
    { id: "choc", emoji: "🍫", label: "Choc Bar" },
    { id: "cat", emoji: "🐱", label: "Cat" },
    { id: "dog", emoji: "🐶", label: "Dog" },
    { id: "fox", emoji: "🦊", label: "Fox" },
    { id: "panda", emoji: "🐼", label: "Panda" },
    { id: "frog", emoji: "🐸", label: "Frog" },
    { id: "robot", emoji: "🤖", label: "Robot" },
    { id: "alien", emoji: "👾", label: "Alien" },
    { id: "star", emoji: "⭐", label: "Star" },
    { id: "flame", emoji: "🔥", label: "Flame" },
    { id: "clover", emoji: "🍀", label: "Clover" },
    { id: "octopus", emoji: "🐙", label: "Octopus" },
  ];

  function walletKey() {
    try {
      const session = JSON.parse(localStorage.getItem("mimiActiveSession") || "null");
      return STORE_PREFIX + (session && session.key ? session.key : "guest");
    } catch (e) {
      return STORE_PREFIX + "guest";
    }
  }

  function byId(id) {
    return LIST.find((a) => a.id === id) || LIST[0];
  }

  function currentId() {
    try {
      return localStorage.getItem(walletKey()) || LIST[0].id;
    } catch (e) {
      return LIST[0].id;
    }
  }

  function current() {
    return byId(currentId());
  }

  function set(id) {
    if (!LIST.some((a) => a.id === id)) return;
    try {
      localStorage.setItem(walletKey(), id);
    } catch (e) {
      /* private mode or a full quota — the pick just won't persist */
    }
    const avatar = byId(id);
    listeners.forEach((fn) => {
      try { fn(avatar); } catch (err) { /* one bad listener shouldn't stop the rest */ }
    });
  }

  function openPicker(opts) {
    opts = opts || {};
    const selected = currentId();
    const overlay = document.createElement("div");
    overlay.className = "updates-overlay avatar-overlay";
    overlay.innerHTML = `
      <div class="updates-card" style="max-width:480px">
        <button class="help-close" type="button" aria-label="Close">✕</button>
        <div class="updates-header">
          <span class="updates-emoji">🎭</span>
          <div><h2>${opts.title || "Choose an avatar"}</h2><p class="help-meta">Picked once, used everywhere it fits</p></div>
        </div>
        <div class="updates-list">
          <div class="avatar-grid"></div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector(".help-close").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

    const grid = overlay.querySelector(".avatar-grid");
    LIST.forEach((avatar) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "avatar-opt" + (avatar.id === selected ? " is-selected" : "");
      btn.innerHTML = `<span class="avatar-opt-emoji">${avatar.emoji}</span><span class="avatar-opt-label">${avatar.label}</span>`;
      btn.addEventListener("click", () => {
        set(avatar.id);
        grid.querySelectorAll(".avatar-opt").forEach((el) => el.classList.remove("is-selected"));
        btn.classList.add("is-selected");
        if (opts.onPick) opts.onPick(avatar);
        window.setTimeout(close, 140);
      });
      grid.appendChild(btn);
    });
  }

  window.MimiAvatars = {
    LIST,
    byId,
    current,
    currentEmoji() { return current().emoji; },
    set,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    openPicker,
  };
})();
