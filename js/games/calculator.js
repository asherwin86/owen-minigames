MimiGames.register({
  id: "calculator",
  title: "Calculator",
  emoji: "🧮",
  category: "Apps",
  players: "1P",
  howTo: "A standard calculator. Tap numbers and an operator, then = for the result. C clears everything, ⌫ deletes the last digit, +/- flips the sign, % divides the current number by 100.",
  init(root, ctx) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:10px;width:100%;max-width:320px";

    const display = document.createElement("div");
    display.style.cssText = "width:100%;box-sizing:border-box;background:var(--bg-alt);border:1px solid var(--border);border-radius:10px;padding:18px 14px;text-align:right;font-size:2rem;font-weight:700;font-family:'Space Grotesk',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)";
    display.textContent = "0";

    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(4, 1fr);gap:8px;width:100%";

    // ============ calculation state ============
    let current = "0";
    let stored = null;
    let pendingOp = null;
    let justEvaluated = false;

    function formatNumber(n) {
      if (!Number.isFinite(n)) return "Error";
      const rounded = Math.round(n * 1e10) / 1e10; // trim float noise (0.1+0.2 etc.)
      return String(rounded);
    }

    function render() {
      display.textContent = current.length > 12 ? Number(current).toExponential(5) : current;
    }

    function inputDigit(d) {
      if (justEvaluated) { current = "0"; justEvaluated = false; }
      if (d === "." && current.includes(".")) return;
      current = current === "0" && d !== "." ? d : current + d;
      render();
    }

    function applyOp() {
      if (stored === null || pendingOp === null) return Number(current);
      const a = stored, b = Number(current);
      switch (pendingOp) {
        case "+": return a + b;
        case "-": return a - b;
        case "×": return a * b;
        case "÷": return b === 0 ? NaN : a / b;
        default: return b;
      }
    }

    function chooseOp(op) {
      if (pendingOp !== null && !justEvaluated) {
        stored = applyOp();
        current = formatNumber(stored);
      } else {
        stored = Number(current);
      }
      pendingOp = op;
      justEvaluated = true; // next digit press should start a fresh number
      render();
    }

    function evaluate() {
      if (pendingOp === null) return;
      const result = applyOp();
      current = formatNumber(result);
      stored = null;
      pendingOp = null;
      justEvaluated = true;
      render();
      ctx.playSound("click");
    }

    function clearAll() {
      current = "0";
      stored = null;
      pendingOp = null;
      justEvaluated = false;
      render();
    }

    function backspace() {
      if (justEvaluated) return;
      current = current.length > 1 ? current.slice(0, -1) : "0";
      render();
    }

    function toggleSign() {
      if (current === "0") return;
      current = current.startsWith("-") ? current.slice(1) : "-" + current;
      render();
    }

    function percent() {
      current = formatNumber(Number(current) / 100);
      render();
    }

    // ============ button layout ============
    const LAYOUT = [
      ["C", "⌫", "%", "÷"],
      ["7", "8", "9", "×"],
      ["4", "5", "6", "-"],
      ["1", "2", "3", "+"],
      ["+/-", "0", ".", "="],
    ];
    LAYOUT.flat().forEach((label) => {
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = label;
      b.style.padding = "16px 0";
      b.style.fontSize = "1.15rem";
      if (label === "=") { b.classList.add("primary"); b.style.gridRow = "span 1"; }
      b.onclick = () => {
        ctx.playSound("tick");
        if (/^[0-9.]$/.test(label)) inputDigit(label);
        else if (["+", "-", "×", "÷"].includes(label)) chooseOp(label);
        else if (label === "=") evaluate();
        else if (label === "C") clearAll();
        else if (label === "⌫") backspace();
        else if (label === "+/-") toggleSign();
        else if (label === "%") percent();
      };
      grid.appendChild(b);
    });

    // ============ keyboard support ============
    function isTypingInField() {
      const tag = document.activeElement?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA";
    }
    function onKeydown(e) {
      if (isTypingInField()) return;
      if (/^[0-9.]$/.test(e.key)) inputDigit(e.key);
      else if (e.key === "+" || e.key === "-") chooseOp(e.key);
      else if (e.key === "*") chooseOp("×");
      else if (e.key === "/") { e.preventDefault(); chooseOp("÷"); }
      else if (e.key === "Enter" || e.key === "=") evaluate();
      else if (e.key === "Escape") clearAll();
      else if (e.key === "Backspace") backspace();
      else return;
    }
    document.addEventListener("keydown", onKeydown);

    wrap.append(display, grid);
    root.appendChild(wrap);
    ctx.setStatus("Ready.");

    return () => {
      document.removeEventListener("keydown", onKeydown);
    };
  },
});
