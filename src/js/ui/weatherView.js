/**
 * Renders the weather hero, sky personality, metric cards and secondary details (FR-04/05/06).
 * Every value is written from the API response via the view model — index.html holds only labels.
 */
import { nearbyNote } from '../core/places.js';
import { getWeatherPersonality } from '../core/personality.js';
import { toViewModel } from '../core/viewModel.js';
import { byId, h } from './dom.js';
import { createIcon, setIcon } from './icons.js';

export function createWeatherView() {
  const el = {
    city: byId('city-name'),
    region: byId('city-region'),
    note: byId('city-note'),
    localTime: byId('local-time'),
    zone: byId('local-zone'),
    temperature: byId('temp-value'),
    conditionText: byId('condition-text'),
    conditionIcon: byId('condition-icon'),
    scoreCard: byId('score-card'),
    scoreBadge: byId('score-badge'),
    scoreTitle: byId('score-title'),
    scoreDescription: byId('score-description'),
    scoreBasis: byId('score-basis'),
    metrics: byId('metrics'),
    details: byId('details'),
  };

  let rendered = null;

  function showConditionIcon(viewModel) {
    const image = el.conditionIcon;
    if (!viewModel.iconUrl) {
      image.hidden = true;
      image.removeAttribute('src');
      return;
    }
    let triedFallback = false;
    image.onerror = () => {
      // 128px icon missing → try the 64px one the API itself reported → otherwise hide it
      if (!triedFallback && viewModel.fallbackIconUrl && image.src !== viewModel.fallbackIconUrl) {
        triedFallback = true;
        image.src = viewModel.fallbackIconUrl;
      } else {
        image.hidden = true;
      }
    };
    image.hidden = false;
    image.src = viewModel.iconUrl;
  }

  function metricCard(metric) {
    return h(
      'div',
      { class: 'card metric', 'data-metric': metric.id },
      h('dt', { class: 'metric__top' }, h('span', { class: 'metric__icon' }, createIcon(metric.icon)), h('span', { class: 'metric__label' }, metric.label)),
      h('dd', { class: 'metric__value' }, h('span', null, metric.value), h('span', { class: 'metric__unit' }, metric.unit))
    );
  }

  function detailTile(detail) {
    return h(
      'div',
      { class: 'detail', 'data-detail': detail.id },
      h('dt', { class: 'detail__label' }, createIcon(detail.icon), detail.label),
      h('dd', { class: 'detail__value' }, detail.value, detail.unit ? h('span', { class: 'detail__unit' }, detail.unit) : null),
      detail.hint ? h('dd', { class: 'detail__hint' }, detail.hint) : null
    );
  }

  /** Paints a new result. Returns what was shown (for the screen-reader announcement), or null if unchanged. */
  function render(weather) {
    if (!weather || weather === rendered) return null;
    rendered = weather;

    const viewModel = toViewModel(weather.data);
    const personality = getWeatherPersonality(weather.data);

    el.city.textContent = viewModel.city;
    el.region.textContent = viewModel.place;
    el.region.hidden = viewModel.place === '';

    // Picked from the suggestions, but WeatherAPI only had a nearby point with another name? Say so.
    const nearby = nearbyNote(weather.place, weather.data.location);
    el.note.hidden = !nearby;
    if (nearby) {
      el.note.textContent = `Nearest weather point to ${nearby.placeName}${nearby.km === null ? '' : ` · about ${nearby.km} km away`}`;
    }
    el.localTime.textContent = viewModel.localTime;
    el.localTime.setAttribute('datetime', viewModel.localTimeAttribute);
    el.zone.textContent = viewModel.timezone;
    el.temperature.textContent = viewModel.temperatureC;
    el.conditionText.textContent = viewModel.condition;
    showConditionIcon(viewModel);

    el.scoreCard.dataset.tone = personality.tone;
    setIcon(el.scoreBadge, personality.icon);
    el.scoreTitle.textContent = personality.title;
    el.scoreDescription.textContent = personality.description;
    el.scoreBasis.textContent = `Based on ${viewModel.basis}`;

    el.metrics.replaceChildren(...viewModel.metrics.map(metricCard));
    el.details.replaceChildren(...viewModel.details.map(detailTile));

    return { viewModel, personality };
  }

  return { render };
}
