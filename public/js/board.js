// ============================================================
// MONOPOLY INDIA - Board Renderer
// ============================================================

const COLOR_HEX = {
  brown: '#8B4513',
  lightblue: '#87CEEB',
  pink: '#FF69B4',
  orange: '#FFA500',
  red: '#e74c3c',
  yellow: '#FFD700',
  green: '#228B22',
  darkblue: '#1a3c8f',
};

function getSpaceBadge(space) {
  if (space.type === 'chance') return 'CH';
  if (space.type === 'karma') return 'KA';
  if (space.type === 'railroad') return 'RAIL';
  if (space.type === 'utility') return 'UTIL';
  if (space.type === 'tax') return 'TAX';
  return '';
}

// Board cell positions in grid (column, row)
// Bottom row: positions 0-10 (right to left from GO corner)
// Left column: positions 11-19 (bottom to top)
// Top row: positions 20-30 (left to right)
// Right column: positions 31-39 (top to bottom)
function getCellGridPosition(id) {
  if (id === 0) return { col: 11, row: 11, side: 'corner' };
  if (id >= 1 && id <= 9) return { col: 10 - (id - 1), row: 11, side: 'bottom' };
  if (id === 10) return { col: 1, row: 11, side: 'corner' };
  if (id >= 11 && id <= 19) return { col: 1, row: 10 - (id - 11), side: 'left' };
  if (id === 20) return { col: 1, row: 1, side: 'corner' };
  if (id >= 21 && id <= 29) return { col: 2 + (id - 21), row: 1, side: 'top' };
  if (id === 30) return { col: 11, row: 1, side: 'corner' };
  if (id >= 31 && id <= 39) return { col: 11, row: 2 + (id - 31), side: 'right' };
  return { col: 1, row: 1, side: 'corner' };
}

function buildBoard(boardData) {
  const boardEl = document.getElementById('board');

  boardData.forEach(space => {
    const pos = getCellGridPosition(space.id);
    const el = document.createElement('div');
    el.dataset.spaceId = space.id;
    el.dataset.spaceType = space.type;

    if (pos.side === 'corner') {
      el.className = 'corner';
      el.style.gridColumn = pos.col;
      el.style.gridRow = pos.row;

      let title = space.name;
      let subtitle = '';
      if (space.type === 'go') {
        title = 'GO';
        subtitle = 'Collect Bonus';
      } else if (space.type === 'jail') {
        title = 'JAIL';
        subtitle = 'Just Visiting';
      } else if (space.type === 'freeparking') {
        title = 'FREE';
        subtitle = 'Parking';
      } else if (space.type === 'gotojail') {
        title = 'GO TO';
        subtitle = 'Jail';
      }

      el.innerHTML = `
        <div class="corner-icon">${title}</div>
        <div class="corner-label">${subtitle}</div>
      `;
    } else {
      el.className = `cell cell-${pos.side}`;
      el.style.gridColumn = pos.col;
      el.style.gridRow = pos.row;

      const colorBar = space.color
        ? `<div class="color-bar" style="background:${COLOR_HEX[space.color] || '#999'}"></div>`
        : '';

      const badge = getSpaceBadge(space);
      const badgeHtml = badge ? `<span class="cell-badge">${badge}</span>` : '';
      const priceHtml = space.price ? `<div class="cell-price">&#8377;${space.price}</div>` : '';

      el.innerHTML = `
        ${colorBar}
        <div class="cell-content">
          <div class="cell-name">${space.name}</div>
          <div class="cell-meta">
            ${badgeHtml}
            ${priceHtml}
          </div>
        </div>
        <div class="cell-houses" id="houses-${space.id}"></div>
      `;
    }

    const center = boardEl.querySelector('.board-center');
    boardEl.insertBefore(el, center);
  });
}

function getCellCenter(spaceId) {
  const cell = document.querySelector(`[data-space-id="${spaceId}"]`);
  if (!cell) return { x: 0, y: 0 };
  const board = document.getElementById('board');
  const boardRect = board.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();
  return {
    x: cellRect.left - boardRect.left + cellRect.width / 2,
    y: cellRect.top - boardRect.top + cellRect.height / 2,
  };
}

function updateTokens(players) {
  const container = document.getElementById('token-container');

  players.forEach(player => {
    let tokenEl = document.getElementById(`token-${player.id}`);
    if (!tokenEl) {
      tokenEl = document.createElement('div');
      tokenEl.id = `token-${player.id}`;
      tokenEl.className = 'board-token';
      tokenEl.textContent = player.token;
      container.appendChild(tokenEl);
    }

    if (player.bankrupt) {
      tokenEl.style.display = 'none';
      return;
    }

    tokenEl.style.display = 'grid';
    const pos = getCellCenter(player.position);
    const sameSpacePlayers = players.filter(p => !p.bankrupt && p.position === player.position);
    const sameIdx = sameSpacePlayers.findIndex(p => p.id === player.id);
    const offsetX = (sameIdx % 3) * 24 - 18;
    const offsetY = Math.floor(sameIdx / 3) * 24 - 14;
    tokenEl.style.left = `${pos.x + offsetX - 18}px`;
    tokenEl.style.top = `${pos.y + offsetY - 18}px`;
  });
}

function updateBoardProperties(properties, boardData, players = []) {
  const playerById = new Map(players.map(p => [p.id, p]));

  boardData.forEach(space => {
    const cellEl = document.querySelector(`[data-space-id="${space.id}"]`);
    const housesEl = document.getElementById(`houses-${space.id}`);
    if (!cellEl || !housesEl) return;

    housesEl.innerHTML = '';

    const staleDot = cellEl.querySelector('.owner-indicator');
    if (staleDot) staleDot.remove();
    const staleOverlay = cellEl.querySelector('.mortgage-overlay');
    if (staleOverlay) staleOverlay.remove();

    const prop = properties[space.id];
    if (!prop) return;

    const ownerDot = document.createElement('div');
    ownerDot.className = 'owner-indicator';
    ownerDot.style.background = playerById.get(prop.owner)?.color || '#b8c0cc';
    cellEl.appendChild(ownerDot);

    if (prop.mortgaged) {
      const overlay = document.createElement('div');
      overlay.className = 'mortgage-overlay';
      overlay.textContent = 'MORTGAGED';
      cellEl.appendChild(overlay);
    }

    if (prop.houses === 5) {
      housesEl.innerHTML = '<div class="hotel"></div>';
    } else {
      for (let i = 0; i < prop.houses; i++) {
        housesEl.innerHTML += '<div class="house"></div>';
      }
    }
  });
}

function animateTokenMove(playerId) {
  const tokenEl = document.getElementById(`token-${playerId}`);
  if (!tokenEl) return;
  tokenEl.classList.add('moving');
  setTimeout(() => tokenEl.classList.remove('moving'), 520);
}
