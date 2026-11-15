import { WEATHER_API_DEFAULT_BASE_URL } from './constants.js';

/**
 * Loads js/env.js, which scripts/build.mjs generates from WEATHER_API_KEY.
 * A missing file is not fatal: the API client then reports an "API configuration error" in the UI.
 */
export async function loadConfig() {
  try {
    const { CONFIG } = await import('../env.js');
    return {
      weatherApiKey: String((CONFIG && CONFIG.weatherApiKey) || '').trim(),
      weatherApiBaseUrl: String((CONFIG && CONFIG.weatherApiBaseUrl) || WEATHER_API_DEFAULT_BASE_URL),
    };
  } catch (error) {
    console.error('[SKY CRED] js/env.js could not be loaded. Run "npm run build" with WEATHER_API_KEY set.', error);
    return { weatherApiKey: '', weatherApiBaseUrl: WEATHER_API_DEFAULT_BASE_URL };
  }
}
