import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSuggestions, rankSuggestions, splitHighlight, SuggestStatus } from '../src/js/core/suggestions.js';

/** A scheduler the test drives by hand, so debounce behaviour is deterministic. */
function manualClock() {
  const tasks = [];
  let id = 0;
  return {
    schedule(callback, ms) {
      tasks.push({ id: ++id, callback, ms });
      return id;
    },
    cancel(handle) {
      const at = tasks.findIndex((t) => t.id === handle);
      if (at >= 0) tasks.splice(at, 1);
    },
    /** Fire everything that is due, like waiting out the debounce delay. */
    fire() {
      for (const task of tasks.splice(0)) task.callback();
    },
    get pending() {
      return tasks.length;
    },
  };
}

/** A geocoder whose answers the test settles by hand, so response ORDER is controllable. */
function controllableGeocoder() {
  const calls = [];
  return {
    calls,
    searchPlaces(query, { signal, count }) {
      return new Promise((resolve, reject) => calls.push({ query, signal, count, resolve, reject }));
    },
  };
}

const place = (name, country = 'India') =>
  Object.freeze({ id: 1, name, admin1: '', country, label: `${name}, ${country}`, latitude: 1, longitude: 2 });

function setup(options = {}) {
  const clock = manualClock();
  const geocoder = controllableGeocoder();
  const suggestions = createSuggestions({ geocoder, schedule: clock.schedule, cancel: clock.cancel, ...options });
  return { clock, geocoder, suggestions };
}
const settle = () => new Promise((resolve) => setImmediate(resolve)); // let promise callbacks run

test('starts idle with nothing to show', () => {
  const { suggestions } = setup();
  assert.deepEqual({ ...suggestions.getState() }, { status: SuggestStatus.IDLE, query: '', pendingQuery: '', items: [] });
});

test('text shorter than the minimum never schedules a request', () => {
  const { clock, geocoder, suggestions } = setup();
  for (const text of ['', ' ', 'm', ' m ']) suggestions.setQuery(text);
  assert.equal(clock.pending, 0);
  assert.equal(geocoder.calls.length, 0);
  assert.equal(suggestions.getState().status, SuggestStatus.IDLE);
});

test('a burst of keystrokes costs exactly one request, for the final text', () => {
  const { clock, geocoder, suggestions } = setup();
  for (const text of ['pu', 'pun', 'pune']) suggestions.setQuery(text); // typed faster than the debounce delay
  assert.equal(clock.pending, 1, 'earlier timers were cancelled');
  assert.equal(suggestions.getState().status, SuggestStatus.LOADING);
  assert.equal(suggestions.getState().pendingQuery, 'pune');

  clock.fire();
  assert.equal(geocoder.calls.length, 1);
  assert.equal(geocoder.calls[0].query, 'pune');
  assert.equal(geocoder.calls[0].count, 6);
});

test('the debounce delay is the configured one (220 ms unless told otherwise)', () => {
  const delays = [];
  const schedule = (callback, ms) => {
    delays.push(ms);
    return 1;
  };
  createSuggestions({ geocoder: controllableGeocoder(), schedule, cancel() {}, debounceMs: 123 }).setQuery('pune');
  createSuggestions({ geocoder: controllableGeocoder(), schedule, cancel() {} }).setQuery('pune');
  assert.deepEqual(delays, [123, 220]);
});

test('an answer becomes READY items, with prefix matches ranked first', async () => {
  const { clock, geocoder, suggestions } = setup();
  suggestions.setQuery('mum');
  clock.fire();
  geocoder.calls[0].resolve([place('Mume', 'Angola'), place('Mumbai')]); // API order is not prefix order
  await settle();

  const state = suggestions.getState();
  assert.equal(state.status, SuggestStatus.READY);
  assert.equal(state.query, 'mum');
  assert.equal(state.pendingQuery, '');
  assert.deepEqual(state.items.map((p) => p.name), ['Mume', 'Mumbai']); // both start with "mum": order kept
  assert.ok(Object.isFrozen(state.items));
});

test('a late answer for an older query can never replace the newer one', async () => {
  const { clock, geocoder, suggestions } = setup();
  suggestions.setQuery('mum');
  clock.fire(); // request #1 in flight
  suggestions.setQuery('mumb');
  assert.equal(geocoder.calls[0].signal.aborted, true, 'the superseded request is aborted');
  clock.fire(); // request #2

  geocoder.calls[1].resolve([place('Mumbai')]);
  await settle();
  geocoder.calls[0].resolve([place('Mumias', 'Kenya')]); // slow, stale answer arrives last
  await settle();

  assert.deepEqual(suggestions.getState().items.map((p) => p.name), ['Mumbai']);
  assert.equal(suggestions.getState().query, 'mumb');
});

test('typing again before the debounce fires makes an in-flight answer irrelevant', async () => {
  const { clock, geocoder, suggestions } = setup();
  suggestions.setQuery('pun');
  clock.fire();
  suggestions.setQuery('pune'); // new keystroke while request #1 is still out
  geocoder.calls[0].resolve([place('Punia Airport', 'Congo')]);
  await settle();
  assert.equal(suggestions.getState().items.length, 0, 'the stale answer was not applied');
  assert.equal(suggestions.getState().status, SuggestStatus.LOADING);
});

test('answers are cached per query, case-insensitively, so backspacing is free', async () => {
  const { clock, geocoder, suggestions } = setup();
  suggestions.setQuery('pune');
  clock.fire();
  geocoder.calls[0].resolve([place('Pune')]);
  await settle();

  suggestions.setQuery('pun'); // different text: needs a request
  clock.fire();
  geocoder.calls[1].resolve([place('Punjab')]);
  await settle();
  assert.equal(geocoder.calls.length, 2);

  suggestions.setQuery('PUNE'); // cached from before
  assert.equal(geocoder.calls.length, 2);
  assert.equal(clock.pending, 0);
  assert.equal(suggestions.getState().status, SuggestStatus.READY);
  assert.equal(suggestions.getState().items[0].name, 'Pune');
});

test('the cache forgets the oldest entry once it is full', async () => {
  const { clock, geocoder, suggestions } = setup({ cacheSize: 2 });
  for (const text of ['aa', 'bb', 'cc']) {
    suggestions.setQuery(text);
    clock.fire();
    geocoder.calls.at(-1).resolve([place(text)]);
    await settle();
  }
  suggestions.setQuery('aa'); // evicted → needs a fresh request
  assert.equal(clock.pending, 1);
  suggestions.setQuery('cc'); // still cached
  assert.equal(clock.pending, 0);
});

test('"no places found" is EMPTY (and cached), not an error', async () => {
  const { clock, geocoder, suggestions } = setup();
  suggestions.setQuery('zzzz');
  clock.fire();
  geocoder.calls[0].resolve([]);
  await settle();
  assert.equal(suggestions.getState().status, SuggestStatus.EMPTY);

  suggestions.setQuery('zzzz');
  assert.equal(geocoder.calls.length, 1);
  assert.equal(suggestions.getState().status, SuggestStatus.EMPTY);
});

test('a failed lookup is ERROR with no items, and the next keystroke recovers', async () => {
  const { clock, geocoder, suggestions } = setup();
  suggestions.setQuery('pune');
  clock.fire();
  geocoder.calls[0].reject(new Error('network down'));
  await settle();
  assert.equal(suggestions.getState().status, SuggestStatus.ERROR);
  assert.equal(suggestions.getState().items.length, 0);

  suggestions.setQuery('pune ');
  clock.fire();
  geocoder.calls[1].resolve([place('Pune')]);
  await settle();
  assert.equal(suggestions.getState().status, SuggestStatus.READY);
});

test('an aborted request is not reported as an error', async () => {
  const { clock, geocoder, suggestions } = setup();
  suggestions.setQuery('pune');
  clock.fire();
  geocoder.calls[0].reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
  await settle();
  assert.equal(suggestions.getState().status, SuggestStatus.LOADING, 'still waiting, never ERROR');
});

test('the previous list stays on screen while the next answer is loading', async () => {
  const { clock, geocoder, suggestions } = setup();
  suggestions.setQuery('pun');
  clock.fire();
  geocoder.calls[0].resolve([place('Punjab')]);
  await settle();

  suggestions.setQuery('pune');
  const state = suggestions.getState();
  assert.equal(state.status, SuggestStatus.LOADING);
  assert.equal(state.query, 'pun', 'items still belong to the old query');
  assert.deepEqual(state.items.map((p) => p.name), ['Punjab']);
});

test('clear() empties the list and drops anything still in flight', async () => {
  const { clock, geocoder, suggestions } = setup();
  suggestions.setQuery('pune');
  clock.fire();
  suggestions.clear();
  assert.equal(geocoder.calls[0].signal.aborted, true);
  geocoder.calls[0].resolve([place('Pune')]);
  await settle();
  assert.deepEqual({ ...suggestions.getState() }, { status: SuggestStatus.IDLE, query: '', pendingQuery: '', items: [] });
});

test('subscribers get the current state immediately and every change; unsubscribe stops them', () => {
  const { clock, suggestions } = setup();
  const seen = [];
  const unsubscribe = suggestions.subscribe((state) => seen.push(state.status));
  suggestions.setQuery('pune');
  assert.deepEqual(seen, [SuggestStatus.IDLE, SuggestStatus.LOADING]);
  unsubscribe();
  suggestions.clear();
  assert.equal(seen.length, 2);
  assert.equal(clock.pending, 0);
});

test('rankSuggestions puts prefix matches first and keeps API order otherwise', () => {
  const ranked = rankSuggestions([place('Bannu'), place('Abbanu'), place('Bangkok'), place('Cabana')], 'ban');
  assert.deepEqual(ranked.map((p) => p.name), ['Bannu', 'Bangkok', 'Abbanu', 'Cabana']);
});

test('splitHighlight finds the typed text case-insensitively and never guesses on odd casing', () => {
  assert.deepEqual(splitHighlight('Mumbai', 'mum'), ['', 'Mum', 'bai']);
  assert.deepEqual(splitHighlight('New York', 'york'), ['New ', 'York', '']);
  assert.deepEqual(splitHighlight('Pune', 'xyz'), ['Pune', '', '']);
  assert.deepEqual(splitHighlight('Pune', '  '), ['Pune', '', '']);
  assert.deepEqual(splitHighlight('İstanbul', 'ist'), ['İstanbul', '', '']); // lower-casing changes the length
});
