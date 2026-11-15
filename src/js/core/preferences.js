/**
 * UI preferences, remembered in localStorage.
 *
 * Storage can be missing, blocked (private windows, sandboxed frames) or full, and can hold anything
 * another script wrote — so every read is validated and every write is allowed to fail. When it does,
 * the preference simply lives in memory for the session.
 */

const DEFAULTS = Object.freeze({
  showAqi: true, // the "Show air quality (AQI)" switch
});

const VALIDATORS = Object.freeze({
  showAqi: (value) => typeof value === 'boolean',
});

function browserStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null; // even touching `localStorage` can throw a SecurityError
  }
}

export function createPreferences({ storage = browserStorage(), key = 'skycred:preferences:v1', defaults = DEFAULTS } = {}) {
  const listeners = new Set();

  function load() {
    if (!storage) return {};
    try {
      const parsed = JSON.parse(storage.getItem(key) || '{}');
      const valid = {};
      for (const name of Object.keys(defaults)) {
        if (parsed && name in parsed && VALIDATORS[name](parsed[name])) valid[name] = parsed[name];
      }
      return valid;
    } catch {
      return {};
    }
  }

  let values = { ...defaults, ...load() };

  function save() {
    if (!storage) return;
    try {
      storage.setItem(key, JSON.stringify(values));
    } catch {
      /* quota or permissions — keep the value in memory only */
    }
  }

  return {
    get: (name) => values[name],

    set(name, value) {
      if (!(name in defaults) || !VALIDATORS[name](value) || values[name] === value) return;
      values = { ...values, [name]: value };
      save();
      for (const listener of [...listeners]) listener(values, name);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
