// ============================================================
// MONOPOLY INDIA - Lobby Client
// ============================================================
const socket = io();

let roomId = null;
let playerId = null;
let isHost = false;

function updateHostControls() {
  document.getElementById('settings-panel').style.display = isHost ? 'block' : 'none';
  document.getElementById('btn-start').style.display = isHost ? 'block' : 'none';
  document.getElementById('waiting-msg').style.display = isHost ? 'none' : 'block';
}

// --- Tab Switching ---
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// --- Check URL for room code ---
const urlParams = new URLSearchParams(window.location.search);
const joinCode = urlParams.get('room');
if (joinCode) {
  document.querySelector('[data-tab="join"]').click();
  document.getElementById('join-code').value = joinCode;
}

// --- Create Room ---
document.getElementById('btn-create').addEventListener('click', () => {
  const name = document.getElementById('create-name').value.trim();
  if (!name) return showError('Please enter your name.');
  hideError();

  socket.emit('create_room', { name }, (res) => {
    if (res.error) return showError(res.error);
    roomId = res.roomId;
    playerId = res.playerId;
    isHost = true;
    sessionStorage.setItem('playerName', name);
    sessionStorage.setItem('roomId', roomId);
    sessionStorage.setItem('playerId', playerId);
    showWaitingRoom();
  });
});

// --- Join Room ---
document.getElementById('btn-join').addEventListener('click', () => {
  const name = document.getElementById('join-name').value.trim();
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (!name) return showError('Please enter your name.');
  if (!code) return showError('Please enter a room code.');
  hideError();

  socket.emit('join_room', { roomId: code, name }, (res) => {
    if (res.error) return showError(res.error);
    roomId = res.roomId;
    playerId = res.playerId;
    isHost = false;
    sessionStorage.setItem('playerName', name);
    sessionStorage.setItem('roomId', roomId);
    sessionStorage.setItem('playerId', playerId);
    showWaitingRoom();
  });
});

// --- Show Waiting Room ---
function showWaitingRoom() {
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('waiting-room').style.display = 'block';
  document.getElementById('room-code').textContent = roomId;

  const shareUrl = `${window.location.origin}?room=${roomId}`;
  document.getElementById('share-url').value = shareUrl;

  updateHostControls();
}

// --- Copy Link ---
document.getElementById('btn-copy').addEventListener('click', () => {
  const input = document.getElementById('share-url');
  input.select();
  navigator.clipboard.writeText(input.value).then(() => {
    const btn = document.getElementById('btn-copy');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy Link', 2000);
  });
});

// --- Save Settings ---
document.getElementById('btn-save-settings').addEventListener('click', () => {
  const settings = {
    startingCash: parseInt(document.getElementById('set-cash').value) || 1500,
    cashLimit: parseInt(document.getElementById('set-cash-limit').value) || 0,
    goBonus: parseInt(document.getElementById('set-go').value) || 200,
    vacationCashEnabled: document.getElementById('set-vacation').checked,
    vacationCashStart: parseInt(document.getElementById('set-vacation-amt').value) || 500,
    collectRentInJail: document.getElementById('set-jail-rent').checked,
    jailBailAmount: parseInt(document.getElementById('set-bail').value) || 50,
  };
  socket.emit('update_settings', { roomId, settings });
});

// --- Start Game ---
document.getElementById('btn-start').addEventListener('click', () => {
  socket.emit('start_game', { roomId }, (res) => {
    if (res?.error) showError(res.error);
  });
});

// --- Game State Updates ---
socket.on('game_state', (state) => {
  if (playerId && state.hostId) {
    isHost = state.hostId === playerId;
    updateHostControls();
  }

  // Update players list in waiting room
  if (!state.started) {
    const list = document.getElementById('players-list');
    list.innerHTML = state.players.map((p, i) => `
      <div class="player-item">
        <div class="player-dot" style="background:${p.color}"></div>
        <span class="player-token">${p.token}</span>
        <span class="player-name">${p.name}</span>
        ${p.id === state.hostId ? '<span class="player-host">HOST</span>' : ''}
      </div>
    `).join('');

    // Update settings display
    if (state.settings) {
      document.getElementById('set-cash').value = state.settings.startingCash;
      document.getElementById('set-cash-limit').value = state.settings.cashLimit ?? 0;
      document.getElementById('set-go').value = state.settings.goBonus;
      document.getElementById('set-vacation').checked = state.settings.vacationCashEnabled;
      document.getElementById('set-vacation-amt').value = state.settings.vacationCashStart;
      document.getElementById('set-jail-rent').checked = state.settings.collectRentInJail;
      document.getElementById('set-bail').value = state.settings.jailBailAmount;
    }
  }

  // Game started - redirect to game page
  if (state.started) {
    const activeRoomId = state.id || roomId;
    if (activeRoomId) {
      sessionStorage.setItem('roomId', activeRoomId);
      window.location.href = `/game.html?room=${activeRoomId}`;
    } else {
      showError('Could not resolve room id for game.');
    }
  }
});

// --- Error Handling ---
socket.on('error_message', (msg) => showError(msg));

function showError(msg) {
  const lobbyVisible = document.getElementById('lobby').style.display !== 'none';
  if (lobbyVisible) {
    const el = document.getElementById('error-msg');
    el.textContent = msg;
    el.style.display = 'block';
  } else {
    alert(msg);
  }
}

function hideError() {
  document.getElementById('error-msg').style.display = 'none';
}
