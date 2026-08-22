// Friends: follow-based, not a public directory — you add someone by typing
// their exact profile name (same as signing in already requires knowing an
// exact name), following is unilateral (no approval needed), and two
// profiles become "friends" once both follow each other. Online status and
// room-code visibility are gated to mutual friends only — a one-way follow
// sees nothing beyond "you follow them". See server.js's handleFriendsApi
// for the actual privacy enforcement (this panel only ever renders what the
// server already decided to send).
// Same self-contained-overlay pattern as the admin panel in js/profiles.js.
(function () {
  const overlay = document.createElement("div");
  overlay.className = "updates-overlay hidden";
  overlay.id = "friendsOverlay";
  overlay.innerHTML = `
    <div class="updates-card">
      <button id="friendsCloseBtn" class="help-close" type="button" aria-label="Close">✕</button>
      <div class="updates-header">
        <span class="updates-emoji">👥</span>
        <div>
          <h2>Friends</h2>
          <p class="help-meta">Follow by name — mutual follows show up as friends</p>
        </div>
      </div>
      <div id="friendsBody" class="updates-list"></div>
    </div>`;
  document.body.appendChild(overlay);
  const closeBtn = overlay.querySelector("#friendsCloseBtn");
  const bodyEl = overlay.querySelector("#friendsBody");

  function friendRow(f, statusEl) {
    const row = document.createElement("div");
    row.className = "profile-identity-row";
    row.style.marginBottom = "8px";

    const avatar = document.createElement("span");
    avatar.className = "profile-avatar";
    if (f.avatar) avatar.style.backgroundImage = `url(${f.avatar})`;

    const info = document.createElement("span");
    info.style.flex = "1";
    info.style.display = "flex";
    info.style.flexDirection = "column";
    const nameLine = document.createElement("span");
    nameLine.className = "profile-name-line";
    nameLine.textContent = f.name;
    if (f.online) {
      const dot = document.createElement("span");
      dot.textContent = "🟢 online";
      dot.className = "profile-dev-badge";
      dot.style.background = "rgba(124,252,154,.18)";
      dot.style.color = "#7cfc9a";
      nameLine.appendChild(dot);
    }
    info.appendChild(nameLine);
    if (f.roomCode) {
      const roomLine = document.createElement("span");
      roomLine.className = "profile-note";
      roomLine.textContent = `In room ${f.roomCode}`;
      info.appendChild(roomLine);
    }

    const actions = document.createElement("span");
    if (f.roomCode) {
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "btn";
      copyBtn.textContent = "Copy code";
      copyBtn.addEventListener("click", () => {
        navigator.clipboard?.writeText(f.roomCode).then(() => {
          copyBtn.textContent = "Copied!";
          setTimeout(() => { copyBtn.textContent = "Copy code"; }, 1500);
        });
      });
      actions.appendChild(copyBtn);
    }
    if (f.isFollowing) {
      const unfollowBtn = document.createElement("button");
      unfollowBtn.type = "button";
      unfollowBtn.className = "btn";
      unfollowBtn.textContent = "Unfollow";
      unfollowBtn.addEventListener("click", async () => {
        unfollowBtn.disabled = true;
        const r = await window.MimiProfiles.unfollowKey(f.key);
        if (r.ok) renderPanel();
        else { unfollowBtn.disabled = false; statusEl.className = "profile-status error"; statusEl.textContent = r.msg || "Couldn't unfollow."; }
      });
      actions.appendChild(unfollowBtn);
    }

    row.append(avatar, info, actions);
    return row;
  }

  function section(title, rows, emptyText, statusEl) {
    const wrap = document.createElement("div");
    wrap.className = "profile-security-section";
    const heading = document.createElement("p");
    heading.className = "profile-name-line";
    heading.textContent = title;
    wrap.appendChild(heading);
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "profile-note";
      empty.textContent = emptyText;
      wrap.appendChild(empty);
    } else {
      rows.forEach((f) => wrap.appendChild(friendRow(f, statusEl)));
    }
    return wrap;
  }

  async function renderPanel() {
    if (!window.MimiProfiles?.isSignedIn?.()) {
      bodyEl.innerHTML = `<p class="profile-status">Sign in from the 👤 Profile panel to follow people.</p>`;
      return;
    }
    bodyEl.innerHTML = `<p class="profile-status">Loading…</p>`;
    const result = await window.MimiProfiles.listFriends();
    bodyEl.innerHTML = "";
    if (!result.ok) {
      const err = document.createElement("p");
      err.className = "profile-status error";
      err.textContent = result.msg || "Couldn't load friends.";
      bodyEl.appendChild(err);
      return;
    }

    const form = document.createElement("div");
    form.className = "profile-form";

    const followRow = document.createElement("div");
    followRow.className = "profile-delete-row";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "Follow someone by name";
    nameInput.autocomplete = "off";
    const followBtn = document.createElement("button");
    followBtn.type = "button";
    followBtn.className = "btn";
    followBtn.textContent = "Follow";
    followRow.append(nameInput, followBtn);
    form.appendChild(followRow);

    const status = document.createElement("p");
    status.className = "profile-status";
    form.appendChild(status);

    followBtn.addEventListener("click", async () => {
      if (!nameInput.value.trim()) return;
      followBtn.disabled = true;
      const r = await window.MimiProfiles.followByName(nameInput.value.trim());
      followBtn.disabled = false;
      status.className = "profile-status" + (r.ok === false ? " error" : " ok");
      status.textContent = r.ok ? `Now following ${nameInput.value.trim()}.` : (r.msg || "Couldn't follow.");
      if (r.ok) { nameInput.value = ""; renderPanel(); }
    });

    const friends = result.friends || [];
    const mutual = friends.filter((f) => f.isFollowing && f.isFollower);
    const following = friends.filter((f) => f.isFollowing && !f.isFollower);
    const followers = friends.filter((f) => f.isFollower && !f.isFollowing);

    form.appendChild(section("Friends (mutual)", mutual, "No mutual friends yet — follow someone who follows you back.", status));
    form.appendChild(section("Following", following, "You're not following anyone else yet.", status));
    form.appendChild(section("Followers", followers, "Nobody else follows you yet.", status));

    bodyEl.appendChild(form);
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
  btn.id = "friendsBtn";
  btn.className = "btn updates-btn";
  btn.type = "button";
  btn.textContent = "👥 Friends";
  document.querySelector(".topbar-controls")?.appendChild(btn);
  btn.addEventListener("click", openPanel);
})();
