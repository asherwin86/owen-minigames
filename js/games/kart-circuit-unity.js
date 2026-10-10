/* Kart Circuit Unity: a Unity (WebGL) port of Kart Circuit, hosted separately on Render and embedded here.
 * Kept as an iframe because the hub's static server only serves an allowlist of file types and does not
 * serve Unity's .wasm/.unityweb files. The Open-in-new-tab button is the fallback if framing is blocked. */
MimiGames.register({
  id: "kart-circuit-unity",
  title: "Kart Circuit Unity",
  emoji: "🏁",
  category: "Racing",
  players: "1P",
  howTo: "Unity version of Kart Circuit with bots. Keyboard: W/S gas and brake, A/D steer, Space or Shift to drift. Controller: left stick, RT gas, LT brake, RB drift. Touch: on-screen buttons.",
  init(root) {
    const URL_ = "https://owen-kart-circuit-unity.onrender.com/";
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:10px;width:100%;max-width:960px";
    const frame = document.createElement("iframe");
    frame.src = URL_;
    frame.allow = "gamepad; fullscreen; autoplay";
    frame.allowFullscreen = true;
    frame.style.cssText = "width:100%;aspect-ratio:16/9;min-height:360px;border:0;border-radius:12px;background:#000";
    const link = document.createElement("a");
    link.href = URL_;
    link.target = "_blank";
    link.rel = "noopener";
    link.className = "btn";
    link.textContent = "Open in new tab";
    wrap.append(frame, link);
    root.appendChild(wrap);
    return () => { frame.src = "about:blank"; wrap.remove(); };
  },
});
