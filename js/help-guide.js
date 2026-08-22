// Animated "how to play" guide, built once and auto-populated for every registered game
// from data the game already provides (title, emoji, category, players, howTo) rather than
// hand-authored per-game scripts.
(function () {
  const overlay = document.getElementById("helpOverlay");
  const emojiEl = document.getElementById("helpEmoji");
  const titleEl = document.getElementById("helpTitle");
  const metaEl = document.getElementById("helpMeta");
  const stageEl = document.getElementById("helpStage");
  const captionEl = document.getElementById("helpCaption");
  const dotsEl = document.getElementById("helpDots");
  const prevBtn = document.getElementById("helpPrevBtn");
  const nextBtn = document.getElementById("helpNextBtn");
  const closeBtn = document.getElementById("helpCloseBtn");

  const GOAL_BY_CATEGORY = {
    Puzzle: "Solve it using as few moves (or as little time) as possible.",
    Action: "React fast and rack up the highest score before you run out of lives, time, or space.",
    Board: "Outmaneuver your opponent and win by the game's classic win condition.",
    Cards: "Play your hand smartly to win the round — or the whole game.",
    Sports: "Line up your shot and beat your opponent's score (or par).",
    Party: "It's mostly luck and quick reflexes — have fun and beat the odds!",
  };

  function detectControlMove(howTo) {
    const text = (howTo || "").toLowerCase();
    if (/arrow|wasd/.test(text)) return "keys";
    if (/drag/.test(text)) return "drag";
    if (/type|keyboard letter/.test(text)) return "type";
    return "click";
  }

  function buildSteps(def) {
    const controlMove = detectControlMove(def.howTo);
    const goalCaption = GOAL_BY_CATEGORY[def.category] || "Beat your own best result.";
    return [
      {
        move: "objective",
        stepTitle: "Objective",
        caption: `${def.emoji || "🎮"} ${def.title} — a ${def.category || "mini"} game for ${def.players || "1P"}.`,
      },
      {
        move: controlMove,
        stepTitle: "Controls",
        caption: def.howTo || "Use the on-screen controls to play.",
      },
      {
        move: "goal",
        stepTitle: "Goal",
        caption: goalCaption,
      },
    ];
  }

  const STAGE_MARKUP = {
    objective: `<div class="hg-stage hg-objective"><div class="hg-trophy">🏆</div></div>`,
    click: `<div class="hg-stage hg-click"><div class="hg-target"></div><div class="hg-ripple"></div><div class="hg-cursor">🖱️</div></div>`,
    keys: `<div class="hg-stage hg-keys">
      <div class="hg-key hg-key-up">⬆</div>
      <div class="hg-key-row">
        <div class="hg-key hg-key-left">⬅</div>
        <div class="hg-key hg-key-down">⬇</div>
        <div class="hg-key hg-key-right">➡</div>
      </div>
    </div>`,
    drag: `<div class="hg-stage hg-drag"><div class="hg-drag-track"></div><div class="hg-drag-item">🂠</div></div>`,
    type: `<div class="hg-stage hg-type"><div class="hg-type-box"><span class="hg-type-text">PLAY</span><span class="hg-caret">|</span></div></div>`,
    goal: `<div class="hg-stage hg-goal"><div class="hg-flag">🏁</div></div>`,
  };

  let currentSteps = [];
  let currentIndex = 0;
  let autoTimer = null;

  function renderDots() {
    dotsEl.innerHTML = "";
    currentSteps.forEach((step, index) => {
      const dot = document.createElement("button");
      dot.className = "help-dot" + (index === currentIndex ? " active" : "");
      dot.setAttribute("aria-label", step.stepTitle);
      dot.onclick = () => showStep(index, true);
      dotsEl.appendChild(dot);
    });
  }

  function showStep(index, userTriggered) {
    currentIndex = (index + currentSteps.length) % currentSteps.length;
    const step = currentSteps[currentIndex];
    stageEl.innerHTML = STAGE_MARKUP[step.move] || STAGE_MARKUP.click;
    captionEl.textContent = step.caption;
    renderDots();
    if (userTriggered) restartAutoplay();
  }

  function restartAutoplay() {
    if (autoTimer) clearInterval(autoTimer);
    autoTimer = setInterval(() => showStep(currentIndex + 1), 3600);
  }

  function stopAutoplay() {
    if (autoTimer) clearInterval(autoTimer);
    autoTimer = null;
  }

  function openHelp(def) {
    emojiEl.textContent = def.emoji || "🎮";
    titleEl.textContent = def.title;
    metaEl.textContent = `${def.players || "1P"} · ${def.category || ""}`;
    currentSteps = buildSteps(def);
    showStep(0);
    restartAutoplay();
    overlay.classList.remove("hidden");
  }

  function closeHelp() {
    overlay.classList.add("hidden");
    stopAutoplay();
  }

  prevBtn.onclick = () => showStep(currentIndex - 1, true);
  nextBtn.onclick = () => showStep(currentIndex + 1, true);
  closeBtn.onclick = closeHelp;
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeHelp();
  });

  window.MimiHelpGuide = { open: openHelp, close: closeHelp, isOpen: () => !overlay.classList.contains("hidden") };
})();
