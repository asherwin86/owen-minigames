// Play Together: wireless multiplayer for every game in the hub.
// The host's live game (DOM + canvas frames) is mirrored to everyone in the
// room over the same /mp room relay Kart Circuit uses, and guests' clicks,
// pointer moves, and key presses are forwarded back and replayed on the host.
// 2P hotseat games become playable across computers; 1P games become co-op.
(function () {
  // See js/profiles.js for why a configured Server address override also
  // counts as "not static mode" — it's a real backend even on a page
  // loaded from GitHub Pages.
  const STATIC_MODE = window.MIMI_STATIC_MODE === true && !window.MimiGames?.getServerBase();
  const gameStage = document.getElementById("gameStage");
  const gameView = document.getElementById("gameView");
  const menuView = document.getElementById("menuView");
  const gameTitle = document.getElementById("gameTitle");
  const gameStatus = document.getElementById("gameStatus");
  const howTo = document.getElementById("howToPlay");

  const FRAME_INTERVAL_MS = 150;
  const DOM_DEBOUNCE_MS = 100;
  const MOVE_THROTTLE_MS = 40;

  let socket = null;
  let role = "idle"; // idle | host | guest
  let roomCode = "";
  let players = [];
  let selfId = null;
  let currentDef = null;

  // host-side machinery
  let domObserver = null;
  let domSendTimer = null;
  let frameTimer = null;
  let lastFrames = [];

  // guest-side machinery
  let guestFrames = new Map(); // canvas index -> dataURL
  let lastMoveSent = 0;

  // --- panel UI ---
  const overlay = document.createElement("div");
  overlay.className = "updates-overlay hidden";
  overlay.id = "ptOverlay";
  overlay.innerHTML = `
    <div class="updates-card pt-card">
      <button id="ptCloseBtn" class="help-close" type="button" aria-label="Close">✕</button>
      <div class="updates-header">
        <span class="updates-emoji">📡</span>
        <div>
          <h2>Play Together</h2>
          <p class="help-meta">Play any game with friends on your network</p>
        </div>
      </div>
      <p id="ptStatus" class="pt-status">Host shares the game they have open. Friends join with the room code and play on the same board.</p>
      <div id="ptControls" class="pt-controls">
        <input id="ptNameInput" type="text" placeholder="Your name" maxlength="14" />
        <button id="ptHostBtn" class="btn primary" type="button">Host Room</button>
        <input id="ptCodeInput" type="text" placeholder="Code" maxlength="4" />
        <button id="ptJoinBtn" class="btn primary" type="button">Join Room</button>
      </div>
      <div id="ptRoomInfo" class="pt-room-info hidden">
        <p>Room code: <strong id="ptRoomCode"></strong></p>
        <p id="ptPlayerList" class="help-meta"></p>
        <button id="ptLeaveBtn" class="btn" type="button">Leave Room</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const ptStatus = overlay.querySelector("#ptStatus");
  const ptControls = overlay.querySelector("#ptControls");
  const ptNameInput = overlay.querySelector("#ptNameInput");
  const ptHostBtn = overlay.querySelector("#ptHostBtn");
  const ptCodeInput = overlay.querySelector("#ptCodeInput");
  const ptJoinBtn = overlay.querySelector("#ptJoinBtn");
  const ptRoomInfo = overlay.querySelector("#ptRoomInfo");
  const ptRoomCodeEl = overlay.querySelector("#ptRoomCode");
  const ptPlayerList = overlay.querySelector("#ptPlayerList");
  const ptLeaveBtn = overlay.querySelector("#ptLeaveBtn");
  const ptCloseBtn = overlay.querySelector("#ptCloseBtn");

  function playerName() {
    return ptNameInput.value.trim() || "Player";
  }

  function isPanelOpen() {
    return !overlay.classList.contains("hidden");
  }

  function openPanel() {
    if (STATIC_MODE) {
      ptStatus.textContent = "This is the static GitHub Pages preview — it has no server to relay a room over, so wireless play isn't available here. Use the full hosted version or the desktop app to play with friends.";
      ptControls.classList.add("hidden");
      ptRoomInfo.classList.add("hidden");
    }
    overlay.classList.remove("hidden");
  }

  function closePanel() {
    overlay.classList.add("hidden");
  }

  function syncPanel() {
    const inRoom = role !== "idle";
    ptControls.classList.toggle("hidden", inRoom);
    ptRoomInfo.classList.toggle("hidden", !inRoom);
    if (inRoom) {
      ptRoomCodeEl.textContent = roomCode;
      ptPlayerList.textContent = "Players: " + players.map((p) => p.name).join(", ");
      ptStatus.textContent = role === "host"
        ? "Hosting — open any game and everyone in the room plays it with you."
        : "Connected — you're playing live on the host's screen.";
    } else {
      ptStatus.textContent = "Host shares the game they have open. Friends join with the room code and play on the same board.";
    }
  }

  function send(pt) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "state", pt }));
    }
  }

  // --- host: mirror the stage out ---
  function stageHasIframe() {
    return Boolean(gameStage.querySelector("iframe"));
  }

  function sendSnapshot() {
    if (role !== "host") return;
    if (stageHasIframe()) {
      send({ kind: "native", title: gameTitle.textContent });
      return;
    }
    const inGame = !gameView.classList.contains("hidden");
    send({
      kind: "html",
      html: inGame ? gameStage.innerHTML : "",
      title: inGame ? gameTitle.textContent : "",
      status: gameStatus.textContent,
      howTo: howTo.textContent,
    });
    sendFrames(true);
  }

  function scheduleSnapshot() {
    clearTimeout(domSendTimer);
    domSendTimer = setTimeout(sendSnapshot, DOM_DEBOUNCE_MS);
  }

  function sendFrames(force) {
    if (role !== "host" || stageHasIframe()) return;
    const canvases = gameStage.querySelectorAll("canvas");
    canvases.forEach((canvas, index) => {
      if (!canvas.width || !canvas.height) return;
      let data;
      try {
        const tmp = document.createElement("canvas");
        tmp.width = canvas.width;
        tmp.height = canvas.height;
        const tctx = tmp.getContext("2d");
        tctx.fillStyle = "#101425";
        tctx.fillRect(0, 0, tmp.width, tmp.height);
        tctx.drawImage(canvas, 0, 0);
        data = tmp.toDataURL("image/jpeg", 0.6);
      } catch (e) {
        return;
      }
      if (!force && lastFrames[index] === data) return;
      lastFrames[index] = data;
      send({ kind: "frame", index, data });
    });
  }

  function startHosting() {
    domObserver = new MutationObserver(scheduleSnapshot);
    domObserver.observe(gameStage, { childList: true, subtree: true, attributes: true, characterData: true });
    domObserver.observe(gameStatus, { childList: true, characterData: true, subtree: true });
    frameTimer = setInterval(() => sendFrames(false), FRAME_INTERVAL_MS);
    sendSnapshot();
  }

  function stopHosting() {
    if (domObserver) domObserver.disconnect();
    domObserver = null;
    clearTimeout(domSendTimer);
    clearInterval(frameTimer);
    frameTimer = null;
    lastFrames = [];
  }

  // --- host: replay guest input ---
  function resolvePath(path) {
    let node = gameStage;
    for (const index of path) {
      node = node.children[index];
      if (!node) return null;
    }
    return node;
  }

  function pathCoords(target, nx, ny) {
    const rect = target.getBoundingClientRect();
    return {
      clientX: rect.left + nx * rect.width,
      clientY: rect.top + ny * rect.height,
    };
  }

  function replayInput(pt) {
    const target = pt.path ? resolvePath(pt.path) : gameStage;
    if (!target) return;
    const { clientX, clientY } = pathCoords(target, pt.nx ?? 0.5, pt.ny ?? 0.5);
    const base = { bubbles: true, cancelable: true, clientX, clientY, button: pt.button || 0, buttons: pt.buttons ?? 1, view: window };
    const fire = (PointerCtor, pointerType, MouseType, mouseType) => {
      try { target.dispatchEvent(new PointerEvent(pointerType, { ...base, pointerId: 9, isPrimary: true })); } catch (e) { /* older browser */ }
      target.dispatchEvent(new MouseEvent(mouseType, base));
    };
    if (pt.ev === "down") fire(PointerEvent, "pointerdown", MouseEvent, "mousedown");
    else if (pt.ev === "up") fire(PointerEvent, "pointerup", MouseEvent, "mouseup");
    else if (pt.ev === "move") fire(PointerEvent, "pointermove", MouseEvent, "mousemove");
    else if (pt.ev === "click") {
      fire(PointerEvent, "pointerdown", MouseEvent, "mousedown");
      fire(PointerEvent, "pointerup", MouseEvent, "mouseup");
      target.dispatchEvent(new MouseEvent("click", base));
    }
  }

  function replayKey(pt) {
    const init = { code: pt.code, key: pt.key, bubbles: true, cancelable: true };
    const type = pt.ev === "up" ? "keyup" : "keydown";
    document.dispatchEvent(new KeyboardEvent(type, init));
    window.dispatchEvent(new KeyboardEvent(type, init));
  }

  // --- guest: live view + input forwarding ---
  function enterLiveView() {
    if (window.MimiAppCloseGame && !gameView.classList.contains("hidden")) {
      // a local game is open; app.js closeGame will fire mimi:gameclose which we ignore for guests
    }
    menuView.classList.add("hidden");
    gameView.classList.remove("hidden");
    gameTitle.textContent = "🔴 LIVE — waiting for the host…";
    gameStatus.textContent = "";
    gameStage.innerHTML = "<p style='color:var(--text-dim)'>Waiting for the host to open a game…</p>";
    howTo.textContent = "You're playing live on the host's screen. Your clicks and keys control their game. Press Esc to leave.";
  }

  function exitLiveView() {
    gameStage.innerHTML = "";
    gameView.classList.add("hidden");
    menuView.classList.remove("hidden");
  }

  function applySnapshot(pt) {
    if (pt.kind === "native") {
      gameTitle.textContent = "🔴 LIVE — " + (pt.title || "Kart Circuit");
      gameStage.innerHTML = "<p style='color:var(--text-dim)'>This game has its own built-in wireless multiplayer — open it from your own menu and use Host/Join inside the game.</p>";
      return;
    }
    if (pt.kind === "html") {
      gameTitle.textContent = pt.title ? "🔴 LIVE — " + pt.title : "🔴 LIVE — host is picking a game…";
      gameStatus.textContent = pt.status || "";
      if (pt.howTo) howTo.textContent = pt.howTo;
      gameStage.innerHTML = pt.html || "<p style='color:var(--text-dim)'>Waiting for the host to open a game…</p>";
      guestFrames.forEach((data, index) => paintFrame(index, data));
      return;
    }
    if (pt.kind === "frame") {
      guestFrames.set(pt.index, pt.data);
      paintFrame(pt.index, pt.data);
    }
  }

  function paintFrame(index, data) {
    const canvas = gameStage.querySelectorAll("canvas")[index];
    if (!canvas) return;
    const img = new Image();
    img.onload = () => {
      const cctx = canvas.getContext("2d");
      if (!cctx) return;
      cctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = data;
  }

  function elementPath(el) {
    const path = [];
    let node = el;
    while (node && node !== gameStage) {
      const parent = node.parentElement;
      if (!parent) return null;
      path.unshift(Array.prototype.indexOf.call(parent.children, node));
      node = parent;
    }
    return node === gameStage ? path : null;
  }

  function forwardPointer(ev, type) {
    if (role !== "guest") return;
    const path = elementPath(ev.target);
    if (path === null) return;
    const rect = ev.target.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    ev.preventDefault();
    ev.stopPropagation();
    send({
      kind: "input",
      ev: type,
      path,
      nx: (ev.clientX - rect.left) / rect.width,
      ny: (ev.clientY - rect.top) / rect.height,
      button: ev.button || 0,
      buttons: ev.buttons,
    });
  }

  gameStage.addEventListener("click", (ev) => forwardPointer(ev, "click"), true);
  gameStage.addEventListener("pointerdown", (ev) => forwardPointer(ev, "down"), true);
  gameStage.addEventListener("pointerup", (ev) => forwardPointer(ev, "up"), true);
  gameStage.addEventListener("pointermove", (ev) => {
    if (role !== "guest") return;
    const now = performance.now();
    if (now - lastMoveSent < MOVE_THROTTLE_MS) return;
    lastMoveSent = now;
    forwardPointer(ev, "move");
  }, true);

  document.addEventListener("keydown", (ev) => {
    if (role !== "guest") return;
    if (ev.key === "Escape") return; // Esc stays local (leaves the session)
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    send({ kind: "key", ev: "down", code: ev.code, key: ev.key });
    if (ev.code === "Space" || ev.code.startsWith("Arrow")) ev.preventDefault();
  });
  document.addEventListener("keyup", (ev) => {
    if (role !== "guest") return;
    if (ev.key === "Escape") return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    send({ kind: "key", ev: "up", code: ev.code, key: ev.key });
  });

  // --- connection lifecycle ---
  function connect(onOpen) {
    const wsBase = window.MimiGames?.getServerWsBase();
    const wsUrl = wsBase ? `${wsBase}/mp` : `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/mp`;
    socket = new WebSocket(wsUrl);
    socket.addEventListener("open", () => onOpen(), { once: true });
    socket.addEventListener("message", (event) => {
      try {
        handleMessage(JSON.parse(event.data));
      } catch (e) {
        /* ignore malformed message */
      }
    });
    socket.addEventListener("close", () => {
      if (role !== "idle") leaveRoom(true);
    });
    socket.addEventListener("error", () => {
      ptStatus.textContent = "Connection error. Is the server reachable?";
    });
  }

  function handleMessage(msg) {
    if (msg.type === "joined") {
      selfId = msg.id;
      role = msg.isHost ? "host" : "guest";
      roomCode = msg.room;
      players = msg.players;
      window.MimiProfiles?.unlockAchievement?.("party-started");
      syncPanel();
      if (role === "host") {
        startHosting();
      } else {
        closePanel();
        enterLiveView();
      }
      return;
    }
    if (msg.type === "joinError") {
      ptStatus.textContent = msg.reason || "Could not join that room.";
      return;
    }
    if (msg.type === "playerJoined") {
      players.push({ id: msg.id, name: msg.name });
      syncPanel();
      if (role === "host") sendSnapshot();
      return;
    }
    if (msg.type === "playerLeft") {
      const wasHost = players[0] && players[0].id === msg.id;
      players = players.filter((p) => p.id !== msg.id);
      syncPanel();
      if (role === "guest" && wasHost) {
        ptStatus.textContent = "The host left the room.";
        leaveRoom();
        openPanel();
      }
      return;
    }
    if (msg.type === "state" && msg.pt) {
      if (role === "guest") applySnapshot(msg.pt);
      if (role === "host") {
        if (msg.pt.kind === "input") replayInput(msg.pt);
        if (msg.pt.kind === "key") replayKey(msg.pt);
      }
    }
  }

  function hostRoom() {
    connect(() => {
      socket.send(JSON.stringify({ type: "host", name: playerName() }));
    });
  }

  function joinRoom(code) {
    if (!code) {
      ptStatus.textContent = "Enter a room code to join.";
      return;
    }
    connect(() => {
      socket.send(JSON.stringify({ type: "join", room: code, name: playerName() }));
    });
  }

  function leaveRoom(fromClose) {
    const wasGuest = role === "guest";
    if (role === "host") stopHosting();
    role = "idle";
    roomCode = "";
    players = [];
    guestFrames.clear();
    if (socket && !fromClose) socket.close();
    socket = null;
    if (wasGuest && !gameView.classList.contains("hidden")) exitLiveView();
    syncPanel();
  }

  ptHostBtn.addEventListener("click", hostRoom);
  ptJoinBtn.addEventListener("click", () => joinRoom(ptCodeInput.value.trim().toUpperCase()));
  ptLeaveBtn.addEventListener("click", () => leaveRoom());
  ptCloseBtn.addEventListener("click", closePanel);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closePanel();
  });

  // host: re-mirror when they open/close games; guest: leaving the live view leaves the room
  document.addEventListener("mimi:gameopen", () => {
    if (role === "host") {
      lastFrames = [];
      sendSnapshot();
    }
  });
  document.addEventListener("mimi:gameclose", () => {
    if (role === "host") {
      lastFrames = [];
      sendSnapshot();
    } else if (role === "guest") {
      leaveRoom();
    }
  });

  // topbar button
  const topbarBtn = document.createElement("button");
  topbarBtn.id = "playTogetherBtn";
  topbarBtn.className = "btn updates-btn";
  topbarBtn.type = "button";
  topbarBtn.textContent = "📡 Play Together";
  document.querySelector(".topbar-controls").appendChild(topbarBtn);
  topbarBtn.addEventListener("click", () => (isPanelOpen() ? closePanel() : openPanel()));

  window.MimiPlayTogether = { openPanel, closePanel, isPanelOpen };
})();
