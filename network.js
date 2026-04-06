// ── NETWORK.JS ── online game session (launched from lobby.html)
// Depends on: NetClient.js (global), state.js, render.js, game.js

const Net = {
  client: null,
  online: false,
  mySymbol: null,
  myName: '',
  opponentName: '',
  roomId: null,
  myId: null,
};

// ── PUBLIC API ────────────────────────────────────────────────────────────────
function netIsOnline()  { return Net.online; }
function netMySymbol()  { return Net.mySymbol; }

function netSendMove(metaIdx, cellIdx) {
  Net.client.sendRelay({ type: 'move', metaIdx, cellIdx });
}

function netBackToLobby() {
  Net.client?.sendRelay({ type: 'playerBackToLobby', id: Net.myId });
  Net.client?.leaveRoom();
  Net.client?.disconnect();
  Net.online = false;
  location.href = 'lobby.html?room=' + Net.roomId;
}

// ── INIT ──────────────────────────────────────────────────────────────────────
// Called by game.js boot. Returns true if we are in an online session.
function netInit() {
  const raw = sessionStorage.getItem('online_game');
  if (!raw) return false;

  let cfg;
  try { cfg = JSON.parse(raw); } catch { return false; }

  Net.roomId       = cfg.roomId;
  Net.myId         = cfg.myId;
  Net.mySymbol     = cfg.mySymbol;
  Net.myName       = cfg.myName;
  Net.opponentName = cfg.opponentName;

  // ── FAST PATH: lobby passed us its live NetClient via window ──────────────
  // Skips reconnect entirely — the socket is already open and in the room.
  if (window._sharedNetClient) {
    Net.client = window._sharedNetClient;
    window._sharedNetClient = null;
    window._sharedNetCfg    = null;
    _attachGameHandlers();
    Net.online = true;
    _beginOnlineGame(cfg.mode);
    return true;
  }

  // ── SLOW PATH: page was refreshed, reconnect from scratch ─────────────────
  Net.client = new NetClient(cfg.serverUrl, '3dttt');

  Net.client.on('connected', () => {
    Net.client.joinRoom(Net.roomId);
  });

  Net.client.on('roomJoined', (roomId, ownerId, maxClients, metaData) => {
    Net.online = true;
    _beginOnlineGame(cfg.mode);
  });

  _attachGameHandlers();
  Net.client.connect();
  return true;
}

function _attachGameHandlers() {
  Net.client.on('relay', (fromId, payload) => {
    if (!Net.online) return;
    if (payload.type === 'move') {
      if (fromId === Net.myId) return;
      const winner = applyMove(payload.metaIdx, payload.cellIdx);
      renderAll();
      updateHint();
      if (winner) endGame(winner);
      encodeStateToHash();
    } else if (payload.type === 'playerBackToLobby') {
      if (!Net.online) return;
      _showNetBanner('Opponent returned to lobby.', 'error');
      Net.online = false;
    }
  });

  Net.client.on('playerLeft', () => {
    if (!Net.online) return;
    _showNetBanner('Opponent disconnected.', 'error');
    Net.online = false;
  });

  Net.client.on('disconnected', () => { Net.online = false; });
  Net.client.on('error', msg => { _showNetBanner('Network error: ' + msg, 'error'); });
}

// ── GAME START ────────────────────────────────────────────────────────────────
function _beginOnlineGame(gameMode) {
  document.getElementById('mode-modal').classList.remove('show');

  S.gameMode  = gameMode;
  S.vsAI      = false;
  S.sharePlay = false;

  initState();
  applyToolbarForMode();

  document.getElementById('btn-reset').style.display = 'none';
  document.getElementById('btn-share').style.display = 'none';
  document.getElementById('btn-leave').style.display = '';

  _patchNameDisplay();

  _showNetBanner(
    'You are <strong style="color:' + (Net.mySymbol === 'x' ? 'var(--x)' : 'var(--o)') + '">' +
    Net.myName + ' (' + Net.mySymbol.toUpperCase() + ')</strong> vs ' +
    '<strong>' + Net.opponentName + '</strong>' +
    (Net.mySymbol === 'x' ? ' · You go first!' : ' · Opponent goes first\u2026'),
    'info'
  );

  renderAll();
  updateHint();
  encodeStateToHash();
}

function _patchNameDisplay() {
  const orig = updateStatus;
  window.updateStatus = function() {
    orig();
    if (!Net.online) return;
    const lbl = document.getElementById('turn-label');
    if (!lbl) return;
    const isMyTurn = S.currentPlayer === Net.mySymbol;
    lbl.textContent = (isMyTurn ? Net.myName : Net.opponentName) + (isMyTurn ? ' (YOU)' : '');
  };
}

function _showNetBanner(html, type) {
  const banner = document.getElementById('net-banner');
  if (!banner) return;
  banner.innerHTML = html;
  banner.className = 'net-banner show ' + (type || '');
  clearTimeout(banner._hideTimer);
  if (type !== 'error') {
    banner._hideTimer = setTimeout(() => banner.classList.remove('show'), 6000);
  }
}

function onlineLeaveGame() {
  sessionStorage.removeItem('online_game');
  netBackToLobby();
}