(function () {
  // See js/profiles.js for why a configured Server address override also
  // counts as "not static mode" — it's a real backend even on a page
  // loaded from GitHub Pages.
  const STATIC_MODE = window.MIMI_STATIC_MODE === true && !window.MimiGames?.getServerBase();
  const grid = document.getElementById("gameGrid");
  const topbar = document.getElementById("topbar");
  const searchHomeView = document.getElementById("searchHomeView");
  const searchHomeForm = document.getElementById("searchHomeForm");
  const searchHomeInput = document.getElementById("searchHomeInput");
  const searchHomeMimiApp = document.getElementById("searchHomeMimiApp");
  const searchHomeCalculatorApp = document.getElementById("searchHomeCalculatorApp");
  const searchHomeNotesApp = document.getElementById("searchHomeNotesApp");
  const searchHomeTimerApp = document.getElementById("searchHomeTimerApp");
  const pageViewOverlay = document.getElementById("pageViewOverlay");
  const pageViewBackBtn = document.getElementById("pageViewBackBtn");
  const pageViewUrl = document.getElementById("pageViewUrl");
  const pageViewStatus = document.getElementById("pageViewStatus");
  const pageViewFrame = document.getElementById("pageViewFrame");
  const downloadAppBtn = document.getElementById("downloadAppBtn");
  const downloadAppMenu = document.getElementById("downloadAppMenu");
  const landingView = document.getElementById("landingView");
  const browseControls = document.getElementById("browseControls");
  const playSoloBtn = document.getElementById("playSoloBtn");
  const playMultiplayerBtn = document.getElementById("playMultiplayerBtn");
  const playWirelessBtn = document.getElementById("playWirelessBtn");
  const brandHomeBtn = document.getElementById("brandHomeBtn");
  const menuView = document.getElementById("menuView");
  const gameView = document.getElementById("gameView");
  const gameStage = document.getElementById("gameStage");
  const gameTitle = document.getElementById("gameTitle");
  const gameStatus = document.getElementById("gameStatus");
  const howTo = document.getElementById("howToPlay");
  const howToPlayDetails = document.getElementById("howToPlayDetails");
  const backBtn = document.getElementById("backBtn");
  const helpBtn = document.getElementById("helpBtn");
  const search = document.getElementById("search");
  const categoryFiltersEl = document.getElementById("categoryFilters");
  const surpriseBtn = document.getElementById("surpriseBtn");
  const musicBtn = document.getElementById("musicBtn");
  const continuePlaying = document.getElementById("continuePlaying");
  const continueRow = document.getElementById("continueRow");
  const clearContinueBtn = document.getElementById("clearContinueBtn");

  let activeCleanup = null;
  let activeFilter = "All";
  let searchTerm = "";
  let lastDef = null;

  const games = MimiGames.getAll().sort((a, b) => a.title.localeCompare(b.title));
  const gamesById = new Map(games.map((g) => [g.id, g]));

  const FAVORITES_CHIP = "⭐ Favorites";
  const THREED_CHIP = "🕶️ 3D";
  const MULTIPLAYER_CHIP = "👥 Multiplayer";
  const categories = [
    "All",
    FAVORITES_CHIP,
    THREED_CHIP,
    MULTIPLAYER_CHIP,
    ...Array.from(new Set(games.map((g) => g.category))),
  ];

  // "1P" -> false, "2P"/"1-2P"/"1-13P"/"1-20P" -> true (any max player count > 1)
  function isMultiplayer(g) {
    const nums = (g.players || "").match(/\d+/g);
    if (!nums) return false;
    return Math.max(...nums.map(Number)) > 1;
  }

  // ---------- favorites (starred games, persisted) ----------
  const FAV_KEY = "mimiFavorites";
  function loadFavorites() {
    try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]")); } catch (e) { return new Set(); }
  }
  const favorites = loadFavorites();
  function saveFavorites() {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(favorites))); } catch (e) { /* private mode etc. */ }
  }
  function toggleFavorite(id) {
    if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
    saveFavorites();
  }

  // ---------- recently played ----------
  const RECENT_KEY = "mimiRecentlyPlayed";
  const RECENT_MAX = 8;
  function loadRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch (e) { return []; }
  }
  let recentIds = loadRecent().filter((id) => gamesById.has(id));
  function saveRecent() {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recentIds)); } catch (e) { /* ignore */ }
  }
  function recordPlayed(id) {
    recentIds = [id, ...recentIds.filter((x) => x !== id)].slice(0, RECENT_MAX);
    saveRecent();
  }
  function clearRecent() {
    recentIds = [];
    saveRecent();
    renderContinuePlaying();
  }
  clearContinueBtn.onclick = () => {
    MimiHubAudio?.playUiSound("click");
    clearRecent();
  };

  function renderFilters() {
    categoryFiltersEl.innerHTML = "";
    categories.forEach((cat) => {
      const chip = document.createElement("button");
      chip.className = "cat-chip" + (cat === activeFilter ? " active" : "");
      chip.textContent = cat;
      chip.onclick = () => {
        activeFilter = cat;
        MimiHubAudio?.playUiSound("click");
        renderFilters();
        renderGrid();
      };
      categoryFiltersEl.appendChild(chip);
    });
  }

  function matchesFilter(g) {
    if (activeFilter === "All") return true;
    if (activeFilter === FAVORITES_CHIP) return favorites.has(g.id);
    if (activeFilter === THREED_CHIP) return (g.tags || []).includes("3D");
    if (activeFilter === MULTIPLAYER_CHIP) return isMultiplayer(g);
    return g.category === activeFilter;
  }
  function matchesSearch(g) {
    if (!searchTerm) return true;
    return g.title.toLowerCase().includes(searchTerm) || g.category.toLowerCase().includes(searchTerm);
  }
  function currentlyFiltered() {
    return games.filter((g) => matchesFilter(g) && matchesSearch(g));
  }

  function renderContinuePlaying() {
    const recentGames = recentIds.map((id) => gamesById.get(id)).filter(Boolean);
    continueRow.innerHTML = "";
    if (!recentGames.length) {
      continuePlaying.classList.add("hidden");
      return;
    }
    continuePlaying.classList.remove("hidden");
    recentGames.forEach((g, i) => {
      const tile = document.createElement("button");
      tile.type = "button";
      // the most recent one reads as "your spot" — same idea as "Continue
      // Watching": this hub can't save exact mid-game state (69 independent
      // games, no shared save format), but it can always put you one click
      // from whatever you were last playing
      tile.className = "continue-tile" + (i === 0 ? " continue-tile--last" : "");
      tile.innerHTML = i === 0
        ? `<span class="tile-emoji">${g.emoji || "🎮"}</span><span class="continue-tile-text"><span class="continue-tile-label">Jump back in</span><span class="tile-title">${g.title}</span></span>`
        : `<span class="tile-emoji">${g.emoji || "🎮"}</span><span class="tile-title">${g.title}</span>`;
      tile.style.setProperty("--i", i);
      tile.onclick = () => openGame(g);
      continueRow.appendChild(tile);
    });
  }

  function renderGrid() {
    grid.innerHTML = "";
    const filtered = currentlyFiltered();
    filtered.forEach((g) => {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "game-tile";
      const isFav = favorites.has(g.id);
      tile.innerHTML = `
        <span class="tile-num">#${games.indexOf(g) + 1}</span>
        <span class="tile-fav${isFav ? " is-fav" : ""}" role="button" tabindex="0" aria-label="Favorite ${g.title}" title="Favorite">${isFav ? "⭐" : "☆"}</span>
        <span class="tile-emoji">${g.emoji || "🎮"}</span>
        <span class="tile-title">${g.title}</span>
        <span class="tile-meta">${g.players || "1P"} · ${g.category}</span>
      `;
      tile.style.setProperty("--i", filtered.indexOf(g));
      // Stable per-game icon hue (css/switch2.css) — position in the full
      // list, so filtering never repaints a game a different colour.
      tile.style.setProperty("--hue", games.indexOf(g));
      tile.onclick = () => openGame(g);
      const favEl = tile.querySelector(".tile-fav");
      const onToggleFav = (e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleFavorite(g.id);
        MimiHubAudio?.playUiSound("pop");
        const nowFav = favorites.has(g.id);
        favEl.textContent = nowFav ? "⭐" : "☆";
        favEl.classList.toggle("is-fav", nowFav);
        favEl.classList.remove("pop");
        void favEl.offsetWidth;
        favEl.classList.add("pop");
        if (activeFilter === FAVORITES_CHIP) renderGrid();
      };
      favEl.addEventListener("click", onToggleFav);
      favEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") onToggleFav(e);
      });
      grid.appendChild(tile);
    });
    if (!filtered.length) {
      const msg = activeFilter === FAVORITES_CHIP
        ? "No favorites yet — click the star on a game to add it here."
        : "No games match your search.";
      grid.innerHTML = `<p style="color:var(--text-dim)">${msg}</p>`;
    }
  }

  // toggling .hidden alone won't replay the view's CSS entrance animation
  // (the element never left the DOM) — force a reflow between removing and
  // re-adding .hidden so the fade-in restarts each time a view is shown
  function replayViewAnim(el) {
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
  }

  function openGame(def) {
    lastDef = def;
    recordPlayed(def.id);
    renderContinuePlaying();
    menuView.classList.add("hidden");
    browseControls.classList.add("hidden");
    gameView.classList.remove("hidden");
    replayViewAnim(gameView);
    gameTitle.textContent = `${def.emoji || ""} ${def.title}`;
    howTo.textContent = def.howTo || "";
    howToPlayDetails.open = false;
    gameStatus.textContent = "";
    gameStage.innerHTML = "";
    gameStage.style.position = "relative";
    helpBtn.onclick = () => MimiHelpGuide.open(def);
    MimiHubAudio?.setInGame(true);

    const ctx = MimiGames.makeContext(def.id, gameStatus);
    try {
      activeCleanup = def.init(gameStage, ctx) || null;
    } catch (err) {
      console.error("Game failed to load:", def.id, err);
      gameStage.innerHTML = `<p style="color:var(--lose)">This game hit an error and couldn't load. (${err.message})</p>`;
    }
    setRoute(`/${def.id}`);
    document.dispatchEvent(new CustomEvent("mimi:gameopen", { detail: def }));
  }

  function closeGame() {
    MimiHelpGuide.close();
    if (typeof activeCleanup === "function") {
      try {
        activeCleanup();
      } catch (e) {
        console.error(e);
      }
    }
    activeCleanup = null;
    gameStage.innerHTML = "";
    gameView.classList.add("hidden");
    menuView.classList.remove("hidden");
    browseControls.classList.remove("hidden");
    replayViewAnim(menuView);
    MimiHubAudio?.setInGame(false);
    setRoute("/games");
    document.dispatchEvent(new CustomEvent("mimi:gameclose"));
  }

  /* Shareable per-game URLs.
   *
   * The hub is one page, so all 85 games used to sit at the same address and
   * "come play Snake" could only ever be a link to the front door. Opening a
   * game now puts /<id> in the address bar, and arriving on that URL opens that
   * game directly — the server hands back index.html for any single-segment
   * path that isn't a real file (see resolvePrettyPath in server.js), so a cold
   * load or a refresh works too, not just in-app navigation.
   *
   * replaceState-vs-pushState matters here: pushState would mean every game you
   * opened piled onto the history stack, so Back walked you through your whole
   * browsing session one game at a time. One entry per view keeps Back meaning
   * "leave the game", which is what the on-screen Back button does too.
   *
   * All of it is skipped on the static GitHub Pages preview, which has no
   * server to serve index.html for a path that isn't a real file. */
  const routingEnabled = !window.MIMI_STATIC_MODE && typeof history.replaceState === "function";

  function setRoute(path) {
    if (!routingEnabled || location.pathname === path) return;
    try {
      history.replaceState({ path }, "", path + location.search);
    } catch (e) {
      /* file:// in the packaged desktop app — the hub works the same without it */
    }
  }

  // Returns the game a /play/<id> URL is asking for, if it names a real one.
  function routedGame() {
    if (!routingEnabled) return null;
    const match = /^\/([a-z0-9][a-z0-9-]*)$/i.exec(location.pathname);
    // gamesById is the authority — any other single-segment path (/games,
    // /home, a typo) simply isn't a game and falls through to the front page.
    return match ? gamesById.get(match[1].toLowerCase()) || null : null;
  }

  // Screen 0 (searchHomeView): a search-engine-style front page, shown
  // before anything else. "51 Mimi Games" is just the one app shortcut on
  // it for now — clicking it moves on to screen 1 exactly like brandHomeBtn
  // already did before this screen existed.
  function showSearchHome() {
    searchHomeView.classList.remove("hidden");
    landingView.classList.add("hidden");
    browseControls.classList.add("hidden");
    menuView.classList.add("hidden");
    topbar.classList.add("search-mode");
  }
  // Screen 1 (landingView): "Play Solo" or "Play Multiplayer". Screen 2
  // (menuView) is the full game grid either way — Multiplayer just arrives
  // with that filter chip already applied; nothing stops switching it back
  // to All or anything else once there, same as picking any other chip.
  function showLanding() {
    searchHomeView.classList.add("hidden");
    landingView.classList.remove("hidden");
    browseControls.classList.add("hidden");
    menuView.classList.add("hidden");
    topbar.classList.remove("search-mode");
  }
  function showBrowse(filterMode) {
    activeFilter = filterMode;
    searchHomeView.classList.add("hidden");
    landingView.classList.add("hidden");
    browseControls.classList.remove("hidden");
    menuView.classList.remove("hidden");
    topbar.classList.remove("search-mode");
    replayViewAnim(menuView);
    renderFilters();
    renderGrid();
  }
  searchHomeMimiApp.onclick = () => {
    MimiHubAudio?.playUiSound("click");
    showLanding();
  };
  // The three utility-app tiles jump straight into their tool, same as
  // picking them from the game grid, without going through Play
  // Solo/Multiplayer/Wireless first — they aren't games, that choice doesn't
  // apply to them.
  function openAppTile(id) {
    return () => {
      MimiHubAudio?.playUiSound("click");
      const def = gamesById.get(id);
      if (!def) return;
      showBrowse("All");
      openGame(def);
    };
  }
  searchHomeCalculatorApp.onclick = openAppTile("calculator");
  searchHomeNotesApp.onclick = openAppTile("notes");
  searchHomeTimerApp.onclick = openAppTile("timer");
  // A private page viewer, not a search engine: the server fetches the
  // exact URL you type and hands back that page's HTML, so the FIRST
  // request never comes from your own browser. There's no keyword
  // search/ranking behind this — type a URL (or a bare domain) and that's
  // the page you get.
  //
  // The frame runs scripts (sandbox="allow-scripts" in index.html) — most
  // real sites (Google, YouTube, DuckDuckGo, ...) render blank without
  // them, since their content is built by JS rather than present in the
  // raw HTML. Deliberately NOT combined with allow-same-origin: that
  // specific combination would let a script-enabled frame share the hub's
  // own origin, meaning fetched-page scripts could reach into the hub's
  // own localStorage/DOM — a well-known sandbox-escape pattern. Without
  // allow-same-origin, this frame is a fully opaque, isolated origin no
  // matter what runs inside it.
  //
  // That isolation is also why this page can no longer reach INTO the
  // frame at all — contentDocument is null cross-origin. Two real,
  // deliberate trade-offs follow from that, not oversights: the gamepad
  // cursor and on-screen keyboard (js/pad-cursor.js, js/virtual-keyboard.js)
  // can no longer see or click things inside a loaded page, only the
  // viewer's own back button/URL bar around it; and clicking a link now
  // navigates the frame directly, the same way any ordinary browser tab
  // would — only the page you actually typed into the search box goes
  // through the private fetch, not everywhere you click from there.
  function closePageView() {
    pageViewOverlay.classList.add("hidden");
    pageViewFrame.classList.add("hidden");
    pageViewFrame.srcdoc = "";
  }
  pageViewBackBtn.onclick = () => {
    MimiHubAudio?.playUiSound("click");
    closePageView();
  };

  // Cross-origin once loaded, so there's no way to read the frame's real
  // current URL after the visitor clicks around inside it — the bar just
  // shows what was actually typed/fetched, then admits it can't say more.
  let awaitingInitialLoad = false;
  pageViewFrame.addEventListener("load", () => {
    if (awaitingInitialLoad) {
      awaitingInitialLoad = false;
      return;
    }
    pageViewUrl.textContent = "Browsing within this site…";
  });

  async function loadPrivatePage(url) {
    pageViewOverlay.classList.remove("hidden");
    pageViewFrame.classList.add("hidden");
    pageViewUrl.textContent = url;
    pageViewStatus.textContent = "Loading…";
    pageViewStatus.classList.remove("hidden");
    if (STATIC_MODE) {
      pageViewStatus.textContent = "Browsing needs the full hosted version — not available on this static GitHub Pages preview.";
      return;
    }
    try {
      const resp = await fetch(`${window.MimiGames?.getServerBase() ?? ""}/api/fetch-page`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await resp.json();
      if (!data.ok) {
        pageViewStatus.textContent = data.msg || "Couldn't load that page.";
        return;
      }
      pageViewUrl.textContent = data.url;
      awaitingInitialLoad = true;
      pageViewFrame.srcdoc = data.html;
      pageViewFrame.classList.remove("hidden");
      pageViewStatus.classList.add("hidden");
    } catch (err) {
      pageViewStatus.textContent = "Couldn't reach the server.";
    }
  }

  // The viewed page can't be reached into from out here (no allow-same-origin
  // — see index.html's #pageViewFrame), so a script injected INTO that page
  // (server-side, see buildCompatShim in server.js) catches its own link
  // clicks/GET-form submits and relays the resolved URL back via postMessage
  // instead — keeping every page you click into private, not just the first
  // one you typed in. Checking e.source (not just e.data shape) confirms
  // this really came from our own iframe, not some other message source.
  window.addEventListener("message", (e) => {
    if (e.source !== pageViewFrame.contentWindow) return;
    if (e.data?.source === "mimi-private-browser" && e.data?.type === "navigate" && typeof e.data.url === "string") {
      loadPrivatePage(e.data.url);
    }
  });

  searchHomeForm.onsubmit = (e) => {
    e.preventDefault();
    const q = searchHomeInput.value.trim();
    if (!q) return;
    MimiHubAudio?.playUiSound("click");
    loadPrivatePage(q);
  };
  playSoloBtn.onclick = () => {
    MimiHubAudio?.playUiSound("click");
    showBrowse("All");
  };
  playMultiplayerBtn.onclick = () => {
    MimiHubAudio?.playUiSound("click");
    showBrowse(MULTIPLAYER_CHIP);
  };
  // Wireless is a room you host/join from anywhere (the same overlay as the
  // 📡 Play Together topbar button) rather than a filtered slice of the grid,
  // so it just opens the panel in place instead of navigating to screen 2.
  playWirelessBtn.onclick = () => {
    MimiHubAudio?.playUiSound("click");
    window.MimiPlayTogether?.openPanel();
  };
  brandHomeBtn.onclick = () => {
    MimiHubAudio?.playUiSound("click");
    if (!gameView.classList.contains("hidden")) closeGame();
    showLanding();
  };

  backBtn.onclick = () => {
    MimiHubAudio?.playUiSound("click");
    closeGame();
  };
  search.oninput = () => {
    searchTerm = search.value.trim().toLowerCase();
    renderGrid();
  };

  surpriseBtn.onclick = () => {
    const pool = currentlyFiltered();
    const source = pool.length ? pool : games;
    const pick = source[Math.floor(Math.random() * source.length)];
    MimiHubAudio?.playUiSound("powerUp");
    openGame(pick);
  };

  function syncMusicBtn() {
    musicBtn.textContent = `🎵 Music: ${MimiHubAudio?.isMusicOn() ? "On" : "Off"}`;
  }
  musicBtn.onclick = () => {
    MimiHubAudio?.toggleMusic();
    syncMusicBtn();
  };
  syncMusicBtn();

  // if music was left on from a previous visit, actually starting playback
  // needs a real user gesture (autoplay policy) — catch the first one
  let audioUnlocked = false;
  function unlockAudioOnce() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    const onMenu = gameView.classList.contains("hidden");
    if (MimiHubAudio?.isMusicOn() && onMenu) {
      MimiHubAudio.setInGame(false);
    }
    document.removeEventListener("pointerdown", unlockAudioOnce);
    document.removeEventListener("keydown", unlockAudioOnce);
  }
  document.addEventListener("pointerdown", unlockAudioOnce);
  document.addEventListener("keydown", unlockAudioOnce);

  // Download App: a real file (Downloads folder → you run it), not the
  // browser's own "Install app" PWA prompt — this is the desktop-app build,
  // separate from that. Highlights whichever platform this browser is
  // probably running on, but always shows all three; detection is just a
  // hint, not a gate.
  function detectDownloadPlatform() {
    const ua = navigator.userAgent;
    // Android UAs also contain "Linux", so this check must come first.
    if (/Android/i.test(ua)) return "android";
    if (/Win/i.test(ua)) return "win";
    if (/Mac/i.test(ua)) return "mac";
    if (/Linux|X11/i.test(ua)) return "linux";
    return null;
  }
  // The menu also offers the Android phone/tablet and TV apps, which are
  // never redundant regardless of which desktop platform you're already
  // running — so unlike the desktop installers, it stays visible even
  // inside the packaged Electron app.
  // The installer binaries live in downloads/ (gitignored — rebuilt per
  // release, never committed), so they simply aren't present in what gets
  // pushed to GitHub Pages. Hide the button rather than link to a 404.
  if (downloadAppBtn && downloadAppMenu && STATIC_MODE) {
    downloadAppBtn.closest(".download-app-wrap")?.classList.add("hidden");
  } else if (downloadAppBtn && downloadAppMenu) {
    const detected = detectDownloadPlatform();
    if (detected) {
      downloadAppMenu.querySelector(`[data-platform="${detected}"]`)?.classList.add("is-detected");
    }
    downloadAppBtn.onclick = (e) => {
      e.stopPropagation();
      MimiHubAudio?.playUiSound("click");
      downloadAppMenu.classList.toggle("hidden");
    };
    downloadAppMenu.addEventListener("click", (e) => {
      if (e.target.closest(".download-app-option")) {
        MimiHubAudio?.playUiSound("click");
        downloadAppMenu.classList.add("hidden");
      }
    });
    document.addEventListener("click", (e) => {
      if (!downloadAppMenu.classList.contains("hidden") && !downloadAppMenu.contains(e.target) && e.target !== downloadAppBtn) {
        downloadAppMenu.classList.add("hidden");
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!pageViewOverlay.classList.contains("hidden")) {
      closePageView();
    } else if (downloadAppMenu && !downloadAppMenu.classList.contains("hidden")) {
      downloadAppMenu.classList.add("hidden");
    } else if (MimiHelpGuide.isOpen()) {
      MimiHelpGuide.close();
    } else if (MimiUpdateCenter.isOpen()) {
      MimiUpdateCenter.close();
    } else if (window.MimiPlayTogether && MimiPlayTogether.isPanelOpen()) {
      MimiPlayTogether.closePanel();
    } else if (window.MimiSettingsPanel && MimiSettingsPanel.isOpen()) {
      MimiSettingsPanel.close();
    } else if (!gameView.classList.contains("hidden")) {
      closeGame();
    } else if (landingView.classList.contains("hidden")) {
      showLanding();
    } else if (searchHomeView.classList.contains("hidden")) {
      showSearchHome();
    }
  });

  window.MimiApp = {
    reopenCurrent() {
      if (!lastDef || gameView.classList.contains("hidden")) return;
      const def = lastDef;
      closeGame();
      openGame(def);
    },
    // exposed so embedded same-origin iframes (Kart Circuit) can back out to
    // the game grid from a gamepad gesture, without any DOM/cursor involved
    closeGame() {
      if (!gameView.classList.contains("hidden")) closeGame();
    },
  };

  // Desktop-app Start Menu shortcuts for Calculator/Notes/Timer & Stopwatch
  // launch the exe with --app=<id> (see electron/main.js), which turns into
  // this query param — jump straight into that tool, skipping the
  // search-home/landing/browse screens entirely.
  const launchAppId = new URLSearchParams(location.search).get("app");
  const launchDef = launchAppId ? gamesById.get(launchAppId) : null;
  // A /play/<id> URL is the same intent as the desktop app's --app shortcut:
  // skip the front page and open that game.
  const deepLinked = routedGame();
  if (launchDef || deepLinked) {
    showBrowse("All");
    openGame(launchDef || deepLinked);
  } else if (location.pathname === "/games" || location.pathname === "/games/") {
    showBrowse("All");
  } else {
    showSearchHome();
  }
  renderFilters();
  renderContinuePlaying();
  renderGrid();

  // A tripwire for a game file that silently failed to load or register — the
  // count only ever moves when a game is deliberately added, so a mismatch
  // means something is missing rather than something is new. Bump it when you
  // add one.
  const EXPECTED_GAMES = 88;
  console.log(`Loaded ${games.length} mini-games.`);
  if (games.length !== EXPECTED_GAMES) {
    console.warn(`Expected ${EXPECTED_GAMES} games, found ${games.length}.`);
  }
})();
