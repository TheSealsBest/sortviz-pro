// ============================================================
//  SortViz — app.js
//  All frontend logic. Talks to the C++ backend at BACKEND.
// ============================================================

'use strict';

// ── Backend URL ──────────────────────────────────────────────
const BACKEND = 'https://sortviz-pro-production.up.railway.app';

// ── Constants ────────────────────────────────────────────────
const SPEED_LABELS  = ['Very Slow','Slow','Medium','Fast','Very Fast','Instant'];
const SPEEDS        = [700, 250, 80, 25, 8, 0]; // ms delay (0 = instant)
const ALGOS         = ['bubble','selection','insertion','merge','quick','heap'];

const ALGO_NAMES = {
  bubble:    'Bubble Sort',
  selection: 'Selection Sort',
  insertion: 'Insertion Sort',
  merge:     'Merge Sort',
  quick:     'Quick Sort',
  heap:      'Heap Sort',
};

const ALGO_COLORS = {
  bubble:    '#e8514a',
  selection: '#f0a832',
  insertion: '#e8d44d',
  merge:     '#2ecc8f',
  quick:     '#4d8ef7',
  heap:      '#a070f5',
};

const PSEUDOCODE = {
  bubble: [
    ['for i = 0 to n-1',           0],
    ['  for j = 0 to n-i-2',       1],
    ['    if arr[j] > arr[j+1]',   2],
    ['      swap(arr[j], arr[j+1])',3],
    ['    end if',                  4],
    ['  end for',                   5],
    ['end for',                     6],
  ],
  selection: [
    ['for i = 0 to n-1',             0],
    ['  minIdx = i',                  1],
    ['  for j = i+1 to n-1',         2],
    ['    if arr[j] < arr[minIdx]',   3],
    ['      minIdx = j',              4],
    ['  if minIdx != i',              5],
    ['    swap(arr[i], arr[minIdx])', 6],
    ['end for',                       7],
  ],
  insertion: [
    ['for i = 1 to n-1',               0],
    ['  key = arr[i]',                  1],
    ['  j = i - 1',                     2],
    ['  while j >= 0 and arr[j] > key', 3],
    ['    arr[j+1] = arr[j]',           4],
    ['    j = j - 1',                   5],
    ['  arr[j+1] = key',                6],
    ['end for',                         7],
  ],
  merge: [
    ['mergeSort(arr, lo, hi)',      0],
    ['  if lo >= hi: return',       1],
    ['  mid = (lo + hi) / 2',      2],
    ['  mergeSort(arr, lo, mid)',   3],
    ['  mergeSort(arr, mid+1, hi)', 4],
    ['  merge(arr, lo, mid, hi)',   5],
    ['    while i<=mid and j<=hi',  6],
    ['      pick smaller, advance', 7],
  ],
  quick: [
    ['quickSort(arr, lo, hi)',        0],
    ['  if lo >= hi: return',         1],
    ['  pivot = arr[hi]',             2],
    ['  i = lo - 1',                  3],
    ['  for j = lo to hi-1',          4],
    ['    if arr[j] <= pivot',        5],
    ['      i++; swap(arr[i],arr[j])',6],
    ['  swap(arr[i+1], arr[hi])',     7],
    ['  recurse left and right',      8],
  ],
  heap: [
    ['buildMaxHeap(arr)',              0],
    ['  heapify from n/2 down to 0',  1],
    ['for i = n-1 down to 1',         2],
    ['  swap(arr[0], arr[i])',         3],
    ['  heapifyDown(arr, 0, i)',       4],
    ['    while node has children',    5],
    ['      find largest child',       6],
    ['      if parent < child: swap',  7],
  ],
};

// ── Application state ────────────────────────────────────────
const state = {
  arr:          [],
  frames:       [],
  curFrame:     0,
  animTimer:    null,
  isPlaying:    false,
  currentAlgo:  'bubble',
  currentPreset:'random',
  currentView:  'bars',
  currentMode:  'viz',
  soundOn:      false,
  volume:       0.4,
  audioCtx:     null,
  opHistory:    [],

  // Race mode
  raceSets:  {},   // { algo: { frames: [], timing_ms: 0 } }
  raceMax:   0,
  raceTL:    [],   // unified timeline

  // Benchmark
  benchResults: null,
};

// ── Canvas & context references ──────────────────────────────
const sortCanvas  = document.getElementById('sort-canvas');
const raceCanvas  = document.getElementById('race-canvas');
const opsCanvas   = document.getElementById('ops-canvas');
const sortCtx     = sortCanvas.getContext('2d');
const raceCtx     = raceCanvas.getContext('2d');
const opsCtx      = opsCanvas.getContext('2d');

// ── Resize canvases on window resize ────────────────────────
function resizeCanvases() {
  const stage = sortCanvas.parentElement;
  const W = stage.clientWidth;
  const H = stage.clientHeight;
  const dpr = devicePixelRatio;

  [sortCanvas, raceCanvas].forEach(c => {
    c.width  = W * dpr;
    c.height = H * dpr;
    c.style.width  = W + 'px';
    c.style.height = H + 'px';
  });

  sortCtx.scale(dpr, dpr);
  raceCtx.scale(dpr, dpr);

  redraw();
}

function redraw() {
  if (state.currentMode === 'race') drawRaceFrame(state.curFrame);
  else if (state.currentMode === 'viz') drawVizFrame(state.curFrame);
}

window.addEventListener('resize', resizeCanvases);

// ════════════════════════════════════════════════════════════
//  ARRAY MANAGEMENT
// ════════════════════════════════════════════════════════════

function buildArray() {
  const n = +document.getElementById('size-slider').value;
  state.arr = generatePreset(state.currentPreset, n);
  document.getElementById('custom-input').value = '';
  afterArrayChange();
}

function generatePreset(preset, n) {
  const rand  = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
  switch (preset) {
    case 'random':   return Array.from({length:n}, () => rand(5, 100));
    case 'nearly':   return Array.from({length:n}, (_,i) => i+1)
                            .map(v => Math.random() < 0.85 ? v : rand(1, n));
    case 'reversed': return Array.from({length:n}, (_,i) => n - i);
    case 'few':      return Array.from({length:n}, () => rand(1,5) * 10);
    case 'sorted':   return Array.from({length:n}, (_,i) => i + 1);
    case 'sawtooth': return Array.from({length:n}, (_,i) => ((i % 10) + 1) * 10);
    default:         return Array.from({length:n}, () => rand(5, 100));
  }
}

function applyCustom() {
  const hint = document.getElementById('custom-hint');
  const raw  = document.getElementById('custom-input').value.trim();

  if (!raw) {
    hint.textContent = 'Enter values first';
    hint.className = 'custom-hint error';
    return;
  }

  const vals = raw.split(/[\s,;]+/).filter(Boolean).map(Number);

  if (vals.some(v => isNaN(v) || !Number.isInteger(v) || v < 1 || v > 999)) {
    hint.textContent = 'Only integers 1–999 allowed';
    hint.className = 'custom-hint error';
    return;
  }
  if (vals.length < 3) {
    hint.textContent = 'Need at least 3 values';
    hint.className = 'custom-hint error';
    return;
  }
  if (vals.length > 100) {
    hint.textContent = 'Max 100 values';
    hint.className = 'custom-hint error';
    return;
  }

  hint.textContent = `✓ ${vals.length} values loaded`;
  hint.className = 'custom-hint ok';
  state.arr = vals;

  const slider = document.getElementById('size-slider');
  slider.value = vals.length;
  document.getElementById('size-display').value = vals.length;

  afterArrayChange();
}

function afterArrayChange() {
  stopAnim();
  state.frames    = [snapZero()];
  state.curFrame  = 0;
  state.opHistory = [];
  state.raceSets  = {};
  state.raceTL    = [];
  state.raceMax   = 0;

  setScrubber(0, 0);
  setButtonState('idle');
  drawVizFrame(0);
  renderPseudocode(-1);
  drawOpsGraph();

  setNarration('New array ready — press <span class="hl">SORT</span>');
  log('info', `Array of ${state.arr.length} elements ready`);
}

function snapZero() {
  return {
    arr:    [...state.arr],
    hl:     {},
    sorted: new Set(),
    stats:  { c:0, s:0, r:0, w:0 },
    pseudo: -1,
    narr:   '',
  };
}

function onSizeChange(v) {
  document.getElementById('size-display').value = v;
  buildArray();
}

// ════════════════════════════════════════════════════════════
//  BACKEND COMMUNICATION
// ════════════════════════════════════════════════════════════

/**
 * Fetch sort frames from the C++ backend.
 * Returns a normalised array of frame objects compatible with the renderer.
 */
async function fetchSortFrames(algo) {
  const params = new URLSearchParams({
    algo,
    size:   document.getElementById('size-slider').value,
    preset: state.currentPreset,
  });

  const customRaw = document.getElementById('custom-input').value.trim();
  if (customRaw) params.set('data', customRaw.replace(/\s+/g, ''));

  const response = await fetch(`${BACKEND}/sort?${params}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  const raw = await response.json();
  return raw.map(normaliseFrame);
}

/**
 * Fetch parallel race results from the C++ backend.
 * The /race endpoint runs all algorithms in std::async threads.
 * Returns { results: [{ algo, frames, timing_ms }] }
 */
async function fetchRaceResults() {
  const params = new URLSearchParams({
    size:   document.getElementById('size-slider').value,
    preset: state.currentPreset,
  });

  const customRaw = document.getElementById('custom-input').value.trim();
  if (customRaw) params.set('data', customRaw.replace(/\s+/g, ''));

  const response = await fetch(`${BACKEND}/race?${params}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  const raw = await response.json();
  // Normalise each algorithm's frames
  return raw.map(r => ({
    algo:      r.algo,
    timing_ms: r.timing_ms,
    frames:    r.frames.map(normaliseFrame),
  }));
}

/**
 * Fetch benchmark results from the C++ backend.
 * The /benchmark endpoint sorts at multiple sizes with high-res timing.
 * Returns [{ algo, sizes: [{ n, time_ns, swaps, comps }] }]
 */
async function fetchBenchmarkResults() {
  const response = await fetch(`${BACKEND}/benchmark`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/** Convert raw backend frame → renderer-compatible frame */
function normaliseFrame(f) {
  return {
    arr:    f.arr,
    hl:     {
      compare: f.compare  || [],
      swap:    f.swap     || [],
      pivot:   f.pivot >= 0 ? f.pivot : undefined,
    },
    sorted: new Set(f.sorted || []),
    stats:  { c: f.stats.c, s: f.stats.s, r: f.stats.r, w: f.stats.w },
    pseudo: f.pseudo,
    narr:   f.narr,
  };
}

// ════════════════════════════════════════════════════════════
//  VIZ MODE — RENDERING
// ════════════════════════════════════════════════════════════

function drawVizFrame(fi) {
  if (!state.frames.length) return;
  fi = Math.min(fi, state.frames.length - 1);
  const f = state.frames[fi];
  const W = sortCanvas.offsetWidth;
  const H = sortCanvas.offsetHeight;

  sortCtx.clearRect(0, 0, W, H);

  const data  = f.arr;
  const n     = data.length;
  const maxV  = Math.max(...data);

  switch (state.currentView) {
    case 'bars':  renderBars(sortCtx, data, f, W, H, maxV, n);  break;
    case 'dots':  renderDots(sortCtx, data, f, W, H, maxV, n);  break;
    case 'color': renderHeatmap(sortCtx, data, f, W, H, maxV, n); break;
  }

  // Update stat panel
  document.getElementById('s-comps').textContent  = f.stats.c.toLocaleString();
  document.getElementById('s-swaps').textContent  = f.stats.s.toLocaleString();
  document.getElementById('s-reads').textContent  = f.stats.r.toLocaleString();
  document.getElementById('s-writes').textContent = f.stats.w.toLocaleString();

  // Narration
  if (f.narr) setNarration(
    f.narr
      .replace(/(\d+)/g, '<span class="hl">$1</span>')
      .replace(/✓/g, '<span class="ok">✓</span>')
  );

  // Pseudocode
  renderPseudocode(f.pseudo);

  // Ops graph
  if (fi === 0) state.opHistory = [];
  state.opHistory.push(f.stats.c + f.stats.s);
  drawOpsGraph();

  // Scrubber
  updateScrubberUI(fi, state.frames.length - 1);

  // Sound
  if (state.soundOn && state.isPlaying && fi > 0) {
    const idx = (f.hl.swap.length ? f.hl.swap : f.hl.compare)[0];
    if (idx != null) playTone(data[idx], maxV);
  }
}

// ── Individual render modes ───────────────────────────────────

function renderBars(ctx, data, f, W, H, maxV, n) {
  const gap = n > 60 ? 0.5 : 2;
  const bw  = (W - gap * (n - 1)) / n;

  for (let i = 0; i < n; i++) {
    const x = i * (bw + gap);
    const h = Math.max((data[i] / maxV) * (H - 4), 2);
    const y = H - h;

    ctx.fillStyle = elementColor(i, f);
    ctx.beginPath();
    if (bw > 4) ctx.roundRect(x, y, Math.max(bw - 0.5, 1), h, [2, 2, 0, 0]);
    else         ctx.rect(x, y, Math.max(bw - 0.5, 0.5), h);
    ctx.fill();

    // Value labels for small arrays
    if (n <= 20 && bw > 18) {
      ctx.fillStyle   = 'rgba(255,255,255,0.28)';
      ctx.font        = `${Math.min(10, bw - 3)}px JetBrains Mono`;
      ctx.textAlign   = 'center';
      ctx.fillText(data[i], x + bw / 2, H - 3);
    }
  }
}

function renderDots(ctx, data, f, W, H, maxV, n) {
  const r = Math.max(2, Math.min(6, W / n / 2));
  for (let i = 0; i < n; i++) {
    const x   = (i / Math.max(n - 1, 1)) * (W - 20) + 10;
    const y   = H - (data[i] / maxV) * (H - 20) - 10;
    const col = elementColor(i, f);

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();

    if (f.hl.compare.includes(i) || f.hl.swap.includes(i)) {
      ctx.beginPath();
      ctx.arc(x, y, r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = col;
      ctx.lineWidth   = 1;
      ctx.stroke();
    }
  }
}

function renderHeatmap(ctx, data, f, W, H, maxV, n) {
  const cw = W / n;
  for (let i = 0; i < n; i++) {
    const t   = data[i] / maxV;
    let color = `hsl(${Math.round(t * 240)}, 80%, 50%)`;
    if (f.sorted.has(i))            color = '#2ecc8f';
    if (f.hl.compare.includes(i))   color = '#f0a832';
    if (f.hl.swap.includes(i))      color = '#e8514a';
    ctx.fillStyle = color;
    ctx.fillRect(i * cw, 0, Math.max(cw - 0.3, 0.5), H);
  }
}

/** Returns the display colour for a single array element */
function elementColor(i, f) {
  if (f.sorted.has(i))            return '#2ecc8f';
  if (f.hl.swap.includes(i))      return '#e8514a';
  if (f.hl.pivot === i)           return '#ffffff';
  if (f.hl.compare.includes(i))   return '#f0a832';
  return '#3a4a7a';
}

// ════════════════════════════════════════════════════════════
//  RACE MODE — RENDERING
// ════════════════════════════════════════════════════════════

function drawRaceFrame(fi) {
  if (!state.raceTL.length) return;
  fi = Math.min(fi, state.raceTL.length - 1);

  const combined = state.raceTL[fi];
  const W  = raceCanvas.offsetWidth;
  const H  = raceCanvas.offsetHeight;
  const dpr = devicePixelRatio;

  raceCtx.clearRect(0, 0, W, H);

  const cols = 3, rows = 2, pad = 6;
  const cw = W / cols, ch = H / rows;

  ALGOS.forEach((algo, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x0  = col * cw + pad;
    const y0  = row * ch + pad;
    const w   = cw - pad * 2;
    const h   = ch - pad * 2;

    const algoFi = combined[algo];
    const set    = state.raceSets[algo];
    if (!set) return;

    const f    = set.frames[algoFi];
    const data = f.arr;
    const n    = data.length;
    const maxV = Math.max(...data);
    const done = algoFi >= set.frames.length - 1;

    // Cell background
    raceCtx.fillStyle   = '#0d1017';
    raceCtx.beginPath();
    raceCtx.roundRect(x0, y0, w, h, 5);
    raceCtx.fill();

    raceCtx.strokeStyle = done
      ? 'rgba(46,204,143,0.3)'
      : 'rgba(255,255,255,0.04)';
    raceCtx.lineWidth = 1;
    raceCtx.stroke();

    // Algorithm label
    raceCtx.fillStyle = done ? '#2ecc8f' : ALGO_COLORS[algo];
    raceCtx.font      = 'bold 11px JetBrains Mono';
    raceCtx.textAlign = 'left';
    raceCtx.fillText(ALGO_NAMES[algo] + (done ? ' ✓' : ''), x0 + 8, y0 + 17);

    // Timing label (if available)
    if (done && set.timing_ms != null) {
      raceCtx.fillStyle = '#7a8099';
      raceCtx.font      = '10px JetBrains Mono';
      raceCtx.textAlign = 'right';
      raceCtx.fillText(`${set.timing_ms.toFixed(2)}ms`, x0 + w - 6, y0 + 17);
    } else {
      raceCtx.fillStyle = '#7a8099';
      raceCtx.font      = '10px JetBrains Mono';
      raceCtx.textAlign = 'right';
      raceCtx.fillText(`${f.stats.s}sw ${f.stats.c}cmp`, x0 + w - 6, y0 + 17);
    }

    // Mini visualisation — respects current view mode
    const barH = h - 28;
    raceCtx.save();
    raceCtx.beginPath();
    raceCtx.rect(x0, y0 + 22, w, barH);
    raceCtx.clip();

    const ff = { ...f, hl: done ? { compare:[], swap:[] } : f.hl };

    if (state.currentView === 'bars') {
      const gap = n > 60 ? 0.5 : 1;
      const bw  = (w - gap * (n - 1)) / n;
      for (let i = 0; i < n; i++) {
        const bx = x0 + i * (bw + gap);
        const bh = Math.max((data[i] / maxV) * barH, 1);
        const by = y0 + 22 + barH - bh;
        raceCtx.fillStyle = elementColor(i, ff);
        raceCtx.fillRect(bx, by, Math.max(bw - 0.3, 0.5), bh);
      }
    } else if (state.currentView === 'dots') {
      const r = Math.max(1.5, Math.min(4, w / n / 2));
      for (let i = 0; i < n; i++) {
        const bx = x0 + (i / Math.max(n - 1, 1)) * (w - 4) + 2;
        const by = y0 + 22 + barH - (data[i] / maxV) * barH;
        raceCtx.beginPath();
        raceCtx.arc(bx, by, r, 0, Math.PI * 2);
        raceCtx.fillStyle = elementColor(i, ff);
        raceCtx.fill();
      }
    } else {
      const cw2 = w / n;
      for (let i = 0; i < n; i++) {
        const t = data[i] / maxV;
        let color = `hsl(${Math.round(t * 240)},80%,50%)`;
        if (ff.sorted.has(i))           color = '#2ecc8f';
        if (ff.hl.compare.includes(i))  color = '#f0a832';
        if (ff.hl.swap.includes(i))     color = '#e8514a';
        raceCtx.fillStyle = color;
        raceCtx.fillRect(x0 + i * cw2, y0 + 22, Math.max(cw2 - 0.2, 0.3), barH);
      }
    }
    raceCtx.restore();

    // Progress bar at bottom of cell
    const prog = algoFi / (set.frames.length - 1);
    raceCtx.fillStyle = '#1a1d2a';
    raceCtx.fillRect(x0, y0 + h - 4, w, 4);
    raceCtx.fillStyle = done ? '#2ecc8f' : ALGO_COLORS[algo];
    raceCtx.fillRect(x0, y0 + h - 4, w * prog, 4);
  });

  updateScrubberUI(fi, state.raceMax - 1);
  updateRaceComparePanel(fi);
}

function updateRaceComparePanel(fi) {
  const combined = state.raceTL[fi] || {};
  const maxSwaps = Math.max(...ALGOS.map(a => state.raceSets[a]?.frames.at(-1)?.stats.s || 0), 1);
  const maxComps = Math.max(...ALGOS.map(a => state.raceSets[a]?.frames.at(-1)?.stats.c || 0), 1);
  const maxTime  = Math.max(...ALGOS.map(a => state.raceSets[a]?.timing_ms || 0), 1);

  document.getElementById('rc-items').innerHTML = ALGOS.map(algo => {
    const set  = state.raceSets[algo];
    if (!set) return '';
    const last = set.frames.at(-1);
    const timeBar = maxTime > 0 && set.timing_ms != null
      ? `<div class="rc-bar-row">time
          <div class="rc-bar-track">
            <div class="rc-bar-fill"
              style="width:${(set.timing_ms/maxTime*100).toFixed(1)}%;background:${ALGO_COLORS[algo]}88">
            </div>
          </div>
        </div>`
      : '';

    return `
      <article class="rc-algo-item">
        <header class="rc-algo-header">
          <span class="rc-algo-name" style="color:${ALGO_COLORS[algo]}">${ALGO_NAMES[algo]}</span>
          <span class="rc-algo-time">${set.timing_ms != null ? set.timing_ms.toFixed(2)+'ms' : ''}</span>
        </header>
        <div class="rc-bar-row">swaps
          <div class="rc-bar-track">
            <div class="rc-bar-fill"
              style="width:${(last.stats.s/maxSwaps*100).toFixed(1)}%;background:${ALGO_COLORS[algo]}">
            </div>
          </div>
        </div>
        <div class="rc-bar-row">comps
          <div class="rc-bar-track">
            <div class="rc-bar-fill"
              style="width:${(last.stats.c/maxComps*100).toFixed(1)}%;background:${ALGO_COLORS[algo]}55">
            </div>
          </div>
        </div>
        ${timeBar}
      </article>`;
  }).join('');
}

// ════════════════════════════════════════════════════════════
//  BENCHMARK MODE
// ════════════════════════════════════════════════════════════

async function runBenchmark() {
  const panel = document.getElementById('bench-panel');
  panel.innerHTML = `
    <div class="bench-loading">
      <div class="bench-spinner"></div>
      <span>Running C++ benchmark — sorting up to 1,000,000 elements…</span>
    </div>`;

  log('info', 'Benchmark started — C++ is sorting 1k → 1M elements with chrono timing');

  let results;
  try {
    results = await fetchBenchmarkResults();
  } catch (e) {
    panel.innerHTML = `<p style="color:var(--red);padding:20px">
      Server error: ${e.message} — is ./server running?</p>`;
    log('warn', `Benchmark failed: ${e.message}`);
    return;
  }

  state.benchResults = results;
  renderBenchmarkPanel(results);
  log('done', 'Benchmark complete');
}

function renderBenchmarkPanel(results) {
  const panel = document.getElementById('bench-panel');
  const sizes = results[0]?.sizes.map(s => s.n) || [];

  // Format ns → human readable
  const fmtTime = ns => {
    if (ns < 1000)       return ns.toFixed(0) + ' ns';
    if (ns < 1_000_000)  return (ns / 1000).toFixed(1) + ' μs';
    return (ns / 1_000_000).toFixed(1) + ' ms';
  };

  // Determine fastest at each size
  const fastestAt = {};
  sizes.forEach((n, si) => {
    const times = results.map(r => ({ algo: r.algo, t: r.sizes[si].time_ns }));
    times.sort((a, b) => a.t - b.t);
    fastestAt[n] = times[0].algo;
  });

  const headerCols = sizes.map(n =>
    n >= 1_000_000 ? '1M' :
    n >= 1_000     ? (n/1000) + 'k' : n
  ).join('</th><th>');

  const rows = results.map(r => {
    const cells = r.sizes.map((s, si) => {
      const n    = s.n;
      const isFastest = fastestAt[n] === r.algo;
      const isSlowest = results.every(rr => rr.sizes[si].time_ns <= s.time_ns)
                        && results.length > 1;
      const cls = isFastest ? 'fast' : (isSlowest ? 'slow' : '');
      return `<td class="${cls}">${fmtTime(s.time_ns)}</td>`;
    }).join('');

    return `<tr>
      <td style="color:${ALGO_COLORS[r.algo]}">${ALGO_NAMES[r.algo]}</td>
      ${cells}
    </tr>`;
  }).join('');

  panel.innerHTML = `
    <h2 class="bench-title">C++ Benchmark Results</h2>
    <p class="bench-subtitle">
      Actual CPU execution time measured with std::chrono::high_resolution_clock.
      Each algorithm sorts the same randomly-generated input at each size.
      Results reflect real hardware performance — not theoretical complexity.
    </p>

    <div class="bench-table-wrap">
      <table class="bench-table">
        <thead>
          <tr>
            <th>Algorithm</th>
            <th>${headerCols}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div class="bench-scale-chart">
      <h3 class="bench-scale-label">Scaling curves — time vs input size</h3>
      <canvas id="bench-scale-canvas" aria-label="Scaling chart"></canvas>
    </div>`;

  // Draw scaling chart
  requestAnimationFrame(() => drawScalingChart(results, sizes));
}

function drawScalingChart(results, sizes) {
  const canvas = document.getElementById('bench-scale-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = devicePixelRatio;
  const W   = canvas.offsetWidth;
  const H   = 160;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const padL = 44, padR = 12, padT = 10, padB = 24;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const allTimes = results.flatMap(r => r.sizes.map(s => s.time_ns));
  const maxTime  = Math.max(...allTimes, 1);

  // Axes
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth   = 1;
  [0, 0.25, 0.5, 0.75, 1].forEach(t => {
    const y = padT + chartH - t * chartH;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + chartW, y);
    ctx.stroke();
  });

  // Lines per algorithm
  results.forEach(r => {
    ctx.beginPath();
    r.sizes.forEach((s, i) => {
      const x = padL + (i / (sizes.length - 1)) * chartW;
      const y = padT + chartH - (s.time_ns / maxTime) * chartH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = ALGO_COLORS[r.algo];
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // Dots
    r.sizes.forEach((s, i) => {
      const x = padL + (i / (sizes.length - 1)) * chartW;
      const y = padT + chartH - (s.time_ns / maxTime) * chartH;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = ALGO_COLORS[r.algo];
      ctx.fill();
    });
  });

  // X axis labels
  ctx.fillStyle  = '#7a8099';
  ctx.font       = '9px JetBrains Mono';
  ctx.textAlign  = 'center';
  sizes.forEach((n, i) => {
    const x = padL + (i / (sizes.length - 1)) * chartW;
    const label = n >= 1_000_000 ? '1M' : n >= 1000 ? (n/1000)+'k' : n;
    ctx.fillText(label, x, H - 6);
  });

  // Legend
  let lx = padL;
  ctx.textAlign = 'left';
  results.forEach(r => {
    ctx.fillStyle = ALGO_COLORS[r.algo];
    ctx.fillRect(lx, padT - 1, 12, 4);
    ctx.fillStyle = '#7a8099';
    ctx.fillText(r.algo, lx + 15, padT + 4);
    lx += ctx.measureText(r.algo).width + 30;
  });
}

// ════════════════════════════════════════════════════════════
//  ANIMATION ENGINE
// ════════════════════════════════════════════════════════════

async function doSort() {
  if (!state.arr.length) { buildArray(); return; }
  if (state.currentMode === 'race')  { startRace(); return; }
  if (state.currentMode === 'bench') { runBenchmark(); return; }

  stopAnim();
  setButtonState('idle');
  setNarration('Loading from C++ backend…');

  try {
    state.frames = await fetchSortFrames(state.currentAlgo);
  } catch (e) {
    setNarration(`<span class="err">Server error: ${e.message} — is ./server running?</span>`);
    log('warn', `Sort fetch failed: ${e.message}`);
    return;
  }

  state.curFrame  = 0;
  state.opHistory = [];
  setScrubber(0, state.frames.length - 1);
  log('info', `${ALGO_NAMES[state.currentAlgo]} — ${state.frames.length} frames`);

  const delay = SPEEDS[+document.getElementById('speed-slider').value - 1];

  if (delay === 0) {
    state.curFrame = state.frames.length - 1;
    drawVizFrame(state.curFrame);
    setButtonState('done');
    const last = state.frames[state.curFrame];
    log('done', `Done — ${last.stats.s} swaps, ${last.stats.c} comparisons`);
    return;
  }

  setButtonState('playing');
  state.isPlaying = true;

  state.animTimer = setInterval(() => {
    if (state.curFrame >= state.frames.length - 1) {
      stopAnim();
      setButtonState('done');
      const last = state.frames[state.curFrame];
      log('done', `Done — ${last.stats.s} swaps, ${last.stats.c} comparisons`);
      return;
    }
    state.curFrame++;
    drawVizFrame(state.curFrame);
  }, delay);
}

async function startRace() {
  stopAnim();
  state.raceSets = {};
  state.raceTL   = [];
  state.raceMax  = 0;

  setButtonState('idle');
  setNarration('Requesting parallel race from C++ backend…');

  let raceData;
  try {
    raceData = await fetchRaceResults();
  } catch (e) {
    setNarration(`<span class="err">Server error: ${e.message} — is ./server running?</span>`);
    log('warn', `Race fetch failed: ${e.message}`);
    return;
  }

  // Populate raceSets
  raceData.forEach(({ algo, frames, timing_ms }) => {
    state.raceSets[algo] = { frames, timing_ms };
  });

  // Build unified timeline
  state.raceMax = Math.max(...ALGOS.map(a => state.raceSets[a]?.frames.length || 0));
  for (let i = 0; i < state.raceMax; i++) {
    const entry = {};
    ALGOS.forEach(a => {
      entry[a] = Math.min(i, (state.raceSets[a]?.frames.length || 1) - 1);
    });
    state.raceTL.push(entry);
  }

  setScrubber(0, state.raceMax - 1);
  state.curFrame = 0;

  // Log timing results
  const sorted = [...raceData].sort((a, b) => a.timing_ms - b.timing_ms);
  log('info', `Race complete (parallel C++ threads):`);
  sorted.forEach(r => log('done',
    `  ${ALGO_NAMES[r.algo]}: ${r.timing_ms.toFixed(3)}ms`
  ));

  setNarration('Race data received — press <span class="hl">SORT</span> to animate');
  setButtonState('idle');

  // Auto-play
  doSort();
}

function resumeAnim() {
  const delay = Math.max(
    SPEEDS[+document.getElementById('speed-slider').value - 1],
    state.currentMode === 'race' ? 8 : 0
  );

  if (delay === 0 && state.currentMode === 'viz') {
    state.curFrame = state.frames.length - 1;
    drawVizFrame(state.curFrame);
    setButtonState('done');
    return;
  }

  setButtonState('playing');
  state.isPlaying = true;

  state.animTimer = setInterval(() => {
    const maxF = state.currentMode === 'race'
      ? state.raceMax - 1
      : state.frames.length - 1;

    if (state.curFrame >= maxF) {
      stopAnim();
      setButtonState('done');
      return;
    }

    state.curFrame++;
    state.currentMode === 'race'
      ? drawRaceFrame(state.curFrame)
      : drawVizFrame(state.curFrame);
  }, delay);
}

function stopAnim() {
  clearInterval(state.animTimer);
  state.animTimer = null;
  state.isPlaying = false;
}

function togglePause() {
  if (state.isPlaying) {
    stopAnim();
    setButtonState('paused');
  } else {
    resumeAnim();
  }
}

function onPlayBtn() {
  const maxF     = state.currentMode === 'race' ? state.raceMax - 1 : state.frames.length - 1;
  const hasData  = state.currentMode === 'race' ? state.raceTL.length > 0 : state.frames.length > 1;

  if (!hasData) { doSort(); return; }

  if (state.isPlaying) { togglePause(); return; }

  // At end — restart
  if (state.curFrame >= maxF) {
    state.curFrame = 0;
    setScrubber(0, maxF);
    resumeAnim();
    return;
  }

  resumeAnim();
}

function stepFwd() {
  if (state.isPlaying) { stopAnim(); setButtonState('paused'); }
  const maxF = state.currentMode === 'race' ? state.raceMax - 1 : state.frames.length - 1;
  if (!maxF) return;
  if (state.curFrame < maxF) state.curFrame++;
  state.currentMode === 'race' ? drawRaceFrame(state.curFrame) : drawVizFrame(state.curFrame);
}

function stepBack() {
  if (state.isPlaying) { stopAnim(); setButtonState('paused'); }
  if (state.curFrame > 0) state.curFrame--;
  state.currentMode === 'race' ? drawRaceFrame(state.curFrame) : drawVizFrame(state.curFrame);
}

function scrubTo(fi) {
  if (state.isPlaying) { stopAnim(); setButtonState('paused'); }
  state.curFrame = fi;
  state.currentMode === 'race' ? drawRaceFrame(fi) : drawVizFrame(fi);
}

function doReset() {
  stopAnim();
  state.frames    = state.arr.length ? [snapZero()] : [];
  state.curFrame  = 0;
  state.opHistory = [];
  setScrubber(0, 0);
  setButtonState('idle');
  if (state.arr.length) drawVizFrame(0);
  renderPseudocode(-1);
  drawOpsGraph();
  setNarration('Reset — press <span class="hl">SORT</span>');
  log('info', 'Reset');
}

// ════════════════════════════════════════════════════════════
//  MODE SWITCHING
// ════════════════════════════════════════════════════════════

function switchMode(mode) {
  if (mode === state.currentMode) return;
  stopAnim();
  state.currentMode = mode;

  // Tab states
  ['viz','race','bench'].forEach(m => {
    document.getElementById(`tab-${m}`).setAttribute('aria-selected', m === mode);
  });

  // Sidebar dimming
  document.getElementById('sidebar').dataset.mode = mode;

  // Canvas visibility
  document.querySelector('.sort-canvas').classList.toggle('active', mode === 'viz');
  document.querySelector('.race-canvas').classList.toggle('active', mode === 'race');
  document.querySelector('.bench-panel').classList.toggle('active', mode === 'bench');

  // Right panel sections
  const inRace = mode === 'race';
  document.getElementById('stats-grid').classList.toggle('dimmed', inRace);
  document.getElementById('pseudo-panel').classList.toggle('dimmed', inRace);
  document.getElementById('ops-graph-panel').classList.toggle('dimmed', inRace);
  document.getElementById('race-compare').classList.toggle('active', inRace);

  setButtonState('idle');

  if (mode === 'viz') {
    state.frames   = state.arr.length ? [snapZero()] : [];
    state.curFrame = 0;
    setScrubber(0, 0);
    if (state.arr.length) drawVizFrame(0);
    renderPseudocode(-1);
    setNarration('Visualize — press <span class="hl">SORT</span>');
  } else if (mode === 'race') {
    if (state.raceTL.length) {
      setScrubber(state.curFrame, state.raceMax - 1);
      drawRaceFrame(state.curFrame);
    } else {
      setNarration('Race Mode — press <span class="hl">SORT</span> to run all algorithms in parallel C++ threads');
    }
  } else if (mode === 'bench') {
    setNarration('Benchmark — press <span class="hl">SORT</span> to run chrono timing up to 1M elements');
  }
}

// ════════════════════════════════════════════════════════════
//  PSEUDOCODE
// ════════════════════════════════════════════════════════════

function renderPseudocode(activeIndex) {
  const lines = PSEUDOCODE[state.currentAlgo] || [];
  document.getElementById('pseudo-lines').innerHTML = lines.map(([text, idx], i) => {
    const isActive = idx === activeIndex && activeIndex >= 0;
    const escaped  = text
      .replace(/\b(for|while|if|end|return)\b/g, '<span class="kw">$1</span>')
      .replace(/\b(swap|mergeSort|quickSort|heapify|buildMaxHeap|merge)\b/g, '<span class="fn">$1</span>')
      .replace(/\b(arr|key|mid|pivot|minIdx|i|j|k|lo|hi|n|lg)\b/g, '<span class="id">$1</span>');
    return `<div class="pseudo-line${isActive ? ' active' : ''}" role="listitem">
      <span class="ln">${i + 1}</span>${escaped}</div>`;
  }).join('');

  if (activeIndex >= 0) {
    document.querySelector('.pseudo-line.active')
      ?.scrollIntoView({ block: 'nearest' });
  }
}

// ════════════════════════════════════════════════════════════
//  OPS-OVER-TIME GRAPH
// ════════════════════════════════════════════════════════════

function drawOpsGraph() {
  const canvas = opsCanvas;
  const W = canvas.offsetWidth;
  const H = 52;
  const dpr = devicePixelRatio;

  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  opsCtx.scale(dpr, dpr);
  opsCtx.clearRect(0, 0, W, H);

  const hist = state.opHistory;
  if (hist.length < 2) return;

  const maxOps = Math.max(...hist, 1);
  const pts = hist.map((v, i) => [
    (i / (hist.length - 1)) * W,
    H - (v / maxOps) * (H - 4) - 2,
  ]);

  const grad = opsCtx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(77,142,247,0.3)');
  grad.addColorStop(1, 'rgba(77,142,247,0)');

  opsCtx.beginPath();
  opsCtx.moveTo(0, H);
  pts.forEach(([x, y]) => opsCtx.lineTo(x, y));
  opsCtx.lineTo(W, H);
  opsCtx.fillStyle = grad;
  opsCtx.fill();

  opsCtx.beginPath();
  pts.forEach(([x, y], i) => i === 0 ? opsCtx.moveTo(x, y) : opsCtx.lineTo(x, y));
  opsCtx.strokeStyle = 'rgba(77,142,247,0.85)';
  opsCtx.lineWidth   = 1.5;
  opsCtx.stroke();

  // Total ops label
  const total = hist.at(-1) || 0;
  document.getElementById('ops-total').value = total.toLocaleString() + ' ops';
}

// ════════════════════════════════════════════════════════════
//  UI HELPERS
// ════════════════════════════════════════════════════════════

function setButtonState(s) {
  const pauseBtn = document.getElementById('pause-btn');
  const stepbBtn = document.getElementById('stepb-btn');
  const stepfBtn = document.getElementById('stepf-btn');
  const playBtn  = document.getElementById('play-btn');
  const pbStepb  = document.getElementById('pb-stepb');
  const pbStepf  = document.getElementById('pb-stepf');

  const canStep = ['playing','paused','done'].includes(s);

  pauseBtn.disabled = !canStep;
  stepbBtn.disabled = !canStep;
  stepfBtn.disabled = !canStep;
  pbStepb.disabled  = !canStep;
  pbStepf.disabled  = !canStep;

  if (s === 'playing') { pauseBtn.textContent = '⏸ Pause';  playBtn.textContent = '⏸'; }
  if (s === 'paused')  { pauseBtn.textContent = '▶ Resume'; playBtn.textContent = '▶'; }
  if (s === 'done')    { pauseBtn.textContent = '▶ Replay'; playBtn.textContent = '↺'; }
  if (s === 'idle')    { pauseBtn.textContent = '⏸ Pause';  playBtn.textContent = '▶'; }
}

function setScrubber(val, max) {
  const s = document.getElementById('scrubber');
  s.max   = max;
  s.value = val;
  updateScrubberUI(val, max);
}

function updateScrubberUI(fi, maxF) {
  document.getElementById('scrubber').value    = fi;
  document.getElementById('frame-cur').textContent = `frame ${fi}`;
  document.getElementById('frame-tot').textContent = `/ ${maxF}`;
  document.getElementById('frame-pct').textContent =
    maxF > 0 ? `${Math.round(fi / maxF * 100)}%` : '';
}

function setNarration(html) {
  document.getElementById('narration').innerHTML = html;
}

function selectAlgo(btn) {
  if (state.currentMode !== 'viz') return;
  document.querySelectorAll('.algo-btn').forEach(b => b.setAttribute('aria-pressed','false'));
  btn.setAttribute('aria-pressed', 'true');
  state.currentAlgo = btn.dataset.algo;
  renderPseudocode(-1);
  doReset();
}

function selectPreset(btn) {
  document.querySelectorAll('.preset-btn').forEach(b => b.setAttribute('aria-pressed','false'));
  btn.setAttribute('aria-pressed', 'true');
  state.currentPreset = btn.dataset.preset;
  buildArray();
}

function setView(v) {
  state.currentView = v;
  document.querySelectorAll('.view-tab').forEach((tab, i) => {
    tab.setAttribute('aria-selected', ['bars','dots','color'][i] === v);
  });
  redraw();
}

function onSpeedChange(v) {
  document.getElementById('speed-display').value = SPEED_LABELS[v - 1];
  if (state.isPlaying) { stopAnim(); resumeAnim(); }
}

// ════════════════════════════════════════════════════════════
//  SOUND
// ════════════════════════════════════════════════════════════

function toggleSound() {
  state.soundOn = !state.soundOn;
  if (state.soundOn && !state.audioCtx)
    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  const btn = document.getElementById('sound-btn');
  btn.textContent = state.soundOn ? '◉ Sound ON' : '◉ Sound OFF';
  btn.setAttribute('aria-pressed', state.soundOn);
  btn.classList.toggle('active', state.soundOn);
}

function onVolume(v) {
  state.volume = v / 100;
  document.getElementById('vol-display').value = v + '%';
}

function playTone(value, maxVal) {
  if (!state.audioCtx || !state.soundOn) return;
  try {
    const freq  = 120 + (value / maxVal) * 900;
    const osc   = state.audioCtx.createOscillator();
    const gain  = state.audioCtx.createGain();
    osc.connect(gain);
    gain.connect(state.audioCtx.destination);
    osc.type          = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(state.volume * 0.35, state.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, state.audioCtx.currentTime + 0.08);
    osc.start();
    osc.stop(state.audioCtx.currentTime + 0.08);
  } catch (_) {}
}

// ════════════════════════════════════════════════════════════
//  HELP MODAL
// ════════════════════════════════════════════════════════════

function openHelp()  { document.getElementById('help-modal').classList.add('open'); }
function closeHelp() { document.getElementById('help-modal').classList.remove('open'); }

// ════════════════════════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ════════════════════════════════════════════════════════════

document.addEventListener('keydown', e => {
  // Don't intercept when typing in an input
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;

  const modal = document.getElementById('help-modal');
  if (modal.classList.contains('open')) {
    if (e.code === 'Escape') closeHelp();
    return;
  }

  switch (e.code) {
    case 'Space':       e.preventDefault(); onPlayBtn();    break;
    case 'ArrowRight':  e.preventDefault(); stepFwd();      break;
    case 'ArrowLeft':   e.preventDefault(); stepBack();     break;
    case 'KeyR':        buildArray();                        break;
    case 'KeyS':        toggleSound();                      break;
    case 'Escape':      doReset();                          break;
    case 'KeyH':        openHelp();                         break;
  }
});

// ════════════════════════════════════════════════════════════
//  ACTIVITY LOG
// ════════════════════════════════════════════════════════════

function log(type, msg) {
  const el   = document.getElementById('activity-log');
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  const icon = type === 'done' ? '✓' : type === 'warn' ? '!' : '→';
  entry.innerHTML =
    `<span class="log-icon ${type}" aria-hidden="true">${icon}</span>${msg}`;
  el.appendChild(entry);
  el.scrollTop = el.scrollHeight;
}

// ════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════

window.addEventListener('load', () => {
  resizeCanvases();
  buildArray();
  renderPseudocode(-1);
  log('info', 'SortViz ready — C++ backend at ' + BACKEND);
});
