/* Feedback — a private inbox, not a public feed.
 *
 * Anyone can send feedback, signed in or not: a bug report shouldn't require
 * an account first. What you send only comes back to you as "sent" — nobody
 * else sees the list, including other regular players. Only a verified dev
 * account can read what's come in (server.js gates "list" on entry.dev the
 * same way the keys dev tools and Kart Circuit's cheats are gated), so this
 * behaves like a mailbox to the people running the hub, not a forum.
 */
(function () {
  "use strict";

  const CATEGORIES = [
    { id: "bug", label: "🐞 Bug" },
    { id: "suggestion", label: "💡 Suggestion" },
    { id: "other", label: "💬 Other" },
  ];

  function isDev() {
    try {
      return Boolean(JSON.parse(localStorage.getItem("mimiActiveSession") || "null")?.dev);
    } catch (e) {
      return false;
    }
  }

  // Notifications: handleFeedbackApi's "submit" action pushes a
  // "new-feedback" notice to every currently-connected dev (server-side —
  // a non-dev browser's presence socket never receives this at all, so
  // nothing here needs its own dev check). Same badge/Notification shape
  // as js/messages.js's "mimi-new-message" handling.
  const feedbackBtn = document.getElementById("feedbackBtn");
  let badge = null;
  let panelOpen = false;
  let liveInboxHost = null;

  if (feedbackBtn) {
    badge = document.createElement("span");
    badge.id = "feedbackBadge";
    badge.className = "updates-badge hidden";
    feedbackBtn.appendChild(badge);
  }

  function notifyNewFeedback(data) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const body = data.message.length > 140 ? data.message.slice(0, 140) + "…" : data.message;
    try {
      new Notification(`New feedback from ${data.name}`, { body, tag: "mimi-feedback" });
    } catch (e) { /* some browsers throw for Notification() outside a service worker */ }
  }

  window.addEventListener("mimi-new-feedback", (e) => {
    const data = e.detail;
    if (!data) return;
    if (panelOpen && liveInboxHost) {
      renderInbox(liveInboxHost); // already looking at the inbox — refresh in place
      return;
    }
    badge?.classList.remove("hidden");
    notifyNewFeedback(data);
  });

  function openPanel() {
    // Called directly from the button's click handler (still a user
    // gesture at this point in the call stack) — Safari in particular
    // needs that for this to ever actually prompt.
    if (("Notification" in window) && Notification.permission === "default") Notification.requestPermission();
    badge?.classList.add("hidden");

    const overlay = document.createElement("div");
    overlay.className = "updates-overlay feedback-overlay";
    overlay.innerHTML = `
      <div class="updates-card" style="max-width:520px">
        <button class="help-close" type="button" aria-label="Close">✕</button>
        <div class="updates-header">
          <span class="updates-emoji">💬</span>
          <div><h2>Feedback</h2><p class="help-meta">Bugs, ideas, anything — goes straight to the people running this hub</p></div>
        </div>
        <div class="updates-list">
          <div class="feedback-cats"></div>
          <textarea class="feedback-message" maxlength="2000" rows="5" placeholder="What's up?"></textarea>
          <button type="button" class="btn primary feedback-send">Send</button>
          <p class="feedback-status"></p>
          <div class="feedback-inbox"></div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    panelOpen = true;
    liveInboxHost = overlay.querySelector(".feedback-inbox");
    const close = () => {
      overlay.remove();
      panelOpen = false;
      liveInboxHost = null;
    };
    overlay.querySelector(".help-close").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

    let category = CATEGORIES[0].id;
    const catsHost = overlay.querySelector(".feedback-cats");
    function renderCats() {
      catsHost.innerHTML = "";
      CATEGORIES.forEach((c) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn" + (c.id === category ? " primary" : "");
        btn.textContent = c.label;
        btn.addEventListener("click", () => { category = c.id; renderCats(); });
        catsHost.appendChild(btn);
      });
    }
    renderCats();

    const textarea = overlay.querySelector(".feedback-message");
    const status = overlay.querySelector(".feedback-status");
    overlay.querySelector(".feedback-send").addEventListener("click", async () => {
      const message = textarea.value.trim();
      if (!message) { status.textContent = "Write something first."; return; }
      status.textContent = "Sending…";
      const res = await window.MimiProfiles?.submitFeedback?.(category, message);
      if (res && res.ok) {
        status.textContent = "Sent — thanks!";
        textarea.value = "";
        window.setTimeout(() => { status.textContent = ""; }, 3000);
      } else {
        status.textContent = res?.msg || "Couldn't send that — try again in a moment.";
      }
    });

    renderInbox(overlay.querySelector(".feedback-inbox"));
  }

  /* Only ever populated for a verified dev account — see the module comment.
   * Absent entirely for everyone else, same as keys.js's dev tools. */
  async function renderInbox(host) {
    if (!host || !isDev() || !window.MimiProfiles?.listFeedback) return;
    host.innerHTML = `<p class="keys-quest-title">🛠️ Inbox (dev only)</p><p class="profile-status">Loading…</p>`;
    const res = await window.MimiProfiles.listFeedback();
    if (!res || !res.ok) {
      host.innerHTML = `<p class="keys-quest-title">🛠️ Inbox (dev only)</p><p class="profile-note">Couldn't load it right now.</p>`;
      return;
    }
    if (!res.feedback.length) {
      host.innerHTML = `<p class="keys-quest-title">🛠️ Inbox (dev only)</p><p class="profile-note">Nothing sent in yet.</p>`;
      return;
    }
    const catLabel = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));
    host.innerHTML = `<p class="keys-quest-title">🛠️ Inbox (dev only) — ${res.feedback.length}</p>`;
    const list = document.createElement("div");
    list.className = "feedback-inbox-list";
    res.feedback.forEach((f) => {
      const row = document.createElement("div");
      row.className = "feedback-row";
      const when = new Date(f.createdAt).toLocaleString();
      row.innerHTML = `<div class="feedback-row-top"><span>${catLabel[f.category] || f.category}</span><strong>${f.name}</strong><span class="feedback-row-when">${when}</span></div>
        <p class="feedback-row-msg"></p>`;
      row.querySelector(".feedback-row-msg").textContent = f.message; // textContent, never innerHTML — this is player-submitted text
      list.appendChild(row);
    });
    host.appendChild(list);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("feedbackBtn");
    if (btn) btn.addEventListener("click", openPanel);
  });
})();
