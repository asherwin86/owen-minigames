// On-screen keyboard: pops up under any text box so you can type with the
// gamepad cursor, mouse, or touch. Shared by the hub and Kart Circuit.
(function () {
  const ROWS = [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["⇧", "z", "x", "c", "v", "b", "n", "m", "⌫"],
    ["SPACE", "ENTER", "✕"],
  ];

  const style = document.createElement("style");
  style.textContent = `
    .vk-board {
      position: fixed;
      left: 50%;
      bottom: 12px;
      transform: translateX(-50%);
      z-index: 250;
      background: rgba(10, 14, 28, 0.96);
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 16px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      box-shadow: 0 16px 44px rgba(0, 0, 0, 0.55);
    }
    .vk-board.hidden { display: none; }
    .vk-row { display: flex; gap: 6px; justify-content: center; }
    .vk-key {
      min-width: 34px;
      height: 38px;
      padding: 0 10px;
      border-radius: 9px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      background: rgba(255, 255, 255, 0.08);
      color: #f2f5ff;
      font: 600 15px/1 system-ui, sans-serif;
      cursor: pointer;
    }
    .vk-key:hover { background: rgba(255, 255, 255, 0.18); }
    .vk-key:active { transform: scale(0.94); }
    .vk-key.vk-wide { min-width: 120px; }
    .vk-key.vk-accent { background: rgba(83, 224, 255, 0.25); border-color: rgba(83, 224, 255, 0.5); }
    .vk-key.vk-on { background: rgba(255, 209, 102, 0.35); border-color: rgba(255, 209, 102, 0.6); }
  `;
  document.head.appendChild(style);

  const board = document.createElement("div");
  board.className = "vk-board hidden";
  // Kart Circuit's fullscreen mode targets .shell, not <body> — the
  // Fullscreen API only renders elements inside the fullscreen element's
  // subtree, so a body-level sibling would vanish there. Falls back to
  // <body> on pages (like the hub) with no .shell/fullscreen concept.
  (document.querySelector(".shell") || document.body).appendChild(board);

  let activeInput = null;
  let shiftOn = false;
  const keyButtons = [];

  function build() {
    board.innerHTML = "";
    keyButtons.length = 0;
    ROWS.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.className = "vk-row";
      row.forEach((key) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "vk-key";
        if (key === "SPACE") {
          btn.classList.add("vk-wide");
          btn.textContent = "␣ space";
        } else if (key === "ENTER") {
          btn.classList.add("vk-accent");
          btn.textContent = "↵ enter";
        } else {
          btn.textContent = key;
        }
        btn.dataset.key = key;
        btn.addEventListener("click", () => press(key, btn));
        rowEl.appendChild(btn);
        keyButtons.push(btn);
      });
      board.appendChild(rowEl);
    });
  }

  function syncCase() {
    keyButtons.forEach((btn) => {
      const key = btn.dataset.key;
      if (key.length === 1 && /[a-z]/i.test(key)) {
        btn.textContent = shiftOn ? key.toUpperCase() : key.toLowerCase();
      }
      if (key === "⇧") btn.classList.toggle("vk-on", shiftOn);
    });
  }

  function insert(text) {
    if (!activeInput) return;
    const max = activeInput.maxLength;
    if (max > 0 && activeInput.value.length >= max) return;
    const start = activeInput.selectionStart ?? activeInput.value.length;
    const end = activeInput.selectionEnd ?? activeInput.value.length;
    activeInput.value = activeInput.value.slice(0, start) + text + activeInput.value.slice(end);
    try { activeInput.setSelectionRange(start + text.length, start + text.length); } catch (e) { /* number inputs etc. */ }
    activeInput.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function press(key, btn) {
    if (!activeInput) return;
    if (key === "✕") {
      hide();
      return;
    }
    if (key === "⇧") {
      shiftOn = !shiftOn;
      syncCase();
      return;
    }
    if (key === "⌫") {
      const start = activeInput.selectionStart ?? activeInput.value.length;
      const end = activeInput.selectionEnd ?? activeInput.value.length;
      const from = start === end ? Math.max(0, start - 1) : start;
      activeInput.value = activeInput.value.slice(0, from) + activeInput.value.slice(end);
      try { activeInput.setSelectionRange(from, from); } catch (e) { /* ignore */ }
      activeInput.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    if (key === "ENTER") {
      const form = activeInput.form;
      if (form) {
        if (typeof form.requestSubmit === "function") form.requestSubmit();
        else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      } else {
        hide();
      }
      return;
    }
    if (key === "SPACE") {
      insert(" ");
      return;
    }
    insert(shiftOn ? key.toUpperCase() : key);
    if (shiftOn && /[a-z]/i.test(key)) {
      shiftOn = false;
      syncCase();
    }
  }

  function show(input) {
    activeInput = input;
    board.classList.remove("hidden");
  }

  function hide() {
    activeInput = null;
    board.classList.add("hidden");
  }

  // keep the input focused while tapping keys
  board.addEventListener("mousedown", (e) => e.preventDefault());
  board.addEventListener("pointerdown", (e) => e.preventDefault());

  function isTextField(el) {
    if (!el) return false;
    if (el.tagName === "TEXTAREA") return true;
    return el.tagName === "INPUT" && ["text", "search", "email", "number", ""].includes(el.type || "text");
  }

  // only pop up for gamepad players — with a real keyboard in hand you don't need it
  function padConnected() {
    if (typeof navigator.getGamepads !== "function") return false;
    return Array.from(navigator.getGamepads()).some((pad) => pad?.connected);
  }

  // With two documents bound (hub + page-view iframe), focus moving from an
  // element in the OUTER document into a text field INSIDE the iframe fires
  // a focusout on the outer document too — its own activeElement becomes
  // the <iframe> tag itself, which isn't a text field, so its (separate)
  // focusout handler would call the shared hide() and undo the show the
  // iframe's own handler just correctly did. Descending into a focused
  // iframe to find what's REALLY focused avoids that false hide.
  function deepActiveElement(doc) {
    let el = doc.activeElement;
    while (el && el.tagName === "IFRAME") {
      let inner;
      try { inner = el.contentDocument; } catch (e) { break; }
      if (!inner) break;
      el = inner.activeElement;
    }
    return el;
  }

  // Bound to the hub's own document below, and — via attachToDocument — to
  // any other same-origin document a gamepad player might type into, e.g.
  // the private page viewer's iframe (games fetched privately have their
  // own document, and focus/click events never bubble across an iframe
  // boundary into this one, so without this the keyboard would only ever
  // work at the top level).
  function bindDocument(doc) {
    doc.addEventListener("focusin", (e) => {
      if (isTextField(e.target) && padConnected()) show(e.target);
    });

    doc.addEventListener("focusout", () => {
      setTimeout(() => {
        if (!isTextField(deepActiveElement(doc))) hide();
      }, 120);
    });

    // pad-cursor synthetic clicks don't focus inputs natively — do it for them
    doc.addEventListener("click", (e) => {
      if (isTextField(e.target) && doc.activeElement !== e.target) {
        e.target.focus();
      }
    });
  }

  bindDocument(document);
  build();
  syncCase();

  window.MimiKeyboard = { show, hide, attachToDocument: bindDocument };
})();
