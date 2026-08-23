// Settings panel: a dedicated overlay for hub-wide preferences. Currently
// just hosts the gamepad settings (js/pad-cursor.js renders its content into
// #settingsBody) — previously buried inside the Play Together panel, which
// made no sense for someone who just wants to remap a button and has no
// interest in wireless multiplayer. Structured the same way as the Update
// Center overlay (js/update-center.js) for a consistent open/close feel.
(function () {
  const btn = document.getElementById("settingsBtn");
  const overlay = document.getElementById("settingsOverlay");
  const closeBtn = document.getElementById("settingsCloseBtn");
  const body = document.getElementById("settingsBody");

  // Theme: a handful of built-in presets plus a fully custom one built from
  // color pickers. Every preset (including custom) works the same way —
  // set a handful of CSS custom properties as inline styles on <html>, since
  // nearly everything in the hub already keys off those variable names (see
  // :root in css/style.css) and repaints itself automatically. The
  // .theme-light class is a separate flag for "does this read as light or
  // dark overall" (each preset carries it explicitly; custom themes work it
   // out from the chosen background's own brightness) — a few non-variable
  // things (the animated dark gradient, glow blobs, the tile LED strip)
  // switch off for any theme with that class, since they're a dark-console
  // effect that's just noise on a light background.
  const THEME_VARS = ["--bg", "--bg-alt", "--panel", "--panel-light", "--accent", "--accent2", "--accent3", "--text", "--text-dim", "--border", "--win", "--lose"];
  const THEME_PRESETS = {
    dark: {
      label: "🌙 Dark", swatch: "#0d0e10", dark: true,
      vars: { "--bg": "#0d0e10", "--bg-alt": "#17181b", "--panel": "#1c1d21", "--panel-light": "#26272c", "--accent": "#ff3c28", "--accent2": "#00c3e3", "--accent3": "#7ee81c", "--text": "#f1f3f9", "--text-dim": "#ffffff", "--border": "#34353b", "--win": "#35d07f", "--lose": "#ff5c5c" },
    },
    light: {
      label: "☀️ Light", swatch: "#ffffff", dark: false,
      vars: { "--bg": "#ffffff", "--bg-alt": "#f4f5f8", "--panel": "#ffffff", "--panel-light": "#eef0f5", "--accent": "#e0301e", "--accent2": "#0090ab", "--accent3": "#4a9e0a", "--text": "#1a1c24", "--text-dim": "#53566b", "--border": "#dcdee6", "--win": "#1f9a56", "--lose": "#e0301e" },
    },
    midnight: {
      label: "🌌 Midnight Purple", swatch: "#1a1230", dark: true,
      vars: { "--bg": "#140d24", "--bg-alt": "#1d1436", "--panel": "#221a3d", "--panel-light": "#2c2350", "--accent": "#b46bff", "--accent2": "#ff5fa8", "--accent3": "#7ee8e8", "--text": "#f2edff", "--text-dim": "#ffffff", "--border": "#3c2f66", "--win": "#4fe0a0", "--lose": "#ff6b8a" },
    },
    ocean: {
      label: "🌊 Ocean", swatch: "#082430", dark: true,
      vars: { "--bg": "#061c26", "--bg-alt": "#0a2733", "--panel": "#0e3140", "--panel-light": "#123c4e", "--accent": "#00d1c1", "--accent2": "#4d9fff", "--accent3": "#ffd166", "--text": "#e8fbff", "--text-dim": "#ffffff", "--border": "#1c4a5c", "--win": "#35d07f", "--lose": "#ff6b6b" },
    },
    sunset: {
      label: "🌅 Sunset", swatch: "#3a1530", dark: true,
      vars: { "--bg": "#241129", "--bg-alt": "#33163a", "--panel": "#3d1c46", "--panel-light": "#4a2454", "--accent": "#ff7a45", "--accent2": "#ff4d8f", "--accent3": "#ffd166", "--text": "#fff2ec", "--text-dim": "#ffffff", "--border": "#5a2f63", "--win": "#8ee06a", "--lose": "#ff5c6a" },
    },
    forest: {
      label: "🌲 Forest", swatch: "#0f2116", dark: true,
      vars: { "--bg": "#0b1a12", "--bg-alt": "#12261a", "--panel": "#173322", "--panel-light": "#1e402c", "--accent": "#5fd47a", "--accent2": "#ffb347", "--accent3": "#8ee8ff", "--text": "#eafff0", "--text-dim": "#ffffff", "--border": "#2b4d38", "--win": "#5fd47a", "--lose": "#ff6b6b" },
    },
    contrast: {
      label: "⬛ High Contrast", swatch: "#000000", dark: true,
      vars: { "--bg": "#000000", "--bg-alt": "#0a0a0a", "--panel": "#0d0d0d", "--panel-light": "#1a1a1a", "--accent": "#ffe600", "--accent2": "#00e5ff", "--accent3": "#39ff6a", "--text": "#ffffff", "--text-dim": "#ffffff", "--border": "#555555", "--win": "#39ff6a", "--lose": "#ff3b3b" },
    },
  };
  const CUSTOM_KEY = "mimiThemeCustom";
  const THEME_KEY = "mimiThemeChoice";

  function relativeLuminance(hex) {
    const n = parseInt(hex.replace("#", ""), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function loadCustomVars() {
    try {
      const saved = JSON.parse(localStorage.getItem(CUSTOM_KEY) || "null");
      if (saved && typeof saved === "object") return saved;
    } catch (e) { /* ignore */ }
    return { "--bg": "#101018", "--panel": "#1c1c28", "--accent": "#ff3c28", "--accent2": "#00c3e3", "--text": "#f1f3f9" };
  }
  function deriveFullVars(base) {
    // a custom theme only picks 5 core colors; the rest (bg-alt, panel-light,
    // border, accent3, win/lose) are derived so it doesn't take 12 pickers
    // to make something that looks coherent
    const isDark = relativeLuminance(base["--bg"]) < 0.5;
    return {
      "--bg": base["--bg"], "--panel": base["--panel"], "--accent": base["--accent"], "--accent2": base["--accent2"], "--text": base["--text"],
      "--bg-alt": base["--bg"], "--panel-light": base["--panel"],
      "--accent3": isDark ? "#7ee81c" : "#4a9e0a",
      "--text-dim": isDark ? "#ffffff" : "#53566b",
      "--border": isDark ? "#3a3a48" : "#dcdee6",
      "--win": isDark ? "#35d07f" : "#1f9a56",
      "--lose": isDark ? "#ff5c5c" : "#e0301e",
    };
  }

  function applyVars(vars) {
    THEME_VARS.forEach((name) => {
      if (vars[name]) document.documentElement.style.setProperty(name, vars[name]);
      else document.documentElement.style.removeProperty(name);
    });
  }
  function applyTheme(key) {
    if (key === "custom") {
      const base = loadCustomVars();
      const full = deriveFullVars(base);
      applyVars(full);
      document.documentElement.classList.toggle("theme-light", relativeLuminance(base["--bg"]) >= 0.5);
    } else {
      const preset = THEME_PRESETS[key] || THEME_PRESETS.dark;
      applyVars(preset.vars);
      document.documentElement.classList.toggle("theme-light", !preset.dark);
    }
  }

  function loadThemeChoice() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved && (saved === "custom" || THEME_PRESETS[saved])) return saved;
    } catch (e) { /* ignore */ }
    return "dark";
  }
  let currentTheme = loadThemeChoice();
  applyTheme(currentTheme);
  // signing into a profile (js/profiles.js) restores mimiThemeChoice /
  // mimiThemeCustom into localStorage and dispatches a storage event for
  // same-document listeners (native storage events only fire in *other*
  // documents) — react to that so the theme actually changes right away
  // instead of needing a reload, the same live-update pattern pad-cursor.js
  // already uses for its own synced prefs.
  window.addEventListener("storage", (e) => {
    if (e.key !== THEME_KEY && e.key !== CUSTOM_KEY) return;
    currentTheme = loadThemeChoice();
    applyTheme(currentTheme);
    syncCustomInputs();
    syncThemeUI();
  });

  const themeSection = document.createElement("div");
  themeSection.style.marginBottom = "18px";
  const themeLabel = document.createElement("p");
  themeLabel.className = "pt-status";
  themeLabel.style.marginBottom = "10px";
  themeLabel.innerHTML = "<strong>Theme</strong> — how the hub itself looks. Doesn't change how any individual game renders.";
  themeSection.appendChild(themeLabel);

  const presetRow = document.createElement("div");
  presetRow.style.cssText = "display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;";
  const presetButtons = {};
  Object.keys(THEME_PRESETS).forEach((key) => {
    const preset = THEME_PRESETS[key];
    const pBtn = document.createElement("button");
    pBtn.type = "button";
    pBtn.className = "btn";
    pBtn.style.cssText = "display:flex; align-items:center; gap:6px; padding:6px 12px;";
    const swatch = document.createElement("span");
    swatch.style.cssText = `display:inline-block; width:14px; height:14px; border-radius:50%; border:1px solid rgba(255,255,255,.3); background:${preset.swatch};`;
    pBtn.append(swatch, document.createTextNode(preset.label));
    pBtn.addEventListener("click", () => selectTheme(key));
    presetRow.appendChild(pBtn);
    presetButtons[key] = pBtn;
  });
  const customBtn = document.createElement("button");
  customBtn.type = "button";
  customBtn.className = "btn";
  customBtn.textContent = "🎨 Custom";
  customBtn.addEventListener("click", () => selectTheme("custom"));
  presetRow.appendChild(customBtn);
  presetButtons.custom = customBtn;
  themeSection.appendChild(presetRow);

  const customPanel = document.createElement("div");
  customPanel.style.cssText = "display:flex; gap:14px; flex-wrap:wrap; align-items:center; padding:10px; border:1px solid var(--border); border-radius:10px;";
  const CUSTOM_FIELDS = [["--bg", "Background"], ["--panel", "Panel"], ["--accent", "Accent"], ["--accent2", "Accent 2"], ["--text", "Text"]];
  const customInputs = {};
  CUSTOM_FIELDS.forEach(([varName, label]) => {
    const field = document.createElement("label");
    field.style.cssText = "display:flex; flex-direction:column; align-items:center; gap:4px; font-size:.72rem; color:var(--text-dim);";
    const input = document.createElement("input");
    input.type = "color";
    input.style.cssText = "width:38px; height:30px; border:1px solid var(--border); border-radius:6px; background:none; cursor:pointer; padding:0;";
    field.append(document.createTextNode(label), input);
    customPanel.appendChild(field);
    customInputs[varName] = input;
  });
  function syncCustomInputs() {
    const vals = loadCustomVars();
    CUSTOM_FIELDS.forEach(([varName]) => { customInputs[varName].value = vals[varName] || "#000000"; });
  }
  syncCustomInputs();
  Object.entries(customInputs).forEach(([varName, input]) => {
    input.addEventListener("input", () => {
      const vals = loadCustomVars();
      vals[varName] = input.value;
      try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(vals)); } catch (e) { /* storage unavailable */ }
      if (currentTheme === "custom") applyTheme("custom");
    });
  });
  themeSection.appendChild(customPanel);

  function selectTheme(key) {
    currentTheme = key;
    applyTheme(key);
    try { localStorage.setItem(THEME_KEY, key); } catch (e) { /* storage unavailable */ }
    syncThemeUI();
  }
  function syncThemeUI() {
    Object.entries(presetButtons).forEach(([key, elBtn]) => {
      elBtn.style.borderColor = key === currentTheme ? "var(--accent2)" : "";
      elBtn.style.boxShadow = key === currentTheme ? "0 0 0 1px var(--accent2)" : "";
    });
    customPanel.style.display = currentTheme === "custom" ? "flex" : "none";
  }
  syncThemeUI();
  body?.appendChild(themeSection);

  // Server address override — see js/engine.js's getServerBase/getServerWsBase
  // for how this gets used. Exists so an installed app (Android, desktop)
  // doesn't need rebuilding every time the backend's address changes; type
  // the current one in here and reload instead. Empty = use whatever origin
  // the page itself was loaded from, same as before this setting existed.
  const SERVER_OVERRIDE_KEY = "mimiServerOverride";
  const serverSection = document.createElement("div");
  serverSection.style.marginBottom = "18px";
  const serverLabel = document.createElement("p");
  serverLabel.className = "pt-status";
  serverLabel.style.marginBottom = "10px";
  serverLabel.innerHTML = "<strong>Server address</strong> — where this app looks for accounts, leaderboards, and multiplayer. Leave blank to use the site it was loaded from. Only needed if that changes without the app being reinstalled (e.g. a temporary tunnel URL).";
  serverSection.appendChild(serverLabel);

  const serverRow = document.createElement("div");
  serverRow.style.cssText = "display:flex; gap:8px; flex-wrap:wrap; align-items:center;";
  const serverInput = document.createElement("input");
  serverInput.type = "text";
  serverInput.placeholder = "https://example.com (blank = default)";
  serverInput.style.cssText = "flex:1; min-width:220px; padding:8px 10px; border-radius:8px; border:1px solid var(--border); background:var(--panel); color:var(--text);";
  try { serverInput.value = localStorage.getItem(SERVER_OVERRIDE_KEY) || ""; } catch (e) { /* storage unavailable */ }
  const serverSaveBtn = document.createElement("button");
  serverSaveBtn.type = "button";
  serverSaveBtn.className = "btn";
  serverSaveBtn.textContent = "Save & Reload";
  const serverStatus = document.createElement("p");
  serverStatus.className = "pt-status";
  serverStatus.style.cssText = "margin-top:8px; min-height: 1.2em;";
  serverSaveBtn.addEventListener("click", () => {
    const value = serverInput.value.trim().replace(/\/+$/, "");
    if (value && !/^https?:\/\/.+/i.test(value)) {
      serverStatus.textContent = "Needs to start with http:// or https://";
      return;
    }
    try {
      if (value) localStorage.setItem(SERVER_OVERRIDE_KEY, value);
      else localStorage.removeItem(SERVER_OVERRIDE_KEY);
    } catch (e) {
      serverStatus.textContent = "Couldn't save — storage unavailable.";
      return;
    }
    location.reload();
  });
  serverRow.append(serverInput, serverSaveBtn);
  serverSection.append(serverRow, serverStatus);
  body?.appendChild(serverSection);

  function isOpen() {
    return !overlay.classList.contains("hidden");
  }

  function open() {
    overlay.classList.remove("hidden");
  }

  function close() {
    overlay.classList.add("hidden");
  }

  btn.addEventListener("click", () => (isOpen() ? close() : open()));
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  window.MimiSettingsPanel = { open, close, isOpen };
})();
