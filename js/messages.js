// Messages: DMs between mutual friends only — same "you follow each other"
// gate js/friends.js already surfaces for presence, enforced server-side in
// handleMessagesApi (this panel only ever renders what the server already
// decided to send, same trust boundary as friends.js).
//
// Notifications: handleMessagesApi's "send" action pushes a "new-message"
// payload straight down the existing presence WebSocket (see
// pushPresenceMessage in server.js and the message listener profiles.js
// adds to that socket), re-dispatched here as a "mimi-new-message" window
// event. That drives a red dot on the Messages button and a real
// Notification popup — but only when you're connected and not already
// looking at that exact conversation. The 4s poll below stays as the
// fallback for whenever the push doesn't land (socket briefly dropped, a
// message sent while this device was offline) — same honest-degradation
// choice profiles.js's presence connection already documents.
// Same self-contained-overlay pattern as js/friends.js.
(function () {
  const overlay = document.createElement("div");
  overlay.className = "updates-overlay hidden";
  overlay.id = "messagesOverlay";
  overlay.innerHTML = `
    <div class="updates-card">
      <button id="messagesCloseBtn" class="help-close" type="button" aria-label="Close">✕</button>
      <div class="updates-header">
        <span class="updates-emoji">💬</span>
        <div>
          <h2 id="messagesTitle">Messages</h2>
          <p class="help-meta" id="messagesSubtitle">Message mutual friends — follow each other first</p>
        </div>
      </div>
      <div id="messagesBody" class="updates-list"></div>
    </div>`;
  document.body.appendChild(overlay);
  const closeBtn = overlay.querySelector("#messagesCloseBtn");
  const bodyEl = overlay.querySelector("#messagesBody");
  const titleEl = overlay.querySelector("#messagesTitle");
  const subtitleEl = overlay.querySelector("#messagesSubtitle");

  let pollTimer = null;
  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // Which conversation (if any) is currently on screen, so a push notice
  // can tell "they're already looking at this" (refresh in place, stay
  // quiet) from "they're somewhere else" (badge + Notification).
  let activeThreadKey = null;
  let activeThreadList = null;

  const badge = document.createElement("span");
  badge.id = "messagesBadge";
  badge.className = "updates-badge hidden";
  function showBadge() { badge.classList.remove("hidden"); }
  function clearBadge() { badge.classList.add("hidden"); }

  function notifyNewMessage(data) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const body = data.text.length > 140 ? data.text.slice(0, 140) + "…" : data.text;
    let n;
    try {
      n = new Notification(`${data.fromName} messaged you`, { body, tag: "mimi-message-" + data.from });
    } catch (e) { return; } // some browsers throw for Notification() outside a service worker
    n.onclick = () => {
      window.focus();
      openPanel();
      openThread(data.from, data.fromName);
    };
  }

  window.addEventListener("mimi-new-message", (e) => {
    const data = e.detail;
    if (!data?.from) return;
    const panelOpen = !overlay.classList.contains("hidden");
    if (panelOpen && activeThreadKey === data.from && activeThreadList) {
      // Already looking right at this conversation — refresh in place
      // instead of a badge/popup for a message they can already see land.
      loadThreadMessages(data.from, window.MimiProfiles.getSessionKey(), activeThreadList);
      return;
    }
    if (panelOpen && activeThreadKey === null) renderInbox(); // inbox open — refresh its previews live
    showBadge();
    notifyNewMessage(data);
  });

  function timeLabel(ts) {
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
                   : d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  async function renderInbox() {
    stopPolling();
    activeThreadKey = null;
    activeThreadList = null;
    titleEl.textContent = "Messages";
    subtitleEl.textContent = "Message mutual friends — follow each other first";
    if (!window.MimiProfiles?.isSignedIn?.()) {
      bodyEl.innerHTML = `<p class="profile-status">Sign in from the 👤 Profile panel to message friends.</p>`;
      return;
    }
    bodyEl.innerHTML = `<p class="profile-status">Loading…</p>`;
    const result = await window.MimiProfiles.getMessageInbox();
    if (!result.ok) {
      bodyEl.innerHTML = "";
      const err = document.createElement("p");
      err.className = "profile-status error";
      err.textContent = result.msg || "Couldn't load messages.";
      bodyEl.appendChild(err);
      return;
    }
    bodyEl.innerHTML = "";
    const friends = result.friends || [];
    if (!friends.length) {
      const empty = document.createElement("p");
      empty.className = "profile-note";
      empty.textContent = "No mutual friends yet — add each other from the 👥 Friends panel, then you can message here.";
      bodyEl.appendChild(empty);
      return;
    }
    friends.forEach((f) => {
      const row = document.createElement("div");
      row.className = "profile-identity-row message-inbox-row";

      const avatar = document.createElement("span");
      avatar.className = "profile-avatar";
      if (f.avatar) avatar.style.backgroundImage = `url(${f.avatar})`;

      const info = document.createElement("span");
      info.style.flex = "1";
      info.style.display = "flex";
      info.style.flexDirection = "column";
      info.style.minWidth = "0";
      const nameLine = document.createElement("span");
      nameLine.className = "profile-name-line";
      nameLine.textContent = f.name;
      info.appendChild(nameLine);
      const preview = document.createElement("span");
      preview.className = "profile-note message-preview";
      if (f.lastMessage) {
        const mine = f.lastMessage.from !== f.key;
        preview.textContent = (mine ? "You: " : "") + f.lastMessage.text;
      } else {
        preview.textContent = "Say hi 👋";
      }
      info.appendChild(preview);

      row.append(avatar, info);
      row.addEventListener("click", () => openThread(f.key, f.name));
      bodyEl.appendChild(row);
    });
  }

  async function loadThreadMessages(withKey, myKey, listEl) {
    const result = await window.MimiProfiles.getMessageThread(withKey);
    if (!result.ok) return false;
    listEl.innerHTML = "";
    (result.messages || []).forEach((m) => listEl.appendChild(bubble(m, myKey)));
    listEl.scrollTop = listEl.scrollHeight;
    return true;
  }

  function bubble(m, myKey) {
    const el = document.createElement("div");
    el.className = "message-bubble" + (m.from === myKey ? " mine" : "");
    const text = document.createElement("span");
    text.className = "message-bubble-text";
    text.textContent = m.text;
    const time = document.createElement("span");
    time.className = "message-bubble-time";
    time.textContent = timeLabel(m.ts);
    el.append(text, time);
    return el;
  }

  async function openThread(withKey, withName) {
    stopPolling();
    activeThreadKey = withKey;
    activeThreadList = null;
    titleEl.textContent = withName;
    subtitleEl.innerHTML = "";
    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "btn";
    backBtn.textContent = "← All messages";
    backBtn.addEventListener("click", renderInbox);
    subtitleEl.appendChild(backBtn);

    bodyEl.innerHTML = "";
    const list = document.createElement("div");
    list.className = "message-thread-list";
    list.textContent = "Loading…";
    bodyEl.appendChild(list);
    activeThreadList = list;

    const inputRow = document.createElement("div");
    inputRow.className = "message-input-row";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Message…";
    input.maxLength = 1000;
    input.autocomplete = "off";
    const sendBtn = document.createElement("button");
    sendBtn.type = "button";
    sendBtn.className = "btn primary";
    sendBtn.textContent = "Send";
    inputRow.append(input, sendBtn);
    bodyEl.appendChild(inputRow);

    const status = document.createElement("p");
    status.className = "profile-status error";
    bodyEl.appendChild(status);

    const myKey = window.MimiProfiles.getSessionKey();
    const ok = await loadThreadMessages(withKey, myKey, list);
    if (!ok) { list.textContent = ""; status.textContent = "Couldn't load this conversation."; return; }

    async function send() {
      const text = input.value.trim();
      if (!text) return;
      sendBtn.disabled = true;
      const r = await window.MimiProfiles.sendMessage(withKey, text);
      sendBtn.disabled = false;
      if (r.ok) {
        input.value = "";
        status.textContent = "";
        list.appendChild(bubble(r.message, myKey));
        list.scrollTop = list.scrollHeight;
      } else {
        status.textContent = r.msg || "Couldn't send that message.";
      }
    }
    sendBtn.addEventListener("click", send);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });

    // Fallback for the push notice above missing this thread for any
    // reason — see the file header.
    pollTimer = setInterval(() => loadThreadMessages(withKey, myKey, list), 4000);
  }

  function openPanel() {
    // Called directly from the button's click handler (still a user
    // gesture at this point in the call stack), which some browsers
    // (Safari) require for this to ever actually prompt.
    if (("Notification" in window) && Notification.permission === "default") Notification.requestPermission();
    clearBadge();
    renderInbox();
    overlay.classList.remove("hidden");
  }
  function closePanel() {
    stopPolling();
    activeThreadKey = null;
    activeThreadList = null;
    overlay.classList.add("hidden");
  }
  closeBtn.addEventListener("click", closePanel);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closePanel(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.classList.contains("hidden")) closePanel();
  });

  const btn = document.createElement("button");
  btn.id = "messagesBtn";
  btn.className = "btn updates-btn";
  btn.type = "button";
  btn.append(document.createTextNode("💬 Messages"), badge);
  document.querySelector(".topbar-controls")?.appendChild(btn);
  btn.addEventListener("click", openPanel);
})();
