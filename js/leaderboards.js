// Leaderboards: global, cross-profile high-score boards for a small,
// representative set of games (not all 80 — see ctx.reportScore in
// js/engine.js and each game's own call site for how a game opts in).
// Same self-contained-overlay pattern as the admin panel in js/profiles.js.
(function () {
  const GAMES = [
    { id: "snake", label: "Snake", sortDir: "desc" },
    { id: "2048", label: "2048", sortDir: "desc" },
    { id: "reaction-test", label: "Reaction Test", sortDir: "asc" },
    { id: "bowling", label: "Bowling", sortDir: "desc" },
    { id: "darts", label: "Darts", sortDir: "desc" },
  ];
  let activeTab = GAMES[0].id;

  const overlay = document.createElement("div");
  overlay.className = "updates-overlay hidden";
  overlay.id = "leaderboardsOverlay";
  overlay.innerHTML = `
    <div class="updates-card">
      <button id="leaderboardsCloseBtn" class="help-close" type="button" aria-label="Close">✕</button>
      <div class="updates-header">
        <span class="updates-emoji">📊</span>
        <div>
          <h2>Leaderboards</h2>
          <p class="help-meta">Top scores across everyone signed in on this hub</p>
        </div>
      </div>
      <div id="leaderboardsTabs" class="profile-chip-row" style="padding:0 20px"></div>
      <div id="leaderboardsBody" class="updates-list"></div>
    </div>`;
  document.body.appendChild(overlay);
  const closeBtn = overlay.querySelector("#leaderboardsCloseBtn");
  const tabsEl = overlay.querySelector("#leaderboardsTabs");
  const bodyEl = overlay.querySelector("#leaderboardsBody");

  function renderTabs() {
    tabsEl.innerHTML = "";
    GAMES.forEach((game) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "profile-chip" + (game.id === activeTab ? " is-selected" : "");
      chip.textContent = game.label;
      chip.addEventListener("click", () => {
        if (activeTab === game.id) return;
        activeTab = game.id;
        renderTabs();
        renderBoard();
      });
      tabsEl.appendChild(chip);
    });
  }

  async function renderBoard() {
    bodyEl.innerHTML = `<p class="profile-status">Loading…</p>`;
    const myKey = window.MimiProfiles?.getSessionKey?.();
    const result = await window.MimiProfiles?.getLeaderboardTop(activeTab, 50);
    if (!result || !result.ok) {
      bodyEl.innerHTML = "";
      const err = document.createElement("p");
      err.className = "profile-status error";
      err.textContent = (result && result.msg) || "Couldn't load this leaderboard.";
      bodyEl.appendChild(err);
      return;
    }
    bodyEl.innerHTML = "";
    if (!result.entries.length) {
      const empty = document.createElement("p");
      empty.className = "profile-note";
      empty.textContent = "Nobody's on this board yet — be the first.";
      bodyEl.appendChild(empty);
      return;
    }
    const list = document.createElement("div");
    list.className = "profile-form";
    result.entries.forEach((row, index) => {
      const line = document.createElement("div");
      line.className = "profile-identity-row";
      if (row.key === myKey) line.style.cssText = "border:1px solid var(--accent2, #00c3e3);border-radius:10px;padding:4px 8px";

      const rank = document.createElement("span");
      rank.className = "profile-dev-badge";
      rank.textContent = `#${index + 1}`;
      rank.style.minWidth = "36px";
      rank.style.textAlign = "center";

      const avatar = document.createElement("span");
      avatar.className = "profile-avatar";
      if (row.avatar) avatar.style.backgroundImage = `url(${row.avatar})`;

      const name = document.createElement("span");
      name.textContent = row.name + (row.key === myKey ? " (you)" : "");
      name.style.flex = "1";

      const value = document.createElement("span");
      value.className = "profile-name-line";
      value.textContent = activeTab === "reaction-test" ? `${row.value} ms` : String(row.value);

      line.append(rank, avatar, name, value);
      list.appendChild(line);
    });
    bodyEl.appendChild(list);
  }

  function openPanel() {
    renderTabs();
    renderBoard();
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
  btn.id = "leaderboardsBtn";
  btn.className = "btn updates-btn";
  btn.type = "button";
  btn.textContent = "📊 Leaderboards";
  document.querySelector(".topbar-controls")?.appendChild(btn);
  btn.addEventListener("click", openPanel);
})();
