/**
 * Developer-oriented API response viewer (FR-07): Formatted / Raw tabs, copy, scrolling.
 *
 *   Formatted = JSON.stringify(parsed, null, 2)   → indented, syntax-coloured
 *   Raw       = the response body exactly as received (WeatherAPI's own text, untouched)
 */
import { byId } from './dom.js';
import { createTabs } from './tabs.js';

// strings (optionally followed by ":" → object key) | true/false | null | numbers
const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

/** Colour JSON using DOM nodes only (no innerHTML), so response text can never inject markup. */
export function paintJson(target, text) {
  const fragment = document.createDocumentFragment();
  const span = (className, value) => {
    const node = document.createElement('span');
    node.className = className;
    node.textContent = value;
    return node;
  };

  let cursor = 0;
  for (const match of text.matchAll(TOKEN)) {
    if (match.index > cursor) fragment.append(text.slice(cursor, match.index));
    const [token, string, colon] = match;
    if (string !== undefined) {
      fragment.append(span(colon ? 'j-key' : 'j-string', string));
      if (colon) fragment.append(colon);
    } else if (token === 'true' || token === 'false') {
      fragment.append(span('j-boolean', token));
    } else if (token === 'null') {
      fragment.append(span('j-null', token));
    } else {
      fragment.append(span('j-number', token));
    }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) fragment.append(text.slice(cursor));
  target.replaceChildren(fragment);
}

/** Clipboard API first (secure contexts), hidden-textarea fallback for everything else. */
export async function copyText(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* permission denied or unfocused document — try the fallback */
    }
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.className = 'sr-only';
  document.body.append(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}

export function createJsonViewer({ announce }) {
  const el = {
    tabs: [byId('tab-formatted'), byId('tab-raw')],
    panel: byId('json-panel'),
    pre: byId('json-pre'),
    code: byId('json-code'),
    copy: byId('copy-json'),
    copyLabel: byId('copy-label'),
  };

  const state = { view: 'formatted', formatted: '', raw: '', source: null };
  let resetTimer = null;

  const currentText = () => (state.view === 'raw' ? state.raw : state.formatted);

  function paint() {
    const raw = state.view === 'raw';
    el.pre.classList.toggle('json--raw', raw);
    if (raw) el.code.textContent = state.raw;
    else paintJson(el.code, state.formatted);
    el.panel.scrollTop = 0;
    el.panel.scrollLeft = 0;
  }

  function showView(view) {
    state.view = view;
    el.panel.setAttribute('aria-labelledby', view === 'raw' ? 'tab-raw' : 'tab-formatted');
    paint();
  }

  createTabs({ tabs: el.tabs, onSelect: (tab) => showView(tab.dataset.view) });

  function flashCopyResult(ok) {
    clearTimeout(resetTimer);
    el.copyLabel.textContent = ok ? 'Copied' : 'Copy failed';
    el.copy.classList.toggle('is-done', ok);
    el.copy.classList.toggle('is-failed', !ok);
    announce(ok ? `${state.view === 'raw' ? 'Raw' : 'Formatted'} JSON copied to clipboard` : 'Could not copy to clipboard');
    resetTimer = setTimeout(() => {
      el.copyLabel.textContent = 'Copy';
      el.copy.classList.remove('is-done', 'is-failed');
    }, 1800);
  }

  // FR-07.4: copies whichever representation is currently displayed
  el.copy.addEventListener('click', async () => flashCopyResult(await copyText(currentText())));

  /** FR-07.5: called with every successful result. */
  function render(weather) {
    if (!weather || weather === state.source) return;
    state.source = weather;
    state.formatted = JSON.stringify(weather.data, null, 2);
    state.raw = weather.rawText;
    paint();
  }

  return { render };
}
