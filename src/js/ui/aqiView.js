/**
 * Air-quality card: WeatherAPI's US EPA level for the place, a six-step scale with the current step marked,
 * the EPA's plain-language advice for that level, and the pollutant concentrations.
 * Shown only while the "Show air quality (AQI)" switch is on.
 */
import { AQI_LEVELS, describeAirQuality } from '../core/aqi.js';
import { byId, h } from './dom.js';

export function createAqiView({ preferences }) {
  const el = {
    card: byId('aqi-card'),
    title: byId('aqi-title'),
    range: byId('aqi-range'),
    badge: byId('aqi-badge'),
    level: byId('aqi-level'),
    body: byId('aqi-body'),
    scale: byId('aqi-scale'),
    advice: byId('aqi-advice'),
    pollutants: byId('aqi-pollutants'),
    note: byId('aqi-note'),
    unavailable: byId('aqi-unavailable'),
  };

  // The six scale steps never change, so build them once.
  const segments = AQI_LEVELS.map((level) =>
    h('span', { class: 'aqi-scale__seg', 'data-level': level.level, title: `${level.label} — AQI ${level.range}` })
  );
  el.scale.replaceChildren(...segments);

  let weather = null;

  function paint() {
    const show = Boolean(weather) && preferences.get('showAqi');
    el.card.hidden = !show;
    if (!show) return;

    const info = describeAirQuality(weather.data.current.air_quality);
    el.body.hidden = !info.available;
    el.unavailable.hidden = info.available;
    el.badge.hidden = !info.available;
    el.range.hidden = !info.available;

    if (!info.available) {
      el.card.dataset.level = '0';
      el.title.textContent = 'Not available';
      return;
    }

    const { level, defra, pollutants } = info;
    el.card.dataset.level = String(level.level);
    el.title.textContent = level.label;
    el.range.textContent = `US EPA level ${level.level} of 6 · AQI ${level.range}`;
    el.level.textContent = String(level.level);

    segments.forEach((segment, i) => segment.classList.toggle('is-active', i === level.level - 1));
    el.scale.setAttribute('aria-label', `Air quality scale: level ${level.level} of 6, ${level.label}`);
    el.advice.textContent = level.advice;

    el.pollutants.replaceChildren(
      ...pollutants.map((p) =>
        h(
          'div',
          { class: 'pollutant', 'data-pollutant': p.id, title: p.name },
          h('dt', { class: 'pollutant__label' }, p.label),
          h('dd', { class: 'pollutant__value' }, p.value, h('span', { class: 'pollutant__unit' }, p.unit))
        )
      )
    );

    el.note.textContent = defra
      ? `UK DEFRA index: ${defra.index} of 10 (${defra.label}). Level reported by WeatherAPI.`
      : 'Level reported by WeatherAPI.';
  }

  return {
    /** Called with every store update. */
    render(next) {
      weather = next;
      paint();
    },
    /** Called when the preference changes. */
    refresh: paint,
  };
}
