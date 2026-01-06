(() => {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const remainingEl = document.getElementById('remaining');
  const movesEl = document.getElementById('moves');
  const newBtn = document.getElementById('newBtn');
  const applyBtn = document.getElementById('applyBtn');
  const optCount = document.getElementById('optCount');
  const optMinLen = document.getElementById('optMinLen');
  const optMaxLen = document.getElementById('optMaxLen');
  const settingsNote = document.getElementById('settingsNote');
  const undoBtn = document.getElementById('undoBtn');
  const exportBtn = document.getElementById('exportBtn');
  const levelLabel = document.getElementById('levelLabel');
  const levelNameEl = document.getElementById('levelName');
  const prevLevelBtn = document.getElementById('prevLevelBtn');
  const nextLevelBtn = document.getElementById('nextLevelBtn');
  const restartBtn = document.getElementById('restartBtn');
  const toast = document.getElementById('toast');

  const mode = document.body.dataset.mode || 'infinite';
  const isInfinite = mode === 'infinite';
  const isLevels = mode === 'levels';
  const hasGeneratorUI = Boolean(optCount && optMinLen && optMaxLen && applyBtn && newBtn && settingsNote);

  // Canvas world size (fixed logical coords)
  const W = canvas.width;
  const H = canvas.height;

  // Grid (snakes are generated on cell centers, but unwind in pixels when leaving)
  const CELL = 30; // px
  const COLS = Math.floor(W / CELL);
  const ROWS = Math.floor(H / CELL);

  // --- Utils (must be defined before any usage) ---
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));

  // --- User options (persisted) ---
  const DEFAULTS = {
    count: 14,
    minLen: 2,
    maxLen: 20
  };

  const VISUAL_STORAGE_KEY = 'snakeArrowVisualDifficulty';
  const VISUAL_CONFIGS = {
    easy: { showPath: true, showColor: true },
    medium: { showPath: false, showColor: true },
    hard: { showPath: false, showColor: false }
  };

  function loadVisualDifficulty() {
    try {
      const saved = localStorage.getItem(VISUAL_STORAGE_KEY);
      if (saved && VISUAL_CONFIGS[saved]) return saved;
    } catch {
      return 'easy';
    }
    return 'easy';
  }

  let visualDifficulty = loadVisualDifficulty();

  function getVisualConfig() {
    return VISUAL_CONFIGS[visualDifficulty] || VISUAL_CONFIGS.easy;
  }

  function refreshVisualDifficulty() {
    visualDifficulty = loadVisualDifficulty();
  }

  function loadOptions() {
    try {
      const raw = localStorage.getItem('snakeArrowOptions');
      if (!raw) return { ...DEFAULTS };
      const o = JSON.parse(raw);
      return {
        count: Number.isFinite(+o.count) ? +o.count : DEFAULTS.count,
        minLen: Number.isFinite(+o.minLen) ? +o.minLen : DEFAULTS.minLen,
        maxLen: Number.isFinite(+o.maxLen) ? +o.maxLen : DEFAULTS.maxLen
      };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveOptions(o) {
    localStorage.setItem('snakeArrowOptions', JSON.stringify(o));
  }

  let OPTIONS = loadOptions();

  function syncOptionsUI() {
    if (!hasGeneratorUI) return;
    optCount.value = String(OPTIONS.count);
    optMinLen.value = String(OPTIONS.minLen);
    optMaxLen.value = String(OPTIONS.maxLen);
  }

  function validateAndClampOptions(fromUI = true) {
    if (!hasGeneratorUI) {
      OPTIONS = { ...DEFAULTS };
      return OPTIONS;
    }
    let count = fromUI ? parseInt(optCount.value, 10) : OPTIONS.count;
    let minLen = fromUI ? parseInt(optMinLen.value, 10) : OPTIONS.minLen;
    let maxLen = fromUI ? parseInt(optMaxLen.value, 10) : OPTIONS.maxLen;

    if (!Number.isFinite(count)) count = DEFAULTS.count;
    if (!Number.isFinite(minLen)) minLen = DEFAULTS.minLen;
    if (!Number.isFinite(maxLen)) maxLen = DEFAULTS.maxLen;

    // Hard constraints
    count = clamp(count, 1, 40); // solver bitmask limit
    minLen = clamp(minLen, 2, 20);
    maxLen = clamp(maxLen, 2, 30);
    if (minLen > maxLen) [minLen, maxLen] = [maxLen, minLen];

    // Soft density hint (non-blocking)
    const maxCells = COLS * ROWS;
    const minNeeded = count * minLen;
    let note = '';
    if (minNeeded > maxCells * 0.80) {
      note = `That’s very dense for this board. Try fewer snakes or shorter lengths.`;
    }
    settingsNote.textContent = note;

    OPTIONS = { count, minLen, maxLen };
    syncOptionsUI();
    saveOptions(OPTIONS);
    return OPTIONS;
  }

  // Visual thickness
  const BASE_THICK = 16; // px

  // How far outside the canvas snakes slide before being removed
  const EXIT_PADDING = 14;

  // Generation / solver
  const MAX_GEN_ATTEMPTS = 700;

  // Directions
  const DIRS = [
    { key: 'R', dx: 1, dy: 0, ang: 0, name: 'right' },
    { key: 'L', dx: -1, dy: 0, ang: Math.PI, name: 'left' },
    { key: 'D', dx: 0, dy: 1, ang: Math.PI / 2, name: 'down' },
    { key: 'U', dx: 0, dy: -1, ang: -Math.PI / 2, name: 'up' }
  ];

  // --- Self-tests (basic sanity checks; prints to console) ---
  function runSelfTests() {
    if (!hasGeneratorUI) return;
    console.assert(clamp(5, 1, 10) === 5, 'clamp within range');
    console.assert(clamp(-1, 0, 10) === 0, 'clamp low');
    console.assert(clamp(99, 0, 10) === 10, 'clamp high');

    // validateAndClampOptions should never produce invalid ranges
    const saved = { ...OPTIONS };
    OPTIONS = { count: 999, minLen: 20, maxLen: 2 }; // intentionally wrong
    syncOptionsUI();
    validateAndClampOptions(false);
    console.assert(OPTIONS.count >= 1 && OPTIONS.count <= 40, 'options count clamped');
    console.assert(OPTIONS.minLen >= 2 && OPTIONS.minLen <= 20, 'options minLen clamped');
    console.assert(OPTIONS.maxLen >= 2 && OPTIONS.maxLen <= 30, 'options maxLen clamped');
    console.assert(OPTIONS.minLen <= OPTIONS.maxLen, 'options min<=max');

    // restore
    OPTIONS = saved;
    syncOptionsUI();
    validateAndClampOptions(false);
  }

  // --- State ---
  let snakes = []; // active snakes
  let animating = false;
  let moves = 0;
  let history = [];
  let hoverId = null;
  const LEVELS = window.ARROW_LEVELS || [];
  let currentLevel = 0;
  let levelCleared = false;
  let generatedSnapshot = [];

  // Toast
  let toastTimer = null;
  function showToast(html, ms = 1500) {
    toast.innerHTML = html;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), ms);
  }

  // --- Grid / pixel helpers ---
  function cellCenter(c) {
    return { x: (c.x + 0.5) * CELL, y: (c.y + 0.5) * CELL };
  }

  function seededColor(seed) {
    const hue = (seed * 57) % 360;
    return {
      fill: `hsla(${hue}, 85%, 64%, 0.95)`,
      fill2: `hsla(${(hue + 18) % 360}, 90%, 58%, 0.95)`,
      stroke: `hsla(${hue}, 90%, 22%, 0.55)`
    };
  }

  function uuid() {
    return crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
  }

  // --- History (undo) ---
  function deepCopyState(list) {
    // Only store static data needed to reconstruct
    return list.map((s) => ({
      id: s.id,
      dir: s.dir,
      lenCells: s.lenCells,
      thick: s.thick,
      colorSeed: s.colorSeed,
      cells: s.cells.map((c) => ({ x: c.x, y: c.y })),
      isLeaving: false,
      seg: null,
      path: null,
      vx: 0,
      vy: 0
    }));
  }

  function snapshotForExport(list) {
    return list.map((s) => ({
      dir: s.dir,
      cells: s.cells.map((cell) => ({ x: cell.x, y: cell.y }))
    }));
  }

  function formatExportLevel(snakesSnapshot) {
    const timestamp = Date.now();
    const levelSpec = {
      id: `generated-${timestamp}`,
      name: `Generated ${new Date(timestamp).toLocaleString()}`,
      snakes: snakesSnapshot.map((s) => ({
        dir: DIRS[s.dir]?.key || DIRS[0].key,
        cells: s.cells.map((cell) => ({ x: cell.x, y: cell.y }))
      }))
    };

    const payload = JSON.stringify(levelSpec, null, 2);
    return `window.ARROW_LEVELS = window.ARROW_LEVELS || [];\nwindow.ARROW_LEVELS.push(${payload});\n`;
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const temp = document.createElement('textarea');
    temp.value = text;
    temp.setAttribute('readonly', '');
    temp.style.position = 'absolute';
    temp.style.left = '-9999px';
    document.body.appendChild(temp);
    temp.select();
    document.execCommand('copy');
    document.body.removeChild(temp);
  }

  function pushHistory() {
    history.push({ snakes: deepCopyState(snakes), moves });
    if (history.length > 90) history.shift();
    undoBtn.disabled = history.length === 0;
  }

  function popHistory() {
    const snap = history.pop();
    if (!snap) return;
    snakes = deepCopyState(snap.snakes);
    moves = snap.moves;
    animating = false;
    hoverId = null;
    undoBtn.disabled = history.length === 0;
    updateHUD();
    draw();
  }

  function dirIndexFromKey(key) {
    const idx = DIRS.findIndex((d) => d.key === key);
    return idx >= 0 ? idx : 0;
  }

  function makeLevelSnake(spec, index) {
    const cells = spec.cells.map((cell) => ({ x: cell.x, y: cell.y }));
    return {
      id: uuid(),
      dir: dirIndexFromKey(spec.dir),
      lenCells: cells.length,
      thick: clamp(BASE_THICK + (index % 3) * 2, 12, 22),
      colorSeed: (index * 947 + cells.length * 31) % 10000,
      cells,
      isLeaving: false,
      seg: null,
      path: null,
      vx: 0,
      vy: 0
    };
  }

  function loadLevel(index, afterWin = false) {
    if (!LEVELS.length) {
      snakes = [];
      showToast('No levels found.');
      updateHUD();
      draw();
      return;
    }

    currentLevel = clamp(index, 0, LEVELS.length - 1);
    levelCleared = false;
    animating = false;
    hoverId = null;
    moves = 0;
    history = [];
    undoBtn.disabled = true;

    const level = LEVELS[currentLevel];
    snakes = level.snakes.map((spec, idx) => makeLevelSnake(spec, idx));
    let solvableNote = '';
    if (!solveBoard(snakes)) {
      const regenerated = generateSolvableStoryLevel(level);
      if (regenerated) {
        snakes = regenerated;
        solvableNote = ' <em>(solvable variant generated)</em>';
      } else {
        solvableNote = ' <em>(unsolvable)</em>';
      }
    }

    showToast(
      `Level ${currentLevel + 1}: <strong>${level.name || 'Untitled'}</strong> — ${snakes.length} snakes.${solvableNote}`,
      afterWin ? 1600 : 1400
    );
    updateHUD();
    draw();
  }

  // --- Geometry: dynamic polyline (segments) ---
  function ensureSegments(s) {
    if (s.seg && s.seg.length) return;
    // seg[0] = head point (center), then body points
    s.seg = s.cells.map(cellCenter).map((p) => ({ x: p.x, y: p.y }));
    s.path = s.seg.map((p) => ({ x: p.x, y: p.y }));
  }

  function polylinePoints(s) {
    // Use dynamic segments if leaving, otherwise derive from cells
    let pts;
    if (s.isLeaving) {
      ensureSegments(s);
      pts = s.seg;
    } else {
      pts = s.cells.map(cellCenter);
    }

    // Add slight head forward extension and tail extension for nicer caps
    const d = DIRS[s.dir];
    const out = pts.map((p) => ({ x: p.x, y: p.y }));

    const head = out[0];
    const headExt = Math.min(CELL * 0.40, s.thick * 1.0);
    out.unshift({ x: head.x + d.dx * headExt, y: head.y + d.dy * headExt });

    const tail = out[out.length - 1];
    const prev = out[out.length - 2] || tail;
    const tx = tail.x - prev.x;
    const ty = tail.y - prev.y;
    const tlen = Math.hypot(tx, ty) || 1;
    const tailExt = Math.min(CELL * 0.35, s.thick * 0.9);
    out.push({ x: tail.x + (tx / tlen) * tailExt, y: tail.y + (ty / tlen) * tailExt });

    return out;
  }

  function buildStrokePath(s) {
    const pts = polylinePoints(s);
    const p = new Path2D();
    p.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y);
    return p;
  }

  function headCenterPx(s) {
    if (s.isLeaving) {
      ensureSegments(s);
      return { x: s.seg[0].x, y: s.seg[0].y };
    }
    return cellCenter(s.cells[0]);
  }

  function buildHeadTrianglePath(s) {
    const d = DIRS[s.dir];
    const head = headCenterPx(s);
    const hx = head.x;
    const hy = head.y;

    const headLen = clamp(s.thick * 1.35, 18, 30);
    const headW = clamp(s.thick * 0.95, 14, 26);

    const tipX = hx + d.dx * headLen;
    const tipY = hy + d.dy * headLen;

    const baseCX = hx - d.dx * (s.thick * 0.15);
    const baseCY = hy - d.dy * (s.thick * 0.15);

    const px = -d.dy;
    const py = d.dx;

    const leftX = baseCX + px * (headW * 0.5);
    const leftY = baseCY + py * (headW * 0.5);
    const rightX = baseCX - px * (headW * 0.5);
    const rightY = baseCY - py * (headW * 0.5);

    const p = new Path2D();
    p.moveTo(tipX, tipY);
    p.lineTo(leftX, leftY);
    p.lineTo(rightX, rightY);
    p.closePath();
    return p;
  }

  function getAABB(s) {
    const pts = polylinePoints(s);
    let x1 = Infinity,
      y1 = Infinity,
      x2 = -Infinity,
      y2 = -Infinity;
    for (const p of pts) {
      x1 = Math.min(x1, p.x);
      y1 = Math.min(y1, p.y);
      x2 = Math.max(x2, p.x);
      y2 = Math.max(y2, p.y);
    }
    const pad = s.thick * 0.85;
    return { x1: x1 - pad, y1: y1 - pad, x2: x2 + pad, y2: y2 + pad };
  }

  function aabbOverlap(A, B) {
    return !(A.x2 < B.x1 || A.x1 > B.x2 || A.y2 < B.y1 || A.y1 > B.y2);
  }

  function pointInAABB(x, y, bb) {
    return x >= bb.x1 && x <= bb.x2 && y >= bb.y1 && y <= bb.y2;
  }

  function hitTestSnake(px, py, s) {
    const { showPath } = getVisualConfig();
    const bb = getAABB(s);
    if (!pointInAABB(px, py, bb)) return false;

    const headTri = buildHeadTrianglePath(s);
    if (ctx.isPointInPath(headTri, px, py)) return true;

    if (!showPath) return false;

    const strokePath = buildStrokePath(s);
    ctx.save();
    ctx.lineWidth = s.thick;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const ok = ctx.isPointInStroke(strokePath, px, py);
    ctx.restore();
    return ok;
  }

  // --- Blocking / exit rules ---
  // IMPORTANT: Movement is head-led (snake unwinds), so the only check is whether the HEAD'S lane to the edge is clear.
  function headLaneRect(s) {
    const d = DIRS[s.dir];
    const head = headCenterPx(s);
    const w = s.thick * 1.35;
    const half = w / 2;

    if (d.dx === 1) return { x1: head.x + s.thick * 0.6, y1: head.y - half, x2: W + 999, y2: head.y + half };
    if (d.dx === -1) return { x1: -999, y1: head.y - half, x2: head.x - s.thick * 0.6, y2: head.y + half };
    if (d.dy === 1) return { x1: head.x - half, y1: head.y + s.thick * 0.6, x2: head.x + half, y2: H + 999 };
    return { x1: head.x - half, y1: -999, x2: head.x + half, y2: head.y - s.thick * 0.6 };
  }

  function canExit(s, list = snakes) {
    const lane = headLaneRect(s);
    for (const o of list) {
      if (o.id === s.id) continue;
      if (aabbOverlap(lane, getAABB(o))) return false;
    }
    return true;
  }

  // --- Rendering ---
  function drawBackground() {
    ctx.clearRect(0, 0, W, H);

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0.06)');
    g.addColorStop(1, 'rgba(255,255,255,0.02)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += CELL) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += CELL) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
      ctx.stroke();
    }
    ctx.restore();

    // Vignette
    const v = ctx.createRadialGradient(
      W * 0.5,
      H * 0.5,
      Math.min(W, H) * 0.15,
      W * 0.5,
      H * 0.5,
      Math.max(W, H) * 0.7
    );
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);

    // Border glow
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = 'rgba(122,162,255,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawOneSnake(s, highlight = false) {
    const { showPath, showColor } = getVisualConfig();
    const palette = showColor
      ? seededColor(s.colorSeed)
      : { fill: 'rgba(219,226,255,0.6)', fill2: 'rgba(219,226,255,0.6)', stroke: 'rgba(12,18,40,0.85)' };

    const headTri = buildHeadTrianglePath(s);

    let grad = palette.fill;
    let bb = null;
    if (showColor) {
      bb = getAABB(s);
      grad = ctx.createLinearGradient(bb.x1, bb.y1, bb.x2, bb.y2);
      grad.addColorStop(0, palette.fill2);
      grad.addColorStop(0.55, palette.fill);
      grad.addColorStop(1, palette.fill2);
    }

    if (showPath) {
      const body = buildStrokePath(s);

      // Shadow
      ctx.save();
      ctx.translate(3, 4);
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = 'rgba(0,0,0,0.95)';
      ctx.lineWidth = s.thick + 3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke(body);
      ctx.restore();

      // Body
      ctx.save();
      ctx.strokeStyle = grad;
      ctx.lineWidth = s.thick;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke(body);

      // Outline
      ctx.strokeStyle = highlight ? 'rgba(255,255,255,0.85)' : palette.stroke;
      ctx.lineWidth = highlight ? 4 : 2;
      ctx.stroke(body);
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(2, 3);
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fill(headTri);
      ctx.restore();
    }

    // Head
    ctx.save();
    ctx.fillStyle = grad;
    ctx.strokeStyle = highlight ? 'rgba(255,255,255,0.85)' : palette.stroke;
    ctx.lineWidth = highlight ? 3 : 2;
    ctx.fill(headTri);
    ctx.stroke(headTri);
    ctx.restore();

    // Eyes
    const d = DIRS[s.dir];
    const head = headCenterPx(s);
    const px = -d.dy;
    const py = d.dx;

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    const eyeDist = Math.max(4, s.thick * 0.18);
    const eyeBack = Math.max(6, s.thick * 0.32);
    const ex = head.x - d.dx * eyeBack;
    const ey = head.y - d.dy * eyeBack;
    ctx.beginPath();
    ctx.arc(ex + px * eyeDist, ey + py * eyeDist, 2.4, 0, Math.PI * 2);
    ctx.arc(ex - px * eyeDist, ey - py * eyeDist, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (showPath) {
      // Length badge
      if (!bb) bb = getAABB(s);
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = 'rgba(255,255,255,0.20)';
      ctx.font =
        '11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
      ctx.fillText(String(s.lenCells), bb.x1 + 8, bb.y1 + 14);
      ctx.restore();
    }

    // (Optional) visualize head lane on hover
    if (highlight) {
      const lane = headLaneRect(s);
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = canExit(s) ? 'rgba(74,222,128,0.55)' : 'rgba(251,113,133,0.55)';
      ctx.fillRect(lane.x1, lane.y1, lane.x2 - lane.x1, lane.y2 - lane.y1);
      ctx.restore();
    }
  }

  function draw() {
    drawBackground();

    const sorted = [...snakes].sort((a, b) => (a.isLeaving ? 1 : 0) - (b.isLeaving ? 1 : 0));

    for (const s of sorted) {
      const can = !s.isLeaving && canExit(s);
      const isHover = hoverId === s.id;
      const { showPath } = getVisualConfig();

      ctx.save();
      if (!can && !s.isLeaving) ctx.globalAlpha = 0.62;
      drawOneSnake(s, isHover);
      ctx.restore();

      if (isHover && !s.isLeaving) {
        const headTri = buildHeadTrianglePath(s);
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = can ? 'rgba(74,222,128,0.85)' : 'rgba(251,113,133,0.85)';
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        if (showPath) {
          const strokePath = buildStrokePath(s);
          ctx.lineWidth = s.thick + 6;
          ctx.stroke(strokePath);
        }
        ctx.lineWidth = 4;
        ctx.stroke(headTri);
        ctx.restore();
      }
    }

    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    ctx.fillText('Click snakes. Green outline = head lane is clear. (Unwinds while leaving)', 16, H - 16);
    ctx.restore();
  }

  // --- Input ---
  function canvasToLocal(evt) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    return { x: (evt.clientX - rect.left) * sx, y: (evt.clientY - rect.top) * sy };
  }

  function findTopSnakeAt(x, y) {
    for (let i = snakes.length - 1; i >= 0; i--) {
      const s = snakes[i];
      if (s.isLeaving) continue;
      if (hitTestSnake(x, y, s)) return s;
    }
    return null;
  }

  canvas.addEventListener('mousemove', (e) => {
    if (animating) return;
    const p = canvasToLocal(e);
    const hit = findTopSnakeAt(p.x, p.y);
    hoverId = hit ? hit.id : null;
    draw();
  });

  canvas.addEventListener('mouseleave', () => {
    hoverId = null;
    draw();
  });

  canvas.addEventListener('click', (e) => {
    if (animating) return;
    const p = canvasToLocal(e);
    const hit = findTopSnakeAt(p.x, p.y);
    if (!hit) return;

    if (!canExit(hit)) {
      showToast(`That snake is <strong>blocked</strong>. Clear its <strong>head lane</strong> to the edge.`);
      return;
    }

    pushHistory();
    moves++;
    movesEl.textContent = String(moves);
    startLeaving(hit);
  });

  // --- Leaving animation (unwind: segments follow head) ---
  function startLeaving(s) {
    const d = DIRS[s.dir];
    s.isLeaving = true;
    ensureSegments(s);
    s.path = s.seg.map((p) => ({ x: p.x, y: p.y }));

    const speed = 760 + s.thick * 7;
    s.vx = d.dx * speed;
    s.vy = d.dy * speed;

    animating = true;
    showToast(`Snake unwinds and slides <strong>${d.name}</strong> off-screen.`);
    updateHUD();

    let last = performance.now();
    function tick(now) {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;

      // Update leaving snakes
      for (const x of snakes) {
        if (!x.isLeaving) continue;
        updateUnwind(x, dt);
      }

      // Remove exited
      snakes = snakes.filter((x) => !isOut(x));

      draw();

      if (snakes.length === 0) {
        animating = false;
        if (isInfinite) {
          updateHUD();
          showToast(`<strong>Cleared!</strong> Generating a new puzzle…`, 1400);
          setTimeout(() => newPuzzle(true), 750);
        } else {
          levelCleared = true;
          updateHUD();
          const atEnd = currentLevel >= LEVELS.length - 1;
          showToast(
            atEnd
              ? `<strong>All levels cleared!</strong> Hit Replay Levels to start again.`
              : `<strong>Level cleared!</strong> Tap Next Level to continue.`,
            2200
          );
        }
        return;
      }

      const anyLeaving = snakes.some((x) => x.isLeaving);
      if (anyLeaving) {
        requestAnimationFrame(tick);
      } else {
        animating = false;
        updateHUD();
        if (!snakes.some((x) => canExit(x))) {
          showToast(`No exits available. Try <strong>Undo</strong> (U) or new puzzle (R).`, 2200);
        }
      }
    }

    requestAnimationFrame(tick);
  }

  function updateUnwind(s, dt) {
    // Move head forward continuously
    const head = s.seg[0];
    head.x += s.vx * dt;
    head.y += s.vy * dt;

    // Advance the path and keep total length constant
    if (!s.path || !s.path.length) {
      s.path = s.seg.map((p) => ({ x: p.x, y: p.y }));
    } else {
      s.path[0] = { x: head.x, y: head.y };
    }
    trimPathToLength(s.path, (s.seg.length - 1) * CELL);

    // Place segments along the path at fixed spacing
    const spacing = CELL;
    for (let i = 1; i < s.seg.length; i++) {
      const p = samplePointAlongPath(s.path, spacing * i);
      s.seg[i].x = p.x;
      s.seg[i].y = p.y;
    }
  }

  function pathLength(path) {
    let total = 0;
    for (let i = 1; i < path.length; i++) {
      total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    }
    return total;
  }

  function trimPathToLength(path, maxLen) {
    let total = pathLength(path);
    while (path.length > 1 && total > maxLen) {
      const last = path[path.length - 1];
      const prev = path[path.length - 2];
      const segLen = Math.hypot(last.x - prev.x, last.y - prev.y) || 1;
      const excess = total - maxLen;
      if (segLen > excess) {
        const t = (segLen - excess) / segLen;
        path[path.length - 1] = {
          x: prev.x + (last.x - prev.x) * t,
          y: prev.y + (last.y - prev.y) * t
        };
        return;
      }
      path.pop();
      total -= segLen;
    }
  }

  function samplePointAlongPath(path, dist) {
    if (dist <= 0 || path.length === 1) return { x: path[0].x, y: path[0].y };
    let remaining = dist;
    for (let i = 1; i < path.length; i++) {
      const prev = path[i - 1];
      const cur = path[i];
      const segLen = Math.hypot(cur.x - prev.x, cur.y - prev.y) || 1;
      if (remaining <= segLen) {
        const t = remaining / segLen;
        return { x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t };
      }
      remaining -= segLen;
    }
    const tail = path[path.length - 1];
    return { x: tail.x, y: tail.y };
  }

  function isOut(s) {
    const bb = getAABB(s);
    return bb.x2 < -EXIT_PADDING || bb.x1 > W + EXIT_PADDING || bb.y2 < -EXIT_PADDING || bb.y1 > H + EXIT_PADDING;
  }

  // --- HUD ---
  function updateHUD() {
    remainingEl.textContent = String(snakes.length);
    movesEl.textContent = String(moves);
    undoBtn.disabled = history.length === 0 || animating;
    if (levelLabel) {
      const label = LEVELS.length ? `${currentLevel + 1} / ${LEVELS.length}` : '–';
      levelLabel.textContent = label;
    }
    if (levelNameEl) {
      levelNameEl.textContent = LEVELS[currentLevel]?.name || 'Level';
    }
    if (prevLevelBtn) prevLevelBtn.disabled = animating || currentLevel === 0;
    if (restartBtn) restartBtn.disabled = animating;
    if (nextLevelBtn) {
      const hasNext = currentLevel < LEVELS.length - 1;
      nextLevelBtn.textContent = hasNext ? 'Next Level' : 'Replay Levels';
      nextLevelBtn.disabled = animating || !levelCleared;
    }
  }

  // --- Generation ---
  // We still generate on the grid (with bendy tails), but solvability is now guaranteed by a real solver.

  function forwardDot(dx, dy, dirIdx) {
    const d = DIRS[dirIdx];
    return dx * d.dx + dy * d.dy;
  }

  function makeSnakePath(head, dirIdx, lenCells) {
    // cells[0] is head, then each next cell is one step away
    const cells = [{ x: head.x, y: head.y }];

    // First body cell must be behind head
    const d = DIRS[dirIdx];
    let prevDir = { dx: -d.dx, dy: -d.dy };
    let cur = { x: head.x - d.dx, y: head.y - d.dy };
    if (cur.x < 0 || cur.x >= COLS || cur.y < 0 || cur.y >= ROWS) return null;

    cells.push(cur);
    const used = new Set([`${head.x},${head.y}`, `${cur.x},${cur.y}`]);

    for (let i = 2; i < lenCells; i++) {
      const opts = [
        { dx: prevDir.dx, dy: prevDir.dy },
        { dx: -prevDir.dy, dy: prevDir.dx },
        { dx: prevDir.dy, dy: -prevDir.dx }
      ];
      // shuffle
      for (let k = opts.length - 1; k > 0; k--) {
        const j = (Math.random() * (k + 1)) | 0;
        [opts[k], opts[j]] = [opts[j], opts[k]];
      }

      let placed = false;
      for (const step of opts) {
        const nx = cur.x + step.dx;
        const ny = cur.y + step.dy;
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
        const key = `${nx},${ny}`;
        if (used.has(key)) continue;

        // Keep body from going "in front" of the head at generation time.
        // (During leaving it can straighten/unwind, but initial shape should not self-cover the lane.)
        const relx = nx - head.x;
        const rely = ny - head.y;
        if (forwardDot(relx, rely, dirIdx) > 0) continue;

        cur = { x: nx, y: ny };
        cells.push(cur);
        used.add(key);
        prevDir = { dx: step.dx, dy: step.dy };
        placed = true;
        break;
      }
      if (!placed) return null;
    }

    return cells;
  }

  function randomSnakeSpec(i, minLen = OPTIONS.minLen, maxLen = OPTIONS.maxLen) {
    const dir = randi(0, 3);
    const lenCells = randi(minLen, maxLen);
    const thick = clamp(BASE_THICK + randi(-3, 6), 12, 24);
    const seed = (Date.now() + i * 997 + ((Math.random() * 1e6) | 0)) % 10000;
    return { dir, lenCells, thick, seed };
  }

  function placeSnakeNonOverlapping(spec, usedCellsSet) {
    const tries = 180;
    const marginCells = 1;

    for (let t = 0; t < tries; t++) {
      const hx = randi(marginCells, COLS - 1 - marginCells);
      const hy = randi(marginCells, ROWS - 1 - marginCells);

      const head = { x: hx, y: hy };
      const cells = makeSnakePath(head, spec.dir, spec.lenCells);
      if (!cells) continue;

      // Avoid trivial immediate exits (head too close to edge in its heading)
      const d = DIRS[spec.dir];
      const hp = cellCenter(cells[0]);
      const edgeBuffer = 60;
      if (d.dx === 1 && hp.x > W - edgeBuffer) continue;
      if (d.dx === -1 && hp.x < edgeBuffer) continue;
      if (d.dy === 1 && hp.y > H - edgeBuffer) continue;
      if (d.dy === -1 && hp.y < edgeBuffer) continue;

      // Grid-cell overlap check
      let ok = true;
      for (const c of cells) {
        const key = `${c.x},${c.y}`;
        if (usedCellsSet.has(key)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      return {
        id: uuid(),
        dir: spec.dir,
        lenCells: spec.lenCells,
        thick: spec.thick,
        colorSeed: spec.seed,
        cells,
        isLeaving: false,
        seg: null,
        path: null,
        vx: 0,
        vy: 0
      };
    }

    return null;
  }

  function generateCandidate(count = OPTIONS.count, minLen = OPTIONS.minLen, maxLen = OPTIONS.maxLen) {
    const list = [];
    const usedCells = new Set();

    for (let i = 0; i < count; i++) {
      const spec = randomSnakeSpec(i, minLen, maxLen);
      const placed = placeSnakeNonOverlapping(spec, usedCells);
      if (!placed) return null;
      list.push(placed);
      for (const c of placed.cells) usedCells.add(`${c.x},${c.y}`);
    }

    return list;
  }

  // --- Exact solver (guarantees solvable boards) ---
  // State is a bitmask of remaining snakes. Snakes are static while solving; only removals happen.

  function solveBoard(list) {
    const n = list.length;
    if (n > 20) return null;

    // Precompute AABBs and head-lane rectangles per snake (static geometry)
    const stat = list.map((s) => {
      const bb = getAABB(s);
      const lane = headLaneRect(s);
      return { bb, lane };
    });

    const full = (1 << n) - 1;
    const dead = new Set();
    const choice = new Map();

    // Precompute overlaps for speed: lane(i) blocks by bb(j)
    const laneBlocks = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        if (aabbOverlap(stat[i].lane, stat[j].bb)) laneBlocks[i].push(j);
      }
    }

    // Simple heuristic score: prefer removing snakes that unblock many others
    const unblockScore = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < laneBlocks.length; k++) {
        if (laneBlocks[k].includes(i)) unblockScore[i]++;
      }
    }

    function exits(mask) {
      const out = [];
      for (let i = 0; i < n; i++) {
        if (((mask >> i) & 1) === 0) continue;
        let blocked = false;
        for (const j of laneBlocks[i]) {
          if (((mask >> j) & 1) === 1) {
            blocked = true;
            break;
          }
        }
        if (!blocked) out.push(i);
      }
      // Try more promising first
      out.sort((a, b) => unblockScore[b] - unblockScore[a]);
      return out;
    }

    function dfs(mask) {
      if (mask === 0) return true;
      if (dead.has(mask)) return false;

      const ex = exits(mask);
      if (ex.length === 0) {
        dead.add(mask);
        return false;
      }

      for (const i of ex) {
        const next = mask & ~(1 << i);
        if (dfs(next)) {
          choice.set(mask, i);
          return true;
        }
      }

      dead.add(mask);
      return false;
    }

    const ok = dfs(full);
    if (!ok) return null;

    // Build solution order
    const order = [];
    let m = full;
    while (m) {
      const i = choice.get(m);
      if (i === undefined) break;
      order.push(i);
      m = m & ~(1 << i);
    }

    return order;
  }

  function generateSolvableStoryLevel(level) {
    const lengths = level.snakes.map((spec) => spec.cells.length);
    const count = lengths.length;
    const minLen = Math.max(2, Math.min(...lengths));
    const maxLen = Math.max(minLen, Math.max(...lengths));

    for (let attempt = 0; attempt < MAX_GEN_ATTEMPTS; attempt++) {
      const candidate = generateCandidate(count, minLen, maxLen);
      if (!candidate) continue;
      if (!candidate.some((s) => canExit(s, candidate))) continue;
      if (!solveBoard(candidate)) continue;
      return candidate;
    }

    return null;
  }

  function newPuzzle(afterWin = false) {
    animating = false;
    hoverId = null;
    moves = 0;
    history = [];
    undoBtn.disabled = true;

    let candidate = null;
    let solution = null;

    for (let attempt = 0; attempt < MAX_GEN_ATTEMPTS; attempt++) {
      const c = generateCandidate();
      if (!c) continue;

      // Must have at least one exit
      if (!c.some((s) => canExit(s, c))) continue;

      // Exact solvability check
      const ord = solveBoard(c);
      if (!ord) continue;

      candidate = c;
      solution = ord;
      break;
    }

    if (!candidate) {
      // Fallback: simpler (still solvable)
      let ok = false;
      for (let attempt = 0; attempt < 400 && !ok; attempt++) {
        const c = generateCandidate();
        if (!c) continue;
        const ord = solveBoard(c);
        if (ord) {
          candidate = c;
          solution = ord;
          ok = true;
        }
      }
    }

    snakes = candidate || [];
    generatedSnapshot = snapshotForExport(snakes);

    if (solution && snakes.length) {
      showToast(
        `Solvable board generated — <strong>${snakes.length}</strong> snakes (len ${OPTIONS.minLen}-${OPTIONS.maxLen}).`,
        afterWin ? 1600 : 1400
      );
    } else {
      showToast(`Board generated — <strong>${snakes.length}</strong> snakes.`, afterWin ? 1600 : 1400);
    }

    updateHUD();
    draw();
  }

  // --- Buttons & keys ---
  if (newBtn) newBtn.addEventListener('click', () => newPuzzle(false));
  if (undoBtn) undoBtn.addEventListener('click', () => popHistory());
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      if (!generatedSnapshot.length) {
        showToast('Generate a puzzle first to export a level.');
        return;
      }
      try {
        const exportText = formatExportLevel(generatedSnapshot);
        await copyTextToClipboard(exportText);
        showToast('Level copied! Paste into a story level file.');
      } catch (err) {
        console.error(err);
        showToast('Unable to copy level. Check clipboard permissions.');
      }
    });
  }

  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      validateAndClampOptions(true);
      newPuzzle(false);
    });
  }

  if (hasGeneratorUI) {
    [optCount, optMinLen, optMaxLen].forEach((el) => {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          validateAndClampOptions(true);
          newPuzzle(false);
        }
      });
      el.addEventListener('change', () => {
        validateAndClampOptions(true);
      });
    });
  }

  if (prevLevelBtn) {
    prevLevelBtn.addEventListener('click', () => {
      if (currentLevel > 0) loadLevel(currentLevel - 1);
    });
  }

  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      loadLevel(currentLevel);
    });
  }

  if (nextLevelBtn) {
    nextLevelBtn.addEventListener('click', () => {
      if (!levelCleared) return;
      const hasNext = currentLevel < LEVELS.length - 1;
      loadLevel(hasNext ? currentLevel + 1 : 0, true);
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') {
      if (isInfinite) newPuzzle(false);
      if (isLevels) loadLevel(currentLevel);
    }
    if (e.key === 'u' || e.key === 'U') if (!animating) popHistory();
  });

  window.addEventListener('storage', (event) => {
    if (event.key === VISUAL_STORAGE_KEY) {
      refreshVisualDifficulty();
      draw();
    }
  });

  // --- Init ---
  if (isInfinite) {
    syncOptionsUI();
    validateAndClampOptions(false);
    runSelfTests();
    newPuzzle(false);
    updateHUD();
  } else {
    loadLevel(0);
    updateHUD();
  }
})();
