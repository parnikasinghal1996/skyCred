import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreferences } from '../src/js/core/preferences.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}
const KEY = 'skycred:preferences:v1';

test('AQI is shown by default', () => {
  assert.equal(createPreferences({ storage: memoryStorage() }).get('showAqi'), true);
});

test('a change is saved and a later visit starts with it', () => {
  const storage = memoryStorage();
  createPreferences({ storage }).set('showAqi', false);
  assert.deepEqual(JSON.parse(storage.data.get(KEY)), { showAqi: false });
  assert.equal(createPreferences({ storage }).get('showAqi'), false);
});

test('anything unexpected in storage falls back to the defaults', () => {
  for (const stored of ['not json', '[]', 'null', '{"showAqi":"yes"}', '{"showAqi":1}', '{"other":false}', '']) {
    assert.equal(createPreferences({ storage: memoryStorage({ [KEY]: stored }) }).get('showAqi'), true, stored);
  }
});

test('blocked or broken storage never throws — the preference just lives in memory', () => {
  const broken = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceededError'); },
  };
  const prefs = createPreferences({ storage: broken });
  assert.equal(prefs.get('showAqi'), true);
  prefs.set('showAqi', false);
  assert.equal(prefs.get('showAqi'), false);

  const none = createPreferences({ storage: null });
  none.set('showAqi', false);
  assert.equal(none.get('showAqi'), false);
});

test('subscribers hear about real changes only', () => {
  const prefs = createPreferences({ storage: memoryStorage() });
  const heard = [];
  const stop = prefs.subscribe((values, name) => heard.push([name, values.showAqi]));

  prefs.set('showAqi', true); // already true
  prefs.set('showAqi', false);
  prefs.set('showAqi', false); // no change
  prefs.set('showAqi', 'nope'); // invalid
  prefs.set('mystery', true); // unknown
  assert.deepEqual(heard, [['showAqi', false]]);

  stop();
  prefs.set('showAqi', true);
  assert.equal(heard.length, 1);
});
