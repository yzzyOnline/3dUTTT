// ── STATE.JS ── pure game logic, zero DOM
// Exports: WINS3D, WINS2D, state object, and all state-mutation functions

// ── WIN TABLES ──────────────────────────────────────────────────────────────
function li(z, y, x) { return z * 9 + y * 3 + x; }

function buildWins3d() {
  const w = [];
  for (let z = 0; z < 3; z++) for (let y = 0; y < 3; y++) w.push([li(z,y,0), li(z,y,1), li(z,y,2)]);
  for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) w.push([li(z,0,x), li(z,1,x), li(z,2,x)]);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) w.push([li(0,y,x), li(1,y,x), li(2,y,x)]);
  for (let z = 0; z < 3; z++) { w.push([li(z,0,0),li(z,1,1),li(z,2,2)]); w.push([li(z,0,2),li(z,1,1),li(z,2,0)]); }
  for (let y = 0; y < 3; y++) { w.push([li(0,y,0),li(1,y,1),li(2,y,2)]); w.push([li(0,y,2),li(1,y,1),li(2,y,0)]); }
  for (let x = 0; x < 3; x++) { w.push([li(0,0,x),li(1,1,x),li(2,2,x)]); w.push([li(0,2,x),li(1,1,x),li(2,0,x)]); }
  w.push([li(0,0,0),li(1,1,1),li(2,2,2)]); w.push([li(0,0,2),li(1,1,1),li(2,2,0)]);
  w.push([li(0,2,0),li(1,1,1),li(2,0,2)]); w.push([li(0,2,2),li(1,1,1),li(2,0,0)]);
  return w;
}

function buildWins2d() {
  const w = [];
  for (let r = 0; r < 3; r++) w.push([r*3, r*3+1, r*3+2]);
  for (let c = 0; c < 3; c++) w.push([c, c+3, c+6]);
  w.push([0,4,8]); w.push([2,4,6]);
  return w;
}

const WINS3D = buildWins3d();
const WINS2D = buildWins2d();

const META_LINE_COUNTS = (() => {
  const counts = Array(27).fill(0);
  for (const [a,b,c] of WINS3D) { counts[a]++; counts[b]++; counts[c]++; }
  return counts;
})();

const META_LINE_COUNTS_2D = (() => {
  const counts = Array(9).fill(0);
  for (const [a,b,c] of WINS2D) { counts[a]++; counts[b]++; counts[c]++; }
  return counts;
})();

// ── GAME STATE ───────────────────────────────────────────────────────────────
const S = {
  // game config
  gameMode: 'classic',   // 'classic' | 'quick' | 'blitz'
  vsAI: false,
  aiPlayer: 'o',
  aiDifficulty: 'easy',
  sharePlay: false,

  // board state
  localCells: [],        // [metaIdx][cellIdx] = null|'x'|'o'
  localWinners: [],      // [metaIdx] = null|'x'|'o'|'draw'
  metaWinners: [],       // [metaIdx] = null|'x'|'o'|'draw'
  currentPlayer: 'x',
  activeMetaBoards: null,
  gameOver: false,

  // ui state
  navSelected: null,
  aiPending: false,
  lastMoveMeta: null,
  lastMoveCell: null,
  lastMoveCleared: false,
  pendingMeta: null,
  pendingCell: null,
};

// ── MODE HELPERS ─────────────────────────────────────────────────────────────
function metaSize()       { return S.gameMode === 'classic' ? 27 : 9; }
function localSize()      { return S.gameMode === 'blitz'   ?  9 : 27; }
function metaWins()       { return S.gameMode === 'classic' ? WINS3D : WINS2D; }
function localWins()      { return S.gameMode === 'blitz'   ? WINS2D : WINS3D; }
function metaLineCounts() { return S.gameMode === 'classic' ? META_LINE_COUNTS : META_LINE_COUNTS_2D; }
function cellToTarget(cellIdx) { return S.gameMode === 'quick' ? cellIdx % 9 : cellIdx; }

// ── STATE INIT ───────────────────────────────────────────────────────────────
function initState() {
  S.localCells      = Array.from({ length: metaSize() }, () => Array(localSize()).fill(null));
  S.localWinners    = Array(metaSize()).fill(null);
  S.metaWinners     = Array(metaSize()).fill(null);
  S.currentPlayer   = 'x';
  S.activeMetaBoards = null;
  S.gameOver        = false;
  S.navSelected     = null;
  S.aiPending       = false;
  S.lastMoveMeta    = null;
  S.lastMoveCell    = null;
  S.lastMoveCleared = false;
  S.pendingMeta     = null;
  S.pendingCell     = null;
}

// ── BOARD QUERIES ────────────────────────────────────────────────────────────
function isMetaActive(mi) {
  if (S.metaWinners[mi]) return false;
  if (S.activeMetaBoards === null) return true;
  return S.activeMetaBoards.includes(mi);
}

function getFreeMetaBoards() {
  return [...Array(metaSize()).keys()].filter(i => !S.metaWinners[i]);
}

function checkWin(arr, wins) {
  for (const [a,b,c] of wins) {
    if (arr[a] && arr[a] === arr[b] && arr[a] === arr[c]) return arr[a];
  }
  if (arr.every(v => v)) return 'draw';
  return null;
}

function getLegalMoves() {
  const moves = [];
  for (let mi = 0; mi < metaSize(); mi++) {
    if (!isMetaActive(mi)) continue;
    for (let ci = 0; ci < localSize(); ci++) {
      if (!S.localCells[mi][ci] && !S.metaWinners[mi]) moves.push({ metaIdx: mi, cellIdx: ci });
    }
  }
  return moves;
}

// ── MOVE APPLICATION ─────────────────────────────────────────────────────────
// Returns null if game continues, or winner string ('x'|'o'|'draw') if game ends
function applyMove(metaIdx, cellIdx) {
  S.lastMoveMeta = metaIdx;
  S.lastMoveCell = cellIdx;
  S.localCells[metaIdx][cellIdx] = S.currentPlayer;

  const lw = checkWin(S.localCells[metaIdx], localWins());
  if (lw) {
    S.localWinners[metaIdx] = lw;
    S.metaWinners[metaIdx]  = lw;
    const gw = checkWin(S.metaWinners, metaWins());
    if (gw) { S.gameOver = true; return gw; }
  }

  const nextMeta = cellToTarget(cellIdx);
  const candidates = !S.metaWinners[nextMeta] ? [nextMeta] : getFreeMetaBoards();
  S.activeMetaBoards = candidates.length > 0 ? candidates : null;

  S.currentPlayer = S.currentPlayer === 'x' ? 'o' : 'x';
  return null;
}

// ── URL ENCODE / DECODE ───────────────────────────────────────────────────────
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_@!$%&*+=?';

function encodeCells(cells) {
  const vals = cells.map(v => v === 'x' ? 1 : v === 'o' ? 2 : 0);
  let result = '';
  for (let i = 0; i < vals.length; i += 4) {
    let n = 0;
    for (let j = 0; j < 4; j++) n = n * 3 + (vals[i+j] ?? 0);
    result += CHARS[n] ?? CHARS[0];
  }
  return result;
}

function decodeCells(str, length) {
  const vals = [];
  for (let i = 0; i < str.length; i++) {
    let n = CHARS.indexOf(str[i]);
    if (n < 0) n = 0;
    const chunk = [];
    for (let j = 0; j < 4; j++) { chunk.unshift(n % 3); n = Math.floor(n / 3); }
    vals.push(...chunk);
  }
  return vals.slice(0, length).map(v => v === 1 ? 'x' : v === 2 ? 'o' : null);
}

function encodeActive(active) {
  if (active === null) return 'N';
  let mask = 0;
  for (const i of active) mask |= (1 << i);
  return mask.toString(36);
}

function decodeActive(str) {
  if (str === 'N') return null;
  const mask = parseInt(str, 36);
  const arr = [];
  for (let i = 0; i < 27; i++) if (mask & (1 << i)) arr.push(i);
  return arr.length ? arr : null;
}

function encodeStateToHash() {
  try {
    const modeChar = S.gameMode === 'classic' ? 'c' : S.gameMode === 'quick' ? 'q' : 'b';
    const flags = modeChar + S.currentPlayer
      + (S.vsAI ? '1' : '0') + S.aiPlayer
      + (S.aiDifficulty === 'hard' ? 'h' : 'e')
      + (S.sharePlay ? '1' : '0');
    const cellsEnc  = encodeCells(S.localCells.flat());
    const metaEnc   = encodeCells(S.metaWinners.map(v => v === 'draw' ? null : v));
    const activeEnc = encodeActive(S.activeMetaBoards);
    const lm = (S.lastMoveMeta !== null && S.lastMoveCell !== null)
      ? S.lastMoveMeta.toString(36) + '.' + S.lastMoveCell.toString(36)
      : 'N';
    const goEnc = S.gameOver ? '1' : '0';
    history.replaceState(null, '', '#state=' + [flags, cellsEnc, metaEnc, activeEnc, lm, goEnc].join('|'));
  } catch(e) {}
}

function decodeStateFromHash() {
  try {
    const hash = location.hash;
    if (!hash.startsWith('#state=')) return false;
    const parts = hash.slice(7).split('|');
    if (parts.length < 6) return false;
    const [flags, cellsEnc, metaEnc, activeEnc, lm, goEnc] = parts;
    const modeChar = flags[0];
    S.gameMode     = modeChar === 'c' ? 'classic' : modeChar === 'q' ? 'quick' : 'blitz';
    const cp = flags[1];
    if (cp !== 'x' && cp !== 'o') return false;
    S.vsAI         = flags[2] === '1';
    S.aiPlayer     = flags[3];
    S.aiDifficulty = flags[4] === 'h' ? 'hard' : 'easy';
    S.sharePlay    = flags[5] === '1';
    const mSz = metaSize(), lSz = localSize();
    const allCells = decodeCells(cellsEnc, mSz * lSz);
    S.localCells = [];
    for (let i = 0; i < mSz; i++) S.localCells.push(allCells.slice(i * lSz, (i+1) * lSz));
    S.metaWinners  = decodeCells(metaEnc, mSz);
    S.localWinners = S.localCells.map((cells, mi) => {
      for (const [a,b,c] of localWins()) {
        if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) return cells[a];
      }
      return S.metaWinners[mi] === 'draw' ? 'draw' : null;
    });
    S.activeMetaBoards = decodeActive(activeEnc);
    S.currentPlayer    = cp;
    S.gameOver         = goEnc === '1';
    S.navSelected = null; S.aiPending = false;
    if (lm !== 'N') {
      const p = lm.split('.');
      S.lastMoveMeta    = parseInt(p[0], 36);
      S.lastMoveCell    = parseInt(p[1], 36);
      S.lastMoveCleared = false;
    } else {
      S.lastMoveMeta = null; S.lastMoveCell = null; S.lastMoveCleared = true;
    }
    return true;
  } catch(e) { return false; }
}