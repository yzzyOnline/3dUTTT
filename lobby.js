// ── LOBBY.JS ── persistent room screen logic
// Depends on: NetClient (global), names.js (randomName)

const SERVER_URL = "wss://gamebackend-dk2p.onrender.com";

// ── STATE ─────────────────────────────────────────────────────────────────────
const L = {
  client: null,
  roomId: null,
  myId: null,
  myName: '',
  isHost: false,
  // players: { [playerId]: { name, isHost } }
  players: {},
  // host-controlled settings (synced via metaData)
  settings: {
    mode: 'classic',
    xPlayer: '',   // playerId
    oPlayer: '',   // playerId
  },
  gameActive: false,
};

// ── BOOT ──────────────────────────────────────────────────────────────────────
(function boot() {
  const params = new URLSearchParams(location.search);
  const roomId = params.get('room');
  const asHost = params.get('host') === '1';

  // No room code — show the join/create entry screen
  if (!roomId || roomId === 'NEW') {
    document.getElementById('join-screen').classList.add('show');
    return;
  }

  _connectAndEnter(roomId, asHost);
})();

function _connectAndEnter(roomId, asHost) {
  // Pick a random name immediately
  L.myName = randomName();
  document.getElementById('my-name-input').value = L.myName;

  L.client = new NetClient(SERVER_URL, '3dttt');
  _attachEvents();
  L.client.connect();

  // Once connected: create or join
  L.client.on('connected', () => {
    if (asHost) {
      L.client.createRoom([], 4, false, {
        mode: 'classic', xPlayer: '', oPlayer: '',
        gameActive: false,
        playerNames: {}
      });
    } else {
      L.client.joinRoom(roomId);
    }
  });
}

// ── JOIN SCREEN HANDLERS ───────────────────────────────────────────────────────
function onJoinCodeInput() {
  const val = document.getElementById('join-code-input').value.trim();
  document.getElementById('btn-join-room').disabled = val.length < 2;
  document.getElementById('join-error').textContent = '';
}

function onJoinCodeKey(e) {
  if (e.key === 'Enter') joinRoomFromCode();
}

function joinRoomFromCode() {
  const code = document.getElementById('join-code-input').value.trim().toUpperCase();
  if (!code) return;
  document.getElementById('join-screen').classList.remove('show');
  history.replaceState(null, '', `?room=${code}`);
  _connectAndEnter(code, false);
}

function createNewRoom() {
  document.getElementById('join-screen').classList.remove('show');
  history.replaceState(null, '', `?room=CREATE&host=1`);
  _connectAndEnter('CREATE', true);
}

window.onJoinCodeInput  = onJoinCodeInput;
window.onJoinCodeKey    = onJoinCodeKey;
window.joinRoomFromCode = joinRoomFromCode;
window.createNewRoom    = createNewRoom;

// ── NET EVENTS ────────────────────────────────────────────────────────────────
function _attachEvents() {
  const c = L.client;

  c.on('assignedId', id => {
    L.myId = id;
    document.getElementById('my-id-label').textContent = 'Your ID: ' + id;
  });

  c.on('roomCreated', (roomId, metaData) => {
    L.roomId = roomId;
    L.isHost = true;
    L.players[L.myId] = { name: L.myName, isHost: true };
    _syncSettings(metaData);
    _applyHostUI();
    document.getElementById('display-room-code').textContent = roomId;
    // Update URL so page can be refreshed
    history.replaceState(null, '', `?room=${roomId}&host=1`);
    _broadcastPresence();
    _renderPlayers();
    _setStatus('Waiting for players… share the room code!');
  });

  c.on('roomJoined', (roomId, ownerId, maxClients, metaData) => {
    L.roomId = roomId;
    L.isHost = false;
    L.players[L.myId] = { name: L.myName, isHost: false };
    _syncSettings(metaData);
    document.getElementById('display-room-code').textContent = roomId;
    history.replaceState(null, '', `?room=${roomId}`);
    _applyHostUI();
    // Announce ourselves to the room
    _broadcastPresence();
    _renderPlayers();
    if (metaData.gameActive) _showGameRunning(metaData);
    _setStatus('');
  });

  c.on('playerJoined', playerId => {
    // New player — they'll announce themselves via relay shortly
    // Pre-register with placeholder name
    if (!L.players[playerId]) {
      L.players[playerId] = { name: '...', isHost: false };
    }
    _renderPlayers();
    // Send them our current presence
    c.tellPlayer(playerId, { type: 'presence', name: L.myName, isHost: L.isHost });
  });

  c.on('playerLeft', playerId => {
    delete L.players[playerId];
    // If they were X or O, clear the picker
    if (L.settings.xPlayer === String(playerId)) L.settings.xPlayer = '';
    if (L.settings.oPlayer === String(playerId)) L.settings.oPlayer = '';
    _renderPlayers();
    _renderPickers();
    _validateStart();
    if (L.isHost) _pushSettings();
  });

  c.on('makeHost', () => {
    L.isHost = true;
    if (L.players[L.myId]) L.players[L.myId].isHost = true;
    _applyHostUI();
    _renderPlayers();
    _setStatus('You are now the host.');
  });

  c.on('relay', (fromId, payload) => {
    switch (payload.type) {
      case 'presence':
        L.players[fromId] = {
          name: payload.name,
          isHost: payload.isHost || (fromId === L.client.ownerId)
        };
        _renderPlayers();
        _renderPickers();
        _validateStart();
        break;
      case 'startGame':
        _launchGame(payload);
        break;
    }
  });

  c.on('tellPlayer', (fromId, payload) => {
    // Same as relay but point-to-point — handle same types
    if (payload.type === 'presence') {
      L.players[fromId] = {
        name: payload.name,
        isHost: payload.isHost || (fromId === L.client.ownerId)
      };
      _renderPlayers();
      _renderPickers();
      _validateStart();
    }
  });

  c.on('roomUpdated', metaData => {
    _syncSettings(metaData);
    _renderPlayers();
    _renderPickers();
    _validateStart();
    if (metaData.gameActive && !L.gameActive) {
      // Only non-players see the overlay; players get startGame relay
      const isPlayer = (
        String(L.myId) === String(L.settings.xPlayer) ||
        String(L.myId) === String(L.settings.oPlayer)
      );
      if (!isPlayer) _showGameRunning(metaData);
    }
    if (!metaData.gameActive && L.gameActive) {
      L.gameActive = false;
      document.getElementById('game-running').classList.remove('show');
    }
  });

  c.on('disconnected', () => {
    _setStatus('Disconnected from server.', 'error');
  });

  c.on('error', msg => {
    _setStatus('Error: ' + msg, 'error');
  });
}

// ── PRESENCE ──────────────────────────────────────────────────────────────────
function _broadcastPresence() {
  L.client.sendRelay({ type: 'presence', name: L.myName, isHost: L.isHost });
}

// ── SETTINGS SYNC ─────────────────────────────────────────────────────────────
function _syncSettings(metaData) {
  if (metaData.mode      !== undefined) L.settings.mode      = metaData.mode;
  if (metaData.xPlayer   !== undefined) L.settings.xPlayer   = String(metaData.xPlayer);
  if (metaData.oPlayer   !== undefined) L.settings.oPlayer   = String(metaData.oPlayer);
  if (metaData.gameActive !== undefined) L.gameActive        = metaData.gameActive;

  // Merge playerNames if present
  if (metaData.playerNames) {
    for (const [id, name] of Object.entries(metaData.playerNames)) {
      if (!L.players[id]) L.players[id] = { name, isHost: false };
      else L.players[id].name = name;
    }
  }

  const sel = document.getElementById('mode-select');
  if (sel) sel.value = L.settings.mode;
}

function _pushSettings() {
  if (!L.isHost) return;
  // Build playerNames map from current player list
  const playerNames = {};
  for (const [id, p] of Object.entries(L.players)) playerNames[id] = p.name;

  L.client.updateMeta({
    mode: L.settings.mode,
    xPlayer: L.settings.xPlayer,
    oPlayer: L.settings.oPlayer,
    gameActive: L.gameActive,
    playerNames
  });
}

// ── HOST UI ───────────────────────────────────────────────────────────────────
function _applyHostUI() {
  const isHost = L.isHost;
  document.getElementById('mode-select').disabled = !isHost;
  document.getElementById('pick-x').disabled = !isHost;
  document.getElementById('pick-o').disabled = !isHost;
  document.getElementById('btn-start').style.display = isHost ? '' : 'none';
  document.getElementById('settings-status').textContent = isHost
    ? '' : 'Only the host can change settings.';
}

// ── RENDER PLAYERS ────────────────────────────────────────────────────────────
function _renderPlayers() {
  const list = document.getElementById('player-list');
  const count = document.getElementById('player-count');
  const entries = Object.entries(L.players);
  count.textContent = entries.length;
  list.innerHTML = '';

  for (const [id, player] of entries) {
    const isMe = String(id) === String(L.myId);
    const isX  = String(id) === String(L.settings.xPlayer);
    const isO  = String(id) === String(L.settings.oPlayer);

    const row = document.createElement('div');
    row.className = 'player-row' +
      (isMe ? ' is-me' : '') +
      (isX  ? ' playing-x' : '') +
      (isO  ? ' playing-o' : '');

    const badge = document.createElement('div');
    badge.className = 'player-badge ' +
      (isX ? 'badge-x' : isO ? 'badge-o' : player.isHost ? 'badge-host' : 'badge-spec');
    badge.textContent = isX ? (player.isHost ? 'X (HOST)' : 'X')
                      : isO ? (player.isHost ? 'O (HOST)' : 'O')
                      : player.isHost ? 'HOST' : 'SPEC';

    const name = document.createElement('div');
    name.className = 'player-name';
    name.textContent = player.name || '...';

    const tags = document.createElement('div');
    tags.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;gap:2px;';
    if (isMe) {
      const you = document.createElement('span');
      you.className = 'player-you'; you.textContent = 'YOU';
      tags.appendChild(you);
    }
    if (player.isHost && !isMe) {
      const ht = document.createElement('span');
      ht.className = 'player-host-tag'; ht.textContent = 'HOST';
      tags.appendChild(ht);
    }

    row.appendChild(badge);
    row.appendChild(name);
    row.appendChild(tags);
    list.appendChild(row);
  }

  // Empty slots
  for (let i = entries.length; i < 4; i++) {
    const slot = document.createElement('div');
    slot.className = 'empty-slot';
    slot.textContent = 'waiting for player…';
    list.appendChild(slot);
  }
}

// ── RENDER PICKERS ────────────────────────────────────────────────────────────
function _renderPickers() {
  const pickX = document.getElementById('pick-x');
  const pickO = document.getElementById('pick-o');
  const prevX = L.settings.xPlayer;
  const prevO = L.settings.oPlayer;

  [pickX, pickO].forEach((sel, i) => {
    sel.innerHTML = `<option value="">— ${i === 0 ? 'X' : 'O'} —</option>`;
    for (const [id, player] of Object.entries(L.players)) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = player.name || id;
      sel.appendChild(opt);
    }
  });

  pickX.value = prevX || '';
  pickO.value = prevO || '';
}

function _validateStart() {
  const btn = document.getElementById('btn-start');
  if (!L.isHost) { btn.disabled = true; return; }
  const x = L.settings.xPlayer;
  const o = L.settings.oPlayer;
  const valid = x && o && x !== o &&
    L.players[x] && L.players[o] &&
    Object.keys(L.players).length >= 2;
  btn.disabled = !valid;
  document.getElementById('settings-status').textContent = valid
    ? '' : (x && o && x === o) ? 'X and O must be different players.' : '';
}

// ── NAME INPUT ────────────────────────────────────────────────────────────────
let _nameTimer = null;
function onNameInput() {
  const val = document.getElementById('my-name-input').value.trim();
  if (!val) return;
  L.myName = val;
  if (L.players[L.myId]) L.players[L.myId].name = val;
  clearTimeout(_nameTimer);
  _nameTimer = setTimeout(() => {
    _broadcastPresence();
    if (L.isHost) _pushSettings();
    _renderPlayers();
  }, 400);
}

function randomizeName() {
  const name = randomName();
  L.myName = name;
  document.getElementById('my-name-input').value = name;
  if (L.players[L.myId]) L.players[L.myId].name = name;
  _broadcastPresence();
  if (L.isHost) _pushSettings();
  _renderPlayers();
}

// ── SETTINGS CHANGE (host only) ───────────────────────────────────────────────
function onSettingChange() {
  if (!L.isHost) return;
  L.settings.mode     = document.getElementById('mode-select').value;
  L.settings.xPlayer  = document.getElementById('pick-x').value;
  L.settings.oPlayer  = document.getElementById('pick-o').value;
  _validateStart();
  _pushSettings();
}

// ── START GAME ────────────────────────────────────────────────────────────────
function startGame() {
  if (!L.isHost) return;
  const x = L.settings.xPlayer;
  const o = L.settings.oPlayer;
  if (!x || !o || x === o) return;

  L.gameActive = true;
  _pushSettings();

  // Tell each player their role
  const payload = {
    type: 'startGame',
    mode: L.settings.mode,
    xPlayerId: x,
    oPlayerId: o,
    xName: L.players[x]?.name || 'X',
    oName: L.players[o]?.name || 'O',
    roomId: L.roomId,
  };

  L.client.sendRelay(payload);

  // Also handle ourselves if we're playing
  _launchGame(payload);
}

function _launchGame(payload) {
  const myIdStr = String(L.myId);
  const isX = myIdStr === String(payload.xPlayerId);
  const isO = myIdStr === String(payload.oPlayerId);

  if (!isX && !isO) {
    _showGameRunning(payload);
    return;
  }

  const mySymbol = isX ? 'x' : 'o';
  const cfg = {
    roomId: L.roomId,
    myId: L.myId,
    mySymbol,
    myName: L.myName,
    opponentName: isX ? payload.oName : payload.xName,
    mode: payload.mode,
    serverUrl: SERVER_URL,
  };

  sessionStorage.setItem('online_game', JSON.stringify(cfg));

  // Hand the live NetClient to the game page so it skips reconnecting
  window._sharedNetClient = L.client;
  window._sharedNetCfg    = cfg;

  _loadGameInPlace();
}

async function _loadGameInPlace() {
  try {
    const res  = await fetch('index.html');
    const html = await res.text();
    const doc  = new DOMParser().parseFromString(html, 'text/html');

    document.title = doc.title;

    // Merge any new styles from the game page
    for (const style of doc.querySelectorAll('head style')) {
      if (!document.head.querySelector('style[data-game]')) {
        const s = document.createElement('style');
        s.setAttribute('data-game', '1');
        s.textContent = style.textContent;
        document.head.appendChild(s);
      }
    }

    document.body.innerHTML = doc.body.innerHTML;
    document.body.className = 'online-mode';
    history.replaceState(null, '', 'index.html?online=1');

    const scripts = ['state.js', 'ai.js', 'render.js', 'names.js', 'network.js', 'game.js'];
    for (const src of scripts) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src + '?t=' + Date.now();
        s.onload  = resolve;
        s.onerror = reject;
        document.body.appendChild(s);
      });
    }
  } catch (err) {
    console.warn('In-place load failed, falling back:', err);
    location.href = 'index.html?online=1';
  }
}

function _showGameRunning(data) {
  L.gameActive = true;
  const el = document.getElementById('game-running');
  el.classList.add('show');
  const vs = document.getElementById('gr-vs-label');
  const xName = data.xName || L.players[data.xPlayerId]?.name || 'X';
  const oName = data.oName || L.players[data.oPlayerId]?.name || 'O';
  vs.innerHTML = `<span class="xn">${xName}</span> <span style="color:var(--text)">vs</span> <span class="on">${oName}</span>`;
  document.getElementById('gr-mode-label').textContent =
    ({ classic: 'CLASSIC · 3D×3D', quick: 'QUICK PLAY · 2D×3D', blitz: 'BLITZ · 2D×2D' })[data.mode] || '';
}

// ── UTILS ─────────────────────────────────────────────────────────────────────
function copyCode() {
  navigator.clipboard.writeText(L.roomId).then(() => {
    const btn = document.getElementById('btn-copy-code');
    const orig = btn.textContent;
    btn.textContent = 'COPIED!';
    setTimeout(() => btn.textContent = orig, 1500);
  });
}

function leaveRoom() {
  L.client.leaveRoom();
  L.client.disconnect();
  location.href = 'index.html';
}

function _setStatus(msg, type) {
  const el = document.getElementById('lobby-status');
  el.textContent = msg;
  el.className = 'status-bar' + (type ? ' ' + type : '');
}

// ── HOME PROMPT ───────────────────────────────────────────────────────────────
function showHomePrompt() {
  document.getElementById('home-prompt').classList.add('show');
}
function cancelHomePrompt() {
  document.getElementById('home-prompt').classList.remove('show');
}
function confirmGoHome() {
  L.client?.leaveRoom();
  L.client?.disconnect();
  location.href = 'index.html';
}

// Expose to HTML onclick
window.showHomePrompt   = showHomePrompt;
window.cancelHomePrompt = cancelHomePrompt;
window.confirmGoHome    = confirmGoHome;
window.copyCode        = copyCode;
window.leaveRoom       = leaveRoom;
window.onNameInput     = onNameInput;
window.randomizeName   = randomizeName;
window.onSettingChange = onSettingChange;
window.startGame       = startGame;