/* Tumbling 3D blocks behind the hub.
 *
 * Hand-rolled projection rather than Three.js. There *is* a copy vendored in
 * this repo (games/mario-kart/three.min.js) but it's 670 KB — the hub already
 * parses ~1.5 MB of JavaScript on every load, and a decorative backdrop has no
 * business being the biggest asset on the page. Six shaded quads per cube with
 * a painter's-algorithm sort is all this needs, and it fits in one file with no
 * dependency and nothing to keep in sync.
 *
 * The canvas sits behind everything (z-index below the colour mesh's siblings,
 * pointer-events: none) and is created here rather than in index.html, so the
 * whole effect is one <script> tag away from being removed.
 *
 * It stops drawing whenever it isn't being looked at — tab hidden, a game open,
 * or the user asked for reduced motion — because an idle rAF loop burning
 * battery behind an opaque game screen is exactly the kind of thing nobody
 * notices until their laptop is hot.
 */
(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const canvas = document.createElement("canvas");
  canvas.className = "hub-backdrop";
  canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  document.addEventListener("DOMContentLoaded", () => document.body.prepend(canvas));
  if (document.readyState !== "loading") document.body.prepend(canvas);

  // Joy-Con red / neon blue / a violet and a green to round the set out. Kept
  // as HSL so each cube's faces can be shaded by lightness alone, which keeps
  // the hue stable across a face's light and dark sides.
  const PALETTE = [8, 190, 258, 96, 320];

  const FOCAL = 620;
  // NEAR is deliberately well in front of the camera rather than close to it:
  // a block recycled at 90 gets projected large enough to sit across the middle
  // of the screen behind the buttons, which reads as clutter rather than depth.
  const NEAR = 190;
  const FAR = 1600;
  const COUNT = 28;

  // A unit cube: 8 corners, and the 6 faces as corner indices wound so the
  // cross product of two edges points out of the cube (used for shading).
  const CORNERS = [
    [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
  ];
  const FACES = [
    [0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7],
    [1, 5, 6, 2], [4, 5, 1, 0], [3, 2, 6, 7],
  ];

  let width = 0;
  let height = 0;
  let dpr = 1;
  const blocks = [];

  function spawn(block, initial) {
    block.x = (Math.random() - 0.5) * 1500;
    block.y = (Math.random() - 0.5) * 1000;
    // On the first fill, scatter blocks through the whole depth range; after
    // that they always re-enter at the far plane, so nothing ever pops into
    // existence in the middle of the screen.
    block.z = initial ? NEAR + Math.random() * (FAR - NEAR) : FAR;
    block.size = 20 + Math.random() * 46;
    block.hue = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    block.speed = 22 + Math.random() * 46;
    block.rx = Math.random() * Math.PI * 2;
    block.ry = Math.random() * Math.PI * 2;
    block.vrx = (Math.random() - 0.5) * 0.5;
    block.vry = (Math.random() - 0.5) * 0.5;
    return block;
  }

  for (let i = 0; i < COUNT; i += 1) blocks.push(spawn({}, true));

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

  function rotate(point, rx, ry) {
    const cosX = Math.cos(rx);
    const sinX = Math.sin(rx);
    const cosY = Math.cos(ry);
    const sinY = Math.sin(ry);
    const y1 = point[1] * cosX - point[2] * sinX;
    const z1 = point[1] * sinX + point[2] * cosX;
    const x2 = point[0] * cosY + z1 * sinY;
    const z2 = -point[0] * sinY + z1 * cosY;
    return [x2, y1, z2];
  }

  function drawBlock(block) {
    const half = block.size / 2;
    const view = CORNERS.map((corner) => {
      const r = rotate(corner, block.rx, block.ry);
      return [block.x + r[0] * half, block.y + r[1] * half, block.z + r[2] * half];
    });

    const projected = view.map(([x, y, z]) => {
      const scale = FOCAL / Math.max(z, 1);
      return [width / 2 + x * scale, height / 2 + y * scale];
    });

    // Depth fade at both ends: in at the far plane, out as a block passes the
    // camera, so nothing ever appears or vanishes abruptly.
    const depth = (block.z - NEAR) / (FAR - NEAR);
    // Faint at both ends — in from the far plane, out as it passes the camera —
    // and never fully opaque, because this sits behind text.
    const alpha = Math.min(1, Math.min(depth * 4, (1 - depth) * 4 + 0.12)) * 0.42;
    if (alpha <= 0.01) return;

    // Painter's algorithm — with only six convex faces per cube, sorting them
    // back to front is both correct and cheaper than any depth buffer.
    const faces = FACES.map((indices) => {
      const z = (view[indices[0]][2] + view[indices[1]][2] + view[indices[2]][2] + view[indices[3]][2]) / 4;
      return { indices, z };
    }).sort((a, b) => b.z - a.z);

    faces.forEach(({ indices }) => {
      const [a, b, c] = indices.map((i) => view[i]);
      // Face normal, for a simple lambert term against a fixed key light.
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      const light = (nx * -0.45 + ny * -0.6 + nz * -0.66) / len;
      const lightness = 26 + Math.max(0, light) * 34;

      ctx.beginPath();
      ctx.moveTo(projected[indices[0]][0], projected[indices[0]][1]);
      for (let i = 1; i < indices.length; i += 1) ctx.lineTo(projected[indices[i]][0], projected[indices[i]][1]);
      ctx.closePath();
      ctx.fillStyle = `hsla(${block.hue}, 72%, ${lightness}%, ${alpha})`;
      ctx.fill();
      ctx.strokeStyle = `hsla(${block.hue}, 85%, 72%, ${alpha * 0.5})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }

  let last = performance.now();
  let raf = 0;

  function frame(now) {
    raf = 0;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    ctx.clearRect(0, 0, width, height);
    // Back to front, so nearer blocks overlap further ones.
    blocks.sort((a, b) => b.z - a.z);
    blocks.forEach((block) => {
      block.z -= block.speed * dt;
      block.rx += block.vrx * dt;
      block.ry += block.vry * dt;
      if (block.z < NEAR) spawn(block, false);
      drawBlock(block);
    });

    schedule();
  }

  function shouldRun() {
    if (document.hidden || reduceMotion.matches) return false;
    // Nothing to look at behind an open game, and the games want the CPU.
    const gameView = document.getElementById("gameView");
    return !gameView || gameView.classList.contains("hidden");
  }

  function schedule() {
    if (raf || !shouldRun()) return;
    raf = requestAnimationFrame(frame);
  }

  function restart() {
    last = performance.now();
    if (!shouldRun()) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      // Leave one rendered frame behind rather than a blank rectangle, so the
      // reduced-motion version is a still life instead of nothing.
      if (reduceMotion.matches && width) {
        ctx.clearRect(0, 0, width, height);
        blocks.forEach(drawBlock);
      }
      return;
    }
    schedule();
  }

  document.addEventListener("visibilitychange", restart);
  reduceMotion.addEventListener("change", restart);
  // openGame/showMenu in js/app.js toggle .hidden on #gameView; watching the
  // class is enough to follow that without app.js needing to know about this.
  document.addEventListener("DOMContentLoaded", () => {
    const gameView = document.getElementById("gameView");
    if (gameView) new MutationObserver(restart).observe(gameView, { attributes: true, attributeFilter: ["class"] });
  });

  restart();
})();
