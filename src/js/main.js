/** SKY CRED entry point. */
import { createGeocoder } from './api/geocodingApi.js';
import { createWeatherClient } from './api/weatherApi.js';
import { DEFAULT_CITY, POPULAR_CITIES } from './core/constants.js';
import { loadConfig } from './core/loadConfig.js';
import { createPreferences } from './core/preferences.js';
import { createRegionSampler } from './core/regionSampler.js';
import { createWeatherStore } from './core/store.js';
import { createSuggestions } from './core/suggestions.js';
import { mountApp } from './ui/app.js';

async function start() {
  const config = await loadConfig();
  const client = createWeatherClient({ apiKey: config.weatherApiKey, baseUrl: config.weatherApiBaseUrl });
  const store = createWeatherStore({ client });
  const suggestions = createSuggestions({ geocoder: createGeocoder() });
  const preferences = createPreferences();
  const sampler = createRegionSampler({ client });

  mountApp({ store, suggestions, preferences, sampler, defaultCity: DEFAULT_CITY, popularCities: POPULAR_CITIES });

  store.search(DEFAULT_CITY); // FR-01.2: fetch Mumbai's live weather as soon as the app loads
}

start().catch((error) => {
  console.error('[SKY CRED] failed to start', error);
  const skeleton = document.getElementById('skeleton');
  const panel = document.getElementById('error-panel');
  if (skeleton) skeleton.hidden = true;
  if (panel) {
    document.getElementById('error-title').textContent = 'Something went wrong';
    document.getElementById('error-message').textContent = 'SKY CRED could not start. Please reload the page.';
    document.getElementById('error-retry').hidden = true;
    panel.hidden = false;
  }
});
