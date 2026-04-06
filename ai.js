// ── AI.JS ── all AI logic; reads S/state helpers, zero DOM
// Depends on: state.js (S, WINS2D, WINS3D, META_LINE_COUNTS, META_LINE_COUNTS_2D)

const W = {
  winMeta:              2578.65,
  blockMetaWin:         1252.39,
  winLocal:             69.68,
  localBoardValueMult:  1.81,
  blockLocalNear:       18.84,
  oppNearAfterSend:     82.73,
  sendToMyMetaLine:     116.35,
  sendToTheirMetaLine:  103.75,
  targetMetaLineCount:  3.33,
  sendToBoardIDominate: 6.66,
};

const AI_LOOKAHEAD_DEPTH = 1;
const AI_BEAM_WIDTH      = 8;

// ── PUBLIC ───────────────────────────────────────────────────────────────────
function aiPickMove() {
  return S.aiDifficulty === 'hard' ? aiPickHard() : aiPickEasy();
}

// ── INTERNAL ─────────────────────────────────────────────────────────────────
function aiPickEasy() {
  const moves = getLegalMoves();
  return moves[Math.floor(Math.random() * moves.length)] || null;
}

function aiPickHard() {
  const moves = getLegalMoves();
  if (!moves.length) return null;
  const snap = makeSnap();
  const scored = moves.map(({ metaIdx, cellIdx }) => ({
    metaIdx, cellIdx,
    s: scoreMoveHeuristic(snap, metaIdx, cellIdx, S.aiPlayer)
  }));
  scored.sort((a, b) => b.s - a.s);
  if (AI_LOOKAHEAD_DEPTH === 0) return scored[0];
  const candidates = scored.slice(0, AI_BEAM_WIDTH);
  let best = null, bestScore = -Infinity;
  for (const { metaIdx, cellIdx } of candidates) {
    const s = scoreMoveDeep(snap, metaIdx, cellIdx, S.aiPlayer, AI_LOOKAHEAD_DEPTH);
    if (s > bestScore) { bestScore = s; best = { metaIdx, cellIdx }; }
  }
  return best || scored[0];
}

function makeSnap() {
  return {
    localCells:   S.localCells.map(a => a.slice()),
    metaWinners:  S.metaWinners.slice(),
    activeBoards: S.activeMetaBoards ? [...S.activeMetaBoards] : null,
    isBlitz:      S.gameMode === 'blitz',
    is2DMeta:     S.gameMode !== 'classic',
    isQuick:      S.gameMode === 'quick',
  };
}

function getLegalMovesFromSnap({ localCells, metaWinners, activeBoards }) {
  const mSz = metaWinners.length, lSz = localCells[0].length;
  const moves = [];
  for (let mi = 0; mi < mSz; mi++) {
    if (metaWinners[mi]) continue;
    if (activeBoards !== null && !activeBoards.includes(mi)) continue;
    for (let ci = 0; ci < lSz; ci++) {
      if (!localCells[mi][ci]) moves.push({ metaIdx: mi, cellIdx: ci });
    }
  }
  return moves;
}

function countNearWins(cells, player, wins) {
  let count = 0;
  for (const [a,b,c] of wins) {
    const vals = [cells[a], cells[b], cells[c]];
    if (vals.filter(v => v === player).length === 2 && vals.filter(v => !v).length === 1) count++;
  }
  return count;
}

function metaNearLines(mw, mi, player) {
  let n = 0;
  const mWins = mw.length === 27 ? WINS3D : WINS2D;
  for (const [a,b,c] of mWins) {
    if (![a,b,c].includes(mi)) continue;
    if ([a,b,c].filter(x => x !== mi).every(x => mw[x] === player)) n++;
  }
  return n;
}

function scoreMoveHeuristic(snap, metaIdx, cellIdx, player) {
  const { localCells, metaWinners } = snap;
  const opp   = player === 'x' ? 'o' : 'x';
  const lWins = snap.isBlitz  ? WINS2D : WINS3D;
  const mWins = snap.is2DMeta ? WINS2D : WINS3D;
  const mlc   = snap.is2DMeta ? META_LINE_COUNTS_2D : META_LINE_COUNTS;
  let score = 0;

  const tmpLocal = localCells[metaIdx].slice();
  tmpLocal[cellIdx] = player;
  let winsLocal = lWins.some(([a,b,c]) => tmpLocal[a] === player && tmpLocal[b] === player && tmpLocal[c] === player);

  let winsMeta = false;
  if (winsLocal) {
    const tmpMeta = metaWinners.slice(); tmpMeta[metaIdx] = player;
    winsMeta = mWins.some(([a,b,c]) => tmpMeta[a] === player && tmpMeta[b] === player && tmpMeta[c] === player);
  }

  let oppWouldWinMeta = false;
  {
    const t = localCells[metaIdx].slice(); t[cellIdx] = opp;
    if (lWins.some(([a,b,c]) => t[a] === opp && t[b] === opp && t[c] === opp)) {
      const tm = metaWinners.slice(); tm[metaIdx] = opp;
      oppWouldWinMeta = mWins.some(([a,b,c]) => tm[a] === opp && tm[b] === opp && tm[c] === opp);
    }
  }

  if (winsMeta)        score += W.winMeta;
  if (oppWouldWinMeta) score += W.blockMetaWin;
  if (winsLocal)       score += W.winLocal + mlc[metaIdx] * W.localBoardValueMult;

  const nearBefore = countNearWins(localCells[metaIdx], opp, lWins);
  if (nearBefore > 0) {
    const tmp = localCells[metaIdx].slice(); tmp[cellIdx] = player;
    score += W.blockLocalNear * (nearBefore - countNearWins(tmp, opp, lWins));
  }

  const tgt = snap.isQuick ? cellIdx % 9 : cellIdx;
  if (tgt < metaWinners.length && !metaWinners[tgt]) {
    score -= W.oppNearAfterSend  * countNearWins(localCells[tgt], opp, lWins);
    score += W.targetMetaLineCount * mlc[tgt];
    score -= W.sendToTheirMetaLine * metaNearLines(metaWinners, tgt, opp);
    score += W.sendToMyMetaLine    * metaNearLines(metaWinners, tgt, player);
    const myP = localCells[tgt].filter(x => x === player).length;
    const opP = localCells[tgt].filter(x => x === opp).length;
    if (myP > opP) score += W.sendToBoardIDominate;
  }
  return score;
}

function applyMoveSnapshot(snap, metaIdx, cellIdx, player) {
  const lc = snap.localCells.map(a => a.slice());
  const mw = snap.metaWinners.slice();
  const lWins = snap.isBlitz  ? WINS2D : WINS3D;
  const mWins = snap.is2DMeta ? WINS2D : WINS3D;
  const mSz   = mw.length;

  lc[metaIdx][cellIdx] = player;
  for (const [a,b,c] of lWins) {
    if (lc[metaIdx][a] && lc[metaIdx][a] === lc[metaIdx][b] && lc[metaIdx][a] === lc[metaIdx][c]) {
      mw[metaIdx] = lc[metaIdx][a]; break;
    }
  }
  if (!mw[metaIdx] && lc[metaIdx].every(v => v)) mw[metaIdx] = 'draw';

  let metaWin = null;
  for (const [a,b,c] of mWins) {
    if (mw[a] && mw[a] !== 'draw' && mw[a] === mw[b] && mw[a] === mw[c]) { metaWin = mw[a]; break; }
  }
  if (!metaWin && mw.every(v => v)) metaWin = 'draw';

  const tgt = snap.isQuick ? cellIdx % 9 : cellIdx;
  const nextActive = !mw[tgt]
    ? [tgt]
    : [...Array(mSz).keys()].filter(i => !mw[i]);

  return { ...snap, localCells: lc, metaWinners: mw, activeBoards: nextActive.length ? nextActive : null, metaWin };
}

function scoreMoveDeep(snap, metaIdx, cellIdx, player, depth) {
  const after = applyMoveSnapshot(snap, metaIdx, cellIdx, player);
  if (after.metaWin) {
    if (after.metaWin === player) return  W.winMeta * 10;
    if (after.metaWin === 'draw') return  0;
    return -W.winMeta * 10;
  }
  if (depth === 0) return scoreMoveHeuristic(snap, metaIdx, cellIdx, player);

  const opp = player === 'x' ? 'o' : 'x';
  const oppMoves = getLegalMovesFromSnap(after);
  if (!oppMoves.length) return scoreMoveHeuristic(snap, metaIdx, cellIdx, player);

  const oppScored = oppMoves
    .map(({ metaIdx: mi, cellIdx: ci }) => ({ mi, ci, s: scoreMoveHeuristic(after, mi, ci, opp) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, AI_BEAM_WIDTH);

  let worstForUs = Infinity;
  for (const { mi, ci } of oppScored) {
    const v = -scoreMoveDeep(after, mi, ci, opp, depth - 1);
    if (v < worstForUs) worstForUs = v;
  }
  return worstForUs;
}