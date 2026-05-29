let _state = { items: [], index: 0, renderContent: null, open: false };

const overlay = document.createElement('div');
overlay.id = 'modal-overlay';
overlay.setAttribute('role', 'dialog');
overlay.setAttribute('aria-modal', 'true');
overlay.innerHTML = `
  <button class="modal-prev" aria-label="上一个">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
  </button>
  <div class="modal">
    <button class="modal-close" aria-label="关闭">×</button>
    <div class="modal-title">
      <h3 id="modal-heading"></h3>
      <span class="chip" id="modal-chip"></span>
    </div>
    <div class="modal-body" id="modal-body"></div>
  </div>
  <button class="modal-next" aria-label="下一个">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
  </button>
`;
document.body.appendChild(overlay);

const elClose = overlay.querySelector('.modal-close');
const elPrev = overlay.querySelector('.modal-prev');
const elNext = overlay.querySelector('.modal-next');
const elHeading = overlay.querySelector('#modal-heading');
const elChip = overlay.querySelector('#modal-chip');
const elBody = overlay.querySelector('#modal-body');

function paint() {
  const { items, index, renderContent } = _state;
  const { heading, chip, bodyHtml } = renderContent(items[index], index, items.length);
  elHeading.textContent = heading;
  elChip.textContent = chip;
  elBody.innerHTML = bodyHtml;
  elPrev.disabled = index === 0;
  elNext.disabled = index === items.length - 1;
}

export function openModal({ items, index, renderContent }) {
  _state = { items, index, renderContent, open: true };
  paint();
  overlay.classList.add('visible');
  document.body.classList.add('modal-open');
  elClose.focus();
}

export function closeModal() {
  _state.open = false;
  overlay.classList.remove('visible');
  document.body.classList.remove('modal-open');
}

elClose.addEventListener('click', closeModal);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

elPrev.addEventListener('click', () => {
  if (_state.index > 0) { _state.index -= 1; paint(); }
});
elNext.addEventListener('click', () => {
  if (_state.index < _state.items.length - 1) { _state.index += 1; paint(); }
});

document.addEventListener('keydown', (e) => {
  if (!_state.open) return;
  if (e.key === 'Escape') { closeModal(); return; }
  if (e.key === 'ArrowLeft' && _state.index > 0) { _state.index -= 1; paint(); }
  if (e.key === 'ArrowRight' && _state.index < _state.items.length - 1) { _state.index += 1; paint(); }
});
