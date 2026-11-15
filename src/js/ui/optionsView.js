/** The "Show air quality (AQI)" switch, kept in sync with the saved preference. */
import { byId } from './dom.js';

export function createOptionsView({ preferences }) {
  const toggle = byId('aqi-toggle');
  toggle.checked = preferences.get('showAqi');

  toggle.addEventListener('change', () => preferences.set('showAqi', toggle.checked));
  preferences.subscribe((values) => {
    toggle.checked = values.showAqi;
  });
}
