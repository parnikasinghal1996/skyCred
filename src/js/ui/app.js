/** Wires the store to the UI components. Components never talk to each other — only to the store. */
import { byId } from './dom.js';
import { hydrateIcons } from './icons.js';
import { createJsonViewer } from './jsonViewer.js';
import { createSearchControls } from './searchControls.js';
import { createStatusView } from './statusView.js';
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

export function mountApp({ store, defaultCity, popularCities }) {
  hydrateIcons(document);
  const announce = createAnnouncer(byId('sr-status'));

  const search = createSearchControls({
    form: byId('search-form'),
    input: byId('city-input'),
    message: byId('search-message'),
    chipList: byId('popular-cities'),
    cities: popularCities,
    initialValue: defaultCity,
    onSearch: (query) => store.search(query),
  });

  const status = createStatusView({
    onRetry: () => {
      store.retry();
      byId('main').focus({ preventScroll: true }); // the Retry button is about to disappear
    },
  });
  const weather = createWeatherView();
  const viewer = createJsonViewer({ announce });

  let previousStatus = null;
  store.subscribe((state) => {
    search.render(state);
    status.render(state);
    const shown = weather.render(state.weather);
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
