// Local Party: same-PC multiplayer for every game in the hub.
// 2-4 players share one keyboard/mouse, take turns, and the hub keeps score
// across rounds and across games. Games that are already 2P hotseat just get
// the scoreboard on top; 1P games become pass-and-play versus.
(function () {
  const gameView = document.getElementById("gameView");
  const gameStage = document.getElementById("gameStage");

  const CHIP_COLORS = ["#ffd166", "#53e0ff", "#ff88ad", "#9cf77e"];

  let players = []; // { name, color, score }
  let turn = 0;
  let active = false;

  // --- scoreboard bar, shown above the game while a party is running ---
  const bar = document.createElement("div");
  bar.className = "party-bar hidden";
  gameView.insertBefore(bar, gameStage);

  function render() {
    bar.classList.toggle("hidden", !active);
    if (!active) return;
    bar.innerHTML = "";

    // Names used to always be auto-generated ("P1".."P4"), so interpolating
    // them into innerHTML was safe by construction. Now that a player can
    // type their own guest name (see the roster form below), that's no
    // longer true — build these with real DOM nodes/textContent instead so
    // a name like "<img onerror=...>" can't inject anything.
    const hint = document.createElement("span");
    hint.className = "party-hint";
    const hintStrong = document.createElement("strong");
    hintStrong.style.color = players[turn].color;
    hintStrong.textContent = players[turn].name;
    hint.appendChild(hintStrong);
    hint.appendChild(document.createTextNode("'s turn — tap the winner after each round"));
    bar.appendChild(hint);

    players.forEach((p, index) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "party-chip" + (index === turn ? " turn" : "");
      chip.style.setProperty("--chip-color", p.color);
      chip.appendChild(document.createTextNode(p.name + " "));
      const scoreEl = document.createElement("b");
      scoreEl.textContent = String(p.score);
      chip.appendChild(scoreEl);
      chip.title = `${p.name} won this round (+1)`;
      chip.onclick = () => {
        p.score += 1;
        turn = (turn + 1) % players.length;
        render();
      };
      bar.appendChild(chip);
    });

    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "btn party-action";
    skip.textContent = "Next turn";
    skip.onclick = () => {
      turn = (turn + 1) % players.length;
      render();
    };
    bar.appendChild(skip);

    const rematch = document.createElement("button");
    rematch.type = "button";
    rematch.className = "btn party-action";
    rematch.textContent = "↻ Rematch";
    rematch.title = "Restart this game for the next round";
    rematch.onclick = () => window.MimiApp && MimiApp.reopenCurrent();
    bar.appendChild(rematch);

    const end = document.createElement("button");
    end.type = "button";
    end.className = "btn party-action";
    end.textContent = "End party";
    end.onclick = endParty;
    bar.appendChild(end);
  }

  // Pulls from the shared local roster (👤 Profile button → Local players)
  // so however many people already signed in there show up with their real
  // name/badge automatically — any remaining seats fall back to "P1".."P4".
  // Signing players in/up lives entirely in that one place now; this file
  // just reads whatever's there at the moment a party starts.
  function startParty(count) {
    const n = Math.max(2, Math.min(4, count));
    const roster = window.MimiProfiles?.getLocalRoster?.() || [];
    startPartyWithRoster(Array.from({ length: n }, (_, i) => roster[i] || { name: `P${i + 1}` }));
  }

  // entries: [{ name, dev? }, ...] — dev just shows the same 🛠️ badge the
  // rest of the hub uses, so a signed-in player is recognizable at a glance
  function startPartyWithRoster(entries) {
    const n = Math.max(2, Math.min(4, entries.length));
    players = entries.slice(0, n).map((entry, i) => ({
      name: (entry.name || `P${i + 1}`).slice(0, 24) + (entry.dev ? " 🛠️" : ""),
      color: CHIP_COLORS[i],
      score: 0,
    }));
    turn = 0;
    active = true;
    render();
  }

  function endParty() {
    active = false;
    players = [];
    render();
  }

  // --- picker section, added into the Play Together panel ---
  const card = document.querySelector("#ptOverlay .updates-card");
  if (card) {
    const section = document.createElement("div");
    section.className = "pt-divider";
    section.innerHTML = `
      <p class="pt-status" style="margin-bottom:10px"><strong>Local party · same PC</strong> — take turns on one keyboard in any game; the hub keeps score. Real names show up automatically for anyone signed in under 👤 Profile → Local players.</p>
      <div class="pt-controls" id="lpButtons">
        <button class="btn" data-party="2" type="button">2 Players</button>
        <button class="btn" data-party="3" type="button">3 Players</button>
        <button class="btn" data-party="4" type="button">4 Players</button>
      </div>`;
    card.appendChild(section);
    section.querySelectorAll("[data-party]").forEach((btn) => {
      btn.addEventListener("click", () => {
        startParty(Number(btn.dataset.party));
        MimiPlayTogether.closePanel();
      });
    });
  }

  window.MimiLocalParty = { startParty, startPartyWithRoster, endParty, isActive: () => active };
})();
