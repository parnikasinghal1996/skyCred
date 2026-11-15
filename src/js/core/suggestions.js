/**
 * Place-suggestion state for the search box — DOM-free, so the timing rules are unit-tested.
 *
 *  • typing is debounced, so one burst of keystrokes costs one request;
 *  • queries shorter than `minChars` never reach the network;
 *  • answers are cached per query, so backspacing is instant and free;
 *  • a newer query aborts the older request, and a late answer for a superseded query is ignored;
 *  • any failure just means "no suggestions" — it never blocks a normal search.
 */
import {
  SUGGESTION_COUNT,
  SUGGESTION_DEBOUNCE_MS,
  SUGGESTION_MIN_CHARS,
} from './constants.js';

export const SuggestStatus = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  EMPTY: 'empty',
  ERROR: 'error',
});

const NO_ITEMS = Object.freeze([]);
const normalize = (text) => String(text ?? '').trim().replace(/\s+/g, ' ');
const cacheKey = (query) => query.toLowerCase();

/** Places whose name (or full label) starts with what was typed come first; API order otherwise. */
export function rankSuggestions(places, query) {
  const typed = cacheKey(normalize(query));
  const prefixMatches = [];
  const others = [];
  for (const place of places) {
    const startsWith = place.name.toLowerCase().startsWith(typed) || place.label.toLowerCase().startsWith(typed);
    (startsWith ? prefixMatches : others).push(place);
  }
  return [...prefixMatches, ...others];
}

/** Split `text` around the first occurrence of `query` → [before, match, after] for bold highlighting. */
export function splitHighlight(text, query) {
  const typed = cacheKey(normalize(query));
  const lower = String(text).toLowerCase();
  if (!typed || lower.length !== text.length) return [text, '', '']; // odd casing can shift indexes: don't guess
  const at = lower.indexOf(typed);
  if (at === -1) return [text, '', ''];
  return [text.slice(0, at), text.slice(at, at + typed.length), text.slice(at + typed.length)];
}

export function createSuggestions({
  geocoder,
  debounceMs = SUGGESTION_DEBOUNCE_MS,
  minChars = SUGGESTION_MIN_CHARS,
  count = SUGGESTION_COUNT,
  schedule = (callback, ms) => setTimeout(callback, ms),
  cancel = (handle) => clearTimeout(handle),
  cacheSize = 40,
}) {
  let state = Object.freeze({ status: SuggestStatus.IDLE, query: '', pendingQuery: '', items: NO_ITEMS });
  let timer = null;
  let controller = null;
  let requestId = 0;
  const cache = new Map();
  const listeners = new Set();

  function update(patch) {
    state = Object.freeze({ ...state, ...patch });
    for (const listener of [...listeners]) listener(state);
  }

  function remember(query, items) {
    cache.set(cacheKey(query), items);
    if (cache.size > cacheSize) cache.delete(cache.keys().next().value); // drop the oldest
  }

  /** Invalidate everything in flight: the debounce timer, the request, and any answer still on its way. */
  function stopPending() {
    requestId++;
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
    if (controller) {
      controller.abort();
      controller = null;
    }
  }

  async function run(query, id) {
    timer = null;
    const mine = new AbortController();
    controller = mine;
    try {
      const found = Object.freeze(rankSuggestions(await geocoder.searchPlaces(query, { signal: mine.signal, count }), query));
      if (id !== requestId) return; // a newer keystroke superseded this request
      remember(query, found);
      update({ status: found.length ? SuggestStatus.READY : SuggestStatus.EMPTY, query, pendingQuery: '', items: found });
    } catch (error) {
      if (id !== requestId || (error && error.name === 'AbortError')) return;
      update({ status: SuggestStatus.ERROR, query, pendingQuery: '', items: NO_ITEMS });
    } finally {
      if (controller === mine) controller = null;
    }
  }

  /** Call on every keystroke with the current text of the search box. */
  function setQuery(text) {
    const query = normalize(text);
    stopPending();

    if (query.length < minChars) {
      update({ status: SuggestStatus.IDLE, query, pendingQuery: '', items: NO_ITEMS });
      return;
    }

    const cached = cache.get(cacheKey(query));
    if (cached) {
      update({ status: cached.length ? SuggestStatus.READY : SuggestStatus.EMPTY, query, pendingQuery: '', items: cached });
      return;
    }

    // Keep the previous list on screen until the new answer arrives, so the dropdown doesn't flicker.
    update({ status: SuggestStatus.LOADING, pendingQuery: query });
    const id = requestId;
    timer = schedule(() => run(query, id), debounceMs);
  }

  function clear() {
    stopPending();
    update({ status: SuggestStatus.IDLE, query: '', pendingQuery: '', items: NO_ITEMS });
  }

  function subscribe(listener) {
    listeners.add(listener);
    listener(state);
    return () => listeners.delete(listener);
  }

  return { getState: () => state, setQuery, clear, subscribe };
}
