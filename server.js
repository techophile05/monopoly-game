// ============================================================
// MONOPOLY INDIA - Server
// ============================================================
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const {
  BOARD_SPACES, CHANCE_CARDS, KARMA_CARDS,
  PLAYER_COLORS, PLAYER_TOKENS, DEFAULT_SETTINGS
} = require('./game-data');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// ---- In-Memory State ----
const rooms = new Map();

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(id) ? generateRoomId() : id;
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function adjustCash(room, player, delta) {
  player.cash += delta;
  const limit = room.settings.cashLimit;
  if (limit && limit > 0 && player.cash > limit) {
    player.cash = limit;
  }
}

function createRoom(hostName) {
  const roomId = generateRoomId();
  const room = {
    id: roomId,
    host: null, // set when socket joins
    settings: { ...DEFAULT_SETTINGS },
    players: [],
    started: false,
    currentTurn: 0,
    diceRolled: false,
    doublesCount: 0,
    lastRollWasDoubles: false,
    turnCanEnd: false,
    pendingBuySpace: null,
    tradeOffers: new Map(),
    properties: {}, // spaceId -> { owner, houses, mortgaged }
    chanceDeck: shuffleArray(CHANCE_CARDS),
    karmaDeck: shuffleArray(KARMA_CARDS),
    chanceIdx: 0,
    karmaIdx: 0,
    freeParkingPool: 0,
    winner: null,
    log: [],
  };
  rooms.set(roomId, room);
  return room;
}

function addPlayer(room, socketId, name) {
  const idx = room.players.length;
  const player = {
    id: socketId,
    name: name || `Player ${idx + 1}`,
    color: PLAYER_COLORS[idx] || '#999',
    token: PLAYER_TOKENS[idx] || '⭐',
    position: 0,
    cash: room.settings.cashLimit && room.settings.cashLimit > 0
      ? Math.min(room.settings.startingCash, room.settings.cashLimit)
      : room.settings.startingCash,
    properties: [],
    inJail: false,
    jailTurns: 0,
    jailFreeCards: 0,
    bankrupt: false,
    hasRolled: false,
  };
  room.players.push(player);
  return player;
}

function getPlayer(room, socketId) {
  return room.players.find(p => p.id === socketId);
}

function getCurrentPlayer(room) {
  const active = room.players.filter(p => !p.bankrupt);
  return active[room.currentTurn % active.length];
}

function nextTurn(room) {
  room.diceRolled = false;
  room.doublesCount = 0;
  room.lastRollWasDoubles = false;
  room.turnCanEnd = false;
  room.pendingBuySpace = null;
  const active = room.players.filter(p => !p.bankrupt);
  if (active.length <= 1) {
    room.winner = active[0]?.id || null;
    return;
  }
  room.currentTurn = (room.currentTurn + 1) % active.length;
}

function bankruptPlayer(room, player) {
  if (!player || player.bankrupt) return;
  player.bankrupt = true;
  player.properties.forEach(pid => { delete room.properties[pid]; });
  player.properties = [];
}

function movePropertyBetweenPlayers(room, propertyId, fromPlayer, toPlayer) {
  const prop = room.properties[propertyId];
  if (!prop) return false;
  if (prop.owner !== fromPlayer.id) return false;
  prop.owner = toPlayer.id;
  fromPlayer.properties = fromPlayer.properties.filter(pid => pid !== propertyId);
  if (!toPlayer.properties.includes(propertyId)) {
    toPlayer.properties.push(propertyId);
  }
  return true;
}

function clearPlayerTradeOffers(room, playerId) {
  if (!room?.tradeOffers) return;
  const removeIds = [];
  room.tradeOffers.forEach((offer, tradeId) => {
    if (offer.fromPlayerId === playerId || offer.toPlayerId === playerId) {
      removeIds.push(tradeId);
    }
  });
  removeIds.forEach(id => room.tradeOffers.delete(id));
}

function rollDice() {
  return [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)];
}

function getPropertiesInGroup(room, group) {
  return BOARD_SPACES.filter(s => s.group === group).map(s => s.id);
}

function ownsFullGroup(room, playerId, group) {
  const groupSpaces = getPropertiesInGroup(room, group);
  return groupSpaces.every(id => room.properties[id]?.owner === playerId);
}

function countOwnedInGroup(room, playerId, group) {
  const groupSpaces = getPropertiesInGroup(room, group);
  return groupSpaces.filter(id => room.properties[id]?.owner === playerId).length;
}

function calculateRent(room, space, diceTotal) {
  const prop = room.properties[space.id];
  if (!prop || prop.mortgaged) return 0;

  if (space.type === 'railroad') {
    const owned = countOwnedInGroup(room, prop.owner, 'railroad');
    return 25 * Math.pow(2, owned - 1);
  }

  if (space.type === 'utility') {
    const owned = countOwnedInGroup(room, prop.owner, 'utility');
    return owned === 1 ? diceTotal * 4 : diceTotal * 10;
  }

  // Property
  if (prop.houses === 0 && ownsFullGroup(room, prop.owner, space.group)) {
    return space.rent[0] * 2; // double rent for full group, no houses
  }
  return space.rent[prop.houses] || space.rent[0];
}

function drawCard(room, type) {
  if (type === 'chance') {
    const card = room.chanceDeck[room.chanceIdx % room.chanceDeck.length];
    room.chanceIdx++;
    return card;
  } else {
    const card = room.karmaDeck[room.karmaIdx % room.karmaDeck.length];
    room.karmaIdx++;
    return card;
  }
}

function applyCard(room, player, card) {
  const results = { card, movements: [], payments: [] };

  switch (card.action) {
    case 'collect':
      adjustCash(room, player, card.value);
      results.payments.push({ to: player.id, amount: card.value });
      break;
    case 'pay':
      adjustCash(room, player, -card.value);
      if (room.settings.freeParkingPool) room.freeParkingPool += card.value;
      results.payments.push({ from: player.id, amount: card.value });
      break;
    case 'moveto': {
      const oldPos = player.position;
      player.position = card.value;
      if (card.value < oldPos && card.value !== 10) {
        adjustCash(room, player, room.settings.goBonus);
        results.payments.push({ to: player.id, amount: room.settings.goBonus, reason: 'GO' });
      }
      results.movements.push({ player: player.id, to: card.value });
      break;
    }
    case 'moveback':
      player.position = (player.position - card.value + 40) % 40;
      results.movements.push({ player: player.id, to: player.position });
      break;
    case 'gotojail':
      player.position = 10;
      player.inJail = true;
      player.jailTurns = 0;
      results.movements.push({ player: player.id, to: 10 });
      break;
    case 'jailfree':
      player.jailFreeCards++;
      break;
    case 'payeach': {
      const active = room.players.filter(p => !p.bankrupt && p.id !== player.id);
      const total = active.length * card.value;
      adjustCash(room, player, -total);
      active.forEach(p => { adjustCash(room, p, card.value); });
      results.payments.push({ from: player.id, amount: total, reason: 'payeach' });
      break;
    }
    case 'repair': {
      let cost = 0;
      player.properties.forEach(pid => {
        const prop = room.properties[pid];
        if (prop) {
          if (prop.houses === 5) cost += card.hotelRate;
          else cost += prop.houses * card.houseRate;
        }
      });
      adjustCash(room, player, -cost);
      if (room.settings.freeParkingPool) room.freeParkingPool += cost;
      results.payments.push({ from: player.id, amount: cost });
      break;
    }
  }

  if (player.cash < 0) {
    player.bankrupt = true;
    // Return properties
    player.properties.forEach(pid => { delete room.properties[pid]; });
    player.properties = [];
  }

  return results;
}

function handleLanding(room, player, diceTotal) {
  const space = BOARD_SPACES[player.position];
  const result = { space, actions: [] };

  switch (space.type) {
    case 'go':
      break; // bonus already collected during move

    case 'property':
    case 'railroad':
    case 'utility': {
      const prop = room.properties[space.id];
      if (!prop) {
        result.actions.push({ type: 'buy_option', spaceId: space.id, price: space.price });
      } else if (prop.owner !== player.id && !prop.mortgaged) {
        const owner = room.players.find(p => p.id === prop.owner);
        if (owner && !owner.bankrupt) {
          // Check jail rent rule
          if (owner.inJail && !room.settings.collectRentInJail) {
            result.actions.push({ type: 'no_rent_jail', owner: owner.name });
          } else {
            const rentAmount = calculateRent(room, space, diceTotal);
            adjustCash(room, player, -rentAmount);
            adjustCash(room, owner, rentAmount);
            result.actions.push({ type: 'pay_rent', to: owner.id, toName: owner.name, amount: rentAmount });
            if (player.cash < 0) {
              player.bankrupt = true;
              player.properties.forEach(pid => {
                room.properties[pid].owner = owner.id;
                owner.properties.push(pid);
              });
              player.properties = [];
            }
          }
        }
      }
      break;
    }

    case 'tax': {
      adjustCash(room, player, -space.amount);
      if (room.settings.freeParkingPool) room.freeParkingPool += space.amount;
      result.actions.push({ type: 'tax', amount: space.amount });
      if (player.cash < 0) {
        player.bankrupt = true;
        player.properties.forEach(pid => { delete room.properties[pid]; });
        player.properties = [];
      }
      break;
    }

    case 'chance':
    case 'karma': {
      const card = drawCard(room, space.type);
      const cardResult = applyCard(room, player, card);
      result.actions.push({ type: 'card', cardType: space.type, ...cardResult });
      // If moved by card, handle new landing
      if (card.action === 'moveto' || card.action === 'moveback') {
        const newLanding = handleLanding(room, player, diceTotal);
        result.actions.push(...newLanding.actions);
      }
      break;
    }

    case 'gotojail':
      player.position = 10;
      player.inJail = true;
      player.jailTurns = 0;
      result.actions.push({ type: 'go_to_jail' });
      break;

    case 'freeparking':
      if (room.settings.freeParkingPool && room.freeParkingPool > 0) {
        adjustCash(room, player, room.freeParkingPool);
        result.actions.push({ type: 'free_parking', amount: room.freeParkingPool });
        room.freeParkingPool = 0;
      }
      if (room.settings.vacationCashEnabled) {
        adjustCash(room, player, room.settings.vacationCashStart);
        result.actions.push({ type: 'vacation_cash', amount: room.settings.vacationCashStart });
      }
      break;

    case 'jail':
      // Just visiting
      break;
  }

  return result;
}

function getGameState(room) {
  return {
    id: room.id,
    hostId: room.host,
    started: room.started,
    settings: room.settings,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      token: p.token,
      position: p.position,
      cash: p.cash,
      properties: p.properties,
      inJail: p.inJail,
      jailTurns: p.jailTurns,
      jailFreeCards: p.jailFreeCards,
      bankrupt: p.bankrupt,
    })),
    currentTurn: room.currentTurn,
    currentPlayerId: getCurrentPlayer(room)?.id,
    diceRolled: room.diceRolled,
    turnCanEnd: room.turnCanEnd,
    pendingBuySpace: room.pendingBuySpace,
    properties: room.properties,
    freeParkingPool: room.freeParkingPool,
    winner: room.winner,
    board: BOARD_SPACES,
  };
}

// ---- Socket.IO Events ----
io.on('connection', (socket) => {

  // Create room
  socket.on('create_room', ({ name }, cb) => {
    const room = createRoom();
    const player = addPlayer(room, socket.id, name);
    room.host = socket.id;
    socket.join(room.id);
    cb({ roomId: room.id, playerId: socket.id });
    io.to(room.id).emit('game_state', getGameState(room));
    io.to(room.id).emit('system_message', `${player.name} created the room.`);
  });

  // Join room
  socket.on('join_room', ({ roomId, name }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb({ error: 'Room not found' });
    if (room.started) return cb({ error: 'Game already started' });
    if (room.players.length >= room.settings.maxPlayers) return cb({ error: 'Room is full' });
    if (room.players.find(p => p.id === socket.id)) return cb({ error: 'Already in room' });

    const player = addPlayer(room, socket.id, name);
    socket.join(room.id);
    cb({ roomId: room.id, playerId: socket.id });
    io.to(room.id).emit('game_state', getGameState(room));
    io.to(room.id).emit('system_message', `${player.name} joined the game!`);
  });

  // Update settings (host only)
  socket.on('update_settings', ({ roomId, settings }) => {
    const room = rooms.get(roomId);
    if (!room || room.host !== socket.id || room.started) return;
    Object.assign(room.settings, settings);
    // Update starting cash for all players
    room.players.forEach(p => { p.cash = room.settings.startingCash; });
    if (room.settings.cashLimit && room.settings.cashLimit > 0) {
      room.players.forEach(p => {
        if (p.cash > room.settings.cashLimit) p.cash = room.settings.cashLimit;
      });
    }
    if (room.settings.freeParkingPool) {
      room.freeParkingPool = 0;
    }
    io.to(room.id).emit('game_state', getGameState(room));
    io.to(room.id).emit('system_message', 'Game settings updated.');
  });

  // Start game (host only)
  socket.on('start_game', ({ roomId }, cb) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error_message', 'Room not found.');
      cb && cb({ error: 'Room not found.' });
      return;
    }
    if (room.started) {
      socket.emit('error_message', 'Game already started.');
      cb && cb({ error: 'Game already started.' });
      return;
    }
    if (room.host !== socket.id) {
      socket.emit('error_message', 'Only the host can start the game.');
      cb && cb({ error: 'Only the host can start the game.' });
      return;
    }
    if (room.players.length < 2) {
      socket.emit('error_message', 'Need at least 2 players to start.');
      cb && cb({ error: 'Need at least 2 players to start.' });
      return;
    }
    room.players = shuffleArray(room.players);
    room.started = true;
    room.currentTurn = 0;
    room.diceRolled = false;
    room.lastRollWasDoubles = false;
    room.turnCanEnd = false;
    room.pendingBuySpace = null;
    if (room.settings.vacationCashEnabled) {
      room.freeParkingPool = room.settings.vacationCashStart;
    }
    io.to(room.id).emit('game_state', getGameState(room));
    io.to(room.id).emit('system_message', 'Turn order randomized.');
    io.to(room.id).emit('system_message', 'Game started! ' + getCurrentPlayer(room).name + ' goes first.');
    io.to(room.id).emit('turn_start', { playerId: getCurrentPlayer(room).id });
    cb && cb({ ok: true });
  });

  // Roll dice
  socket.on('roll_dice', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.started || room.winner) return;
    const current = getCurrentPlayer(room);
    if (!current || current.id !== socket.id) return;
    if (room.diceRolled) return;

    const [d1, d2] = rollDice();
    const isDoubles = d1 === d2;
    const total = d1 + d2;
    room.diceRolled = true;
    room.lastRollWasDoubles = isDoubles;
    room.turnCanEnd = false;
    room.pendingBuySpace = null;

    io.to(room.id).emit('dice_result', { d1, d2, playerId: socket.id });

    // Jail logic
    if (current.inJail) {
      current.jailTurns++;
      if (isDoubles) {
        current.inJail = false;
        current.jailTurns = 0;
        io.to(room.id).emit('system_message', `${current.name} rolled doubles and is free from jail!`);
      } else if (current.jailTurns >= 3) {
        current.inJail = false;
        current.jailTurns = 0;
        adjustCash(room, current, -room.settings.jailBailAmount);
        io.to(room.id).emit('system_message', `${current.name} paid ₹${room.settings.jailBailAmount} bail after 3 turns.`);
      } else {
        io.to(room.id).emit('system_message', `${current.name} is stuck in jail. (${current.jailTurns}/3 turns)`);
        nextTurn(room);
        io.to(room.id).emit('game_state', getGameState(room));
        const next = getCurrentPlayer(room);
        if (next) io.to(room.id).emit('turn_start', { playerId: next.id });
        return;
      }
    }

    // Doubles logic
    if (isDoubles) {
      room.doublesCount++;
      if (room.doublesCount >= 3) {
        current.position = 10;
        current.inJail = true;
        current.jailTurns = 0;
        io.to(room.id).emit('system_message', `${current.name} rolled 3 doubles in a row — go to jail!`);
        nextTurn(room);
        io.to(room.id).emit('game_state', getGameState(room));
        const next = getCurrentPlayer(room);
        if (next) io.to(room.id).emit('turn_start', { playerId: next.id });
        return;
      }
    }

    // Move player
    const oldPos = current.position;
    current.position = (current.position + total) % 40;

    // Pass GO
    if (current.position < oldPos && current.position !== 10) {
      adjustCash(room, current, room.settings.goBonus);
      io.to(room.id).emit('system_message', `${current.name} passed GO! Collected ₹${room.settings.goBonus}.`);
    }

    io.to(room.id).emit('player_moved', {
      playerId: socket.id,
      from: oldPos,
      to: current.position,
      dice: total
    });

    // Handle landing
    const landResult = handleLanding(room, current, total);
    const hasBuyOption = landResult.actions.some(a => a.type === 'buy_option');
    room.pendingBuySpace = hasBuyOption
      ? landResult.actions.find(a => a.type === 'buy_option')?.spaceId ?? null
      : null;

    if (!hasBuyOption) {
      if (isDoubles && !current.inJail) {
        room.diceRolled = false;
        room.turnCanEnd = false;
        room.pendingBuySpace = null;
        io.to(room.id).emit('system_message', `${current.name} rolled doubles! Roll again.`);
      } else {
        room.turnCanEnd = true;
        io.to(room.id).emit('system_message', `${current.name}, click End Turn.`);
      }
    }

    io.to(room.id).emit('land_result', {
      playerId: socket.id,
      space: landResult.space,
      actions: landResult.actions
    });

    io.to(room.id).emit('game_state', getGameState(room));

    // Check winner
    const active = room.players.filter(p => !p.bankrupt);
    if (active.length === 1) {
      room.winner = active[0].id;
      io.to(room.id).emit('game_over', { winnerId: active[0].id, winnerName: active[0].name });
      return;
    }

    if (!hasBuyOption && isDoubles && !current.inJail) {
      io.to(room.id).emit('turn_start', { playerId: current.id });
    }
  });

  // Buy property
  socket.on('buy_property', ({ roomId, spaceId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.started) return;
    const current = getCurrentPlayer(room);
    if (!current || current.id !== socket.id) return;
    if (room.pendingBuySpace !== spaceId) return;

    const space = BOARD_SPACES[spaceId];
    if (!space || room.properties[spaceId]) return;
    if (current.cash < space.price) {
      socket.emit('error_message', 'Not enough cash!');
      return;
    }

    adjustCash(room, current, -space.price);
    current.properties.push(spaceId);
    room.properties[spaceId] = { owner: socket.id, houses: 0, mortgaged: false };

    io.to(room.id).emit('property_bought', {
      playerId: socket.id,
      playerName: current.name,
      spaceId,
      spaceName: space.name,
      price: space.price
    });
    io.to(room.id).emit('system_message', `${current.name} bought ${space.name} for ₹${space.price}.`);
    io.to(room.id).emit('game_state', getGameState(room));

    room.pendingBuySpace = null;
    if (room.lastRollWasDoubles && !current.inJail) {
      room.diceRolled = false;
      room.turnCanEnd = false;
      io.to(room.id).emit('game_state', getGameState(room));
      io.to(room.id).emit('system_message', `${current.name} rolled doubles! Roll again.`);
      io.to(room.id).emit('turn_start', { playerId: current.id });
    } else {
      room.turnCanEnd = true;
      io.to(room.id).emit('game_state', getGameState(room));
      io.to(room.id).emit('system_message', `${current.name}, click End Turn.`);
    }
  });

  // Skip buying (pass)
  socket.on('skip_buy', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.started) return;
    const current = getCurrentPlayer(room);
    if (!current || current.id !== socket.id) return;
    if (room.pendingBuySpace == null) return;

    io.to(room.id).emit('system_message', `${current.name} decided not to buy.`);
    room.pendingBuySpace = null;
    if (room.lastRollWasDoubles && !current.inJail) {
      room.diceRolled = false;
      room.turnCanEnd = false;
      io.to(room.id).emit('game_state', getGameState(room));
      io.to(room.id).emit('turn_start', { playerId: current.id });
    } else {
      room.turnCanEnd = true;
      io.to(room.id).emit('game_state', getGameState(room));
      io.to(room.id).emit('system_message', `${current.name}, click End Turn.`);
    }
  });

  // End turn (manual)
  socket.on('end_turn', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.started || room.winner) return;
    const current = getCurrentPlayer(room);
    if (!current || current.id !== socket.id) return;
    if (!room.turnCanEnd) return;

    nextTurn(room);
    io.to(room.id).emit('game_state', getGameState(room));
    const next = getCurrentPlayer(room);
    if (next) io.to(room.id).emit('turn_start', { playerId: next.id });
  });

  // Build house
  socket.on('build_house', ({ roomId, spaceId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.started) return;
    const player = getPlayer(room, socket.id);
    if (!player) return;

    const space = BOARD_SPACES[spaceId];
    const prop = room.properties[spaceId];
    if (!prop || prop.owner !== socket.id || prop.mortgaged) return;
    if (space.type !== 'property') return;
    if (!ownsFullGroup(room, socket.id, space.group)) {
      socket.emit('error_message', 'You need to own all properties in this color group first.');
      return;
    }

    const groupSpaceIds = getPropertiesInGroup(room, space.group);
    const groupProps = groupSpaceIds.map(id => room.properties[id]).filter(Boolean);
    if (groupProps.length !== groupSpaceIds.length) {
      socket.emit('error_message', 'You need to own all properties in this color group first.');
      return;
    }
    if (groupProps.some(p => p.mortgaged)) {
      socket.emit('error_message', 'Cannot build while any property in this color group is mortgaged.');
      return;
    }

    // Monopoly even-building rule: build only on properties with minimum buildings in the set.
    const minBuildingsInGroup = Math.min(...groupProps.map(p => p.houses));
    if (prop.houses > minBuildingsInGroup) {
      socket.emit('error_message', 'Build evenly across the color group first.');
      return;
    }

    if (prop.houses >= 5) {
      socket.emit('error_message', 'Maximum buildings reached (hotel).');
      return;
    }
    if (player.cash < space.houseCost) {
      socket.emit('error_message', 'Not enough cash to build.');
      return;
    }

    adjustCash(room, player, -space.houseCost);
    prop.houses++;
    const buildingName = prop.houses === 5 ? 'a hotel' : `house #${prop.houses}`;
    io.to(room.id).emit('system_message', `${player.name} built ${buildingName} on ${space.name} for ₹${space.houseCost}.`);
    io.to(room.id).emit('game_state', getGameState(room));
  });

  // Sell house / hotel (downgrade)
  socket.on('sell_house', ({ roomId, spaceId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.started) return;
    const player = getPlayer(room, socket.id);
    if (!player) return;

    const space = BOARD_SPACES[spaceId];
    const prop = room.properties[spaceId];
    if (!space || !prop || prop.owner !== socket.id) return;
    if (space.type !== 'property') return;
    if (prop.houses <= 0) {
      socket.emit('error_message', 'No houses/hotel to downgrade.');
      return;
    }

    if (ownsFullGroup(room, socket.id, space.group)) {
      const groupSpaceIds = getPropertiesInGroup(room, space.group);
      const groupProps = groupSpaceIds.map(id => room.properties[id]).filter(Boolean);

      // Monopoly even-selling rule: sell only from properties with maximum buildings in the set.
      const maxBuildingsInGroup = Math.max(...groupProps.map(p => p.houses));
      if (prop.houses < maxBuildingsInGroup) {
        socket.emit('error_message', 'Downgrade evenly across the color group first.');
        return;
      }
    }

    prop.houses--;
    const refund = Math.floor(space.houseCost / 2);
    adjustCash(room, player, refund);
    const soldName = prop.houses === 4 ? 'a hotel' : 'a house';
    io.to(room.id).emit('system_message', `${player.name} downgraded ${soldName} on ${space.name} and received ₹${refund}.`);
    io.to(room.id).emit('game_state', getGameState(room));
  });

  // Mortgage property
  socket.on('mortgage_property', ({ roomId, spaceId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.started) return;
    const player = getPlayer(room, socket.id);
    if (!player) return;

    const space = BOARD_SPACES[spaceId];
    const prop = room.properties[spaceId];
    if (!prop || prop.owner !== socket.id || prop.mortgaged) return;
    if (prop.houses > 0) {
      socket.emit('error_message', 'Sell all houses first before mortgaging.');
      return;
    }

    prop.mortgaged = true;
    const mortgageValue = Math.floor(space.price / 2);
    adjustCash(room, player, mortgageValue);
    io.to(room.id).emit('system_message', `${player.name} mortgaged ${space.name} for ₹${mortgageValue}.`);
    io.to(room.id).emit('game_state', getGameState(room));
  });

  // Unmortgage
  socket.on('unmortgage_property', ({ roomId, spaceId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.started) return;
    const player = getPlayer(room, socket.id);
    if (!player) return;

    const space = BOARD_SPACES[spaceId];
    const prop = room.properties[spaceId];
    if (!prop || prop.owner !== socket.id || !prop.mortgaged) return;

    const cost = Math.floor(space.price / 2 * 1.1);
    if (player.cash < cost) {
      socket.emit('error_message', 'Not enough cash to unmortgage.');
      return;
    }

    prop.mortgaged = false;
    adjustCash(room, player, -cost);
    io.to(room.id).emit('system_message', `${player.name} unmortgaged ${space.name} for ₹${cost}.`);
    io.to(room.id).emit('game_state', getGameState(room));
  });

  // Pay jail bail
  socket.on('pay_bail', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.started) return;
    const current = getCurrentPlayer(room);
    if (!current || current.id !== socket.id || !current.inJail) return;

    if (current.cash < room.settings.jailBailAmount) {
      socket.emit('error_message', 'Not enough cash!');
      return;
    }

    adjustCash(room, current, -room.settings.jailBailAmount);
    current.inJail = false;
    current.jailTurns = 0;
    room.diceRolled = false;
    io.to(room.id).emit('system_message', `${current.name} paid ₹${room.settings.jailBailAmount} bail and is free!`);
    io.to(room.id).emit('game_state', getGameState(room));
    io.to(room.id).emit('turn_start', { playerId: current.id });
  });

  // Use jail free card
  socket.on('use_jail_card', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.started) return;
    const current = getCurrentPlayer(room);
    if (!current || current.id !== socket.id || !current.inJail) return;
    if (current.jailFreeCards <= 0) {
      socket.emit('error_message', 'No jail free cards!');
      return;
    }

    current.jailFreeCards--;
    current.inJail = false;
    current.jailTurns = 0;
    room.diceRolled = false;
    io.to(room.id).emit('system_message', `${current.name} used a Pardon card and is free!`);
    io.to(room.id).emit('game_state', getGameState(room));
    io.to(room.id).emit('turn_start', { playerId: current.id });
  });

  // Alias: pardon card
  socket.on('use_pardon_card', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.started) return;
    const current = getCurrentPlayer(room);
    if (!current || current.id !== socket.id || !current.inJail) return;
    if (current.jailFreeCards <= 0) {
      socket.emit('error_message', 'No pardon cards!');
      return;
    }

    current.jailFreeCards--;
    current.inJail = false;
    current.jailTurns = 0;
    room.diceRolled = false;
    io.to(room.id).emit('system_message', `${current.name} used a Pardon card and is free!`);
    io.to(room.id).emit('game_state', getGameState(room));
    io.to(room.id).emit('turn_start', { playerId: current.id });
  });

  // Trade offer
  socket.on('propose_trade', ({ roomId, toPlayerId, offerPropertyIds = [], requestPropertyIds = [], offerCash = 0, requestCash = 0 }) => {
    const room = rooms.get(roomId);
    if (!room || !room.started || room.winner) return;
    const fromPlayer = getPlayer(room, socket.id);
    const toPlayer = getPlayer(room, toPlayerId);
    if (!fromPlayer || !toPlayer || fromPlayer.id === toPlayer.id) return;
    if (fromPlayer.bankrupt || toPlayer.bankrupt) return;

    const cleanOfferProps = [...new Set(offerPropertyIds.map(Number))];
    const cleanRequestProps = [...new Set(requestPropertyIds.map(Number))];
    const cleanOfferCash = Math.max(0, parseInt(offerCash, 10) || 0);
    const cleanRequestCash = Math.max(0, parseInt(requestCash, 10) || 0);

    const ownsAllOffered = cleanOfferProps.every(pid => room.properties[pid]?.owner === fromPlayer.id);
    const ownsAllRequested = cleanRequestProps.every(pid => room.properties[pid]?.owner === toPlayer.id);
    if (!ownsAllOffered || !ownsAllRequested) {
      socket.emit('error_message', 'Invalid trade selection. Property ownership changed.');
      return;
    }
    if (fromPlayer.cash < cleanOfferCash || toPlayer.cash < cleanRequestCash) {
      socket.emit('error_message', 'Trade cash exceeds available cash.');
      return;
    }
    if (cleanOfferProps.length === 0 && cleanRequestProps.length === 0 && cleanOfferCash === 0 && cleanRequestCash === 0) {
      socket.emit('error_message', 'Trade offer cannot be empty.');
      return;
    }

    const tradeId = `${fromPlayer.id}:${toPlayer.id}:${Date.now()}`;
    const offer = {
      tradeId,
      roomId,
      fromPlayerId: fromPlayer.id,
      fromPlayerName: fromPlayer.name,
      toPlayerId: toPlayer.id,
      toPlayerName: toPlayer.name,
      offerPropertyIds: cleanOfferProps,
      requestPropertyIds: cleanRequestProps,
      offerCash: cleanOfferCash,
      requestCash: cleanRequestCash,
      createdAt: Date.now(),
    };
    room.tradeOffers.set(tradeId, offer);

    io.to(toPlayer.id).emit('trade_offer', offer);
    io.to(fromPlayer.id).emit('trade_offer_sent', offer);
    io.to(room.id).emit('system_message', `${fromPlayer.name} sent a trade offer to ${toPlayer.name}.`);
  });

  // Trade response
  socket.on('respond_trade', ({ roomId, tradeId, accept }) => {
    const room = rooms.get(roomId);
    if (!room || !room.started || room.winner) return;
    const offer = room.tradeOffers.get(tradeId);
    if (!offer || offer.roomId !== roomId) return;
    if (offer.toPlayerId !== socket.id) return;

    const fromPlayer = getPlayer(room, offer.fromPlayerId);
    const toPlayer = getPlayer(room, offer.toPlayerId);
    room.tradeOffers.delete(tradeId);

    if (!accept) {
      if (fromPlayer) io.to(fromPlayer.id).emit('trade_result', { tradeId, accepted: false, reason: 'declined' });
      io.to(room.id).emit('system_message', `${offer.toPlayerName} declined a trade from ${offer.fromPlayerName}.`);
      return;
    }
    if (!fromPlayer || !toPlayer || fromPlayer.bankrupt || toPlayer.bankrupt) {
      if (fromPlayer) io.to(fromPlayer.id).emit('trade_result', { tradeId, accepted: false, reason: 'invalid' });
      return;
    }

    const validOfferProps = offer.offerPropertyIds.every(pid => room.properties[pid]?.owner === fromPlayer.id);
    const validRequestProps = offer.requestPropertyIds.every(pid => room.properties[pid]?.owner === toPlayer.id);
    if (!validOfferProps || !validRequestProps) {
      io.to(fromPlayer.id).emit('trade_result', { tradeId, accepted: false, reason: 'ownership_changed' });
      io.to(toPlayer.id).emit('trade_result', { tradeId, accepted: false, reason: 'ownership_changed' });
      socket.emit('error_message', 'Trade failed: ownership changed.');
      return;
    }
    if (fromPlayer.cash < offer.offerCash || toPlayer.cash < offer.requestCash) {
      io.to(fromPlayer.id).emit('trade_result', { tradeId, accepted: false, reason: 'cash_changed' });
      io.to(toPlayer.id).emit('trade_result', { tradeId, accepted: false, reason: 'cash_changed' });
      socket.emit('error_message', 'Trade failed: cash no longer available.');
      return;
    }

    offer.offerPropertyIds.forEach(pid => movePropertyBetweenPlayers(room, pid, fromPlayer, toPlayer));
    offer.requestPropertyIds.forEach(pid => movePropertyBetweenPlayers(room, pid, toPlayer, fromPlayer));

    if (offer.offerCash > 0) {
      adjustCash(room, fromPlayer, -offer.offerCash);
      adjustCash(room, toPlayer, offer.offerCash);
    }
    if (offer.requestCash > 0) {
      adjustCash(room, toPlayer, -offer.requestCash);
      adjustCash(room, fromPlayer, offer.requestCash);
    }

    io.to(room.id).emit('game_state', getGameState(room));
    io.to(room.id).emit('system_message', `${toPlayer.name} accepted trade from ${fromPlayer.name}.`);
    io.to(fromPlayer.id).emit('trade_result', { tradeId, accepted: true });
    io.to(toPlayer.id).emit('trade_result', { tradeId, accepted: true });
  });

  // Resign game (player chooses bankruptcy)
  socket.on('resign_game', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.started || room.winner) return;
    const player = getPlayer(room, socket.id);
    if (!player || player.bankrupt) return;

    const wasCurrent = getCurrentPlayer(room)?.id === socket.id;
    bankruptPlayer(room, player);
    clearPlayerTradeOffers(room, player.id);
    io.to(room.id).emit('system_message', `${player.name} resigned and is bankrupt.`);

    const active = room.players.filter(p => !p.bankrupt);
    if (active.length <= 1) {
      room.winner = active[0]?.id || null;
      io.to(room.id).emit('game_state', getGameState(room));
      io.to(room.id).emit('game_over', { winnerId: active[0]?.id, winnerName: active[0]?.name });
      return;
    }

    if (wasCurrent) {
      nextTurn(room);
      io.to(room.id).emit('game_state', getGameState(room));
      const next = getCurrentPlayer(room);
      if (next) io.to(room.id).emit('turn_start', { playerId: next.id });
    } else {
      io.to(room.id).emit('game_state', getGameState(room));
    }
  });

  // Chat
  socket.on('chat_message', ({ roomId, message }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const player = getPlayer(room, socket.id);
    if (!player) return;
    io.to(room.id).emit('chat_message', {
      playerId: socket.id,
      playerName: player.name,
      playerColor: player.color,
      message: message.substring(0, 300),
      timestamp: Date.now()
    });
  });

  // Rejoin room (after redirect or reconnect)
  socket.on('rejoin_room', ({ roomId, name, oldId }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb && cb({ error: 'Room not found' });

    let player = null;
    if (oldId) {
      player = room.players.find(p => p.id === oldId);
    }
    if (!player && name) {
      player = room.players.find(p => p.name === name && !p.bankrupt);
    }
    if (!player) return cb && cb({ error: 'Player not found in room' });

    const prevId = player.id;
    player.id = socket.id;
    clearPlayerTradeOffers(room, prevId);
    if (player.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
      player.disconnectTimer = null;
    }
    player.disconnectedAt = null;

    if (room.host === prevId) room.host = socket.id;
    if (room.winner === prevId) room.winner = socket.id;

    Object.values(room.properties).forEach(prop => {
      if (prop.owner === prevId) prop.owner = socket.id;
    });

    socket.join(room.id);
    cb && cb({ roomId: room.id, playerId: socket.id });
    io.to(room.id).emit('game_state', getGameState(room));
    io.to(room.id).emit('system_message', `${player.name} reconnected.`);
  });

  // Disconnect
  socket.on('disconnect', () => {
    rooms.forEach((room, roomId) => {
      const player = getPlayer(room, socket.id);
      if (!player) return;

      if (!room.started) {
        clearPlayerTradeOffers(room, socket.id);
        room.players = room.players.filter(p => p.id !== socket.id);
        if (room.players.length === 0) {
          rooms.delete(roomId);
        } else {
          if (room.host === socket.id) room.host = room.players[0].id;
          io.to(roomId).emit('game_state', getGameState(room));
          io.to(roomId).emit('system_message', `${player.name} left the game.`);
        }
      } else {
        player.disconnectedAt = Date.now();
        player.disconnectTimer = setTimeout(() => {
          bankruptPlayer(room, player);
          clearPlayerTradeOffers(room, player.id);
          io.to(roomId).emit('system_message', `${player.name} disconnected and is bankrupt.`);

          const active = room.players.filter(p => !p.bankrupt);
          if (active.length <= 1) {
            room.winner = active[0]?.id || null;
            io.to(roomId).emit('game_over', { winnerId: active[0]?.id, winnerName: active[0]?.name });
          } else {
            const current = getCurrentPlayer(room);
            if (current && current.id === socket.id) {
              nextTurn(room);
              const next = getCurrentPlayer(room);
              if (next) io.to(roomId).emit('turn_start', { playerId: next.id });
            }
          }
          io.to(roomId).emit('game_state', getGameState(room));
        }, 15000);
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Monopoly India server running on http://localhost:${PORT}`);
});
