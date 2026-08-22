MimiGames.register({
  id: "mario-kart",
  title: "Kart Circuit",
  emoji: "🏎️",
  category: "Action",
  tags: ["3D"],
  players: "1-13P",
  howTo:
    "Arrow keys / WASD / mouse / touch / gamepad to drive, Space to use items, hold Shift while turning to drift for a mini-turbo. Grab coins for top speed and item boxes for rockets, shields, oil slicks, and turbos. Race five laps and beat the rivals — solo, split-screen with up to 4 on one keyboard, or wireless with up to 13 racers via room codes. Click into the frame first so your keypresses reach it.",
  init(root) {
    const gameView = document.getElementById("gameView");
    gameView.classList.add("wide-stage");

    const frame = document.createElement("iframe");
    frame.src = "games/mario-kart/index.html";
    frame.title = "Kart Circuit";
    frame.style.width = "100%";
    // fixed-px allowance for the topbar/toolbar/controls-tips/footer around
    // it, not a flat vh cut, since that chrome's real height barely changes
    // with viewport height the way a vh-only guess would assume
    frame.style.height = "calc(100vh - 264px)";
    frame.style.minHeight = "420px";
    frame.style.border = "0";
    frame.style.display = "block";
    frame.allow = "fullscreen; gamepad; autoplay";
    root.appendChild(frame);
    return () => {
      root.innerHTML = "";
      gameView.classList.remove("wide-stage");
    };
  },
});
//# sourceMappingURL=mario-kart.js.map