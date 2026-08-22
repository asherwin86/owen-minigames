// Achievements: a badge catalog, mostly hub-level/meta signals derivable
// from data that already exists (games played, profile age, follows,
// leaderboard participation) rather than instrumenting all 80 games. Split
// between client-attested (self-reported, see the "kind" field and
// server.js's own comment on the trust tradeoff this accepts) and
// server-verified (checked against ground truth the server already owns).
// Same self-contained-overlay pattern as the admin panel in js/profiles.js.
(function () {
  const CATALOG = [
    { id: "first-boot", title: "First Boot", emoji: "🎮", desc: "Played your first game.", kind: "client" },
    { id: "ten-games", title: "Ten in the Hub", emoji: "🔟", desc: "Played 10 distinct games.", kind: "client" },
    { id: "forty-games", title: "Half Century", emoji: "🎯", desc: "Played 40 distinct games.", kind: "client" },
    { id: "all-80", title: "The Full 80", emoji: "🏅", desc: "Played all 80 games.", kind: "client" },
    { id: "party-started", title: "Party Started", emoji: "🎉", desc: "Hosted or joined a multiplayer room.", kind: "client" },
    { id: "regular", title: "Regular", emoji: "📅", desc: "Profile is a week old.", kind: "server" },
    { id: "old-timer", title: "Old Timer", emoji: "🕰️", desc: "Profile is 90 days old.", kind: "server" },
    { id: "made-a-friend", title: "Made a Friend", emoji: "🤝", desc: "Got a mutual friend.", kind: "server" },
    { id: "popular", title: "Popular", emoji: "🌟", desc: "5 mutual friends.", kind: "server" },
    { id: "on-the-board", title: "On the Board", emoji: "📈", desc: "Appeared on a leaderboard.", kind: "server" },
    { id: "top-of-the-charts", title: "Top of the Charts", emoji: "👑", desc: "Reached #1 on a leaderboard.", kind: "server" },
    { id: "kitted-out", title: "Kitted Out", emoji: "🎨", desc: "Chose a Kart Circuit color.", kind: "server" },
  ];

  // Client-attested rules evaluated from games-played data already synced to
  // this device (mimiRecentlyPlayed). "party-started" is NOT evaluated here
  // — Kart Circuit and js/play-together.js each unlock it directly, right
  // when a multiplayer room is actually joined/hosted, since that's the one
  // moment they know it happened (this panel only runs on the hub's own
  // top-level page and has no visibility into an in-progress game session).
  function playedGameIds() {
    try {
      const raw = JSON.parse(localStorage.getItem("mimiRecentlyPlayed") || "[]");
      return Array.isArray(raw) ? raw.map((e) => (typeof e === "string" ? e : e?.id)).filter(Boolean) : [];
    } catch (e) {
      return [];
    }
  }
  function evaluateClientRules() {
    const played = new Set(playedGameIds());
    const met = [];
    if (played.size >= 1) met.push("first-boot");
    if (played.size >= 10) met.push("ten-games");
    if (played.size >= 40) met.push("forty-games");
    if (played.size >= 80) met.push("all-80");
    return met;
  }

  const overlay = document.createElement("div");
  overlay.className = "updates-overlay hidden";
  overlay.id = "achievementsOverlay";
  overlay.innerHTML = `
    <div class="updates-card">
      <button id="achievementsCloseBtn" class="help-close" type="button" aria-label="Close">✕</button>
      <div class="updates-header">
        <span class="updates-emoji">🏆</span>
        <div>
          <h2>Achievements</h2>
          <p class="help-meta">Sign in to start unlocking these</p>
        </div>
      </div>
      <div id="achievementsBody" class="updates-list"></div>
    </div>`;
  document.body.appendChild(overlay);
  const closeBtn = overlay.querySelector("#achievementsCloseBtn");
  const bodyEl = overlay.querySelector("#achievementsBody");

  async function checkAndUnlockAchievements() {
    if (!window.MimiProfiles?.isSignedIn?.()) return {};
    const clientMet = evaluateClientRules();
    await Promise.all(clientMet.map((id) => window.MimiProfiles.unlockAchievement(id)));
    const serverResult = await window.MimiProfiles.checkServerAchievements();
    return (serverResult && serverResult.ok) ? serverResult.unlocked : {};
  }

  async function renderPanel() {
    if (!window.MimiProfiles?.isSignedIn?.()) {
      bodyEl.innerHTML = `<p class="profile-status">Sign in from the 👤 Profile panel to track achievements.</p>`;
      return;
    }
    bodyEl.innerHTML = `<p class="profile-status">Checking…</p>`;
    const unlocked = await checkAndUnlockAchievements();
    bodyEl.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "profile-form";
    grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px";
    CATALOG.forEach((a) => {
      const isUnlocked = Boolean(unlocked[a.id]);
      const card = document.createElement("div");
      card.className = "profile-security-section";
      card.style.cssText = "text-align:center;padding:14px 8px" + (isUnlocked ? "" : ";filter:grayscale(1);opacity:.55");
      const emoji = document.createElement("div");
      emoji.style.fontSize = "1.8rem";
      emoji.textContent = a.emoji;
      const title = document.createElement("p");
      title.className = "profile-name-line";
      title.style.justifyContent = "center";
      title.textContent = a.title;
      const desc = document.createElement("p");
      desc.className = "profile-note";
      desc.textContent = a.desc;
      card.append(emoji, title, desc);
      grid.appendChild(card);
    });
    bodyEl.appendChild(grid);
  }

  function openPanel() {
    renderPanel();
    overlay.classList.remove("hidden");
  }
  function closePanel() {
    overlay.classList.add("hidden");
  }
  closeBtn.addEventListener("click", closePanel);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closePanel(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.classList.contains("hidden")) closePanel();
  });

  const btn = document.createElement("button");
  btn.id = "achievementsBtn";
  btn.className = "btn updates-btn";
  btn.type = "button";
  btn.textContent = "🏆 Achievements";
  document.querySelector(".topbar-controls")?.appendChild(btn);
  btn.addEventListener("click", openPanel);

  window.MimiAchievements = { checkAndUnlockAchievements };
})();
