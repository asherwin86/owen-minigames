MimiGames.register({
  id: "solitaire",
  title: "Klondike Solitaire",
  emoji: "🂡",
  category: "Cards",
  players: "1P",
  howTo: "Click a face-up card to select it, then click a pile to move it there. Build tableau piles down in alternating colors, foundations up by suit from Ace. Click the stock to draw.",
  init(root, ctx) {
    const SUITS = ["♠", "♥", "♦", "♣"];
    const state = {
      tableau: [[], [], [], [], [], [], []],
      foundations: { "♠": [], "♥": [], "♦": [], "♣": [] },
      stock: [],
      waste: [],
      selected: null, // {type:'tableau', col} | {type:'waste'}
      over: false,
    };

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "18px";
    wrap.style.width = "100%";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "10px";
    const newBtn = document.createElement("button");
    newBtn.className = "btn primary";
    newBtn.textContent = "New Game";
    newBtn.onclick = newGame;
    controls.appendChild(newBtn);

    const topRow = document.createElement("div");
    topRow.style.display = "flex";
    topRow.style.gap = "10px";
    topRow.style.alignItems = "flex-start";

    const stockEl = document.createElement("div");
    stockEl.style.width = "60px";
    stockEl.style.height = "84px";
    stockEl.onclick = handleStockClick;

    const wasteEl = document.createElement("div");
    wasteEl.style.width = "60px";
    wasteEl.style.height = "84px";
    wasteEl.onclick = handleWasteClick;
    wasteEl.ondblclick = () => tryAutoFoundation({ type: "waste" });

    const spacer = document.createElement("div");
    spacer.style.flex = "1";
    spacer.style.minWidth = "20px";

    const foundationEls = {};
    const foundationsRow = document.createElement("div");
    foundationsRow.style.display = "flex";
    foundationsRow.style.gap = "8px";
    SUITS.forEach((suit) => {
      const f = document.createElement("div");
      f.style.width = "60px";
      f.style.height = "84px";
      f.onclick = () => handleFoundationClick(suit);
      foundationEls[suit] = f;
      foundationsRow.appendChild(f);
    });

    topRow.appendChild(stockEl);
    topRow.appendChild(wasteEl);
    topRow.appendChild(spacer);
    topRow.appendChild(foundationsRow);

    const tableauRow = document.createElement("div");
    tableauRow.style.display = "flex";
    tableauRow.style.gap = "10px";
    tableauRow.style.justifyContent = "center";

    const tableauCols = [];
    for (let col = 0; col < 7; col++) {
      const colEl = document.createElement("div");
      colEl.style.position = "relative";
      colEl.style.width = "60px";
      colEl.style.minHeight = "84px";
      colEl.addEventListener("click", () => handleColumnClick(col));
      colEl.addEventListener("dblclick", () => tryAutoFoundation({ type: "tableau", col }));
      tableauCols.push(colEl);
      tableauRow.appendChild(colEl);
    }

    wrap.appendChild(controls);
    wrap.appendChild(topRow);
    wrap.appendChild(tableauRow);
    root.appendChild(wrap);

    ctx.devCheatPanel(root, [
      {
        label: "Auto-Win",
        run() {
          if (state.over) return;
          SUITS.forEach((suit) => {
            const color = suit === "♥" || suit === "♦" ? "red" : "black";
            state.foundations[suit] = [];
            for (let v = 1; v <= 13; v++) state.foundations[suit].push({ suit, value: v, color, faceUp: true });
          });
          state.tableau = [[], [], [], [], [], [], []];
          state.stock = [];
          state.waste = [];
          state.selected = null;
          render();
          checkWin();
        },
      },
      {
        label: "Reveal All Cards",
        run() {
          state.tableau.forEach((col) => col.forEach((c) => { c.faceUp = true; }));
          render();
        },
      },
    ]);

    function emptyPlaceholder(label) {
      const d = document.createElement("div");
      d.style.width = "60px";
      d.style.height = "84px";
      d.style.border = "2px dashed var(--border)";
      d.style.borderRadius = "8px";
      d.style.boxSizing = "border-box";
      d.style.display = "flex";
      d.style.alignItems = "center";
      d.style.justifyContent = "center";
      d.style.color = "var(--text-dim)";
      d.style.fontSize = "1.3rem";
      d.textContent = label || "";
      return d;
    }

    function newGame() {
      const deck = ctx.shuffle(ctx.newDeck());
      state.tableau = [[], [], [], [], [], [], []];
      for (let col = 0; col < 7; col++) {
        for (let row = 0; row <= col; row++) {
          const card = deck.pop();
          card.faceUp = row === col;
          state.tableau[col].push(card);
        }
      }
      state.stock = deck;
      state.stock.forEach((c) => (c.faceUp = false));
      state.waste = [];
      state.foundations = { "♠": [], "♥": [], "♦": [], "♣": [] };
      state.selected = null;
      state.over = false;
      ctx.setStatus("Ace to King, build the foundations!");
      render();
    }

    function getPile(sel) {
      if (!sel) return null;
      if (sel.type === "waste") return state.waste;
      if (sel.type === "tableau") return state.tableau[sel.col];
      return null;
    }

    function peekTop(sel) {
      const pile = getPile(sel);
      return pile && pile.length ? pile[pile.length - 1] : null;
    }

    function canPlaceOnTableau(card, pile) {
      if (pile.length === 0) return card.value === 13;
      const top = pile[pile.length - 1];
      if (!top.faceUp) return false;
      return top.color !== card.color && top.value === card.value + 1;
    }

    function canPlaceOnFoundation(card, suit) {
      if (card.suit !== suit) return false;
      const f = state.foundations[suit];
      if (f.length === 0) return card.value === 1;
      return f[f.length - 1].value === card.value - 1;
    }

    function samePileSel(a, b) {
      if (!a || !b) return a === b;
      if (a.type !== b.type) return false;
      if (a.type === "tableau") return a.col === b.col;
      return true;
    }

    function moveSelectedTo(dest) {
      const sel = state.selected;
      const pile = getPile(sel);
      const card = pile.pop();
      if (dest.type === "tableau") state.tableau[dest.col].push(card);
      else if (dest.type === "foundation") state.foundations[dest.suit].push(card);
      if (sel.type === "tableau") {
        const src = state.tableau[sel.col];
        if (src.length) src[src.length - 1].faceUp = true;
      }
      state.selected = null;
      ctx.playSound("pop");
      ctx.vibrate(10);
      render();
      checkWin();
    }

    function tryAutoFoundation(sel) {
      const card = peekTop(sel);
      if (!card || (sel.type === "tableau" && !card.faceUp)) return;
      if (canPlaceOnFoundation(card, card.suit)) {
        state.selected = sel;
        moveSelectedTo({ type: "foundation", suit: card.suit });
      }
    }

    function handleStockClick() {
      if (state.over) return;
      if (state.stock.length) {
        const c = state.stock.pop();
        c.faceUp = true;
        state.waste.push(c);
        ctx.playSound("click");
      } else if (state.waste.length) {
        state.stock = state.waste.reverse();
        state.stock.forEach((c) => (c.faceUp = false));
        state.waste = [];
        ctx.playSound("click");
      }
      state.selected = null;
      render();
    }

    function handleWasteClick() {
      if (state.over || !state.waste.length) return;
      if (state.selected && state.selected.type === "waste") {
        state.selected = null;
      } else {
        state.selected = { type: "waste" };
      }
      render();
    }

    function handleColumnClick(col) {
      if (state.over) return;
      const pile = state.tableau[col];
      const top = pile.length ? pile[pile.length - 1] : null;
      if (state.selected && samePileSel(state.selected, { type: "tableau", col })) {
        state.selected = null;
        render();
        return;
      }
      if (state.selected) {
        const card = peekTop(state.selected);
        if (card && canPlaceOnTableau(card, pile)) {
          moveSelectedTo({ type: "tableau", col });
          return;
        }
        if (top && top.faceUp) {
          state.selected = { type: "tableau", col };
        } else {
          ctx.playSound("fail");
        }
        render();
        return;
      }
      if (top && top.faceUp) {
        state.selected = { type: "tableau", col };
        render();
      }
    }

    function handleFoundationClick(suit) {
      if (state.over || !state.selected) return;
      const card = peekTop(state.selected);
      if (card && canPlaceOnFoundation(card, suit)) {
        moveSelectedTo({ type: "foundation", suit });
      } else {
        ctx.playSound("fail");
      }
    }

    function checkWin() {
      const total = SUITS.reduce((sum, s) => sum + state.foundations[s].length, 0);
      if (total === 52) {
        state.over = true;
        ctx.playSound("success");
        ctx.setStatus("You win! All foundations complete.");
        ctx.confetti(wrap);
        setTimeout(() => {
          ctx.showOverlay({
            title: "You Win!",
            subtitle: "All four foundations complete.",
            buttonText: "New Game",
            onButton: newGame,
          });
        }, 400);
      }
    }

    function render() {
      // stock
      stockEl.innerHTML = "";
      if (state.stock.length) {
        stockEl.appendChild(ctx.cardEl(state.stock[state.stock.length - 1], { faceDown: true }));
      } else if (state.waste.length) {
        stockEl.appendChild(emptyPlaceholder("↺"));
      } else {
        stockEl.appendChild(emptyPlaceholder(""));
      }

      // waste
      wasteEl.innerHTML = "";
      if (state.waste.length) {
        const top = state.waste[state.waste.length - 1];
        const el = ctx.cardEl(top, {});
        if (state.selected && state.selected.type === "waste") {
          el.style.boxShadow = "0 0 0 3px var(--accent2)";
        }
        wasteEl.appendChild(el);
      } else {
        wasteEl.appendChild(emptyPlaceholder(""));
      }

      // foundations
      SUITS.forEach((suit) => {
        const f = state.foundations[suit];
        const el = foundationEls[suit];
        el.innerHTML = "";
        if (f.length) {
          el.appendChild(ctx.cardEl(f[f.length - 1], {}));
        } else {
          el.appendChild(emptyPlaceholder(suit));
        }
      });

      // tableau
      for (let col = 0; col < 7; col++) {
        const colEl = tableauCols[col];
        colEl.innerHTML = "";
        const pile = state.tableau[col];
        if (!pile.length) {
          colEl.style.height = "84px";
          colEl.appendChild(emptyPlaceholder(""));
          continue;
        }
        colEl.style.height = 84 + (pile.length - 1) * 24 + "px";
        pile.forEach((card, i) => {
          const el = ctx.cardEl(card, { faceDown: !card.faceUp });
          el.style.position = "absolute";
          el.style.top = i * 24 + "px";
          el.style.left = "0";
          el.style.zIndex = String(i);
          if (
            card.faceUp &&
            i === pile.length - 1 &&
            state.selected &&
            state.selected.type === "tableau" &&
            state.selected.col === col
          ) {
            el.style.boxShadow = "0 0 0 3px var(--accent2)";
          }
          colEl.appendChild(el);
        });
      }
    }

    newGame();

    return () => {};
  },
});
