/**
 * Loading, refreshing and error presentation (FR-01.3, FR-01.5, FR-08).
 *
 *   no data yet + loading → skeleton        (never a blank card)
 *   no data yet + error   → error panel     (never a blank card)
 *   data + loading        → data dimmed under a "Fetching …" pill (old data can't pass for new)
 *   data + error          → data kept, error banner above it (valid data is never replaced)
 */
import { byId } from './dom.js';
import { setIcon } from './icons.js';

const ICON_BY_ERROR_TYPE = {
  network: 'wifi-off',
  api_config: 'key',
  timeout: 'clock',
  city_not_found: 'search',
};

export function createStatusView({ onRetry }) {
  const el = {
    main: byId('main'),
    skeleton: byId('skeleton'),
    content: byId('weather-content'),
    refresh: byId('refresh-indicator'),
    refreshLabel: byId('refresh-label'),
    banner: {
      root: byId('error-banner'),
      icon: byId('banner-icon'),
      title: byId('banner-title'),
      message: byId('banner-message'),
      retry: byId('banner-retry'),
    },
    panel: {
      root: byId('error-panel'),
      icon: byId('error-icon'),
      title: byId('error-title'),
      message: byId('error-message'),
      retry: byId('error-retry'),
    },
  };

  el.banner.retry.addEventListener('click', onRetry);
  el.panel.retry.addEventListener('click', onRetry);

  let paintedError = null;

  function paintError(target, error, weather) {
    const note = weather ? ` Still showing the last result for ${weather.data.location.name}.` : '';
    target.title.textContent = error.title;
    target.message.textContent = `${error.message}${note}`;
    target.retry.hidden = !error.retryable;
    setIcon(target.icon, ICON_BY_ERROR_TYPE[error.type] || 'alert-triangle');
  }

  function render(state) {
    const hasData = Boolean(state.weather);
    const loading = state.status === 'loading';
    const error = state.error;

    el.skeleton.hidden = hasData || Boolean(error);
    el.panel.root.hidden = hasData || !error;
    el.content.hidden = !hasData;
    el.banner.root.hidden = !(hasData && error);

    const refreshing = hasData && loading;
    el.content.classList.toggle('is-refreshing', refreshing);
    el.refresh.hidden = !refreshing;
    if (refreshing) el.refreshLabel.textContent = `Fetching weather for ${state.pendingQuery}…`;

    el.main.setAttribute('aria-busy', String(loading));

    if (error !== paintedError) {
      paintedError = error;
      if (error) paintError(hasData ? el.banner : el.panel, error, state.weather);
    }
  }

  return { render };
}
