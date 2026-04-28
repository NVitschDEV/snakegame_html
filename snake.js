/* ════════════════════════════════════════════════════════════════════
   snake.js — Portfolio Snake Game
   Fix: snake grows by 3 segments when eating food (instead of 1)
   ════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const COLS = 22;
  const ROWS = 22;
  const TICK_MS = 180;  // slowed down from 110ms
  const GROW_AMOUNT = 1; // grow by exactly 1 segment per food

  const DIRS = {
    up:    { x: 0,  y: -1 },
    down:  { x: 0,  y:  1 },
    left:  { x: -1, y:  0 },
    right: { x: 1,  y:  0 },
  };

  const OPPOSITE = { up: "down", down: "up", left: "right", right: "left" };

  // ── State ──────────────────────────────────────────────────────────

  let snake = [];
  let dir = "right";
  let queued = null;
  let food = { x: 16, y: 11 };
  let running = false;
  let gameOver = false;
  let growPending = 0; // segments still to be added
  let score = 0;
  let best = parseInt(localStorage.getItem("snake-best") || "0", 10);
  let status = "idle"; // idle | running | paused | over

  // ── DOM ────────────────────────────────────────────────────────────

  const canvas = document.getElementById("snake-canvas");
  const ctx = canvas.getContext("2d");

  const elScore      = document.getElementById("current-score");
  const elBest       = document.getElementById("current-best");
  const elNavBest    = document.getElementById("nav-best-score");
  const elStatsScore = document.getElementById("stats-score");
  const elStatsBest  = document.getElementById("stats-best");
  const elFooterBest = document.getElementById("footer-best");
  const elTyped      = document.getElementById("typed-text");

  // ── Helpers ────────────────────────────────────────────────────────

  function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function randCell(exclude) {
    while (true) {
      const c = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
      if (!exclude.some(p => p.x === c.x && p.y === c.y)) return c;
    }
  }

  function updateScoreUI() {
    const s = String(score);
    const b = String(best);
    if (elScore)      elScore.textContent      = s;
    if (elBest)       elBest.textContent        = b;
    if (elNavBest)    elNavBest.textContent      = b;
    if (elStatsScore) elStatsScore.textContent  = s;
    if (elStatsBest)  elStatsBest.textContent   = b;
    if (elFooterBest) elFooterBest.textContent  = b;
  }

  // ── Reset ──────────────────────────────────────────────────────────

  function reset() {
    snake = [{ x: 11, y: 11 }, { x: 10, y: 11 }, { x: 9, y: 11 }];
    dir = "right";
    queued = null;
    food = randCell(snake);
    gameOver = false;
    growPending = 0;
    score = 0;
    updateScoreUI();
  }

  // ── Draw ───────────────────────────────────────────────────────────

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const cssSize = canvas.clientWidth;
    if (canvas.width !== cssSize * dpr) {
      canvas.width  = cssSize * dpr;
      canvas.height = cssSize * dpr;
    }
    const cell = (cssSize * dpr) / COLS;

    // colour tokens — variables store raw "H S% L%" channel strings
    const bg1  = `hsl(${getCssVar("--bg-1")})`;
    const bg2  = `hsl(${getCssVar("--bg-2")})`;
    const fg   = `hsl(${getCssVar("--foreground")})`;
    const warm = `hsl(${getCssVar("--accent-warm")})`;
    const clay = `hsl(${getCssVar("--accent-clay")})`;
    const muted = `hsl(${getCssVar("--muted-foreground-deep")})`;

    // background
    ctx.fillStyle = bg1;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // subtle checkerboard
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if ((x + y) % 2 === 0) {
          ctx.fillStyle = bg2;
          ctx.fillRect(x * cell, y * cell, cell, cell);
        }
      }
    }

    // grid hairlines
    ctx.strokeStyle = `hsl(${getCssVar("--foreground")} / 0.04)`;
    ctx.lineWidth = 1;
    for (let i = 1; i < COLS; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, canvas.height); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * cell); ctx.lineTo(canvas.width, i * cell); ctx.stroke();
    }

    // food — terracotta dot with glow
    const fx = food.x * cell + cell / 2;
    const fy = food.y * cell + cell / 2;
    const r  = cell * 0.32;
    const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, r * 2.4);
    grad.addColorStop(0, clay);
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.fillRect(fx - r * 2.4, fy - r * 2.4, r * 4.8, r * 4.8);
    ctx.fillStyle = clay;
    ctx.beginPath(); ctx.arc(fx, fy, r, 0, Math.PI * 2); ctx.fill();

    // snake
    snake.forEach((seg, i) => {
      const isHead = i === 0;
      const pad    = cell * 0.12;
      const sx     = seg.x * cell + pad;
      const sy     = seg.y * cell + pad;
      const s      = cell - pad * 2;
      const radius = cell * 0.22;

      const warmH = getCssVar("--accent-warm");
      ctx.fillStyle = isHead
        ? warm
        : `hsl(${warmH} / ${Math.max(0.10, 0.85 - i * 0.012)})`;

      // rounded rect
      ctx.beginPath();
      ctx.moveTo(sx + radius, sy);
      ctx.arcTo(sx + s, sy,     sx + s, sy + s, radius);
      ctx.arcTo(sx + s, sy + s, sx,     sy + s, radius);
      ctx.arcTo(sx,     sy + s, sx,     sy,     radius);
      ctx.arcTo(sx,     sy,     sx + s, sy,     radius);
      ctx.closePath();
      ctx.fill();

      if (isHead) {
        // eye
        ctx.fillStyle = `hsl(${getCssVar("--background")})`;
        const dv = DIRS[dir];
        const ex = sx + s / 2 + dv.x * s * 0.22;
        const ey = sy + s / 2 + dv.y * s * 0.22;
        ctx.beginPath(); ctx.arc(ex, ey, cell * 0.09, 0, Math.PI * 2); ctx.fill();
      }
    });

    // overlays when not running
    if (status !== "running") {
      ctx.fillStyle = `hsl(${getCssVar("--background")} / 0.72)`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = fg;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      let title = "", sub = "";
      if (status === "idle")   { title = "press space to begin"; sub = "arrow keys · wasd"; }
      if (status === "paused") { title = "paused";               sub = "press space to resume"; }
      if (status === "over")   { title = "game over";            sub = "press space to restart"; }

      ctx.font = `italic 400 ${Math.round(cell * 1.3)}px Fraunces, serif`;
      ctx.fillText(title, canvas.width / 2, canvas.height / 2 - cell * 0.4);
      ctx.fillStyle = muted;
      ctx.font = `400 ${Math.round(cell * 0.55)}px "JetBrains Mono", monospace`;
      ctx.fillText(sub, canvas.width / 2, canvas.height / 2 + cell * 1.1);

      // hairline
      ctx.strokeStyle = warm;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2 - cell * 2, canvas.height / 2 + cell * 0.3);
      ctx.lineTo(canvas.width / 2 + cell * 2, canvas.height / 2 + cell * 0.3);
      ctx.stroke();
    }
  }

  // ── Tick ───────────────────────────────────────────────────────────

  function tick() {
    if (!running || gameOver) return;

    // apply queued direction
    if (queued && queued !== OPPOSITE[dir]) {
      dir = queued;
    }
    queued = null;

    const dv   = DIRS[dir];
    const head = snake[0];
    const next = { x: head.x + dv.x, y: head.y + dv.y };

    // wall collision
    if (next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= ROWS) {
      endGame(); return;
    }

    // self collision
    if (snake.some(s => s.x === next.x && s.y === next.y)) {
      endGame(); return;
    }

    snake.unshift(next);

    if (next.x === food.x && next.y === food.y) {
      // Ate food — grow by GROW_AMOUNT segments
      score++;
      growPending += GROW_AMOUNT - 1; // -1 because we already kept the head without popping
      food = randCell(snake);
      updateScoreUI();
    } else if (growPending > 0) {
      // Still growing from a previous eat — don't pop tail
      growPending--;
    } else {
      snake.pop();
    }

    draw();
  }

  // ── Game over ──────────────────────────────────────────────────────

  function endGame() {
    running  = false;
    gameOver = true;
    status   = "over";

    if (score > best) {
      best = score;
      localStorage.setItem("snake-best", String(best));
    }
    updateScoreUI();
    draw();
  }

  // ── Game loop ──────────────────────────────────────────────────────

  let lastTick = performance.now();

  function loop(t) {
    if (t - lastTick >= TICK_MS) {
      lastTick = t;
      tick();
    }
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);

  // ── Keyboard ───────────────────────────────────────────────────────

  window.addEventListener("keydown", function (e) {
    const k = e.key.toLowerCase();

    const dirMap = {
      arrowup:    "up",    w: "up",
      arrowdown:  "down",  s: "down",
      arrowleft:  "left",  a: "left",
      arrowright: "right", d: "right",
    };

    if (dirMap[k]) {
      e.preventDefault();
      const want = dirMap[k];
      if (want !== OPPOSITE[dir]) queued = want;
      if (status === "idle") {
        running = true;
        status  = "running";
      }
      return;
    }

    if (k === " " || k === "spacebar") {
      e.preventDefault();
      if (status === "idle") {
        running = true; status = "running";
      } else if (status === "running") {
        running = false; status = "paused"; draw();
      } else if (status === "paused") {
        running = true; status = "running";
      } else if (status === "over") {
        reset(); running = true; status = "running";
      }
    }

    if (k === "f") {
      toggleFullscreen();
    }
  });

  // ── Fullscreen ─────────────────────────────────────────────────────

  const gameContainer = document.querySelector(".game-container");
  const fsBtn         = document.getElementById("fullscreen-btn");
  const fsIconExpand  = document.getElementById("fs-icon-expand");
  const fsIconShrink  = document.getElementById("fs-icon-shrink");

  function enterFullscreen() {
    gameContainer.classList.add("is-fullscreen");
    fsIconExpand.style.display = "none";
    fsIconShrink.style.display = "";
    // Trigger resize so canvas redraws at new size
    setTimeout(() => { draw(); }, 50);
  }

  function exitFullscreen() {
    gameContainer.classList.remove("is-fullscreen");
    fsIconExpand.style.display = "";
    fsIconShrink.style.display = "none";
    setTimeout(() => { draw(); }, 50);
  }

  function toggleFullscreen() {
    if (gameContainer.classList.contains("is-fullscreen")) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  }

  fsBtn.addEventListener("click", toggleFullscreen);

  // Close fullscreen on Escape
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && gameContainer.classList.contains("is-fullscreen")) {
      exitFullscreen();
    }
  });

  // ── Resize observer ────────────────────────────────────────────────

  const ro = new ResizeObserver(() => draw());
  ro.observe(canvas);

  // ── Typing animation ───────────────────────────────────────────────

  const PHRASES = [
    "Eat. Grow. Don't bite yourself.",
    "A study in restraint.",
    "Twenty-two by twenty-two.",
    "Built on Arch, btw.",
    "One pixel at a time.",
  ];

  (function typed() {
    let i = 0, c = 0, deleting = false;

    function tick() {
      const cur = PHRASES[i];
      if (deleting) {
        c--;
        elTyped.textContent = cur.slice(0, c);
        if (c === 0) {
          deleting = false;
          i = (i + 1) % PHRASES.length;
          setTimeout(tick, 450);
          return;
        }
        setTimeout(tick, 28);
      } else {
        c++;
        elTyped.textContent = cur.slice(0, c);
        if (c === cur.length) {
          deleting = true;
          setTimeout(tick, 2000);
          return;
        }
        setTimeout(tick, 55);
      }
    }

    setTimeout(tick, 600);
  })();

  // ── Init ───────────────────────────────────────────────────────────

  reset();
  updateScoreUI();
  draw();

})();
