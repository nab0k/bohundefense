/* Site dropdown for mouse users: a styled list over the real <select>, which keeps the value and the form data.
 * Touch devices keep the phone's own picker. */
let uid = 0;
let closeOpen = null;

const check = '<svg class="ui-select-check" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const chevron = '<svg class="ui-select-chevron" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function enhanceSelect(select) {
  if (!select || select.dataset.uiSelect || !matchMedia('(hover:hover) and (pointer:fine)').matches) return;
  // A browser may still hold the previous stylesheet for a few minutes: then stay with the plain <select>.
  const width = select.offsetWidth;
  select.classList.add('ui-select-native');
  if (getComputedStyle(select).display !== 'none') { select.classList.remove('ui-select-native'); return; }
  select.dataset.uiSelect = '1';
  const id = 'ui-select-' + (++uid);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ui-select-btn';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', id);
  const name = select.getAttribute('aria-label') || select.closest('label')?.firstChild?.textContent?.trim();
  if (name) button.setAttribute('aria-label', name);
  const text = document.createElement('span');
  text.className = 'ui-select-text';
  button.append(text);
  button.insertAdjacentHTML('beforeend', chevron);
  if (width && !select.closest('.info-form')) button.style.minWidth = width + 'px';
  select.after(button);
  select.tabIndex = -1;

  const list = document.createElement('ul');
  list.id = id;
  list.className = 'ui-select-list';
  list.setAttribute('role', 'listbox');
  list.tabIndex = -1;
  if (name) list.setAttribute('aria-label', name);
  list.hidden = true;
  document.body.append(list);

  let active = 0;
  let typed = '', typedAt = 0;
  const items = () => [...list.children];

  const paint = () => {
    const current = select.options[select.selectedIndex];
    text.textContent = current ? current.textContent : '';
    list.replaceChildren(...[...select.options].map((option, index) => {
      const item = document.createElement('li');
      item.id = `${id}-${index}`;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(index === select.selectedIndex));
      item.dataset.index = index;
      item.insertAdjacentHTML('beforeend', check);
      const label = document.createElement('span');
      label.textContent = option.textContent;
      item.append(label);
      return item;
    }));
  };

  const highlight = index => {
    const all = items();
    if (!all.length) return;
    active = Math.max(0, Math.min(all.length - 1, index));
    all.forEach((item, i) => item.classList.toggle('is-active', i === active));
    list.setAttribute('aria-activedescendant', all[active].id);
    all[active].scrollIntoView({ block: 'nearest' });
  };

  const place = () => {
    const box = button.getBoundingClientRect();
    const gap = 6, margin = 8;
    list.style.minWidth = box.width + 'px';
    list.style.maxWidth = innerWidth - margin * 2 + 'px';
    const below = innerHeight - box.bottom - gap - margin, above = box.top - gap - margin;
    const wanted = Math.min(list.scrollHeight, 320);
    const up = below < wanted && above > below;
    list.style.maxHeight = Math.min(320, up ? above : below) + 'px';
    const height = list.offsetHeight;
    list.style.top = (up ? box.top - gap - height : box.bottom + gap) + 'px';
    list.style.left = Math.max(margin, Math.min(box.left, innerWidth - list.offsetWidth - margin)) + 'px';
  };

  const close = (focusButton = true) => {
    if (list.hidden) return;
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    list.removeAttribute('aria-activedescendant');
    closeOpen = null;
    if (focusButton) button.focus();
  };

  const open = () => {
    if (closeOpen) closeOpen(false);
    paint();
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    closeOpen = close;
    place();
    highlight(Math.max(0, select.selectedIndex));
    list.focus({ preventScroll: true });
  };

  const choose = index => {
    const changed = select.selectedIndex !== index;
    select.selectedIndex = index;
    paint();
    close();
    if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
  };

  button.addEventListener('click', () => { if (list.hidden) open(); else close(); });
  button.addEventListener('keydown', event => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); open(); }
  });
  list.addEventListener('mousemove', event => {
    const item = event.target.closest('li');
    if (item && +item.dataset.index !== active) highlight(+item.dataset.index);
  });
  list.addEventListener('click', event => {
    const item = event.target.closest('li');
    if (item) choose(+item.dataset.index);
  });
  list.addEventListener('keydown', event => {
    const key = event.key;
    if (key === 'Escape') { event.preventDefault(); close(); return; }
    if (key === 'Tab') { close(false); return; }
    if (key === 'Enter' || key === ' ') { event.preventDefault(); choose(active); return; }
    if (key === 'ArrowDown') { event.preventDefault(); highlight(active + 1); return; }
    if (key === 'ArrowUp') { event.preventDefault(); highlight(active - 1); return; }
    if (key === 'Home') { event.preventDefault(); highlight(0); return; }
    if (key === 'End') { event.preventDefault(); highlight(items().length - 1); return; }
    if (key.length === 1) {
      const now = Date.now();
      typed = now - typedAt < 700 ? typed + key.toLocaleLowerCase() : key.toLocaleLowerCase();
      typedAt = now;
      const found = items().findIndex(item => item.textContent.trim().toLocaleLowerCase().startsWith(typed));
      if (found >= 0) highlight(found);
    }
  });

  // Keep the button right when options are rebuilt or the form is cleared.
  new MutationObserver(paint).observe(select, { childList: true });
  select.addEventListener('change', paint);
  if (select.form) select.form.addEventListener('reset', () => setTimeout(paint));
  paint();
}

export function enhanceSelects(root = document) {
  root.querySelectorAll('select:not([hidden])').forEach(enhanceSelect);
}

document.addEventListener('pointerdown', event => {
  if (closeOpen && !event.target.closest('.ui-select-list, .ui-select-btn')) closeOpen(false);
});
addEventListener('resize', () => { if (closeOpen) closeOpen(false); });
addEventListener('scroll', event => {
  if (closeOpen && !event.target.closest?.('.ui-select-list')) closeOpen(false);
}, true);
