// ── GAME.JS ── flow control, event handlers, modals, AI trigger
// Depends on: state.js, render.js, ai.js

// ── CELL CLICK / CONFIRM FLOW ─────────────────────────────────────────────────
function handleCellClick(metaIdx, cellIdx) {
  if (S.gameOver) return;
  if (S.vsAI && S.currentPlayer === S.aiPlayer) return;
  if (S.aiPending) return;
  if (!isMetaActive(metaIdx)) return;
  if (S.localCells[metaIdx][cellIdx]) return;
  if (S.metaWinners[metaIdx]) return;

  if (S.sharePlay && !S.lastMoveCleared) {
    S.lastMoveCleared = true;
    renderAll();
  }

  // Double-click the same pending cell = instant confirm
  if (S.pendingMeta === metaIdx && S.pendingCell === cellIdx) {
    commitPreview(); return;
  }

  cancelPreview(true);
  S.pendingMeta = metaIdx;
  S.pendingCell = cellIdx;
  if (currentView === 'nav') S.navSelected = metaIdx;
  renderAll();
  showConfirmBar();
}

function commitPreview() {
  if (S.pendingMeta === null) return;
  const metaIdx = S.pendingMeta, cellIdx = S.pendingCell;
  S.pendingMeta = null; S.pendingCell = null;
  navHoverTarget = null;
  document.getElementById('confirm-bar').classList.remove('show');
  clearTargetHighlight();

  const winner = applyMove(metaIdx, cellIdx);
  renderAll();
  updateHint();

  if (winner) { endGame(winner); return; }

  encodeStateToHash();

  if (S.vsAI && S.currentPlayer === S.aiPlayer && !S.gameOver) {
    S.aiPending = true;
    document.getElementById('ai-thinking').classList.add('show');
    setTimeout(() => { aiTakeTurn(); }, 450);
    return;
  }

  if (S.sharePlay && !S.gameOver) {
    showShareModal();
  }
}

function cancelPreview(silent) {
  S.pendingMeta = null; S.pendingCell = null;
  navHoverTarget = null;
  document.getElementById('confirm-bar').classList.remove('show');
  clearTargetHighlight();
  if (!silent) renderAll();
  updateHint();
}

// ── AI TRIGGER ────────────────────────────────────────────────────────────────
function aiTakeTurn() {
  document.getElementById('ai-thinking').classList.remove('show');
  S.aiPending = false;
  if (S.gameOver) return;
  const move = aiPickMove();
  if (!move) return;
  S.pendingMeta = move.metaIdx;
  S.pendingCell = move.cellIdx;
  commitPreview();
}

// ── GAME LIFECYCLE ────────────────────────────────────────────────────────────
function startGame(mode) {
  S.gameMode = mode;
  document.getElementById('mode-modal').classList.remove('show');
  document.getElementById('win-modal').classList.remove('show');
  initState();
  applyToolbarForMode();
  renderAll();
  updateHint();
  encodeStateToHash();
  if (S.vsAI && S.aiPlayer === 'x' && !S.gameOver) {
    S.aiPending = true;
    document.getElementById('ai-thinking').classList.add('show');
    setTimeout(() => { aiTakeTurn(); }, 600);
  }
}

function resetGame() {
  history.replaceState(null, '', location.pathname + location.search);
  document.getElementById('win-modal').classList.remove('show');
  document.getElementById('resume-banner').classList.remove('show');
  S.vsAI = false; S.sharePlay = false;
  document.getElementById('btn-pass-play').classList.add('selected');
  document.getElementById('btn-vs-ai').classList.remove('selected');
  document.getElementById('ai-options').classList.remove('show');
  document.getElementById('mode-modal').classList.add('show');
}

function reviewBoard() {
  document.getElementById('win-modal').classList.remove('show');
}

function endGame(winner) {
  S.gameOver = true;
  const modal = document.getElementById('win-modal');
  const title = document.getElementById('win-title');
  const sub   = document.getElementById('win-sub');
  modal.classList.add('show');
  if (winner === 'draw') {
    title.className   = 'draw'; title.textContent = 'DRAW!';
    sub.textContent   = 'The meta is fully contested';
  } else {
    title.className   = winner;
    title.textContent = winner.toUpperCase() + ' WINS!';
    sub.textContent   = S.gameMode === 'classic' ? '3 meta-positions in a 3D line' : '3 meta-boards in a row';
  }
}

function applyToolbarForMode() {
  document.getElementById('btn-reset').style.display = S.sharePlay ? 'none' : '';
  document.getElementById('btn-share').style.display = S.sharePlay ? ''     : 'none';
  const navBtn = document.getElementById('btn-nav');
  if (S.gameMode === 'blitz') {
    navBtn.style.display = 'none';
    currentView = 'flat';
    document.getElementById('view-flat').style.display = 'flex';
    document.getElementById('view-nav').style.display  = 'none';
    document.getElementById('hint-bar').style.display  = 'none';
    document.getElementById('btn-flat').classList.add('on');
    document.getElementById('btn-nav').classList.remove('on');
  } else {
    navBtn.style.display = '';
    if (S.lastMoveMeta !== null && !S.lastMoveCleared) S.navSelected = S.lastMoveMeta;
    currentView = 'nav';
    document.getElementById('view-flat').style.display = 'none';
    document.getElementById('view-nav').style.display  = 'flex';
    document.getElementById('hint-bar').style.display  = 'block';
    document.getElementById('btn-flat').classList.remove('on');
    document.getElementById('btn-nav').classList.add('on');
  }
}

// ── MODE MODAL CONTROLS ───────────────────────────────────────────────────────
function setPlayerMode(mode) {
  S.vsAI = (mode === 'ai');
  S.sharePlay = false;
  document.getElementById('btn-pass-play').classList.toggle('selected', !S.vsAI);
  document.getElementById('btn-vs-ai').classList.toggle('selected',     S.vsAI);
  document.getElementById('ai-options').classList.toggle('show',        S.vsAI);
}

function setAIPlayerPick(p) {
  S.aiPlayer = p === 'x' ? 'o' : 'x';
  document.getElementById('pick-x').classList.toggle('selected', p === 'x');
  document.getElementById('pick-o').classList.toggle('selected', p === 'o');
}

function setAIDiff(d) {
  S.aiDifficulty = d;
  document.getElementById('diff-easy').classList.toggle('selected', d === 'easy');
  document.getElementById('diff-hard').classList.toggle('selected', d === 'hard');
}

// ── SHARE / URL ────────────────────────────────────────────────────────────────
function shareState() {
  encodeStateToHash();
  showShareModal();
}

function showShareModal() {
  document.getElementById('share-url').textContent          = location.href;
  document.getElementById('share-next-player').textContent  = S.currentPlayer.toUpperCase();
  document.getElementById('share-title').textContent        = 'YOUR MOVE IS DONE';
  document.getElementById('btn-copy-url').textContent       = 'COPY LINK';
  document.getElementById('btn-copy-url').classList.remove('copied');
  document.getElementById('share-modal').classList.add('show');
}

function copyShareURL() {
  navigator.clipboard.writeText(location.href).then(() => {
    const btn = document.getElementById('btn-copy-url');
    btn.textContent = 'COPIED!'; btn.classList.add('copied');
  }).catch(() => {
    const el = document.getElementById('share-url');
    const range = document.createRange();
    range.selectNode(el);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  });
}

function closeShareModal() {
  document.getElementById('share-modal').classList.remove('show');
}

function toggleRules() {
  const r = document.getElementById('rules-box');
  r.classList.toggle('show');
  document.getElementById('btn-rules').classList.toggle('on', r.classList.contains('show'));
}

// ── RESUME BANNER ─────────────────────────────────────────────────────────────
function showResumeBanner() {
  const banner = document.getElementById('resume-banner');
  const modeNames  = { classic: 'CLASSIC', quick: 'QUICK PLAY', blitz: 'BLITZ' };
  const prevPlayer = S.currentPlayer === 'x' ? 'O' : 'X';
  const prevColor  = prevPlayer === 'X' ? '#e8ff57' : '#ff6b6b';
  const curColor   = S.currentPlayer === 'x' ? '#e8ff57' : '#ff6b6b';
  banner.innerHTML = S.sharePlay
    ? `RESUMED · <strong style="color:${prevColor}">${prevPlayer}</strong> just moved · it's your turn as <strong style="color:${curColor}">${S.currentPlayer.toUpperCase()}</strong>`
    : `GAME RESUMED · ${modeNames[S.gameMode]} · <strong style="color:${curColor}">${S.currentPlayer.toUpperCase()}'S TURN</strong>`;
  banner.classList.add('show');
  setTimeout(() => { banner.classList.remove('show'); }, 5000);
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
(function init() {
  if (decodeStateFromHash()) {
    document.getElementById('mode-modal').classList.remove('show');
    applyToolbarForMode();
    renderAll();
    updateHint();
    showResumeBanner();
    if (S.gameOver) {
      const gw = checkWin(S.metaWinners, metaWins());
      if (gw) endGame(gw);
    } else if (S.vsAI && S.currentPlayer === S.aiPlayer) {
      S.aiPending = true;
      document.getElementById('ai-thinking').classList.add('show');
      setTimeout(() => { aiTakeTurn(); }, 600);
    }
  } else {
    document.getElementById('mode-modal').classList.add('show');
  }
})();