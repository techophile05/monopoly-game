// ============================================================
// MONOPOLY INDIA - Game Client
// ============================================================

const socket = io();
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');
const storedName = sessionStorage.getItem('playerName') || '';
const storedPlayerId = sessionStorage.getItem('playerId') || '';

const INR = '\u20B9';

let myId = null;
let gameState = null;
let boardBuilt = false;
let canRoll = false;
let pendingBuySpace = null;
let incomingTradeOffers = [];

let diceSpinTimer = null;
let diceSettleTimer = null;

if (!roomId) {
  alert('Missing room code. Returning to lobby.');
  window.location.href = '/';
}

bindChat(socket, roomId);

socket.emit('rejoin_room', { roomId, name: storedName, oldId: storedPlayerId }, (res) => {
  if (res?.error) {
    alert(`${res.error}. Returning to lobby.`);
    window.location.href = '/';
    return;
  }
  myId = res.playerId;
  sessionStorage.setItem('playerId', myId);
  syncRollAvailability();
});

// ----- Dice Rendering -----
function dieFaceMarkup() {
  return `
    <div class="die-face">
      <span class="pip p1"></span>
      <span class="pip p2"></span>
      <span class="pip p3"></span>
      <span class="pip p4"></span>
      <span class="pip p5"></span>
      <span class="pip p6"></span>
      <span class="pip p7"></span>
      <span class="pip p8"></span>
      <span class="pip p9"></span>
    </div>
  `;
}

function setDieValue(dieEl, value) {
  if (!dieEl.querySelector('.die-face')) {
    dieEl.innerHTML = dieFaceMarkup();
  }
  dieEl.dataset.value = String(value);
}

function randomDieValue() {
  return Math.floor(Math.random() * 6) + 1;
}

function startDiceSpin() {
  const die1 = document.getElementById('die1');
  const die2 = document.getElementById('die2');
  die1.classList.add('rolling');
  die2.classList.add('rolling');
  if (diceSpinTimer) return;
  diceSpinTimer = setInterval(() => {
    setDieValue(die1, randomDieValue());
    setDieValue(die2, randomDieValue());
  }, 85);
}

function stopDiceSpin() {
  if (diceSpinTimer) {
    clearInterval(diceSpinTimer);
    diceSpinTimer = null;
  }
  const die1 = document.getElementById('die1');
  const die2 = document.getElementById('die2');
  die1.classList.remove('rolling');
  die2.classList.remove('rolling');
}

function settleDice(d1, d2) {
  stopDiceSpin();
  const die1 = document.getElementById('die1');
  const die2 = document.getElementById('die2');
  setDieValue(die1, d1);
  setDieValue(die2, d2);
  die1.classList.add('result-pop');
  die2.classList.add('result-pop');
  if (diceSettleTimer) clearTimeout(diceSettleTimer);
  diceSettleTimer = setTimeout(() => {
    die1.classList.remove('result-pop');
    die2.classList.remove('result-pop');
    diceSettleTimer = null;
  }, 450);
}

function initDice() {
  setDieValue(document.getElementById('die1'), 1);
  setDieValue(document.getElementById('die2'), 1);
}

function syncRollAvailability() {
  const rollBtn = document.getElementById('btn-roll');
  if (!gameState || !myId) {
    canRoll = false;
    rollBtn.disabled = true;
    return;
  }

  const isMyTurn = gameState.currentPlayerId === myId;
  const canTakeTurn = isMyTurn && gameState.started && !gameState.winner;
  canRoll = canTakeTurn && !gameState.diceRolled;
  rollBtn.disabled = !canRoll;
}

// ----- UI Helpers -----
function formatMoney(value) {
  return `${INR}${value}`;
}

function getSpaceById(id) {
  return gameState?.board?.find(s => s.id === id);
}

function setTurnIndicator(text) {
  document.getElementById('turn-indicator').textContent = text || '';
}

function showToast(text) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function getPlayerById(id) {
  return gameState?.players?.find(p => p.id === id);
}

function renderTradeIncoming() {
  const container = document.getElementById('trade-incoming');
  if (!container) return;
  container.innerHTML = '';

  if (!incomingTradeOffers.length) {
    container.innerHTML = '<div class="trade-empty">No incoming trade offers.</div>';
    return;
  }

  incomingTradeOffers.forEach(offer => {
    const card = document.createElement('div');
    card.className = 'trade-offer-card';
    const offerNames = offer.offerPropertyIds
      .map(pid => getSpaceById(pid)?.name)
      .filter(Boolean)
      .join(', ') || 'None';
    const requestNames = offer.requestPropertyIds
      .map(pid => getSpaceById(pid)?.name)
      .filter(Boolean)
      .join(', ') || 'None';

    card.innerHTML = `
      <div class="trade-offer-head">${offer.fromPlayerName} offered:</div>
      <div class="trade-offer-line">Gives: ${offerNames}${offer.offerCash ? ` + ${formatMoney(offer.offerCash)}` : ''}</div>
      <div class="trade-offer-line">Wants: ${requestNames}${offer.requestCash ? ` + ${formatMoney(offer.requestCash)}` : ''}</div>
      <div class="trade-offer-actions">
        <button class="trade-accept">Accept</button>
        <button class="trade-reject">Reject</button>
      </div>
    `;

    card.querySelector('.trade-accept').addEventListener('click', () => {
      socket.emit('respond_trade', { roomId, tradeId: offer.tradeId, accept: true });
    });
    card.querySelector('.trade-reject').addEventListener('click', () => {
      socket.emit('respond_trade', { roomId, tradeId: offer.tradeId, accept: false });
    });
    container.appendChild(card);
  });
}

function renderTradeSelectorList(containerId, player) {
  const listEl = document.getElementById(containerId);
  if (!listEl) return;
  listEl.innerHTML = '';
  if (!player || player.bankrupt || !player.properties?.length) {
    listEl.innerHTML = '<div class="trade-empty">No properties</div>';
    return;
  }

  player.properties.forEach(pid => {
    const space = getSpaceById(pid);
    if (!space) return;
    const row = document.createElement('label');
    row.className = 'trade-check';
    row.innerHTML = `
      <input type="checkbox" value="${pid}" />
      <span>${space.name}</span>
    `;
    listEl.appendChild(row);
  });
}

function updateTradePanel() {
  const targetSelect = document.getElementById('trade-target');
  if (!targetSelect || !gameState || !myId) return;

  const currentTarget = targetSelect.value;
  const others = gameState.players.filter(p => p.id !== myId && !p.bankrupt);

  targetSelect.innerHTML = others.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  if (!others.length) {
    renderTradeSelectorList('trade-offer-list', null);
    renderTradeSelectorList('trade-request-list', null);
    renderTradeIncoming();
    return;
  }

  if (currentTarget && others.some(p => p.id === currentTarget)) {
    targetSelect.value = currentTarget;
  }

  const me = getPlayerById(myId);
  const target = getPlayerById(targetSelect.value || others[0].id);
  renderTradeSelectorList('trade-offer-list', me);
  renderTradeSelectorList('trade-request-list', target);
  renderTradeIncoming();
}

function updateSideActions() {
  const side = document.getElementById('side-actions');
  if (!side) return;
  side.innerHTML = '';

  const me = getPlayerById(myId);
  if (!me || me.bankrupt || gameState?.winner) return;

  const resignBtn = document.createElement('button');
  resignBtn.className = 'btn-side btn-resign-side';
  resignBtn.textContent = 'Resign';
  resignBtn.addEventListener('click', () => {
    const ok = window.confirm('Resign and go bankrupt? This cannot be undone.');
    if (!ok) return;
    socket.emit('resign_game', { roomId });
  });
  side.appendChild(resignBtn);
}

function openPropertyModal(spaceId) {
  if (!gameState) return;
  const space = getSpaceById(spaceId);
  if (!space) return;

  const modal = document.getElementById('prop-modal');
  const ownerId = gameState.properties[spaceId]?.owner;
  const owner = gameState.players.find(p => p.id === ownerId);
  const prop = gameState.properties[spaceId];
  const isOwner = ownerId === myId;

  if (window.renderPropertyModalReact) {
    window.renderPropertyModalReact({
      space,
      owner,
      prop,
      isOwner,
      color: COLOR_HEX[space.color] || '#9ca3af',
      onClose: () => {
        modal.classList.remove('show');
        if (window.clearPropertyModalReact) window.clearPropertyModalReact();
      },
      onUpgrade: () => socket.emit('build_house', { roomId, spaceId }),
      onDowngrade: () => socket.emit('sell_house', { roomId, spaceId }),
      onMortgage: () => socket.emit('mortgage_property', { roomId, spaceId }),
      onUnmortgage: () => socket.emit('unmortgage_property', { roomId, spaceId }),
    });
  }

  modal.classList.add('show');
}

function updatePlayersPanel() {
  const panel = document.getElementById('players-panel');
  panel.innerHTML = '';

  gameState.players.forEach(player => {
    const card = document.createElement('div');
    card.className = 'player-card';
    if (player.bankrupt) card.classList.add('bankrupt');
    if (gameState.currentPlayerId === player.id) card.classList.add('active-turn');

    const youBadge = player.id === myId ? '<span class="you-badge">YOU</span>' : '';
    const jailBadge = player.inJail ? '<span class="jail-badge">JAIL</span>' : '';
    const cardBadge = player.jailFreeCards > 0
      ? `<span class="card-badge">PARDON x${player.jailFreeCards}</span>`
      : '';

    card.innerHTML = `
      <div class="player-header">
        <span class="player-token">${player.token}</span>
        <span class="player-name">${player.name}</span>
        ${youBadge}
      </div>
      <div class="player-cash">${formatMoney(player.cash)}</div>
      <div class="player-status">${jailBadge}${cardBadge}</div>
      <div class="player-props">
        ${player.properties.map(pid => {
          const space = getSpaceById(pid);
          const hex = space ? (COLOR_HEX[space.color] || '#999') : '#999';
          return space ? `<div class="prop-dot" style="background:${hex}"></div>` : '';
        }).join('')}
      </div>
    `;
    panel.appendChild(card);
  });
}

function updateMyProperties() {
  const list = document.getElementById('my-props-list');
  list.innerHTML = '';
  const me = gameState.players.find(p => p.id === myId);
  if (!me) return;

  me.properties.forEach(pid => {
    const space = getSpaceById(pid);
    if (!space) return;
    const prop = gameState.properties[pid];

    const item = document.createElement('div');
    item.className = 'my-prop-item';
    const housesText = prop?.houses === 5 ? 'Hotel' : (prop?.houses ? `${prop.houses}H` : '');
    const mortgagedText = prop?.mortgaged ? 'Mortgaged' : '';

    item.innerHTML = `
      <span class="prop-color-sq" style="background:${COLOR_HEX[space.color] || '#999'}"></span>
      <span class="prop-name-text">${space.name}</span>
      <span class="prop-houses-text">${housesText}</span>
      <span class="prop-mortgaged-text">${mortgagedText}</span>
    `;
    item.addEventListener('click', () => openPropertyModal(pid));
    list.appendChild(item);
  });
}

function updatePool() {
  document.getElementById('pool-amount').textContent = formatMoney(gameState.freeParkingPool || 0);
}

function updateActionButtons() {
  const wrap = document.getElementById('action-buttons');
  wrap.innerHTML = '';

  const me = gameState.players.find(p => p.id === myId);
  const isMyTurn = gameState.currentPlayerId === myId;

  if (isMyTurn && me && me.inJail) {
    const bailBtn = document.createElement('button');
    bailBtn.className = 'btn-action btn-bail';
    bailBtn.textContent = 'Pay Bail';
    bailBtn.addEventListener('click', () => socket.emit('pay_bail', { roomId }));
    wrap.appendChild(bailBtn);

    if (me.jailFreeCards > 0) {
      const cardBtn = document.createElement('button');
      cardBtn.className = 'btn-action btn-jail-card';
      cardBtn.textContent = 'Use Pardon';
      cardBtn.addEventListener('click', () => socket.emit('use_pardon_card', { roomId }));
      wrap.appendChild(cardBtn);
    }
  }

  if (pendingBuySpace != null && isMyTurn) {
    const buyBtn = document.createElement('button');
    buyBtn.className = 'btn-action btn-buy';
    buyBtn.textContent = 'Buy';
    buyBtn.addEventListener('click', () => {
      socket.emit('buy_property', { roomId, spaceId: pendingBuySpace });
      pendingBuySpace = null;
      updateActionButtons();
    });

    const skipBtn = document.createElement('button');
    skipBtn.className = 'btn-action btn-skip';
    skipBtn.textContent = 'Skip';
    skipBtn.addEventListener('click', () => {
      socket.emit('skip_buy', { roomId });
      pendingBuySpace = null;
      updateActionButtons();
    });

    wrap.appendChild(buyBtn);
    wrap.appendChild(skipBtn);
  }

  if (isMyTurn && gameState?.turnCanEnd && pendingBuySpace == null) {
    const endTurnBtn = document.createElement('button');
    endTurnBtn.className = 'btn-action btn-end-turn';
    endTurnBtn.textContent = 'End Turn';
    endTurnBtn.addEventListener('click', () => {
      socket.emit('end_turn', { roomId });
    });
    wrap.appendChild(endTurnBtn);
  }
}

function showCard(action) {
  const area = document.getElementById('card-display-area');
  area.innerHTML = '';
  if (!action?.card) return;

  const el = document.createElement('div');
  el.className = `card-display ${action.cardType}`;
  el.innerHTML = `
    <div class="card-type-label">${action.cardType}</div>
    <div class="card-text">${action.card.text}</div>
  `;
  area.appendChild(el);
  setTimeout(() => { area.innerHTML = ''; }, 3500);
}

// ----- Socket Events -----
socket.on('game_state', (state) => {
  gameState = state;
  pendingBuySpace = state.pendingBuySpace ?? null;

  if (!boardBuilt && state.board) {
    buildBoard(state.board);
    boardBuilt = true;
  }

  updateBoardProperties(state.properties, state.board, state.players);
  updateTokens(state.players);
  updatePlayersPanel();
  updateMyProperties();
  updatePool();
  updateSideActions();
  updateTradePanel();
  syncRollAvailability();
  updateActionButtons();

  if (state.currentPlayerId) {
    const current = state.players.find(p => p.id === state.currentPlayerId);
    if (current) {
      setTurnIndicator(`${current.name}'s turn`);
    }
  }
});

socket.on('turn_start', ({ playerId }) => {
  canRoll = playerId === myId;
  if (canRoll) {
    pendingBuySpace = null;
  }
  syncRollAvailability();
  updateTradePanel();
  updateActionButtons();
});

socket.on('dice_result', ({ d1, d2 }) => {
  canRoll = false;
  document.getElementById('btn-roll').disabled = true;
  startDiceSpin();
  setTimeout(() => settleDice(d1, d2), 340);
});

socket.on('player_moved', ({ playerId }) => {
  animateTokenMove(playerId);
});

socket.on('land_result', ({ playerId: landerId, actions }) => {
  pendingBuySpace = null;
  actions.forEach(action => {
    switch (action.type) {
      case 'buy_option':
        pendingBuySpace = action.spaceId;
        break;
      case 'card':
        showCard(action);
        break;
      case 'no_rent_jail':
        showToast(`${action.owner} is in jail. No rent collected.`);
        break;
      case 'pay_rent':
        if (landerId === myId) {
          showToast(`You paid ${formatMoney(action.amount)} rent to ${action.toName}.`);
        } else if (action.to === myId) {
          const payer = gameState?.players.find(p => p.id === landerId);
          showToast(`${payer?.name || 'Player'} paid you ${formatMoney(action.amount)} rent.`);
        }
        break;
      case 'tax':
        if (landerId === myId) {
          showToast(`You paid ${formatMoney(action.amount)} in tax.`);
        }
        break;
      case 'go_to_jail':
        if (landerId === myId) {
          showToast('Go to Jail.');
        }
        break;
      case 'free_parking':
        if (landerId === myId) {
          showToast(`Free Parking. You collected ${formatMoney(action.amount)}.`);
        }
        break;
      case 'vacation_cash':
        if (landerId === myId) {
          showToast(`Vacation bonus: +${formatMoney(action.amount)}`);
        }
        break;
    }
  });
  updateActionButtons();
});

socket.on('property_bought', ({ playerName, spaceName, price }) => {
  addLogMessage(`${playerName} bought ${spaceName} for ${formatMoney(price)}.`);
});

socket.on('system_message', (msg) => {
  addSystemMessage(msg);
  addLogMessage(msg);
});

socket.on('error_message', (msg) => {
  showToast(msg);
});

socket.on('chat_message', (msg) => {
  addChatMessage(msg);
});

socket.on('trade_offer', (offer) => {
  incomingTradeOffers = incomingTradeOffers.filter(o => o.tradeId !== offer.tradeId);
  incomingTradeOffers.push(offer);
  showToast(`Trade offer from ${offer.fromPlayerName}`);
  updateTradePanel();
});

socket.on('trade_offer_sent', ({ toPlayerName }) => {
  showToast(`Trade offer sent to ${toPlayerName}.`);
});

socket.on('trade_result', ({ tradeId, accepted, reason }) => {
  incomingTradeOffers = incomingTradeOffers.filter(o => o.tradeId !== tradeId);
  if (accepted) {
    showToast('Trade completed.');
  } else if (reason === 'declined') {
    showToast('Trade declined.');
  } else {
    showToast('Trade failed due to changed state.');
  }
  updateTradePanel();
});

socket.on('game_over', ({ winnerName }) => {
  const overlay = document.getElementById('game-over');
  document.getElementById('winner-name').textContent = winnerName;
  overlay.classList.add('show');
});

// ----- Button Handlers -----
document.getElementById('btn-roll').addEventListener('click', () => {
  if (!canRoll) return;
  canRoll = false;
  document.getElementById('btn-roll').disabled = true;
  startDiceSpin();
  socket.emit('roll_dice', { roomId });
});

document.getElementById('trade-target').addEventListener('change', () => {
  updateTradePanel();
});

document.getElementById('btn-send-trade').addEventListener('click', () => {
  if (!gameState || !myId) return;
  const targetId = document.getElementById('trade-target').value;
  if (!targetId) {
    showToast('Select a player to trade with.');
    return;
  }

  const offerPropertyIds = Array.from(document.querySelectorAll('#trade-offer-list input[type="checkbox"]:checked'))
    .map(el => Number(el.value));
  const requestPropertyIds = Array.from(document.querySelectorAll('#trade-request-list input[type="checkbox"]:checked'))
    .map(el => Number(el.value));
  const offerCash = parseInt(document.getElementById('trade-cash-offer').value, 10) || 0;
  const requestCash = parseInt(document.getElementById('trade-cash-request').value, 10) || 0;

  socket.emit('propose_trade', {
    roomId,
    toPlayerId: targetId,
    offerPropertyIds,
    requestPropertyIds,
    offerCash,
    requestCash,
  });
});

document.getElementById('board').addEventListener('click', (e) => {
  const cell = e.target.closest('[data-space-id]');
  if (!cell || !gameState) return;
  const spaceId = parseInt(cell.dataset.spaceId, 10);
  openPropertyModal(spaceId);
});

document.getElementById('prop-modal').addEventListener('click', (e) => {
  if (e.target.id === 'prop-modal') {
    document.getElementById('prop-modal').classList.remove('show');
    if (window.clearPropertyModalReact) window.clearPropertyModalReact();
  }
});

initDice();
