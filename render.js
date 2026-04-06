// ── RENDER.JS ── all DOM building; reads S, never mutates it
// Depends on: state.js (S, metaSize, localSize, isMetaActive, metaWins, localWins, cellToTarget)
// Calls back into game.js via: handleCellClick(), commitPreview(), cancelPreview()

let currentView = 'nav';
let navHoverTarget = null;

// ── TOP-LEVEL ────────────────────────────────────────────────────────────────
function renderAll() {
  if (currentView === 'flat') renderFlat();
  else renderNav();
  updateStatus();
}

function setView(v) {
  currentView = v;
  document.getElementById('view-flat').style.display = v === 'flat' ? 'flex' : 'none';
  document.getElementById('view-nav').style.display  = v === 'nav'  ? 'flex' : 'none';
  document.getElementById('hint-bar').style.display  = v === 'nav'  ? 'block' : 'none';
  ['flat', 'nav'].forEach(n => {
    document.getElementById('btn-' + n)?.classList.toggle('on', n === v);
  });
  renderAll();
}

// ── STATUS BAR ───────────────────────────────────────────────────────────────
function updateStatus() {
  const lbl = document.getElementById('turn-label');
  const pip = document.getElementById('turn-pip');
  const ind = document.getElementById('turn-indicator');
  if (S.vsAI) {
    lbl.textContent = S.currentPlayer.toUpperCase() + (S.currentPlayer === S.aiPlayer ? ' · AI' : ' · YOU');
  } else {
    lbl.textContent = S.currentPlayer.toUpperCase() + "'S TURN";
  }
  lbl.style.color = S.currentPlayer === 'x' ? 'var(--x)' : 'var(--o)';
  pip.className   = S.currentPlayer === 'o' ? 'o' : '';
  ind.className   = S.currentPlayer === 'o' ? 'o-turn' : 'x-turn';

  const modeNames = { classic: 'CLASSIC · 3D×3D', quick: 'QUICK · 2D×3D', blitz: 'BLITZ · 2D×2D' };
  document.getElementById('mode-label').textContent = modeNames[S.gameMode];

  const zLegend = document.getElementById('z-legend');
  if (zLegend) zLegend.style.display = S.gameMode === 'blitz' ? 'none' : 'flex';

  const prog = document.getElementById('meta-progress');
  prog.innerHTML = '';
  for (let i = 0; i < metaSize(); i++) {
    const d = document.createElement('div');
    d.className = 'prog-dot' + (S.metaWinners[i] === 'x' ? ' x' : S.metaWinners[i] === 'o' ? ' o' : '');
    prog.appendChild(d);
  }
}

// ── HINT BAR ─────────────────────────────────────────────────────────────────
function updateHint() {
  const hint = document.getElementById('hint-text');
  if (!hint) return;
  if (S.gameOver) { hint.innerHTML = 'Game over!'; return; }
  if (S.pendingMeta !== null) {
    hint.innerHTML = `Confirm placing <strong>${S.currentPlayer.toUpperCase()}</strong> — or cancel to pick a different cell`;
    return;
  }
  if (S.navSelected !== null && isMetaActive(S.navSelected)) {
    hint.innerHTML = `Board selected — <span class="hl">click a cell</span> to place your piece, or pick a different board`;
  } else if (S.navSelected !== null) {
    hint.innerHTML = `That board is <strong>not active</strong> this turn — pick a <span class="hl">glowing green board</span> in the center`;
  } else {
    hint.innerHTML = `Click a <span class="hl">glowing board</span> in the center to select it, then click a cell inside to play`;
  }
}

// ── FLAT VIEW ─────────────────────────────────────────────────────────────────
function renderFlat() {
  const c = document.getElementById('view-flat');
  c.innerHTML = '';
  if (S.gameMode === 'classic') {
    const zNames = ['META Z=0', 'META Z=1', 'META Z=2'];
    for (let z = 0; z < 3; z++) {
      const group = document.createElement('div');
      group.className = 'flat-meta-group'; group.dataset.mz = z;
      const lbl = document.createElement('div');
      lbl.className = 'flat-group-label'; lbl.textContent = zNames[z];
      group.appendChild(lbl);
      const grid = document.createElement('div');
      grid.className = 'flat-boards-grid';
      for (let i = 0; i < 9; i++) grid.appendChild(buildLocalBoard(z * 9 + i, 16, false));
      group.appendChild(grid);
      c.appendChild(group);
    }
  } else {
    const group = document.createElement('div');
    group.className = 'flat-meta-group'; group.dataset.mz = 1;
    const lbl = document.createElement('div');
    lbl.className = 'flat-group-label';
    lbl.textContent = S.gameMode === 'blitz' ? 'BLITZ · 2D META' : 'QUICK PLAY · 2D META';
    group.appendChild(lbl);
    const grid = document.createElement('div');
    grid.className = 'flat-boards-grid';
    for (let i = 0; i < 9; i++) grid.appendChild(buildLocalBoard(i, S.gameMode === 'blitz' ? 20 : 16, false));
    group.appendChild(grid);
    c.appendChild(group);
  }
}

// ── NAVIGATOR VIEW ────────────────────────────────────────────────────────────
function renderNav() {
  const metaAll = document.getElementById('nav-meta-all');
  metaAll.innerHTML = '';

  if (S.gameMode === 'classic') {
    for (let z = 0; z < 3; z++) {
      const layerWrap = document.createElement('div');
      layerWrap.className = 'nav-meta-layer'; layerWrap.dataset.z = z;
      const lbl = document.createElement('div');
      lbl.className = 'nav-meta-layer-label'; lbl.textContent = `META Z=${z}`;
      layerWrap.appendChild(lbl);
      const grid = document.createElement('div');
      grid.className = 'nav-meta-layer-grid';
      for (let i = 0; i < 9; i++) grid.appendChild(makeNavCell(z * 9 + i, `${z}·${Math.floor(i/3)}·${i%3}`));
      layerWrap.appendChild(grid);
      metaAll.appendChild(layerWrap);
      if (z < 2) {
        const div = document.createElement('div'); div.className = 'nav-meta-layer-divider';
        metaAll.appendChild(div);
      }
    }
  } else {
    const layerWrap = document.createElement('div');
    layerWrap.className = 'nav-meta-layer'; layerWrap.dataset.z = 0;
    const lbl = document.createElement('div');
    lbl.className = 'nav-meta-layer-label'; lbl.textContent = 'META GRID';
    layerWrap.appendChild(lbl);
    const grid = document.createElement('div');
    grid.className = 'nav-meta-layer-grid';
    for (let i = 0; i < 9; i++) grid.appendChild(makeNavCell(i, `${Math.floor(i/3)}·${i%3}`));
    layerWrap.appendChild(grid);
    metaAll.appendChild(layerWrap);
  }

  // Left panel: selected board
  const leftBoard = document.getElementById('nav-local-board');
  const leftLabel = document.getElementById('nav-left-label');
  leftBoard.innerHTML = '';
  if (S.navSelected !== null) {
    const mi = S.navSelected;
    const coordStr = S.gameMode === 'classic'
      ? `Z=${Math.floor(mi/9)} Y=${Math.floor((mi%9)/3)} X=${mi%3}`
      : `Y=${Math.floor(mi/3)} X=${mi%3}`;
    const isActive = isMetaActive(mi);
    leftLabel.className = 'nav-panel-label' + (isActive ? ' active-label' : '');
    leftLabel.innerHTML = `<span class="label-main">BOARD ${coordStr}</span><span class="label-sub">${isActive ? 'click a cell to play here' : 'not your turn here'}</span>`;
    leftBoard.appendChild(buildNavBoard(mi, false));
  } else {
    leftLabel.className = 'nav-panel-label active-label';
    leftLabel.innerHTML = `<span class="label-main">YOUR BOARD</span><span class="label-sub">click a board from the center</span>`;
    leftBoard.innerHTML = '<div class="nav-panel-empty">SELECT A BOARD<br>FROM THE CENTER</div>';
  }

  renderNavTarget();
  updateHint();
}

function makeNavCell(mi, coordText) {
  const nc = document.createElement('div');
  nc.className = 'nav-cell';
  const mw = S.metaWinners[mi];
  if (mw && mw !== 'draw') { nc.classList.add('nav-won-' + mw); nc.textContent = mw.toUpperCase(); }
  else if (mw === 'draw')  { nc.textContent = '–'; nc.style.color = 'var(--text)'; }
  if (isMetaActive(mi))     nc.classList.add('nav-active-board');
  if (S.navSelected === mi) nc.classList.add('nav-selected');

  const target = (S.pendingMeta !== null) ? cellToTarget(S.pendingCell) : navHoverTarget;
  if (target === mi) nc.classList.add('nav-target');

  const coord = document.createElement('span');
  coord.className = 'nav-cell-coord'; coord.textContent = coordText;
  nc.appendChild(coord);
  nc.addEventListener('click', () => { S.navSelected = mi; cancelPreview(true); renderNav(); });
  return nc;
}

function renderNavTarget() {
  const rightBoard = document.getElementById('nav-target-board');
  const rightLabel = document.getElementById('nav-right-label');
  rightBoard.innerHTML = '';
  rightBoard.className = '';

  const targetIdx = (S.pendingMeta !== null) ? cellToTarget(S.pendingCell) : navHoverTarget;
  if (targetIdx == null) {
    rightLabel.className = 'nav-panel-label target-label';
    rightLabel.innerHTML = `<span class="label-main">OPPONENT'S NEXT BOARD</span><span class="label-sub">hover a cell to preview</span>`;
    rightBoard.innerHTML = '<div class="nav-panel-empty">HOVER A CELL<br>TO PREVIEW</div>';
    return;
  }

  const isClaimed  = !!S.metaWinners[targetIdx];
  const lockedStr  = S.pendingMeta !== null ? ' · locked' : '';
  const coordStr   = S.gameMode === 'classic'
    ? `Z=${Math.floor(targetIdx/9)} Y=${Math.floor((targetIdx%9)/3)} X=${targetIdx%3}`
    : `Y=${Math.floor(targetIdx/3)} X=${targetIdx%3}`;
  rightLabel.className = 'nav-panel-label target-label';
  rightLabel.innerHTML = !isClaimed
    ? `<span class="label-main">SENDS TO ${coordStr}</span><span class="label-sub">opponent plays here next${lockedStr}</span>`
    : `<span class="label-main">CLAIMED — FREE CHOICE</span><span class="label-sub">opponent picks any open board</span>`;
  rightBoard.appendChild(buildNavBoard(targetIdx, true));
}

// ── LOCAL BOARD BUILDERS ──────────────────────────────────────────────────────
function buildLocalBoard(metaIdx, sz, readOnly) {
  const wrap = _makeBoardWrap(metaIdx, sz, readOnly);
  const isBlitz = S.gameMode === 'blitz';

  if (isBlitz) {
    const row = document.createElement('div');
    row.className = 'lb-layer'; row.dataset.z = 0;
    if (sz >= 28) row.style.gap = '2px';
    for (let i = 0; i < 9; i++)
      row.appendChild(readOnly ? makeReadOnlyCell(metaIdx, i, sz) : makeCell(metaIdx, i, sz, false));
    wrap.appendChild(row);
  } else {
    const zColors = ['var(--lz0-label)', 'var(--lz1-label)', 'var(--lz2-label)'];
    for (let z = 0; z < 3; z++) {
      const layerWrap = document.createElement('div');
      layerWrap.style.cssText = sz >= 28 ? 'display:flex;flex-direction:column;gap:2px;' : 'display:flex;flex-direction:column;gap:1px;';
      const zLbl = document.createElement('div');
      zLbl.style.cssText = sz >= 28
        ? `font-size:9px;letter-spacing:.2em;color:${zColors[z]};font-weight:700;padding:0 3px;`
        : `font-size:7px;letter-spacing:.15em;color:${zColors[z]};opacity:.8;padding:0 2px;line-height:1.2;`;
      zLbl.textContent = sz >= 28 ? `LAYER Z=${z}` : `Z=${z}`;
      layerWrap.appendChild(zLbl);
      const row = document.createElement('div');
      row.className = 'lb-layer'; row.dataset.z = z;
      if (sz >= 28) row.style.gap = '2px';
      for (let i = 0; i < 9; i++) {
        const cellIdx = z * 9 + i;
        row.appendChild(readOnly ? makeReadOnlyCell(metaIdx, cellIdx, sz) : makeCell(metaIdx, cellIdx, sz, false));
      }
      layerWrap.appendChild(row);
      wrap.appendChild(layerWrap);
    }
  }
  wrap.appendChild(_makeWonOverlay(metaIdx, sz));
  return wrap;
}

function buildNavBoard(metaIdx, readOnly) {
  const sz   = 32;
  const wrap = _makeBoardWrap(metaIdx, sz, readOnly);
  wrap.style.padding = '8px'; wrap.style.gap = '4px';

  if (S.gameMode === 'blitz') {
    const row = document.createElement('div');
    row.className = 'lb-layer'; row.dataset.z = 0; row.style.gap = '2px';
    for (let i = 0; i < 9; i++)
      row.appendChild(readOnly ? makeReadOnlyCell(metaIdx, i, sz) : makeCell(metaIdx, i, sz, true));
    wrap.appendChild(row);
  } else {
    const zColors = ['var(--lz0-label)', 'var(--lz1-label)', 'var(--lz2-label)'];
    for (let z = 0; z < 3; z++) {
      const layerWrap = document.createElement('div');
      layerWrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
      const lbl2 = document.createElement('div');
      lbl2.style.cssText = `font-size:9px;letter-spacing:.2em;color:${zColors[z]};font-weight:700;padding:0 3px;`;
      lbl2.textContent = `LAYER Z=${z}`;
      layerWrap.appendChild(lbl2);
      const row = document.createElement('div');
      row.className = 'lb-layer'; row.dataset.z = z; row.style.gap = '2px';
      for (let i = 0; i < 9; i++) {
        const cellIdx = z * 9 + i;
        row.appendChild(readOnly ? makeReadOnlyCell(metaIdx, cellIdx, sz) : makeCell(metaIdx, cellIdx, sz, true));
      }
      layerWrap.appendChild(row);
      wrap.appendChild(layerWrap);
    }
  }
  wrap.appendChild(_makeWonOverlay(metaIdx, sz));
  return wrap;
}

// ── SHARED BOARD HELPERS ──────────────────────────────────────────────────────
function _makeBoardWrap(metaIdx, sz, readOnly) {
  const wrap = document.createElement('div');
  wrap.className = 'local-board-wrap';
  wrap.dataset.meta = metaIdx;
  wrap.style.setProperty('--cell-size', sz + 'px');
  if (sz >= 28) { wrap.style.padding = '8px'; wrap.style.gap = '4px'; }
  const mw = S.metaWinners[metaIdx];
  if (isMetaActive(metaIdx) && !readOnly) wrap.classList.add('active-meta');
  if (mw === 'x')    wrap.classList.add('won-x');
  else if (mw === 'o')    wrap.classList.add('won-o');
  else if (mw === 'draw') wrap.classList.add('drawn');
  return wrap;
}

function _makeWonOverlay(metaIdx, sz) {
  const mw = S.metaWinners[metaIdx];
  const ov = document.createElement('div');
  ov.className = 'lb-won-overlay';
  if (sz >= 28) ov.style.fontSize = '38px';
  if (mw) {
    ov.classList.add('show');
    if (mw === 'draw') { ov.classList.add('draw'); ov.textContent = '–'; }
    else { ov.classList.add(mw); ov.textContent = mw.toUpperCase(); }
  }
  return ov;
}

function makeCell(metaIdx, cellIdx, sz, forNav) {
  const cell = document.createElement('div');
  cell.className = 'lc';
  cell.style.fontSize = (sz >= 28 ? 14 : 9) + 'px';

  const v         = S.localCells[metaIdx][cellIdx];
  const mw        = S.metaWinners[metaIdx];
  const active    = isMetaActive(metaIdx);
  const isPending = (S.pendingMeta === metaIdx && S.pendingCell === cellIdx);

  if (v) {
    cell.classList.add('lc-' + v, 'lc-taken');
    cell.textContent = v.toUpperCase();
    if (!S.lastMoveCleared && S.sharePlay && metaIdx === S.lastMoveMeta && cellIdx === S.lastMoveCell)
      cell.classList.add('lc-last-move');
  } else if (isPending) {
    cell.classList.add('lc-preview', 'lc-preview-' + S.currentPlayer, 'lc-taken');
    cell.textContent = S.currentPlayer.toUpperCase();
  } else if (mw) {
    cell.classList.add('lc-taken');
    cell.style.opacity = sz >= 28 ? '0.1' : '0.15';
    if (sz >= 28) cell.style.cursor = 'default';
  } else if (!active) {
    cell.style.cursor = 'default';
  }

  if (!v && !mw && !isPending && active) {
    cell.addEventListener('click', () => { handleCellClick(metaIdx, cellIdx); if (forNav) renderNav(); });
    cell.addEventListener('mouseenter', () => {
      const target = cellToTarget(cellIdx);
      highlightTarget(target);
      if (forNav && S.pendingMeta === null) {
        navHoverTarget = target;
        renderNavTarget();
        document.querySelectorAll('#nav-meta-all .nav-cell').forEach((el, idx) => {
          el.classList.toggle('nav-target', idx === target);
        });
      }
    });
    cell.addEventListener('mouseleave', () => {
      if (S.pendingMeta === null) {
        clearTargetHighlight();
        if (forNav) {
          navHoverTarget = null;
          renderNavTarget();
          document.querySelectorAll('#nav-meta-all .nav-cell').forEach(el => el.classList.remove('nav-target'));
        }
      }
    });
  }
  if (isPending) cell.addEventListener('click', () => { commitPreview(); if (forNav) renderNav(); });
  return cell;
}

function makeReadOnlyCell(metaIdx, cellIdx, sz) {
  const cell = document.createElement('div');
  cell.className = 'lc';
  cell.style.fontSize = (sz >= 28 ? 14 : 9) + 'px';
  cell.style.cursor   = 'default';
  const v  = S.localCells[metaIdx][cellIdx];
  const mw = S.metaWinners[metaIdx];
  if (v)  { cell.classList.add('lc-' + v, 'lc-taken'); cell.textContent = v.toUpperCase(); }
  else if (mw) { cell.style.opacity = '0.1'; cell.classList.add('lc-taken'); }
  return cell;
}

// ── TARGET HIGHLIGHTS ─────────────────────────────────────────────────────────
function applyTargetHighlight(targetMeta) {
  clearTargetHighlight();
  if (S.gameOver) return;
  if (!S.metaWinners[targetMeta]) {
    document.querySelectorAll(`.local-board-wrap[data-meta="${targetMeta}"]`).forEach(el => el.classList.add('target-preview'));
  } else {
    document.querySelectorAll('.local-board-wrap').forEach(el => {
      if (!S.metaWinners[+el.dataset.meta]) el.classList.add('target-preview-any');
    });
  }
}

function highlightTarget(targetMeta) {
  if (S.pendingMeta !== null) return;
  applyTargetHighlight(targetMeta);
}

function clearTargetHighlight() {
  document.querySelectorAll('.target-preview, .target-preview-any').forEach(el => {
    el.classList.remove('target-preview', 'target-preview-any');
  });
}

// ── CONFIRM BAR ───────────────────────────────────────────────────────────────
function showConfirmBar() {
  const bar = document.getElementById('confirm-bar');
  const lbl = document.getElementById('confirm-label');
  const btn = document.getElementById('btn-confirm');
  bar.classList.add('show');
  lbl.innerHTML = `Place <strong>${S.currentPlayer.toUpperCase()}</strong> — confirm?`;
  btn.className = S.currentPlayer === 'o' ? 'o-turn' : '';
  if (currentView === 'flat') applyTargetHighlight(cellToTarget(S.pendingCell));
  updateHint();
}