/**
 * Search box, Search button, Enter key and popular-city chips (FR-02, FR-03).
 * The chips are created once and only have their attributes updated, so keyboard focus is never lost.
 */
import { normalizeCity, weatherMatchesCity } from '../core/cities.js';
import { h } from './dom.js';

export function createSearchControls({ form, input, message, chipList, cities, initialValue, onSearch }) {
  input.value = initialValue; // FR-01: the box shows the default city

  let shownValidation = null;

  function hideMessage() {
    message.hidden = true;
    message.textContent = '';
    input.removeAttribute('aria-invalid');
  }

  function showMessage(text) {
    message.textContent = text;
    message.hidden = false;
    input.setAttribute('aria-invalid', 'true');
  }

  const chips = cities.map((city) => {
    const button = h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false' }, city);
    button.addEventListener('click', () => {
      input.value = city; // FR-03.3: keep the search box in sync with the chip
      hideMessage();
      onSearch(city);
    });
    chipList.append(h('li', null, button));
    return { city, button };
  });

  // FR-02.2 / FR-02.3: the Search button and the Enter key both submit this form.
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input.value.trim();
    input.value = value; // the box keeps the searched city
    onSearch(value);
  });

  input.addEventListener('input', hideMessage);

  function render(state) {
    // Validation message for an empty search (FR-02.4 / FR-08)
    if (state.validationError !== shownValidation) {
      shownValidation = state.validationError;
      if (shownValidation) {
        showMessage(shownValidation.message);
        input.focus();
      }
    }

    // Chip highlight follows the weather that is actually on screen (FR-03.4)
    const pending = state.status === 'loading' ? normalizeCity(state.pendingQuery) : null;
    for (const { city, button } of chips) {
      button.setAttribute('aria-pressed', String(weatherMatchesCity(state.weather, city)));
      button.classList.toggle('is-pending', pending !== null && pending === normalizeCity(city));
    }
  }

  return { render };
}
