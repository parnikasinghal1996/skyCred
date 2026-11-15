/**
 * Autocomplete dropdown for the search box — the WAI-ARIA "combobox with listbox popup" pattern.
 *
 *   typing        → suggestions (debounced, cached) appear under the box
 *   ↓ / ↑         → move through them (focus stays in the box; aria-activedescendant tracks the option)
 *   Enter         → choose the highlighted one; with none highlighted, Enter searches the typed text as before
 *   Esc / Tab     → close;  click or tap → choose
 *
 * All text is written with text nodes; place names come from a network response.
 */
import { splitHighlight, SuggestStatus } from '../core/suggestions.js';
import { h } from './dom.js';
import { createIcon } from './icons.js';

const MIN_CHARS_TO_REOPEN = 2;

export function createSuggestBox({ input, list, spinner, source, onPick, announce }) {
  let state = source.getState();
  let activeIndex = -1;
  let focused = document.activeElement === input;
  let blurTimer = null;
  let places = [];

  const options = () => [...list.querySelectorAll('[role="option"]')];
  const isOpen = () => !list.hidden;

  function setActive(index) {
    activeIndex = index;
    const all = options();
    all.forEach((option, i) => {
      const active = i === index;
      option.setAttribute('aria-selected', String(active));
      option.classList.toggle('is-active', active);
    });
    if (index >= 0 && all[index]) {
      input.setAttribute('aria-activedescendant', all[index].id);
      all[index].scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function open() {
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    setActive(-1);
  }

  function optionFor(place, index, query) {
    const [before, match, after] = splitHighlight(place.name, query);
    const meta = [place.admin1, place.country].filter((part, i, all) => part && all.indexOf(part) === i).join(', ');
    return h(
      'li',
      { id: `suggestion-${index}`, class: 'suggestion', role: 'option', 'aria-selected': 'false', 'data-index': index },
      h('span', { class: 'suggestion__icon' }, createIcon('map-pin')),
      h(
        'span',
        { class: 'suggestion__text' },
        h('span', { class: 'suggestion__name' }, before, match ? h('strong', null, match) : null, after),
        meta ? h('span', { class: 'suggestion__meta' }, meta) : null
      )
    );
  }

  function note(text) {
    return h('li', { class: 'suggestions__note', role: 'presentation' }, text);
  }

  function render(next) {
    state = next;
    spinner.hidden = next.status !== SuggestStatus.LOADING;
    places = next.items;

    const rows = [];
    if (next.status === SuggestStatus.READY || (next.status === SuggestStatus.LOADING && next.items.length)) {
      next.items.forEach((place, index) => rows.push(optionFor(place, index, next.query)));
    } else if (next.status === SuggestStatus.EMPTY) {
      rows.push(note(`No places found for “${next.query}”. Press Enter to search anyway.`));
    } else if (next.status === SuggestStatus.ERROR) {
      rows.push(note('Suggestions are unavailable right now. Press Enter to search anyway.'));
    }

    list.replaceChildren(...rows);
    setActive(-1);

    if (rows.length && focused) open();
    else if (!rows.length) close();

    if (focused && next.status === SuggestStatus.READY) {
      announce(`${next.items.length} suggestion${next.items.length === 1 ? '' : 's'} available. Use the up and down arrow keys to review.`);
    }
  }

  function pick(index) {
    const place = places[index];
    if (!place) return;
    close();
    source.clear();
    input.value = place.label;
    onPick(place);
  }

  input.addEventListener('input', () => source.setQuery(input.value));

  input.addEventListener('focus', () => {
    focused = true;
    clearTimeout(blurTimer);
    const typed = input.value.trim();
    if (typed.length >= MIN_CHARS_TO_REOPEN && state.status !== SuggestStatus.IDLE && list.children.length) open();
  });

  input.addEventListener('blur', () => {
    focused = false;
    // Wait a beat so a click on an option still lands before the list disappears.
    blurTimer = setTimeout(close, 150);
  });

  input.addEventListener('keydown', (event) => {
    const count = options().length;
    switch (event.key) {
      case 'ArrowDown':
        if (!count) return;
        event.preventDefault();
        if (!isOpen()) open();
        setActive((activeIndex + 1) % count);
        break;
      case 'ArrowUp':
        if (!count) return;
        event.preventDefault();
        if (!isOpen()) open();
        setActive(activeIndex <= 0 ? count - 1 : activeIndex - 1);
        break;
      case 'Enter':
        if (isOpen() && activeIndex >= 0) {
          event.preventDefault(); // choose the highlighted suggestion instead of submitting the typed text
          pick(activeIndex);
        }
        break;
      case 'Escape':
        if (isOpen()) {
          event.preventDefault();
          close();
        }
        break;
      case 'Tab':
        close();
        break;
      default:
    }
  });

  // Keep the input focused while the pointer is on the list, then choose on click / tap.
  list.addEventListener('mousedown', (event) => event.preventDefault());
  list.addEventListener('mouseover', (event) => {
    const option = event.target.closest('[role="option"]');
    if (option) setActive(Number(option.dataset.index));
  });
  list.addEventListener('click', (event) => {
    const option = event.target.closest('[role="option"]');
    if (option) pick(Number(option.dataset.index));
  });

  source.subscribe(render);

  return { close };
}
