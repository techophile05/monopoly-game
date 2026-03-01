// ============================================================
// MONOPOLY INDIA - Property Modal UI (React)
// ============================================================
(function () {
  if (!window.React || !window.ReactDOM) return;

  const h = window.React.createElement;
  const host = document.getElementById('prop-modal-root');
  if (!host) return;
  const root = window.ReactDOM.createRoot(host);

  function money(v) {
    return `\u20B9${v}`;
  }

  function Row({ label, value, accent }) {
    return h('div', { className: 'prop-react-row' }, [
      h('span', { key: 'k1' }, label),
      h('span', { key: 'k2', className: accent ? 'accent' : '' }, value),
    ]);
  }

  function ActionBtn({ label, kind, disabled, onClick }) {
    return h(
      'button',
      {
        className: `prop-react-btn ${kind || ''}`.trim(),
        disabled: !!disabled,
        onClick,
        type: 'button',
      },
      label
    );
  }

  function PropertyModal(props) {
    const { space, owner, prop, isOwner, onClose, onUpgrade, onDowngrade, onMortgage, onUnmortgage } = props;

    const rows = [];
    if (space.price) rows.push(h(Row, { key: 'price', label: 'Price', value: money(space.price) }));
    rows.push(h(Row, {
      key: 'owner',
      label: 'Owner',
      value: owner ? owner.name : 'Unowned',
      accent: !!owner,
    }));
    if (prop) {
      if (prop.houses === 5) rows.push(h(Row, { key: 'hotel', label: 'Buildings', value: 'Hotel' }));
      else if (prop.houses > 0) rows.push(h(Row, { key: 'houses', label: 'Houses', value: String(prop.houses) }));
      if (prop.mortgaged) rows.push(h(Row, { key: 'mort', label: 'Status', value: 'MORTGAGED', accent: true }));
    }

    if (Array.isArray(space.rent)) {
      rows.push(h(Row, { key: 'r0', label: 'Base Rent', value: money(space.rent[0]) }));
      for (let i = 1; i <= 4; i++) {
        if (space.rent[i]) rows.push(h(Row, { key: `r${i}`, label: `${i} House${i > 1 ? 's' : ''}`, value: money(space.rent[i]) }));
      }
      if (space.rent[5]) rows.push(h(Row, { key: 'r5', label: 'Hotel', value: money(space.rent[5]) }));
    }
    if (space.houseCost) rows.push(h(Row, { key: 'hc', label: 'Upgrade Cost', value: money(space.houseCost) }));

    const actionButtons = [];
    if (isOwner && prop) {
      if (space.type === 'property' && !prop.mortgaged && prop.houses < 5) {
        actionButtons.push(h(ActionBtn, { key: 'up', label: 'Upgrade', kind: 'up', onClick: onUpgrade }));
      }
      if (space.type === 'property' && prop.houses > 0) {
        actionButtons.push(h(ActionBtn, { key: 'down', label: 'Downgrade', kind: 'down', onClick: onDowngrade }));
      }
      if (!prop.mortgaged) {
        actionButtons.push(h(ActionBtn, {
          key: 'mort',
          label: 'Mortgage',
          kind: 'warn',
          disabled: prop.houses > 0,
          onClick: onMortgage,
        }));
      } else {
        actionButtons.push(h(ActionBtn, { key: 'unmort', label: 'Unmortgage', kind: 'info', onClick: onUnmortgage }));
      }
    }
    actionButtons.push(h(ActionBtn, { key: 'close', label: 'Close', kind: 'muted', onClick: onClose }));

    return h('div', { className: 'prop-react' }, [
      h('h3', { key: 'title', className: 'prop-react-title' }, space.name),
      h('div', { key: 'card3d', className: 'prop-card-3d' }, [
        h('div', { key: 'inner', className: 'prop-card-3d-inner' }, [
          h('div', {
            key: 'bar',
            className: 'prop-react-color',
            style: { background: props.color || '#9ca3af' },
          }),
          h('div', { key: 'rows', className: 'prop-react-rows' }, rows),
        ]),
      ]),
      h('div', { key: 'actions', className: 'prop-react-actions' }, actionButtons),
    ]);
  }

  window.renderPropertyModalReact = function renderPropertyModalReact(payload) {
    root.render(h(PropertyModal, payload));
  };

  window.clearPropertyModalReact = function clearPropertyModalReact() {
    root.render(null);
  };
})();
