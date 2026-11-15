/**
 * Date/time formatting for WeatherAPI timestamps.
 *
 * `location.localtime` and `current.last_updated` are already expressed in the SEARCHED city's
 * timezone ("2026-11-15 14:42"). We format those strings directly — never through `new Date(string)` —
 * so the viewer's own timezone can never shift them (FR-04: local time matches the city's timezone).
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// WeatherAPI does not zero-pad the hour: "2026-11-15 9:05" is a valid value.
const API_TIME = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/;

/** @returns {{year:number,month:number,day:number,hour:number,minute:number,weekday:number}|null} */
export function parseApiTime(value) {
  const match = API_TIME.exec(String(value ?? '').trim());
  if (!match) return null;
  const [year, month, day, hour = 0, minute = 0] = match.slice(1).map((part) => (part === undefined ? undefined : Number(part)));
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, hour, minute, weekday };
}

/** "2026-11-15 14:42" → "Sun, 15 Nov · 2:42 PM". Unparseable input is returned unchanged. */
export function formatLocalTime(value) {
  const parsed = parseApiTime(value);
  if (!parsed) return String(value ?? '');
  const hour12 = parsed.hour % 12 || 12;
  const meridiem = parsed.hour < 12 ? 'AM' : 'PM';
  const minute = String(parsed.minute).padStart(2, '0');
  return `${WEEKDAYS[parsed.weekday]}, ${parsed.day} ${MONTHS[parsed.month - 1]} · ${hour12}:${minute} ${meridiem}`;
}

/** "2026-11-5 9:05" → "2026-11-05T09:05" for <time datetime>. */
export function toDateTimeAttribute(value) {
  const parsed = parseApiTime(value);
  if (!parsed) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${parsed.year}-${pad(parsed.month)}-${pad(parsed.day)}T${pad(parsed.hour)}:${pad(parsed.minute)}`;
}
