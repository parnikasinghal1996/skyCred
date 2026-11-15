/**
 * Behaviour for a WAI-ARIA tab list: click to select, ←/→ to move (wrapping), Home/End to jump,
 * and a roving tabindex so only the selected tab is in the page's tab order.
 * Hidden tabs are skipped. The caller decides what a selection means via `onSelect(tab)`.
 */
export function createTabs({ tabs, onSelect }) {
  const visibleTabs = () => tabs.filter((tab) => !tab.hidden);

  function select(tab, { focus = false } = {}) {
    for (const other of tabs) {
      const active = other === tab;
      other.setAttribute('aria-selected', String(active));
      other.tabIndex = active ? 0 : -1;
    }
    if (focus) tab.focus();
    onSelect(tab);
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (event) => {
      const list = visibleTabs();
      const index = list.indexOf(tab);
      const last = list.length - 1;
      let next = null;
      if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
      else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = last;
      if (next === null) return;
      event.preventDefault();
      select(list[next], { focus: true });
    });
  }

  return { select };
}
