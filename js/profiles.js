// Profiles: name + password accounts that back up your settings (gamepad
// cursor prefs, gamepad button mapping, Kart Circuit preferences) so
// multiple people sharing this hub can each keep their own setup — and sign
// in from any device on the same network, not just the browser that created
// the profile. Stored server-side (server.js, data/profiles.json), not a
// real account system: passwords are hashed before they ever leave the
// browser. Enough to stop a sibling from messing with your settings, not
// enough for anything that actually matters.
(function () {
  const SESSION_KEY = "mimiActiveSession";
  // A configured Server address override (Settings) means there's a real
  // backend to talk to even when the page itself was loaded from the
  // static GitHub Pages preview — without this check, that override would
  // correctly redirect the actual fetch/WebSocket calls but every one of
  // these gates would still show the "needs the full hosted version"
  // notice regardless, since they only ever checked the hostname.
  const STATIC_MODE = window.MIMI_STATIC_MODE === true && !window.MimiGames?.getServerBase();

  // whitelist of localStorage keys considered "settings" — extend this list
  // as more games grow persisted preferences worth backing up. Deliberately
  // excludes mimiActiveSession (that's the session itself — circular),
  // mimiLocalRoster/mimiKnownProfileNames (who's signed in on THIS device
  // for split-screen — device-local by nature, syncing it would carry other
  // people's names onto a different device), and mimiUpdatesSeenAt (just
  // "have I seen this changelog entry", not worth carrying between devices).
  const SETTINGS_KEYS = [
    "mimiPadCursor", "kartGamepadMapping", "mimiKartSettings",
    "mimiThemeChoice", "mimiThemeCustom", "mimiHubMusicOn",
    "mimiFavorites", "mimiRecentlyPlayed",
  ];
  // every game's high scores/bests are namespaced "mimi51:<gameId>:<key>"
  // (see makeStorage in js/engine.js) — rather than hand-listing one entry
  // per game per stat here (and having to remember to add a line every time
  // a game gains a new persisted stat), everything under that prefix is
  // swept up automatically.
  const GAME_STORAGE_PREFIX = "mimi51:";

  // Electron never implements window.prompt() (unlike alert()/confirm(),
  // which it does support) — calling it in the packaged desktop app silently
  // returns null with no dialog ever shown (confirmed live: every password
  // prompt below just did nothing). This in-page replacement works
  // identically in a real browser tab and in the packaged app.
  function showTextPrompt(message, { defaultValue = "", password = false } = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "updates-overlay text-prompt-overlay";
      const card = document.createElement("div");
      card.className = "updates-card text-prompt-card";
      const msg = document.createElement("p");
      msg.className = "text-prompt-message";
      msg.textContent = message;
      const input = document.createElement("input");
      input.type = password ? "password" : "text";
      input.value = defaultValue;
      input.autocomplete = "off";
      const actions = document.createElement("div");
      actions.className = "profile-form-actions";
      const okBtn = document.createElement("button");
      okBtn.type = "button";
      okBtn.className = "btn";
      okBtn.textContent = "OK";
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn";
      cancelBtn.textContent = "Cancel";
      actions.append(okBtn, cancelBtn);
      card.append(msg, input, actions);
      overlay.appendChild(card);

      const finish = (value) => {
        document.removeEventListener("keydown", onKeydown, true);
        overlay.remove();
        resolve(value);
      };
      const onKeydown = (e) => {
        if (e.key === "Escape") { e.preventDefault(); finish(null); }
        else if (e.key === "Enter") { e.preventDefault(); finish(input.value); }
      };
      okBtn.addEventListener("click", () => finish(input.value));
      cancelBtn.addEventListener("click", () => finish(null));
      overlay.addEventListener("click", (e) => { if (e.target === overlay) finish(null); });
      document.addEventListener("keydown", onKeydown, true);

      document.body.appendChild(overlay);
      input.focus();
    });
  }

  // names are looked up case-insensitively (so "Anthony" and "anthony" are
  // the same profile — mobile keyboards auto-capitalize inconsistently, and
  // requiring exact case was a real "why can't I sign in" trap) while the
  // originally-typed casing is kept for display
  function keyOf(name) {
    return name.trim().toLowerCase();
  }

  // session = the profile currently signed in on THIS device: {key, passwordHash, name, dev}.
  // The password itself is never stored — only its hash, so this is roughly
  // a "remember me" token rather than a stored plaintext credential.
  function loadSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch (e) {
      return null;
    }
  }
  function saveSession(next) {
    try {
      if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) {
      /* private mode etc. */
    }
  }
  let session = loadSession();

  // Pure-JS SHA-256 (FIPS 180-4) — verified byte-for-byte against Node's
  // crypto.createHash("sha256") across empty/short/multi-block inputs.
  // window.crypto.subtle is only available in secure contexts (https:, or
  // http: to localhost/127.0.0.1 specifically) — a device joining another
  // machine's hub over the LAN does that over plain http:// to that
  // machine's LAN IP, which does NOT qualify, so subtle is undefined
  // there. This used to silently swap in a completely different, much
  // weaker hash in that case (a 32-bit polynomial hash) — same name and
  // password, but a passwordHash that could never match the SHA-256 one
  // the host device (on localhost, a secure context) stored at signup.
  // Confirmed live as the actual cause of "can't sign in on other
  // devices": profiles created before this fix carry a passwordHash from
  // whichever algorithm happened to run at signup, and only match a login
  // computed the exact same way — this makes both paths always produce
  // the same real SHA-256, so it can't happen again, but anyone who hit
  // this needs to recreate their profile once (see the "Forgot password"
  // recovery-code flow if the account has one set up, otherwise sign up
  // fresh) since the mismatched hash from before is already stored server-side.
  function sha256Hex(message) {
    const K = new Uint32Array([
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ]);
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

    const bytes = new TextEncoder().encode(message);
    const bitLen = bytes.length * 8;
    const withOne = bytes.length + 1;
    const padLen = ((withOne + 8 + 63) & ~63) - withOne - 8;
    const total = withOne + padLen + 8;
    const buf = new Uint8Array(total);
    buf.set(bytes, 0);
    buf[bytes.length] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 4, bitLen >>> 0, false);
    dv.setUint32(total - 8, Math.floor(bitLen / 0x100000000), false);

    const w = new Uint32Array(64);
    for (let offset = 0; offset < total; offset += 64) {
      for (let i = 0; i < 16; i += 1) w[i] = dv.getUint32(offset + i * 4, false);
      for (let i = 16; i < 64; i += 1) {
        const s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
        const s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }

      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let i = 0; i < 64; i += 1) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const ch = (e & f) ^ (~e & g);
        const temp1 = (h + S1 + ch + K[i] + w[i]) | 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + temp1) | 0;
        d = c; c = b; b = a; a = (temp1 + temp2) | 0;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    }

    const toHex = (n) => (n >>> 0).toString(16).padStart(8, "0");
    return [h0, h1, h2, h3, h4, h5, h6, h7].map(toHex).join("");
  }

  async function hashPassword(key, password) {
    const payload = "mimiProfile:" + key + ":" + password;
    if (window.crypto?.subtle) {
      try {
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
        return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
      } catch (e) {
        // fall through to the pure-JS path below
      }
    }
    return sha256Hex(payload);
  }

  // --- WebAuthn (passkey) browser-side glue ---
  // The server hands back/expects plain JSON (base64url strings), but the
  // real navigator.credentials API only speaks ArrayBuffers — normally
  // @simplewebauthn/browser handles this conversion, but that's a CDN-hosted
  // frontend dependency, and this hub is meant to work fully offline on a
  // LAN with friends (see "Play Wireless") — not something that should stop
  // working because there's no internet access to fetch a script from. The
  // conversion itself is short enough to just write by hand instead.
  function bufToBase64url(buf) {
    const bytes = new Uint8Array(buf);
    let str = "";
    bytes.forEach((b) => { str += String.fromCharCode(b); });
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function base64urlToBuf(b64url) {
    const pad = (4 - (b64url.length % 4)) % 4;
    const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
    const str = atob(b64);
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i += 1) bytes[i] = str.charCodeAt(i);
    return bytes.buffer;
  }
  function credentialToJSON(credential) {
    const response = credential.response;
    const json = {
      id: credential.id,
      rawId: bufToBase64url(credential.rawId),
      type: credential.type,
      clientExtensionResults: credential.getClientExtensionResults ? credential.getClientExtensionResults() : {},
      response: { clientDataJSON: bufToBase64url(response.clientDataJSON) },
    };
    if (response.attestationObject) {
      // registration
      json.response.attestationObject = bufToBase64url(response.attestationObject);
      if (response.getTransports) json.response.transports = response.getTransports();
    } else {
      // authentication
      json.response.authenticatorData = bufToBase64url(response.authenticatorData);
      json.response.signature = bufToBase64url(response.signature);
      if (response.userHandle) json.response.userHandle = bufToBase64url(response.userHandle);
    }
    return json;
  }
  function webauthnSupported() {
    return Boolean(window.PublicKeyCredential && navigator.credentials);
  }
  async function createPasskey(options) {
    const publicKey = {
      ...options,
      challenge: base64urlToBuf(options.challenge),
      user: { ...options.user, id: base64urlToBuf(options.user.id) },
      excludeCredentials: (options.excludeCredentials || []).map((c) => ({ ...c, id: base64urlToBuf(c.id) })),
    };
    const credential = await navigator.credentials.create({ publicKey });
    return credentialToJSON(credential);
  }
  async function getPasskeyAssertion(options) {
    const publicKey = {
      ...options,
      challenge: base64urlToBuf(options.challenge),
      allowCredentials: (options.allowCredentials || []).map((c) => ({ ...c, id: base64urlToBuf(c.id) })),
    };
    const credential = await navigator.credentials.get({ publicKey });
    return credentialToJSON(credential);
  }

  async function apiCall(action, body, base) {
    if (STATIC_MODE) return { ok: false, msg: "This needs the full hosted version — not available on the static GitHub Pages preview." };
    try {
      const res = await fetch(`${window.MimiGames?.getServerBase() ?? ""}/api/${base || "profiles"}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && !("ok" in data)) return { ok: false, msg: "Server error." };
      return data;
    } catch (e) {
      return { ok: false, msg: "Couldn't reach the hub's server — check your connection." };
    }
  }

  // Friends "who's online" presence — a lightweight always-on connection on
  // the existing /mp relay, opened once per signed-in session (distinct from
  // the per-room sockets Kart Circuit/play-together.js only open while
  // actively hosting/joining a race). No reconnect-on-drop logic for v1: a
  // dropped connection just means "appears offline until the next page
  // load/sign-in," which is an acceptable, honest degradation rather than
  // something worth a reconnect loop for a friends-list nicety.
  let presenceSocket = null;
  function connectPresence() {
    if (!session?.key || !session?.passwordHash) return;
    if (presenceSocket && (presenceSocket.readyState === WebSocket.OPEN || presenceSocket.readyState === WebSocket.CONNECTING)) return;
    const wsBase = window.MimiGames?.getServerWsBase();
    const wsUrl = wsBase ? `${wsBase}/mp` : `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/mp`;
    presenceSocket = new WebSocket(wsUrl);
    presenceSocket.addEventListener("open", () => {
      presenceSocket.send(JSON.stringify({ type: "presence-hello", key: session.key, passwordHash: session.passwordHash }));
    });
  }
  function disconnectPresence() {
    presenceSocket?.close();
    presenceSocket = null;
  }

  function allSettingsKeys() {
    const gameKeys = Object.keys(localStorage).filter((k) => k.startsWith(GAME_STORAGE_PREFIX));
    return SETTINGS_KEYS.concat(gameKeys);
  }
  function snapshotSettings() {
    const snap = {};
    allSettingsKeys().forEach((key) => {
      const raw = localStorage.getItem(key);
      if (raw !== null) snap[key] = raw;
    });
    return snap;
  }
  function applySettings(snap) {
    // the game-scores half of the key list is *itself* derived from
    // whatever's already in localStorage, so a restore has to look at the
    // union of "keys we have locally" and "keys the snapshot brought back" —
    // otherwise a high score this device already set (but the profile's
    // last snapshot predates) would just sit there unrestored-but-not-wiped,
    // which is harmless, but a score that predates a fresh browser profile
    // wouldn't restore at all if we only ever iterated today's local keys.
    const keys = new Set(allSettingsKeys());
    Object.keys(snap || {}).forEach((k) => keys.add(k));
    keys.forEach((key) => {
      if (snap && snap[key] !== undefined) {
        localStorage.setItem(key, snap[key]);
      } else {
        localStorage.removeItem(key);
      }
      // storage events only fire in *other* documents by spec — dispatch one
      // manually so anything listening in this same document (pad-cursor.js)
      // picks up the change immediately instead of needing a reload
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: snap?.[key] ?? null }));
    });
  }

  async function createProfile(name, password, isDev, devPassword) {
    const display = name.trim().slice(0, 24);
    if (!display) return { ok: false, msg: "Enter a name." };
    if (!password) return { ok: false, msg: "Enter a password." };
    if (isDev && !devPassword) return { ok: false, msg: "Enter the dev password." };
    const key = keyOf(display);
    const passwordHash = await hashPassword(key, password);
    // Same fixed "dev-gate" key the server checks against (see
    // DEV_SIGNUP_PASSWORD_HASH in server.js) — not a per-profile key, since
    // this one password gates dev signup for everyone, not any single
    // account.
    const devPasswordHash = isDev ? await hashPassword("dev-gate", devPassword) : "";
    const result = await apiCall("create", { key, name: display, passwordHash, dev: Boolean(isDev), devPasswordHash, settings: snapshotSettings() });
    if (!result.ok) return result;
    session = { key, passwordHash, name: display, dev: Boolean(isDev), email: null, passkeys: [], avatar: null };
    saveSession(session);
    return { ok: true, msg: `Profile "${display}" created — current settings saved as your backup. Sign in with this name & password from any device on this network.` };
  }

  async function loginProfile(name, password) {
    const key = keyOf(name);
    if (!key) return { ok: false, msg: "Enter a name." };
    if (!password) return { ok: false, msg: "Enter a password." };
    const passwordHash = await hashPassword(key, password);
    const result = await apiCall("login", { key, passwordHash });
    if (!result.ok) return result;
    session = { key, passwordHash, name: result.name, dev: Boolean(result.dev), email: result.email || null, passkeys: result.passkeys || [], avatar: result.avatar || null, kartColor: result.kartColor || null };
    saveSession(session);
    applySettings(result.settings);
    connectPresence();
    return { ok: true, msg: `Signed in as ${result.name} — your saved settings were loaded. Reopen Kart Circuit to apply them there.` };
  }

  // Signing in with a passkey: no password at all — the signature over a
  // server-issued challenge, verified against the public key stored at
  // registration time, IS the proof of identity. The actual fingerprint/
  // Face ID/Windows Hello check that unlocks the private key to produce
  // that signature happens entirely on the user's own device; this code
  // never sees it.
  async function loginWithPasskey(name) {
    const key = keyOf(name);
    if (!key) return { ok: false, msg: "Enter a name." };
    if (!webauthnSupported()) return { ok: false, msg: "Passkeys aren't supported in this browser." };
    const optionsResult = await apiCall("passkey-login-options", { key });
    if (!optionsResult.ok) return optionsResult;
    let assertion;
    try {
      assertion = await getPasskeyAssertion(optionsResult.options);
    } catch (e) {
      return { ok: false, msg: e.name === "NotAllowedError" ? "Cancelled." : "Passkey sign-in failed: " + e.message };
    }
    const result = await apiCall("passkey-login-verify", { key, credential: assertion });
    if (!result.ok) return result;
    // a passkey sign-in has no password to remember for future save/delete
    // calls — passwordHash stays empty, and profiles.js falls back to
    // re-prompting for the password the one time something needs it (delete,
    // change password); save/reload/settings sync all work fine without it
    session = { key, passwordHash: "", name: result.name, dev: Boolean(result.dev), viaPasskey: true, email: result.email || null, passkeys: result.passkeys || [], avatar: result.avatar || null, kartColor: result.kartColor || null };
    saveSession(session);
    applySettings(result.settings);
    connectPresence();
    return { ok: true, msg: `Signed in as ${result.name} with a passkey — your saved settings were loaded. Reopen Kart Circuit to apply them there.` };
  }

  // Adding a passkey requires the password once, up front — it's an
  // additional way in, not a replacement, so it shouldn't be possible to
  // bolt one on without proving you already own the account.
  async function addPasskey(name, password, label) {
    const key = keyOf(name);
    if (!key) return { ok: false, msg: "Enter a name." };
    if (!webauthnSupported()) return { ok: false, msg: "Passkeys aren't supported in this browser." };
    const passwordHash = await hashPassword(key, password);
    const optionsResult = await apiCall("passkey-register-options", { key, passwordHash });
    if (!optionsResult.ok) return optionsResult;
    let credential;
    try {
      credential = await createPasskey(optionsResult.options);
    } catch (e) {
      return { ok: false, msg: e.name === "NotAllowedError" ? "Cancelled." : "Couldn't add that passkey: " + e.message };
    }
    return apiCall("passkey-register-verify", { key, passwordHash, credential, label });
  }
  async function removePasskey(name, password, credentialId) {
    const key = keyOf(name);
    const passwordHash = await hashPassword(key, password);
    return apiCall("passkey-remove", { key, passwordHash, credentialId });
  }
  async function setProfileEmail(name, password, email) {
    const key = keyOf(name);
    const passwordHash = await hashPassword(key, password);
    return apiCall("set-email", { key, passwordHash, email });
  }
  // avatarDataUrl is already resized/compressed client-side (see
  // resizeImageToAvatar below) before it ever reaches here — pass "" to
  // remove the current picture.
  async function setProfileAvatar(name, password, avatarDataUrl) {
    const key = keyOf(name);
    const passwordHash = await hashPassword(key, password);
    return apiCall("set-avatar", { key, passwordHash, avatar: avatarDataUrl || "" });
  }
  // Downscales/crops whatever image the user picked down to a small square
  // JPEG data: URI — keeps profile pictures cheap to store server-side and
  // cheap to relay to every other racer in a Kart Circuit room, regardless
  // of how large the original photo was.
  const AVATAR_SIZE = 96;
  function resizeImageToAvatar(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - side) / 2;
        const sy = (img.naturalHeight - side) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;
        const c = canvas.getContext("2d");
        c.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Couldn't read that image."));
      };
      img.src = url;
    });
  }
  async function generateRecoveryCode(name, password) {
    const key = keyOf(name);
    const passwordHash = await hashPassword(key, password);
    return apiCall("generate-recovery-code", { key, passwordHash });
  }
  // The actual fix for "I forgot my password and there's no mail server to
  // send a reset link" — a one-time code stands in for the password exactly
  // once, then has to be regenerated.
  async function recoverWithCode(name, recoveryCode, newPassword) {
    const key = keyOf(name);
    if (!key) return { ok: false, msg: "Enter a name." };
    if (!recoveryCode) return { ok: false, msg: "Enter your recovery code." };
    if (!newPassword) return { ok: false, msg: "Enter a new password." };
    const newPasswordHash = await hashPassword(key, newPassword);
    return apiCall("recover", { key, recoveryCode, newPasswordHash });
  }

  // Checks a name+password against a registered profile WITHOUT touching the
  // single browser-wide session above or applying that profile's settings —
  // used for local multiplayer (js/local-party.js), where two-plus real
  // people at the same keyboard each want their own name/badge on the
  // scoreboard without one of them silently taking over the shared gamepad
  // prefs / Kart Circuit settings the real "signed in" session controls.
  async function verifyProfile(name, password) {
    const key = keyOf(name);
    if (!key || !password) return { ok: false, msg: "Enter a name and password." };
    const passwordHash = await hashPassword(key, password);
    const result = await apiCall("login", { key, passwordHash });
    if (!result.ok) return { ok: false, msg: result.msg || "Wrong name or password." };
    return { ok: true, name: result.name, dev: Boolean(result.dev) };
  }

  // Creates a brand-new profile for a local player slot, same as
  // createProfile above but — like verifyProfile — never touches the single
  // browser-wide session or applies any settings. A dev badge can only ever
  // be granted through the real sign-up form (renderSignedOut), not here.
  async function createProfileForRoster(name, password) {
    const display = name.trim().slice(0, 24);
    if (!display) return { ok: false, msg: "Enter a name." };
    if (!password) return { ok: false, msg: "Enter a password." };
    const key = keyOf(display);
    const passwordHash = await hashPassword(key, password);
    const result = await apiCall("create", { key, name: display, passwordHash, dev: false, settings: {} });
    if (!result.ok) return result;
    return { ok: true, name: display, dev: false };
  }

  // ---------- local roster: up to 4 people signed in on this device at
  // once, for local multiplayer (js/local-party.js, Kart Circuit's
  // split-screen). Shared via localStorage so every game/script on this
  // origin sees the same roster without each maintaining its own sign-in UI.
  const ROSTER_KEY = "mimiLocalRoster";
  function loadRoster() {
    try {
      const list = JSON.parse(localStorage.getItem(ROSTER_KEY) || "[null,null,null,null]");
      const arr = Array.isArray(list) ? list.slice(0, 4) : [null, null, null, null];
      while (arr.length < 4) arr.push(null);
      return arr;
    } catch (e) {
      return [null, null, null, null];
    }
  }
  function saveRoster(roster) {
    try { localStorage.setItem(ROSTER_KEY, JSON.stringify(roster)); } catch (e) { /* private mode */ }
    window.dispatchEvent(new StorageEvent("storage", { key: ROSTER_KEY, newValue: JSON.stringify(roster) }));
  }

  function logoutProfile() {
    session = null;
    saveSession(null);
    disconnectPresence();
  }

  async function deleteProfile(confirmPassword) {
    if (!session) return { ok: false, msg: "Sign in first." };
    const passwordHash = await hashPassword(session.key, confirmPassword);
    const result = await apiCall("delete", { key: session.key, passwordHash });
    if (!result.ok) return result;
    const display = session.name;
    session = null;
    saveSession(null);
    return { ok: true, msg: `Profile "${display}" deleted.` };
  }

  // password is optional here ONLY because a passkey-only session (no
  // passwordHash cached — see loginWithPasskey) still needs to prove it can
  // write, same as it would for delete/change-password; a normal password
  // session already has passwordHash cached and never needs to pass one in
  async function saveCurrentSettings(passwordForPasskeySession) {
    if (!session) return { ok: false, msg: "Sign in first." };
    let passwordHash = session.passwordHash;
    if (!passwordHash) {
      if (!passwordForPasskeySession) return { ok: false, msg: "Enter your password to save (passkey sign-in doesn't carry one)." };
      passwordHash = await hashPassword(session.key, passwordForPasskeySession);
    }
    const result = await apiCall("save", { key: session.key, passwordHash, settings: snapshotSettings() });
    if (!result.ok) return result;
    return { ok: true, msg: "Current settings saved to your profile — pull them up on any device by signing in with this name & password." };
  }

  async function loadSavedSettings() {
    if (!session) return { ok: false, msg: "Sign in first." };
    const result = await apiCall("login", { key: session.key, passwordHash: session.passwordHash });
    if (!result.ok) return result;
    applySettings(result.settings);
    return { ok: true, msg: "Your saved settings were re-applied. Reopen Kart Circuit to apply them there." };
  }

  // self-service password change — requires re-entering the CURRENT password
  // even though already signed in (a session can sit open a long time; this
  // stops someone who finds an unlocked device from locking the real owner
  // out just by setting a new password)
  async function changeOwnPassword(currentPassword, newPassword) {
    if (!session) return { ok: false, msg: "Sign in first." };
    if (!currentPassword) return { ok: false, msg: "Enter your current password." };
    if (!newPassword) return { ok: false, msg: "Enter a new password." };
    const currentHash = await hashPassword(session.key, currentPassword);
    // a passkey-only session has no cached passwordHash to compare against
    // locally (that's not a local pre-check being skipped for no reason —
    // there's genuinely nothing to compare here) — the server is the real
    // check either way
    if (session.passwordHash && currentHash !== session.passwordHash) return { ok: false, msg: "Current password is wrong." };
    const newPasswordHash = await hashPassword(session.key, newPassword);
    const result = await apiCall("changepassword", { key: session.key, passwordHash: currentHash, newPasswordHash });
    if (!result.ok) return result;
    session = { ...session, passwordHash: newPasswordHash };
    saveSession(session);
    return { ok: true, msg: "Password changed." };
  }

  // ---------- admin (dev-only): list registered profiles, reset a password ----------
  // Never touches plaintext or hashed passwords except the NEW one being set —
  // the server enforces dev:true on the requester and never returns anyone's
  // passwordHash, even to a dev.
  async function listProfiles() {
    if (!session?.dev) return { ok: false, msg: "Dev profiles only." };
    return apiCall("list", { key: session.key, passwordHash: session.passwordHash });
  }

  async function resetProfilePassword(targetKey, newPassword) {
    if (!session?.dev) return { ok: false, msg: "Dev profiles only." };
    if (!newPassword) return { ok: false, msg: "Enter a new password." };
    const newPasswordHash = await hashPassword(targetKey, newPassword);
    return apiCall("reset", { key: session.key, passwordHash: session.passwordHash, targetKey, newPasswordHash });
  }

  // quietly re-verify a remembered session on load (e.g. after a refresh) so
  // the signed-in state survives without re-prompting for a password every
  // time — but never auto-applies settings, since that could silently
  // clobber whatever the user has set on THIS device right now
  async function restoreSession() {
    if (!session) return;
    syncProfileButton(); // optimistic paint from the cached name/dev
    // a passkey-only session has no passwordHash to re-verify with, and
    // silently re-prompting for a fingerprint/Face ID on every single page
    // load would be worse than just trusting the cached session — the same
    // "remember me" trust level a cached passwordHash already gets here.
    // (Presence also can't authenticate without a stored password, same
    // known limit as kart-color profile sync for passkey-only sessions.)
    if (!session.passwordHash) return;
    const result = await apiCall("login", { key: session.key, passwordHash: session.passwordHash });
    if (!result.ok) {
      // profile deleted, or password changed from another device — drop the stale session
      session = null;
      saveSession(null);
      syncProfileButton();
      return;
    }
    session = { ...session, name: result.name, dev: Boolean(result.dev), email: result.email || null, passkeys: result.passkeys || [], avatar: result.avatar || null, kartColor: result.kartColor || null };
    saveSession(session);
    syncProfileButton();
    connectPresence();
  }

  // ---------- UI ----------

  const profileBtn = document.getElementById("profileBtn");
  const overlay = document.getElementById("profileOverlay");
  const closeBtn = document.getElementById("profileCloseBtn");
  const body = document.getElementById("profileBody");
  if (!profileBtn || !overlay || !body) return;

  function syncProfileButton() {
    profileBtn.textContent = session ? `👤 ${session.name}${session.dev ? " 🛠️" : ""}` : "👤 Profile";
    syncAdminButton();
  }

  function renderSignedOut(status) {
    body.innerHTML = "";

    const form = document.createElement("div");
    form.className = "profile-form";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "Name";
    nameInput.maxLength = 24;
    nameInput.autocomplete = "off";

    const passInput = document.createElement("input");
    passInput.type = "password";
    passInput.placeholder = "Password";
    passInput.autocomplete = "off";

    // Up to 10 accounts that have signed in on this device before, shown as
    // one-tap chips so a returning player can pick themself instead of
    // retyping their name — still has to enter the real password either way,
    // this just saves the typing/remembering-the-exact-spelling part. Plus a
    // Guest option for anyone playing along who doesn't want an account at
    // all: the hub already works fully without signing in (every game saves
    // its own high scores locally regardless), so "Guest" is really just
    // making that existing no-account mode a first-class, visible choice
    // instead of something you'd only discover by ignoring this panel.
    const known = loadKnownNames();
    if (known.length) {
      const pickerWrap = document.createElement("div");
      pickerWrap.className = "profile-form";
      pickerWrap.style.marginBottom = "4px";
      const pickerLabel = document.createElement("p");
      pickerLabel.className = "profile-note";
      pickerLabel.style.margin = "0";
      pickerLabel.textContent = `Choose an account on this device (${known.length}/10 remembered):`;
      const chipRow = document.createElement("div");
      chipRow.className = "profile-chip-row";
      known.forEach((knownName) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "profile-chip";
        chip.textContent = knownName;
        chip.addEventListener("click", () => {
          nameInput.value = knownName;
          passInput.focus();
        });
        chipRow.appendChild(chip);
      });
      pickerWrap.append(pickerLabel, chipRow);
      body.appendChild(pickerWrap);
    }

    const guestBtn = document.createElement("button");
    guestBtn.type = "button";
    guestBtn.className = "btn";
    guestBtn.textContent = "🙋 Continue as Guest";
    guestBtn.title = "Play without an account — nothing syncs to the server, but everything still works and high scores still save on this device.";
    guestBtn.style.marginBottom = "10px";
    guestBtn.addEventListener("click", () => {
      overlay.classList.add("hidden");
    });
    body.appendChild(guestBtn);

    const devLabel = document.createElement("label");
    devLabel.className = "profile-check";
    const devCheck = document.createElement("input");
    devCheck.type = "checkbox";
    devLabel.appendChild(devCheck);
    devLabel.appendChild(document.createTextNode("🛠️ I'm the developer — add a Dev badge (shown next to my name here and in Kart Circuit chat)"));

    // The checkbox alone used to be the entire gate — anyone signing up
    // could tick it and get dev-only capabilities (the Admin panel, and the
    // Kart Circuit fly cheat) with nothing checking it server-side. A
    // password field the server actually verifies (see
    // DEV_SIGNUP_PASSWORD_HASH in server.js) closes that.
    const devPasswordInput = document.createElement("input");
    devPasswordInput.type = "password";
    devPasswordInput.placeholder = "Dev password";
    devPasswordInput.className = "hidden";
    devPasswordInput.autocomplete = "off";
    devCheck.addEventListener("change", () => {
      devPasswordInput.classList.toggle("hidden", !devCheck.checked);
      if (!devCheck.checked) devPasswordInput.value = "";
    });

    const actions = document.createElement("div");
    actions.className = "profile-form-actions";
    const createBtn = document.createElement("button");
    createBtn.type = "button";
    createBtn.className = "btn";
    createBtn.textContent = "Create Profile";
    const loginBtn = document.createElement("button");
    loginBtn.type = "button";
    loginBtn.className = "btn primary";
    loginBtn.textContent = "Sign In";
    actions.appendChild(createBtn);
    actions.appendChild(loginBtn);
    if (webauthnSupported()) {
      const passkeyBtn = document.createElement("button");
      passkeyBtn.type = "button";
      passkeyBtn.className = "btn";
      passkeyBtn.textContent = "🔐 Sign in with Passkey";
      passkeyBtn.title = "Face ID, Windows Hello, fingerprint, or a security key — whatever your device offers";
      actions.appendChild(passkeyBtn);
      passkeyBtn.addEventListener("click", async () => {
        passkeyBtn.disabled = true;
        const result = await loginWithPasskey(nameInput.value);
        passkeyBtn.disabled = false;
        if (result.ok) {
          rememberKnownName(session.name);
          syncProfileButton();
          renderSignedIn(result);
        } else {
          showStatus(result);
        }
      });
    }

    const statusEl = document.createElement("p");
    statusEl.className = "profile-status" + (status?.ok === false ? " error" : status?.ok ? " ok" : "");
    statusEl.textContent = status?.msg || "";

    const forgotToggle = document.createElement("button");
    forgotToggle.type = "button";
    forgotToggle.className = "profile-link-btn";
    forgotToggle.textContent = "Forgot password?";

    const recoverForm = document.createElement("div");
    recoverForm.className = "profile-form hidden";
    recoverForm.style.marginTop = "8px";
    const recoverHint = document.createElement("p");
    recoverHint.className = "profile-note";
    recoverHint.textContent = "Only works if you generated a recovery code while signed in (⚙️ Security, in your profile) and saved it somewhere — this hub has no mail server to send a reset link to.";
    const recoverCodeInput = document.createElement("input");
    recoverCodeInput.type = "text";
    recoverCodeInput.placeholder = "Recovery code (XXXX-XXXX-XXXX)";
    recoverCodeInput.autocomplete = "off";
    const recoverNewPassInput = document.createElement("input");
    recoverNewPassInput.type = "password";
    recoverNewPassInput.placeholder = "New password";
    recoverNewPassInput.autocomplete = "off";
    const recoverBtn = document.createElement("button");
    recoverBtn.type = "button";
    recoverBtn.className = "btn";
    recoverBtn.textContent = "Reset Password";
    const recoverStatus = document.createElement("p");
    recoverStatus.className = "profile-status";
    recoverForm.append(recoverHint, recoverCodeInput, recoverNewPassInput, recoverBtn, recoverStatus);

    forgotToggle.addEventListener("click", () => {
      recoverForm.classList.toggle("hidden");
    });
    recoverBtn.addEventListener("click", async () => {
      recoverBtn.disabled = true;
      const result = await recoverWithCode(nameInput.value, recoverCodeInput.value, recoverNewPassInput.value);
      recoverBtn.disabled = false;
      recoverStatus.className = "profile-status" + (result.ok === false ? " error" : " ok");
      recoverStatus.textContent = result.msg || "";
      if (result.ok) {
        recoverCodeInput.value = "";
        recoverNewPassInput.value = "";
        passInput.value = "";
      }
    });

    const note = document.createElement("p");
    note.className = "profile-note";
    note.textContent = "Backs up: hub theme (including custom colors), music on/off, favorites, continue-playing history, every game's high scores/bests, your profile picture, gamepad cursor size/speed, gamepad button mapping, and Kart Circuit preferences (theme, HDR, audio, difficulty, camera, minimap, auto steer). Saved on this hub's server — sign in with the same name & password from any device on this network.";

    function showStatus(result) {
      statusEl.className = "profile-status" + (result.ok === false ? " error" : " ok");
      statusEl.textContent = result.msg || "";
    }

    createBtn.addEventListener("click", async () => {
      createBtn.disabled = true;
      loginBtn.disabled = true;
      const result = await createProfile(nameInput.value, passInput.value, devCheck.checked, devPasswordInput.value);
      createBtn.disabled = false;
      loginBtn.disabled = false;
      if (result.ok) {
        rememberKnownName(session.name);
        syncProfileButton();
        renderSignedIn(result);
      } else {
        // keep whatever the user typed instead of wiping the form on failure
        showStatus(result);
      }
    });
    loginBtn.addEventListener("click", async () => {
      createBtn.disabled = true;
      loginBtn.disabled = true;
      const result = await loginProfile(nameInput.value, passInput.value);
      createBtn.disabled = false;
      loginBtn.disabled = false;
      if (result.ok) {
        rememberKnownName(session.name);
        syncProfileButton();
        renderSignedIn(result);
      } else {
        showStatus(result);
      }
    });
    passInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") loginBtn.click();
    });

    form.appendChild(nameInput);
    form.appendChild(passInput);
    form.appendChild(devLabel);
    form.appendChild(devPasswordInput);
    form.appendChild(actions);
    form.appendChild(statusEl);
    form.appendChild(forgotToggle);
    form.appendChild(recoverForm);
    form.appendChild(note);
    body.appendChild(form);
  }

  function renderSignedIn(status) {
    if (!session) return renderSignedOut(status);
    body.innerHTML = "";

    const panel = document.createElement("div");
    panel.className = "profile-signed-in";

    const identityRow = document.createElement("div");
    identityRow.className = "profile-identity-row";

    const avatarPreview = document.createElement("div");
    avatarPreview.className = "profile-avatar";
    function syncAvatarPreview() {
      if (session.avatar) {
        avatarPreview.style.backgroundImage = `url("${session.avatar}")`;
        avatarPreview.textContent = "";
      } else {
        avatarPreview.style.backgroundImage = "none";
        avatarPreview.textContent = session.name.slice(0, 1).toUpperCase();
      }
    }
    syncAvatarPreview();
    identityRow.appendChild(avatarPreview);

    const nameLine = document.createElement("p");
    nameLine.className = "profile-name-line";
    nameLine.textContent = `Signed in as ${session.name}`;
    if (session.dev) {
      const badge = document.createElement("span");
      badge.className = "profile-dev-badge";
      badge.textContent = "🛠️ DEV";
      nameLine.appendChild(badge);
    }
    identityRow.appendChild(nameLine);
    panel.appendChild(identityRow);

    const avatarRow = document.createElement("div");
    avatarRow.className = "profile-delete-row";
    const avatarFileInput = document.createElement("input");
    avatarFileInput.type = "file";
    avatarFileInput.accept = "image/*";
    avatarFileInput.id = "profileAvatarFile";
    avatarFileInput.style.display = "none";
    const avatarPickBtn = document.createElement("button");
    avatarPickBtn.type = "button";
    avatarPickBtn.className = "btn";
    avatarPickBtn.textContent = "🖼️ " + (session.avatar ? "Change Picture" : "Add Picture");
    avatarPickBtn.addEventListener("click", () => avatarFileInput.click());
    const avatarRemoveBtn = document.createElement("button");
    avatarRemoveBtn.type = "button";
    avatarRemoveBtn.className = "btn";
    avatarRemoveBtn.textContent = "Remove Picture";
    avatarRemoveBtn.classList.toggle("hidden", !session.avatar);
    const avatarStatus = document.createElement("p");
    avatarStatus.className = "profile-status";
    avatarStatus.style.flexBasis = "100%";

    avatarFileInput.addEventListener("change", async () => {
      const file = avatarFileInput.files?.[0];
      avatarFileInput.value = "";
      if (!file) return;
      let dataUrl;
      try {
        dataUrl = await resizeImageToAvatar(file);
      } catch (e) {
        avatarStatus.className = "profile-status error";
        avatarStatus.textContent = e.message || "Couldn't read that image.";
        return;
      }
      const password = await showTextPrompt("Enter your password to save a profile picture:", { password: true });
      if (password === null) return;
      avatarPickBtn.disabled = true;
      const result = await setProfileAvatar(session.name, password, dataUrl);
      avatarPickBtn.disabled = false;
      if (result.ok) {
        session = { ...session, avatar: result.avatar };
        saveSession(session);
        renderSignedIn({ ok: true, msg: "Profile picture updated." });
      } else {
        avatarStatus.className = "profile-status error";
        avatarStatus.textContent = result.msg || "Couldn't save that picture.";
      }
    });
    avatarRemoveBtn.addEventListener("click", async () => {
      const password = await showTextPrompt("Enter your password to remove your profile picture:", { password: true });
      if (password === null) return;
      avatarRemoveBtn.disabled = true;
      const result = await setProfileAvatar(session.name, password, "");
      avatarRemoveBtn.disabled = false;
      if (result.ok) {
        session = { ...session, avatar: null };
        saveSession(session);
        renderSignedIn({ ok: true, msg: "Profile picture removed." });
      } else {
        avatarStatus.className = "profile-status error";
        avatarStatus.textContent = result.msg || "Couldn't remove that picture.";
      }
    });

    avatarRow.append(avatarFileInput, avatarPickBtn, avatarRemoveBtn, avatarStatus);
    panel.appendChild(avatarRow);

    const actions = document.createElement("div");
    actions.className = "profile-actions";
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn primary";
    saveBtn.textContent = "💾 Save current settings";
    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.className = "btn";
    loadBtn.textContent = "📥 Reload saved settings";
    const signOutBtn = document.createElement("button");
    signOutBtn.type = "button";
    signOutBtn.className = "btn";
    signOutBtn.textContent = "🚪 Sign out";
    actions.appendChild(saveBtn);
    actions.appendChild(loadBtn);
    actions.appendChild(signOutBtn);
    panel.appendChild(actions);

    const statusEl = document.createElement("p");
    statusEl.className = "profile-status" + (status?.ok === false ? " error" : status?.ok ? " ok" : "");
    statusEl.textContent = status?.msg || "";
    panel.appendChild(statusEl);

    const changePassRow = document.createElement("div");
    changePassRow.className = "profile-delete-row";
    const currentPassInput = document.createElement("input");
    currentPassInput.type = "password";
    currentPassInput.placeholder = "Current password";
    currentPassInput.autocomplete = "off";
    const newPassInput = document.createElement("input");
    newPassInput.type = "password";
    newPassInput.placeholder = "New password";
    newPassInput.autocomplete = "off";
    const changePassBtn = document.createElement("button");
    changePassBtn.type = "button";
    changePassBtn.className = "btn";
    changePassBtn.textContent = "🔑 Change Password";
    changePassRow.appendChild(currentPassInput);
    changePassRow.appendChild(newPassInput);
    changePassRow.appendChild(changePassBtn);
    panel.appendChild(changePassRow);
    const changePassStatus = document.createElement("p");
    changePassStatus.className = "profile-status";
    panel.appendChild(changePassStatus);

    // ---------- 🔐 Security: passkeys, recovery email, recovery code ----------
    const securitySection = document.createElement("div");
    securitySection.className = "profile-security-section";
    const securityTitle = document.createElement("p");
    securityTitle.className = "profile-name-line";
    securityTitle.style.marginBottom = "6px";
    securityTitle.textContent = "🔐 Security";
    securitySection.appendChild(securityTitle);

    const securityHint = document.createElement("p");
    securityHint.className = "profile-note";
    securityHint.textContent = "Extra ways in besides your password. A passkey uses your device's own Face ID/Windows Hello/fingerprint/security key — that check happens on your device, this hub never sees it. A recovery code is the actual fix for a forgotten password, since this hub has no mail server to send a reset link with.";
    securitySection.appendChild(securityHint);

    if (webauthnSupported()) {
      const passkeyList = document.createElement("div");
      (session.passkeys || []).forEach((pk) => {
        const row = document.createElement("div");
        row.className = "profile-passkey-row";
        const label = document.createElement("span");
        label.textContent = `🔑 ${pk.label} — added ${new Date(pk.createdAt).toLocaleDateString()}`;
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn";
        removeBtn.textContent = "Remove";
        removeBtn.addEventListener("click", async () => {
          const pw = await showTextPrompt(`Enter your password to remove "${pk.label}":`, { password: true });
          if (pw === null) return;
          removeBtn.disabled = true;
          const result = await removePasskey(session.name, pw, pk.id);
          removeBtn.disabled = false;
          if (result.ok) session = { ...session, passkeys: result.passkeys || [] };
          renderSignedIn(result);
        });
        row.append(label, removeBtn);
        passkeyList.appendChild(row);
      });
      securitySection.appendChild(passkeyList);

      const addPasskeyRow = document.createElement("div");
      addPasskeyRow.className = "profile-delete-row";
      const passkeyPassInput = document.createElement("input");
      passkeyPassInput.type = "password";
      passkeyPassInput.placeholder = "Your password";
      passkeyPassInput.autocomplete = "off";
      const addPasskeyBtn = document.createElement("button");
      addPasskeyBtn.type = "button";
      addPasskeyBtn.className = "btn";
      addPasskeyBtn.textContent = "➕ Add a Passkey";
      addPasskeyRow.append(passkeyPassInput, addPasskeyBtn);
      securitySection.appendChild(addPasskeyRow);
      const passkeyStatus = document.createElement("p");
      passkeyStatus.className = "profile-status";
      securitySection.appendChild(passkeyStatus);
      addPasskeyBtn.addEventListener("click", async () => {
        addPasskeyBtn.disabled = true;
        const label = (await showTextPrompt("Name this passkey (e.g. \"My phone\", \"Work laptop\"):", { defaultValue: "Passkey" })) || "Passkey";
        const result = await addPasskey(session.name, passkeyPassInput.value, label);
        addPasskeyBtn.disabled = false;
        if (result.ok) {
          session = { ...session, passkeys: result.passkeys || [] };
          renderSignedIn({ ok: true, msg: "Passkey added." });
        } else {
          passkeyStatus.className = "profile-status error";
          passkeyStatus.textContent = result.msg || "";
        }
      });
    } else {
      const noSupport = document.createElement("p");
      noSupport.className = "profile-note";
      noSupport.textContent = "Passkeys aren't supported in this browser.";
      securitySection.appendChild(noSupport);
    }

    const emailRow = document.createElement("div");
    emailRow.className = "profile-delete-row";
    const emailInput = document.createElement("input");
    emailInput.type = "email";
    emailInput.placeholder = "Recovery email (optional, reference only)";
    emailInput.autocomplete = "off";
    emailInput.value = session.email || "";
    emailInput.style.flex = "1";
    emailInput.style.minWidth = "180px";
    const emailBtn = document.createElement("button");
    emailBtn.type = "button";
    emailBtn.className = "btn";
    emailBtn.textContent = "Save Email";
    emailRow.append(emailInput, emailBtn);
    securitySection.appendChild(emailRow);
    const emailStatus = document.createElement("p");
    emailStatus.className = "profile-status";
    securitySection.appendChild(emailStatus);
    emailBtn.addEventListener("click", async () => {
      const pw = await showTextPrompt("Enter your password to save this email:", { password: true });
      if (pw === null) return;
      emailBtn.disabled = true;
      const result = await setProfileEmail(session.name, pw, emailInput.value);
      emailBtn.disabled = false;
      emailStatus.className = "profile-status" + (result.ok === false ? " error" : " ok");
      emailStatus.textContent = result.ok ? "Email saved." : (result.msg || "");
      if (result.ok) session = { ...session, email: result.email };
    });

    const recoveryCodeBtn = document.createElement("button");
    recoveryCodeBtn.type = "button";
    recoveryCodeBtn.className = "btn";
    recoveryCodeBtn.textContent = "🔁 Generate Recovery Code";
    securitySection.appendChild(recoveryCodeBtn);
    const recoveryCodeStatus = document.createElement("div");
    recoveryCodeStatus.className = "profile-status";
    securitySection.appendChild(recoveryCodeStatus);
    recoveryCodeBtn.addEventListener("click", async () => {
      const pw = await showTextPrompt("Enter your password to generate a recovery code:", { password: true });
      if (pw === null) return;
      recoveryCodeBtn.disabled = true;
      const result = await generateRecoveryCode(session.name, pw);
      recoveryCodeBtn.disabled = false;
      if (!result.ok) {
        recoveryCodeStatus.className = "profile-status error";
        recoveryCodeStatus.textContent = result.msg || "";
        return;
      }
      recoveryCodeStatus.className = "profile-status ok";
      recoveryCodeStatus.innerHTML = "";
      const warn = document.createElement("p");
      warn.style.margin = "4px 0";
      warn.textContent = "Save this now — it's shown once and replaces any earlier code:";
      const codeEl = document.createElement("code");
      codeEl.className = "profile-recovery-code";
      codeEl.textContent = result.code;
      recoveryCodeStatus.append(warn, codeEl);
    });

    panel.appendChild(securitySection);

    const deleteRow = document.createElement("div");
    deleteRow.className = "profile-delete-row";
    const deletePass = document.createElement("input");
    deletePass.type = "password";
    deletePass.placeholder = "Password to confirm delete";
    deletePass.autocomplete = "off";
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn";
    deleteBtn.textContent = "🗑️ Delete profile";
    deleteRow.appendChild(deletePass);
    deleteRow.appendChild(deleteBtn);
    panel.appendChild(deleteRow);

    const note = document.createElement("p");
    note.className = "profile-note";
    note.textContent = "Backs up: hub theme (including custom colors), music on/off, favorites, continue-playing history, every game's high scores/bests, your profile picture, gamepad cursor size/speed, gamepad button mapping, and Kart Circuit preferences (theme, HDR, audio, difficulty, camera, minimap, auto steer). Sign in with this name & password on any device on this network to pull them up there too.";
    panel.appendChild(note);

    saveBtn.addEventListener("click", async () => {
      let pw;
      if (!session.passwordHash) {
        pw = await showTextPrompt("Enter your password to save (passkey sign-in doesn't carry one):", { password: true });
        if (pw === null) return;
      }
      saveBtn.disabled = true;
      const result = await saveCurrentSettings(pw);
      saveBtn.disabled = false;
      renderSignedIn(result);
    });
    loadBtn.addEventListener("click", async () => {
      loadBtn.disabled = true;
      const result = await loadSavedSettings();
      loadBtn.disabled = false;
      renderSignedIn(result);
    });
    signOutBtn.addEventListener("click", () => {
      logoutProfile();
      syncProfileButton();
      renderSignedOut({ ok: true, msg: "Signed out." });
    });
    changePassBtn.addEventListener("click", async () => {
      changePassBtn.disabled = true;
      const result = await changeOwnPassword(currentPassInput.value, newPassInput.value);
      changePassBtn.disabled = false;
      changePassStatus.className = "profile-status" + (result.ok === false ? " error" : " ok");
      changePassStatus.textContent = result.msg || "";
      if (result.ok) { currentPassInput.value = ""; newPassInput.value = ""; }
    });
    deleteBtn.addEventListener("click", async () => {
      deleteBtn.disabled = true;
      const result = await deleteProfile(deletePass.value);
      deleteBtn.disabled = false;
      if (result.ok) {
        syncProfileButton();
        renderSignedOut(result);
      } else {
        statusEl.className = "profile-status error";
        statusEl.textContent = result.msg;
      }
    });

    body.appendChild(panel);
  }

  // remembers up to 10 names that have signed in/up in the local roster
  // below on THIS device, most recent first, so a returning player can pick
  // their name from a suggestion list instead of retyping it — still has to
  // enter the real password either way, this is just a memory aid
  const KNOWN_NAMES_KEY = "mimiKnownProfileNames";
  const KNOWN_NAMES_MAX = 10;
  function loadKnownNames() {
    try {
      const list = JSON.parse(localStorage.getItem(KNOWN_NAMES_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }
  function rememberKnownName(name) {
    const list = [name, ...loadKnownNames().filter((n) => n.toLowerCase() !== name.toLowerCase())].slice(0, KNOWN_NAMES_MAX);
    try { localStorage.setItem(KNOWN_NAMES_KEY, JSON.stringify(list)); } catch (e) { /* private mode */ }
    syncKnownNamesDatalist();
  }
  function syncKnownNamesDatalist() {
    let datalist = document.getElementById("mimiKnownNames");
    if (!datalist) {
      datalist = document.createElement("datalist");
      datalist.id = "mimiKnownNames";
      document.body.appendChild(datalist);
    }
    datalist.innerHTML = "";
    loadKnownNames().forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      datalist.appendChild(opt);
    });
  }

  // Up to 4 people signed in on this device at once, independent of the
  // single session above — for local multiplayer (js/local-party.js, Kart
  // Circuit's split-screen and solo "Playing as" picker), which read this
  // same localStorage key directly rather than duplicating this sign-in UI.
  function renderLocalRosterSection() {
    syncKnownNamesDatalist();
    const wrap = document.createElement("div");
    wrap.className = "profile-signed-in";
    wrap.style.cssText = "margin-top:18px;padding-top:16px;border-top:1px solid var(--border)";

    const heading = document.createElement("p");
    heading.className = "profile-name-line";
    heading.style.fontSize = "0.95rem";
    heading.textContent = "👥 Local players";
    wrap.appendChild(heading);

    const hint = document.createElement("p");
    hint.className = "profile-note";
    hint.textContent = "Sign in up to 4 people on this device for local multiplayer (Local Party, Kart Circuit split-screen and \"Playing as\"). Independent of the sign-in above — doesn't touch anyone's gamepad or Kart Circuit settings.";
    wrap.appendChild(hint);

    const roster = loadRoster();
    roster.forEach((entry, i) => {
      const row = document.createElement("div");
      row.className = "profile-delete-row";
      const tag = document.createElement("span");
      tag.className = "profile-chip";
      tag.style.cssText = "pointer-events:none;font-weight:700";
      tag.textContent = `P${i + 1}`;
      row.appendChild(tag);

      if (entry) {
        const label = document.createElement("span");
        label.className = "profile-status ok";
        label.style.margin = "0";
        label.textContent = `✅ ${entry.name}${entry.dev ? " 🛠️" : ""}`;
        const signOutBtn = document.createElement("button");
        signOutBtn.type = "button";
        signOutBtn.className = "btn";
        signOutBtn.textContent = "Sign Out";
        signOutBtn.addEventListener("click", () => {
          const next = loadRoster();
          next[i] = null;
          saveRoster(next);
          renderProfilePanel();
        });
        row.append(label, signOutBtn);
      } else {
        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.placeholder = "Name";
        nameInput.maxLength = 24;
        nameInput.autocomplete = "off";
        nameInput.setAttribute("list", "mimiKnownNames");
        const passInput = document.createElement("input");
        passInput.type = "password";
        passInput.placeholder = "Password";
        passInput.autocomplete = "off";
        const signInBtn = document.createElement("button");
        signInBtn.type = "button";
        signInBtn.className = "btn";
        signInBtn.textContent = "Sign In";
        const signUpBtn = document.createElement("button");
        signUpBtn.type = "button";
        signUpBtn.className = "btn";
        signUpBtn.textContent = "Sign Up";
        const rowStatus = document.createElement("p");
        rowStatus.className = "profile-status error hidden";
        rowStatus.style.flexBasis = "100%";

        async function handle(fn) {
          signInBtn.disabled = true;
          signUpBtn.disabled = true;
          rowStatus.classList.add("hidden");
          const result = await fn(nameInput.value, passInput.value);
          signInBtn.disabled = false;
          signUpBtn.disabled = false;
          if (result.ok) {
            const next = loadRoster();
            next[i] = { name: result.name, dev: result.dev };
            saveRoster(next);
            rememberKnownName(result.name);
            renderProfilePanel();
          } else {
            rowStatus.textContent = result.msg;
            rowStatus.classList.remove("hidden");
          }
        }
        signInBtn.addEventListener("click", () => handle(verifyProfile));
        signUpBtn.addEventListener("click", () => handle(createProfileForRoster));
        passInput.addEventListener("keydown", (e) => { if (e.key === "Enter") signInBtn.click(); });

        row.append(nameInput, passInput, signInBtn, signUpBtn, rowStatus);
      }
      wrap.appendChild(row);
    });

    body.appendChild(wrap);
  }

  function renderStaticModeNotice() {
    body.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "profile-form";
    const heading = document.createElement("h3");
    heading.textContent = "Accounts aren't available here";
    const desc = document.createElement("p");
    desc.className = "profile-status";
    desc.textContent =
      "This is the static GitHub Pages preview — it has no server, so sign-in, cross-device settings sync, leaderboards, and wireless multiplayer can't work. All the games themselves still play normally. For accounts and multiplayer, use the full hosted version or the desktop app.";
    wrap.append(heading, desc);
    body.appendChild(wrap);
  }

  function renderProfilePanel() {
    if (STATIC_MODE) return renderStaticModeNotice();
    if (session) renderSignedIn();
    else renderSignedOut();
    renderLocalRosterSection();
  }

  function openPanel() {
    renderProfilePanel();
    overlay.classList.remove("hidden");
  }
  function closePanel() {
    overlay.classList.add("hidden");
  }

  profileBtn.addEventListener("click", openPanel);
  closeBtn?.addEventListener("click", closePanel);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closePanel(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.classList.contains("hidden")) closePanel();
  });

  // ---------- admin panel (dev-only) ----------
  const adminOverlay = document.createElement("div");
  adminOverlay.className = "updates-overlay hidden";
  adminOverlay.id = "adminOverlay";
  adminOverlay.innerHTML = `
    <div class="updates-card">
      <button id="adminCloseBtn" class="help-close" type="button" aria-label="Close">✕</button>
      <div class="updates-header">
        <span class="updates-emoji">🛠️</span>
        <div>
          <h2>Admin</h2>
          <p class="help-meta">Registered profiles on this hub — visible to dev profiles only</p>
        </div>
      </div>
      <div id="adminBody" class="updates-list"></div>
    </div>`;
  document.body.appendChild(adminOverlay);
  const adminCloseBtn = adminOverlay.querySelector("#adminCloseBtn");
  const adminBody = adminOverlay.querySelector("#adminBody");

  function timeAgo(ts) {
    if (!ts) return "";
    const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  }

  async function renderAdminPanel() {
    adminBody.innerHTML = `<p class="profile-status">Loading…</p>`;
    const result = await listProfiles();
    if (!result.ok) {
      adminBody.innerHTML = "";
      const err = document.createElement("p");
      err.className = "profile-status error";
      err.textContent = result.msg || "Couldn't load profiles.";
      adminBody.appendChild(err);
      return;
    }
    adminBody.innerHTML = "";
    const table = document.createElement("div");
    table.className = "profile-form";
    result.profiles
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((p) => {
        const row = document.createElement("div");
        row.className = "profile-signed-in";
        row.style.marginBottom = "8px";

        const line = document.createElement("p");
        line.className = "profile-name-line";
        line.textContent = `${p.name}${p.key === session.key ? " (you)" : ""} — updated ${timeAgo(p.updatedAt)}`;
        if (p.dev) {
          const badge = document.createElement("span");
          badge.className = "profile-dev-badge";
          badge.textContent = "🛠️ DEV";
          line.appendChild(badge);
        }
        row.appendChild(line);

        const resetRow = document.createElement("div");
        resetRow.className = "profile-delete-row";
        const newPassInput = document.createElement("input");
        newPassInput.type = "password";
        newPassInput.placeholder = "New password for this profile";
        newPassInput.autocomplete = "off";
        const resetBtn = document.createElement("button");
        resetBtn.type = "button";
        resetBtn.className = "btn";
        resetBtn.textContent = "Reset Password";
        resetRow.appendChild(newPassInput);
        resetRow.appendChild(resetBtn);
        row.appendChild(resetRow);

        const rowStatus = document.createElement("p");
        rowStatus.className = "profile-status";
        row.appendChild(rowStatus);

        resetBtn.addEventListener("click", async () => {
          resetBtn.disabled = true;
          const r = await resetProfilePassword(p.key, newPassInput.value);
          resetBtn.disabled = false;
          rowStatus.className = "profile-status" + (r.ok === false ? " error" : " ok");
          rowStatus.textContent = r.msg || (r.ok ? "Password reset." : "Failed.");
          if (r.ok) newPassInput.value = "";
        });

        table.appendChild(row);
      });
    adminBody.appendChild(table);
  }

  function openAdminPanel() {
    renderAdminPanel();
    adminOverlay.classList.remove("hidden");
  }
  function closeAdminPanel() {
    adminOverlay.classList.add("hidden");
  }
  adminCloseBtn.addEventListener("click", closeAdminPanel);
  adminOverlay.addEventListener("click", (e) => { if (e.target === adminOverlay) closeAdminPanel(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !adminOverlay.classList.contains("hidden")) closeAdminPanel();
  });

  const adminBtn = document.createElement("button");
  adminBtn.id = "adminBtn";
  adminBtn.className = "btn updates-btn";
  adminBtn.type = "button";
  adminBtn.textContent = "🛠️ Admin";
  adminBtn.style.display = "none";
  document.querySelector(".topbar-controls")?.appendChild(adminBtn);
  adminBtn.addEventListener("click", openAdminPanel);

  function syncAdminButton() {
    adminBtn.style.display = session?.dev ? "" : "none";
  }

  syncProfileButton();
  restoreSession();

  window.MimiProfiles = {
    verifyProfile,
    currentName: () => session?.name || null,
    getLocalRoster: () => loadRoster(),
    getSessionKey: () => session?.key || null,
    isSignedIn: () => Boolean(session?.key && session?.passwordHash),
    // Leaderboards — engine.js's ctx.reportScore() calls submitScore
    // directly; js/leaderboards.js only ever reads via getLeaderboardTop.
    submitScore: (gameId, value, sortDir) => {
      if (!session?.key || !session?.passwordHash) return Promise.resolve({ ok: false, msg: "Not signed in." });
      return apiCall("submit", { key: session.key, passwordHash: session.passwordHash, gameId, value, sortDir }, "leaderboards");
    },
    getLeaderboardTop: async (gameId, limit) => {
      if (STATIC_MODE) return { ok: false, msg: "This needs the full hosted version — not available on the static GitHub Pages preview." };
      try {
        const res = await fetch(`${window.MimiGames?.getServerBase() ?? ""}/api/leaderboards/top?gameId=${encodeURIComponent(gameId)}&limit=${limit || 50}`);
        return await res.json();
      } catch (e) {
        return { ok: false, msg: "Couldn't reach the hub's server." };
      }
    },
    // Cake Bakery's shared feed — same "thin network primitive, no
    // duplicated session/networking logic in the game itself" shape as
    // submitScore/getLeaderboardTop above.
    publishCake: (base, toppings) => {
      if (!session?.key || !session?.passwordHash) return Promise.resolve({ ok: false, msg: "Sign in to publish a cake." });
      return apiCall("publish", { key: session.key, passwordHash: session.passwordHash, base, toppings }, "cakes");
    },
    getCakeFeed: async (limit) => {
      if (STATIC_MODE) return { ok: false, msg: "This needs the full hosted version — not available on the static GitHub Pages preview." };
      try {
        const res = await fetch(`${window.MimiGames?.getServerBase() ?? ""}/api/cakes/list?limit=${limit || 30}`);
        return await res.json();
      } catch (e) {
        return { ok: false, msg: "Couldn't reach the hub's server." };
      }
    },
    // Keys backup — js/keys.js's wallet is localStorage-first by design; this
    // is just the thin network primitive it calls to also back a balance up
    // to (and restore it from) the signed-in account, the same shape as
    // submitScore/publishCake above.
    syncKeys: (balance) => {
      if (!session?.key || !session?.passwordHash) return Promise.resolve({ ok: false, msg: "Not signed in." });
      return apiCall("sync-keys", { key: session.key, passwordHash: session.passwordHash, balance }, "profiles");
    },
    devSetKeys: (balance) => {
      if (!session?.key || !session?.passwordHash) return Promise.resolve({ ok: false, msg: "Not signed in." });
      return apiCall("dev-set-keys", { key: session.key, passwordHash: session.passwordHash, balance }, "profiles");
    },
    // Rival Arena's crate-unlocked weapon skins — same "thin network
    // primitive" shape as syncKeys just above, for the cosmetics rather than
    // the currency that buys them.
    syncRivalSkins: (owned, equipped) => {
      if (!session?.key || !session?.passwordHash) return Promise.resolve({ ok: false, msg: "Not signed in." });
      return apiCall("sync-rival-skins", { key: session.key, passwordHash: session.passwordHash, owned, equipped }, "profiles");
    },
    // Achievements — the catalog and client-attested rule evaluation live in
    // js/achievements.js; these are just the thin network primitives it
    // calls (mirrors how ctx.reportScore in js/engine.js doesn't duplicate
    // networking either).
    unlockAchievement: (id) => {
      if (!session?.key || !session?.passwordHash) return Promise.resolve({ ok: false, msg: "Not signed in." });
      return apiCall("unlock-achievement", { key: session.key, passwordHash: session.passwordHash, achievementId: id });
    },
    checkServerAchievements: () => {
      if (!session?.key || !session?.passwordHash) return Promise.resolve({ ok: false, msg: "Not signed in." });
      return apiCall("check-achievements", { key: session.key, passwordHash: session.passwordHash });
    },
    // Friends
    followByName: (name) => {
      if (!session?.key || !session?.passwordHash) return Promise.resolve({ ok: false, msg: "Not signed in." });
      return apiCall("follow", { key: session.key, passwordHash: session.passwordHash, targetName: name }, "friends");
    },
    unfollowKey: (targetKey) => {
      if (!session?.key || !session?.passwordHash) return Promise.resolve({ ok: false, msg: "Not signed in." });
      return apiCall("unfollow", { key: session.key, passwordHash: session.passwordHash, targetKey }, "friends");
    },
    listFriends: () => {
      if (!session?.key || !session?.passwordHash) return Promise.resolve({ ok: false, msg: "Not signed in." });
      return apiCall("list", { key: session.key, passwordHash: session.passwordHash }, "friends");
    },
  };
})();
