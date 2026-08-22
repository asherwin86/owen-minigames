MimiGames.register({
  id: "cake-bakery",
  title: "Cake Bakery",
  emoji: "🎂",
  category: "Party",
  players: "1P",
  howTo: "Decorate: pick a base flavor and click each topping slot to cycle through toppings, then Publish to share your cake on the feed everyone sees (sign in first — cakes are published under your name). Match Streak: you're shown someone's published cake — rebuild it exactly using the same pickers, then Submit Guess. Get it right and the streak continues with a new cake; get it wrong and the run ends. Your best streak reports to this game's leaderboard.",
  init(root, ctx) {
    const CAKE_BASES = [
      { id: "vanilla", label: "Vanilla", color: "#fdf1d6", crumb: "#f6e2ad" },
      { id: "chocolate", label: "Chocolate", color: "#8a5a3b", crumb: "#5c3a24" },
      { id: "strawberry", label: "Strawberry", color: "#f7b4c6", crumb: "#e888a6" },
      { id: "mint", label: "Mint", color: "#b7ecd0", crumb: "#8fd9b6" },
    ];
    const TOPPINGS = [
      { id: "none", label: "Empty", emoji: "" },
      { id: "cherry", label: "Cherry", emoji: "🍒" },
      { id: "sprinkles", label: "Sprinkles", emoji: "✨" },
      { id: "chocolate-drizzle", label: "Choc Drizzle", emoji: "🍫" },
      { id: "strawberry-slice", label: "Strawberry", emoji: "🍓" },
      { id: "candle", label: "Candle", emoji: "🕯️" },
      { id: "cookie", label: "Cookie", emoji: "🍪" },
      { id: "flower", label: "Flower", emoji: "🌸" },
    ];
    const SLOT_COUNT = 5;
    const baseById = Object.fromEntries(CAKE_BASES.map((b) => [b.id, b]));
    const toppingById = Object.fromEntries(TOPPINGS.map((t) => [t.id, t]));

    function blankRecipe() {
      return { base: CAKE_BASES[0].id, toppings: Array.from({ length: SLOT_COUNT }, () => "none") };
    }
    function randomRecipe() {
      return {
        base: CAKE_BASES[Math.floor(Math.random() * CAKE_BASES.length)].id,
        toppings: Array.from({ length: SLOT_COUNT }, () => TOPPINGS[Math.floor(Math.random() * TOPPINGS.length)].id),
      };
    }
    function recipesMatch(a, b) {
      return a.base === b.base && a.toppings.every((t, i) => t === b.toppings[i]);
    }

    // ============ cake drawing (shared by the big preview and every mini
    // thumbnail in the feed/target — same function at a different scale) ============
    function drawCake(g, w, h, recipe) {
      g.clearRect(0, 0, w, h);
      const base = baseById[recipe.base] || CAKE_BASES[0];
      const plateY = h * 0.86;
      const tierBottomH = h * 0.26;
      const tierTopH = h * 0.2;
      const bottomW = w * 0.72;
      const topW = w * 0.5;

      g.fillStyle = "rgba(0,0,0,0.12)";
      g.beginPath();
      g.ellipse(w / 2, plateY + 4, bottomW / 2 + 10, 8, 0, 0, Math.PI * 2);
      g.fill();

      // bottom tier
      g.fillStyle = base.color;
      roundRect(g, w / 2 - bottomW / 2, plateY - tierBottomH, bottomW, tierBottomH, 8);
      g.fill();
      g.fillStyle = base.crumb;
      roundRect(g, w / 2 - bottomW / 2, plateY - tierBottomH, bottomW, tierBottomH * 0.28, 6);
      g.fill();

      // top tier
      const topY = plateY - tierBottomH - tierTopH;
      g.fillStyle = base.color;
      roundRect(g, w / 2 - topW / 2, topY, topW, tierTopH, 7);
      g.fill();
      g.fillStyle = base.crumb;
      roundRect(g, w / 2 - topW / 2, topY, topW, tierTopH * 0.32, 5);
      g.fill();

      // frosting swoosh along the top edge
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.moveTo(w / 2 - topW / 2, topY);
      const waves = 5;
      for (let i = 0; i <= waves; i += 1) {
        const x = w / 2 - topW / 2 + (topW / waves) * i;
        const dip = i % 2 === 0 ? -6 : 6;
        g.quadraticCurveTo(x - topW / waves / 2, topY + dip, x, topY);
      }
      g.lineTo(w / 2 + topW / 2, topY + 6);
      g.lineTo(w / 2 - topW / 2, topY + 6);
      g.closePath();
      g.fill();

      // toppings along the top surface
      const fontSize = Math.max(10, w * 0.09);
      g.font = `${fontSize}px sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      recipe.toppings.forEach((tId, i) => {
        const topping = toppingById[tId];
        if (!topping || !topping.emoji) return;
        const slotX = w / 2 - topW / 2 + (topW / (SLOT_COUNT + 1)) * (i + 1);
        const slotY = topY - fontSize * 0.3;
        g.fillText(topping.emoji, slotX, slotY);
      });
    }
    function roundRect(g, x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }

    // ============ DOM ============
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "14px";
    wrap.style.width = "100%";
    wrap.style.maxWidth = "560px";

    const tabRow = document.createElement("div");
    tabRow.style.display = "flex";
    tabRow.style.gap = "8px";
    const decorateTabBtn = document.createElement("button");
    decorateTabBtn.className = "btn primary";
    decorateTabBtn.textContent = "🎨 Decorate";
    const streakTabBtn = document.createElement("button");
    streakTabBtn.className = "btn";
    streakTabBtn.textContent = "🔥 Match Streak";
    tabRow.append(decorateTabBtn, streakTabBtn);

    const decoratePane = document.createElement("div");
    decoratePane.style.display = "flex";
    decoratePane.style.flexDirection = "column";
    decoratePane.style.alignItems = "center";
    decoratePane.style.gap = "12px";
    decoratePane.style.width = "100%";

    const streakPane = document.createElement("div");
    streakPane.style.display = "none";
    streakPane.style.flexDirection = "column";
    streakPane.style.alignItems = "center";
    streakPane.style.gap = "12px";
    streakPane.style.width = "100%";

    function showTab(tab) {
      const decorate = tab === "decorate";
      decoratePane.style.display = decorate ? "flex" : "none";
      streakPane.style.display = decorate ? "none" : "flex";
      decorateTabBtn.className = "btn" + (decorate ? " primary" : "");
      streakTabBtn.className = "btn" + (decorate ? "" : " primary");
    }
    decorateTabBtn.onclick = () => showTab("decorate");
    streakTabBtn.onclick = () => showTab("streak");

    // ---- Decorate pane ----
    const editCanvas = document.createElement("canvas");
    editCanvas.width = 320;
    editCanvas.height = 260;
    editCanvas.style.background = "#f4f0ff";
    editCanvas.style.border = "2px solid var(--border)";
    editCanvas.style.borderRadius = "10px";
    const editCtx = editCanvas.getContext("2d");

    const baseRow = document.createElement("div");
    baseRow.style.display = "flex";
    baseRow.style.gap = "8px";
    baseRow.style.flexWrap = "wrap";
    baseRow.style.justifyContent = "center";
    const baseButtons = CAKE_BASES.map((base) => {
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = base.label;
      b.onclick = () => { recipe.base = base.id; syncEditor(); };
      baseRow.appendChild(b);
      return b;
    });

    const slotRow = document.createElement("div");
    slotRow.style.display = "flex";
    slotRow.style.gap = "8px";
    slotRow.style.flexWrap = "wrap";
    slotRow.style.justifyContent = "center";
    const slotButtons = Array.from({ length: SLOT_COUNT }, (_, i) => {
      const b = document.createElement("button");
      b.className = "btn";
      b.style.minWidth = "56px";
      b.onclick = () => {
        const currentIndex = TOPPINGS.findIndex((t) => t.id === recipe.toppings[i]);
        recipe.toppings[i] = TOPPINGS[(currentIndex + 1) % TOPPINGS.length].id;
        syncEditor();
      };
      slotRow.appendChild(b);
      return b;
    });

    const publishBtn = document.createElement("button");
    publishBtn.className = "btn primary";
    publishBtn.textContent = "📮 Publish to Cake Feed";
    publishBtn.onclick = publishCake;

    const publishStatus = document.createElement("p");
    publishStatus.className = "profile-status";

    const feedTitle = document.createElement("h4");
    feedTitle.textContent = "Recent Cakes";
    feedTitle.style.margin = "10px 0 0";
    const feedRow = document.createElement("div");
    feedRow.style.display = "flex";
    feedRow.style.gap = "10px";
    feedRow.style.flexWrap = "wrap";
    feedRow.style.justifyContent = "center";
    feedRow.style.width = "100%";

    decoratePane.append(editCanvas, baseRow, slotRow, publishBtn, publishStatus, feedTitle, feedRow);

    let recipe = blankRecipe();
    function syncEditor() {
      drawCake(editCtx, editCanvas.width, editCanvas.height, recipe);
      baseButtons.forEach((b, i) => b.classList.toggle("primary", CAKE_BASES[i].id === recipe.base));
      slotButtons.forEach((b, i) => {
        const t = toppingById[recipe.toppings[i]];
        b.textContent = t.emoji || "＋";
        b.title = t.label;
      });
    }

    async function publishCake() {
      if (!window.MimiProfiles?.isSignedIn?.()) {
        publishStatus.className = "profile-status error";
        publishStatus.textContent = "Sign in (👤 Profile) to publish a cake.";
        return;
      }
      publishBtn.disabled = true;
      const result = await window.MimiProfiles.publishCake(recipe.base, recipe.toppings);
      publishBtn.disabled = false;
      publishStatus.className = "profile-status" + (result.ok ? " ok" : " error");
      publishStatus.textContent = result.ok ? "Published! Check the feed below." : (result.msg || "Couldn't publish.");
      if (result.ok) {
        ctx.playSound("success");
        loadFeed();
      }
    }

    function miniCakeCard(cakeData) {
      const card = document.createElement("div");
      card.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:4px;width:96px";
      const c = document.createElement("canvas");
      c.width = 96;
      c.height = 84;
      c.style.cssText = "background:#f4f0ff;border:1px solid var(--border);border-radius:8px";
      drawCake(c.getContext("2d"), c.width, c.height, cakeData);
      const label = document.createElement("span");
      label.style.cssText = "font-size:.72rem;color:var(--text-dim)";
      label.textContent = cakeData.name || "Someone";
      card.append(c, label);
      return card;
    }

    let latestFeed = [];
    async function loadFeed() {
      const result = await window.MimiProfiles?.getCakeFeed?.(24);
      if (!result?.ok) return;
      latestFeed = result.cakes || [];
      feedRow.innerHTML = "";
      if (!latestFeed.length) {
        const empty = document.createElement("p");
        empty.className = "profile-note";
        empty.textContent = "No cakes published yet — be the first!";
        feedRow.appendChild(empty);
        return;
      }
      latestFeed.forEach((cakeData) => feedRow.appendChild(miniCakeCard(cakeData)));
    }

    // ---- Match Streak pane ----
    const streakStatus = document.createElement("p");
    streakStatus.className = "profile-status";
    streakStatus.textContent = "Rebuild the shown cake exactly, slot for slot.";

    const targetLabel = document.createElement("h4");
    targetLabel.textContent = "Match this cake:";
    targetLabel.style.margin = "0";
    const targetCanvas = document.createElement("canvas");
    targetCanvas.width = 260;
    targetCanvas.height = 210;
    targetCanvas.style.background = "#fff7f0";
    targetCanvas.style.border = "2px solid var(--accent2)";
    targetCanvas.style.borderRadius = "10px";
    const targetCtx = targetCanvas.getContext("2d");

    const guessLabel = document.createElement("h4");
    guessLabel.textContent = "Your guess:";
    guessLabel.style.margin = "0";
    const guessCanvas = document.createElement("canvas");
    guessCanvas.width = 260;
    guessCanvas.height = 210;
    guessCanvas.style.background = "#f4f0ff";
    guessCanvas.style.border = "2px solid var(--border)";
    guessCanvas.style.borderRadius = "10px";
    const guessCtx = guessCanvas.getContext("2d");

    const streakBaseRow = document.createElement("div");
    streakBaseRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;justify-content:center";
    const streakBaseButtons = CAKE_BASES.map((base) => {
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = base.label;
      b.onclick = () => { guess.base = base.id; syncGuess(); };
      streakBaseRow.appendChild(b);
      return b;
    });
    const streakSlotRow = document.createElement("div");
    streakSlotRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;justify-content:center";
    const streakSlotButtons = Array.from({ length: SLOT_COUNT }, (_, i) => {
      const b = document.createElement("button");
      b.className = "btn";
      b.style.minWidth = "56px";
      b.onclick = () => {
        const currentIndex = TOPPINGS.findIndex((t) => t.id === guess.toppings[i]);
        guess.toppings[i] = TOPPINGS[(currentIndex + 1) % TOPPINGS.length].id;
        syncGuess();
      };
      streakSlotRow.appendChild(b);
      return b;
    });

    const streakScoreLine = document.createElement("p");
    streakScoreLine.style.cssText = "font-weight:700";
    const submitGuessBtn = document.createElement("button");
    submitGuessBtn.className = "btn primary";
    submitGuessBtn.textContent = "✅ Submit Guess";
    submitGuessBtn.onclick = submitGuess;
    const startStreakBtn = document.createElement("button");
    startStreakBtn.className = "btn primary";
    startStreakBtn.textContent = "▶ Start Streak";
    startStreakBtn.onclick = startStreak;

    const cakePickerRow = document.createElement("div");
    cakePickerRow.style.cssText = "display:flex;gap:20px;flex-wrap:wrap;justify-content:center";
    const targetCol = document.createElement("div");
    targetCol.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:6px";
    targetCol.append(targetLabel, targetCanvas);
    const guessCol = document.createElement("div");
    guessCol.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:6px";
    guessCol.append(guessLabel, guessCanvas);
    cakePickerRow.append(targetCol, guessCol);

    streakPane.append(streakScoreLine, streakStatus, startStreakBtn, cakePickerRow, streakBaseRow, streakSlotRow, submitGuessBtn);
    submitGuessBtn.style.display = "none";
    cakePickerRow.style.display = "none";
    streakBaseRow.style.display = "none";
    streakSlotRow.style.display = "none";

    let guess = blankRecipe();
    let target = randomRecipe();
    let streak = 0;
    let bestStreak = ctx.storage.get("bestStreak", 0);
    let streakActive = false;

    function syncGuess() {
      drawCake(guessCtx, guessCanvas.width, guessCanvas.height, guess);
      streakBaseButtons.forEach((b, i) => b.classList.toggle("primary", CAKE_BASES[i].id === guess.base));
      streakSlotButtons.forEach((b, i) => {
        const t = toppingById[guess.toppings[i]];
        b.textContent = t.emoji || "＋";
        b.title = t.label;
      });
    }

    function pickNextTarget() {
      // Prefer a real published cake so "match the picture" means someone
      // else's actual creation when the feed has enough in it; fall back to
      // a random recipe so the mode still works before anyone's published.
      target = latestFeed.length ? latestFeed[Math.floor(Math.random() * latestFeed.length)] : randomRecipe();
      drawCake(targetCtx, targetCanvas.width, targetCanvas.height, target);
      guess = blankRecipe();
      syncGuess();
    }

    function startStreak() {
      streak = 0;
      streakActive = true;
      streakScoreLine.textContent = `Streak: 0 (Best: ${bestStreak})`;
      streakStatus.className = "profile-status";
      streakStatus.textContent = "Rebuild the shown cake exactly, slot for slot.";
      startStreakBtn.style.display = "none";
      submitGuessBtn.style.display = "";
      cakePickerRow.style.display = "";
      streakBaseRow.style.display = "";
      streakSlotRow.style.display = "";
      pickNextTarget();
    }

    function submitGuess() {
      if (!streakActive) return;
      if (recipesMatch(guess, target)) {
        streak += 1;
        ctx.playSound("success");
        streakScoreLine.textContent = `Streak: ${streak} (Best: ${bestStreak})`;
        streakStatus.className = "profile-status ok";
        streakStatus.textContent = "Match! Next cake incoming…";
        pickNextTarget();
      } else {
        streakActive = false;
        ctx.playSound("fail");
        const isNewBest = streak > bestStreak;
        if (isNewBest) {
          bestStreak = streak;
          ctx.storage.set("bestStreak", bestStreak);
        }
        ctx.reportScore(bestStreak, { sortDir: "desc" });
        streakScoreLine.textContent = `Streak: ${streak} (Best: ${bestStreak})`;
        streakStatus.className = "profile-status error";
        streakStatus.textContent = `Not quite — that cake had a different recipe. Final streak: ${streak}${isNewBest ? " (New Best!)" : ""}.`;
        submitGuessBtn.style.display = "none";
        startStreakBtn.textContent = "▶ Run It Back";
        startStreakBtn.style.display = "";
      }
    }

    root.appendChild(wrap);
    wrap.append(tabRow, decoratePane, streakPane);

    ctx.devCheatPanel(root, [
      {
        label: "Force Match",
        run: () => {
          if (!streakActive) return;
          guess = { base: target.base, toppings: target.toppings.slice() };
          syncGuess();
          submitGuess();
        },
      },
      {
        label: "Add Streak +5",
        run: () => {
          if (!streakActive) return;
          streak += 5;
          if (streak > bestStreak) {
            bestStreak = streak;
            ctx.storage.set("bestStreak", bestStreak);
          }
          streakScoreLine.textContent = `Streak: ${streak} (Best: ${bestStreak})`;
        },
      },
    ]);
    syncEditor();
    syncGuess();
    loadFeed();
    ctx.setStatus("Decorate a cake or try Match Streak.");

    return () => {
      // no timers/rAF/global listeners to tear down — every handler here is
      // bound to elements that get GC'd once `root` is cleared by the hub
    };
  },
});
