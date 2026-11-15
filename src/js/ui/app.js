/** Wires the store to the UI components. Components never talk to each other — only to the store. */
import { createAqiView } from './aqiView.js';
import { byId } from './dom.js';
import { createHeatMapView } from './heatMapView.js';
import { hydrateIcons } from './icons.js';
import { createJsonViewer } from './jsonViewer.js';
import { createOptionsView } from './optionsView.js';
import { createSearchControls } from './searchControls.js';
import { createStatusView } from './statusView.js';
import { createSuggestBox } from './suggestBox.js';
import { createWeatherView } from './weatherView.js';

function createAnnouncer(region) {
  let timer;
  return (message) => {
    clearTimeout(timer);
    region.textContent = '';
    timer = setTimeout(() => {
      region.textContent = message;
    }, 60);
  };
}

export function mountApp({ store, suggestions, preferences, sampler, defaultCity, popularCities }) {
  hydrateIcons(document);
  const announce = createAnnouncer(byId('sr-status'));
  const input = byId('city-input');

  const search = createSearchControls({
    form: byId('search-form'),
    input,
    message: byId('search-message'),
    chipList: byId('popular-cities'),
    cities: popularCities,
    initialValue: defaultCity,
    beforeSearch: () => suggestions.clear(),
    onSearch: (query) => store.search(query),
  });

  // Choosing a suggestion searches for that exact place, not for its name as text.
  createSuggestBox({
    input,
    list: byId('suggestions'),
    spinner: byId('suggest-spinner'),
    source: suggestions,
    announce,
    onPick: (place) => store.search(place.label, { place }),
  });

  const status = createStatusView({
    onRetry: () => {
      store.retry();
      byId('main').focus({ preventScroll: true }); // the Retry button is about to disappear
    },
  });
  const weather = createWeatherView();
  const aqi = createAqiView({ preferences });
  const heatMap = createHeatMapView({ sampler, preferences, announce });
  const viewer = createJsonViewer({ announce });
  createOptionsView({ preferences });

  preferences.subscribe(() => {
    aqi.refresh();
    heatMap.refresh();
  });

  let previousStatus = null;
  store.subscribe((state) => {
    search.render(state);
    status.render(state);
    const shown = weather.render(state.weather);
    aqi.render(state.weather);
    heatMap.render(state.weather);
    viewer.render(state.weather);

    if (shown) {
      const { viewModel, personality } = shown;
      announce(`${viewModel.city}: ${viewModel.temperatureC} degrees Celsius, ${viewModel.condition}. ${personality.title}.`);
    } else if (state.status === 'loading' && previousStatus !== 'loading') {
      announce(`Loading weather for ${state.pendingQuery}`);
    }
    previousStatus = state.status;
  });
}
