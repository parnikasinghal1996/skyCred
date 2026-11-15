# Requirements checklist — implementation and testing

Test date: 15 Nov 2026. Only things that were actually run are marked as verified.

**How each item was tested**

| Tag | Meaning |
| --- | --- |
| **Unit** | `npm test` — 48 tests on Node 22. Fixtures in `tests/fixtures` are real WeatherAPI responses captured from the live API (success and error bodies). |
| **Live** | The real app in a browser, driven through the UI, against the real WeatherAPI. |
| **Injected** | The real app in a browser against a local stand-in for the API that injects one failure at a time (HTTP 503, 429, 401, a dropped connection, HTML instead of JSON, slow replies). The stand-in is test scaffolding and is not in this repo. |

Legend: ✅ implemented and verified · ⚠️ implemented, with a deliberate interpretation or a limit on what was verified · ❌ not done

## FR-01 Application initialization

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 01.1 | Mumbai is the default city | ✅ | Live: search box reads "Mumbai", Mumbai chip highlighted on load. |
| 01.2 | Fetch Mumbai on load | ✅ | Live: with no user action, one `fetch` to `/v1/current.json?q=Mumbai` returned 200 (browser resource timing). |
| 01.3 | Loading indicator | ✅ | Injected (6 s reply): shimmer skeleton shown at 1.2 s, `aria-busy="true"`. The skeleton is in the static HTML, so it is visible before any script runs. |
| 01.4 | Weather card on success | ✅ | Live. |
| 01.5 | Error state on failure | ✅ | Injected: 503 on load → "Service unavailable" panel with Retry; after the service recovered, Retry loaded Mumbai and moved focus to the results region. |

Acceptance: automatic request for Mumbai ✅ · input shows Mumbai ✅ · values come from the response ✅ · no hardcoded weather values ✅ (while loading, every weather element is empty and the skeleton contains no digits; all text is written from the response).

## FR-02 City search

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 02.1 | Search input | ✅ | Live. |
| 02.2 | Search button | ✅ | Live: typed "Delhi", clicked Search. |
| 02.3 | Enter key | ✅ | Live: typed "london", pressed Enter. |
| 02.4 | Empty search sends nothing | ✅ | Live: empty and whitespace-only input → message "Please enter a city name to search.", `aria-invalid`, focus returned to the box, request count unchanged. Unit: client never calls `fetch` for a blank query. |
| 02.5 | Fetch weather for the entered city | ✅ | Live. |
| 02.6 | Update the card | ✅ | Live. |
| 02.7 | Error if the city is unknown | ✅ | Live (real API): "zzzzqqqq" → **City not found**, previous city kept on screen, no Retry. |

Acceptance:
- Delhi ⚠️ — a bare `q=Delhi` makes WeatherAPI return **Delhi, Ontario, Canada** (verified live: 3 °C, America/Toronto). Delhi is therefore sent as `Delhi, India` (verified live: 26.6 °C, Asia/Kolkata). Nothing else is rewritten; Mumbai is still `q=Mumbai`.
- London ✅ · input keeps the searched city ✅ (trimmed) · multiple searches without reload ✅ (a page marker survived six searches).
- Previous data cannot be mistaken for a new result ✅ — while loading, old data is dimmed under a "Fetching weather for …" pill and the target chip pulses; after a failure the banner says "Still showing the last result for …".

## FR-03 Popular cities

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 03.1 | Ten chips | ✅ | Unit: exact list and order from the PRD. Live. |
| 03.2 | Click fetches | ✅ | Live: Delhi, Bengaluru, Pune, New York, London. |
| 03.3 | Search box follows the chip | ✅ | Live. |
| 03.4 | Highlight selected | ✅ | Live: highlight moves, the previous chip is cleared; chips are also highlighted when the same city is typed by hand. Not highlighted for a non-popular city (Wellington). |
| 03.5 | All data updates | ✅ | Live: values in every card matched the JSON for the same city. |

## FR-04 Current weather information

| Item | Status | Evidence |
| --- | --- | --- |
| All values dynamic | ✅ | Live + Unit (view-model test against two real responses). |
| Celsius | ✅ | Live (e.g. 26.6 °C Delhi) + Unit. |
| Wind in km/h | ✅ | Live + Unit (`wind_kph`, not mph). |
| Icon matches the API condition | ✅ | Live: Delhi "Sunny" → `/weather/128x128/day/113.png`; Mumbai "Smoky haze" → `…/149.png`. URL is the API's own icon path; only https URLs on `cdn.weatherapi.com` are accepted (Unit). |
| Local time in the city's timezone | ✅ | Live: London showed 11:09 AM `Europe/London`, equal to the browser's independent `Intl` clock for that zone; Wellington showed Mon 16 Nov 12:12 AM `Pacific/Auckland` while other cities showed Sun 15 Nov. Unit: formatting never goes through the viewer's timezone. |
| No hardcoded values | ✅ | See FR-01. |

Numbers are shown as WeatherAPI sends them, without rounding (JSON numbers, so `29.0` appears as `29`).

## FR-05 Weather interpretation

| Item | Status | Evidence |
| --- | --- | --- |
| Dynamic, uses temperature + condition + wind | ✅ | Unit: boundaries at every threshold, plus a sweep of −40…60 °C proving no temperature is left unmapped. |
| Title and description | ✅ | Unit: the five PRD examples produce the exact PRD wording. |
| Updates per search | ✅ | Live. |
| Clear thresholds and a defined priority order | ✅ | Documented in `personality.js` and the README; Unit: each overlap pair. |
| "Not a real credit score" note | ✅ | Shown on the card and in the footer. |

Seen live: Hazy Mode (Mumbai), Perfect Day (Delhi, Bengaluru), Rain Check (London), Freeze Frame (New York), Breezy Mode (Wellington). Warm Spell was seen live before the hazard rule was added; Layer Up and Warm Spell are otherwise covered by unit tests.

- **Sun Alert ⚠️** — no city was at 35 °C or above on the test day, so it was not seen on a live city. It is unit-tested, and its UI rendering was checked on a real Delhi response with the temperature rewritten to 41.2 °C in the page (a test-only patch).
- **Interpretation ⚠️** — the PRD gives five examples. Three more were added so every reading maps to an honest message: **Hazy Mode** (fog/smoke/haze/dust/sand — without it a severe sandstorm or Delhi's smog was a "Perfect Day"), **Layer Up** (5–18 °C) and **Warm Spell** (30–35 °C). Each is a one-line removal if the product team disagrees.

## FR-06 Additional weather metrics

| Item | Status | Evidence |
| --- | --- | --- |
| Humidity %, Wind km/h, UV Index cards | ✅ | Live (Bengaluru: 48 % / 6.1 km/h / 0.8) = JSON values. |
| Cloud, Visibility, Pressure, Wind speed, °F, Last updated | ✅ | Live: all six tiles equal the JSON for the same response; last-updated is shown in the city's local time. |
| All update on every search | ✅ | Live (Mumbai → Delhi → London → Bengaluru → New York → Pune). |

"Wind speed" appears both as a primary card and as a secondary tile because the PRD lists it twice; the tile adds direction and gusts.

## FR-07 API response viewer

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 07.1 | Formatted JSON | ✅ | Live: view equals `JSON.stringify(response, null, 2)`, two-space indent, syntax-coloured. |
| 07.2 | Raw JSON | ✅ | Live: view equals the response body as captured off the wire — 949 of 949 characters identical. |
| 07.3 | Tab switching | ✅ | Live: mouse and keyboard (←/→, wrap-around, Home, End). |
| 07.4 | Copy | ✅ | Live: copies the visible representation — formatted text on the Formatted tab, the exact raw text on the Raw tab (clipboard write captured). |
| 07.5 | Updates after every successful request | ✅ | Live; after a failed request the last successful JSON stays. |
| 07.6 | Scrolling | ✅ | Live: mouse wheel scrolled the panel itself (scrollTop 300 of 894). |

## FR-08 Errors and exceptions

| Scenario | Status | Result |
| --- | --- | --- |
| Empty input | ✅ Live | Validation message, no request. |
| Invalid city | ✅ Live (real API 400/1006) | **City not found**, no Retry. |
| Invalid API key | ✅ Injected + Unit | **API configuration error**, no Retry. Also shown (and no request made) when `js/env.js` is missing. The real `401/2006` body is a test fixture. |
| Rate limit | ⚠️ Injected + Unit | **Temporary service error** + Retry for `403/2007` and `429`. The quota-exceeded body comes from WeatherAPI's documentation — it cannot be triggered on demand. |
| Internet unavailable | ⚠️ Injected + Unit | **Network connection problem** + Retry (connection dropped mid-request). The "You appear to be offline" wording, chosen when `navigator.onLine` is false, is unit-tested only — the machine was not taken offline. |
| API server unavailable | ✅ Injected | **Service unavailable** + Retry (HTTP 503), on first load and with data on screen. |
| Slow response | ✅ Injected | Skeleton on first load; dimmed data + "Fetching …" pill afterwards; after 15 s → **Request timed out** + Retry (Unit). |
| Unexpected response | ✅ Injected + Unit | **Something went wrong** + Retry for an HTML 200, wrong-shape JSON, and payloads missing any rendered field. |

Additional requirements: no blank card ✅ (skeleton or error panel instead) · valid data never replaced by incomplete data ✅ (every failure case above kept Mumbai on screen) · Retry where appropriate ✅ · outdated responses can't overwrite newer ones ✅ — Injected: London made to answer 4 s late, Delhi clicked right after → UI stayed on Delhi throughout; Unit: stale success and stale failure are both ignored even when the client ignores the abort.

## FR-09 Responsive behaviour

| Device | Status | Evidence |
| --- | --- | --- |
| Desktop: centered, max width | ✅ | Live at 1280, 1440. |
| Laptop / tablet: consistent spacing, cards adapt | ✅ | Live at 1024, 900, 768: hero stacks under 900 px, three metric columns, three detail columns. |
| Mobile: stacked metrics, optimized search | ✅ | Live at 600, 414, 375, 360, 320: metrics one column, details two columns (one at ≤360 px), search stays one row. |
| No horizontal overflow | ✅ | `scrollWidth === clientWidth` and zero overflowing elements at all eight widths above. |

Checked in a resized browser pane (emulation), not on physical devices.

## FR-10 WeatherAPI integration

| Item | Status | Evidence |
| --- | --- | --- |
| GET `/v1/current.json`, `key` and `q` as query params | ✅ | Unit (request inspected) + Live (resource timing). |
| Mumbai on launch; fresh data per search | ✅ | Live; `cache: no-store` (Unit). |
| Errors, invalid cities, network failures | ✅ | See FR-08. |
| Key stored in `.env` | ⚠️ | `.env` (git-ignored) is read by `npm run build`, which writes the key into `dist/js/env.js`. On Vercel the same variable is set in project settings. `.env.example` is committed. The key is **not** secret — see below. |
| No hardcoded or mock data | ✅ | The app has no weather data of its own. Test fixtures and the failure stand-in are not shipped. |

## Non-functional requirements

| Category | Status | Notes |
| --- | --- | --- |
| Performance | ⚠️ | No framework or runtime dependencies; skeleton paints before JS runs. No Lighthouse/timing audit was run. |
| API feedback | ✅ | Loading feedback appears the moment a request starts. |
| Reliability | ✅ | See FR-08. |
| Security | ✅ | The README states plainly that a browser-side key is visible to every visitor. Strict CSP + security headers — the dev server sends the same headers as `vercel.json`, and the live-API testing (search, chips, JSON viewer, responsive, accessibility) produced no CSP violations. The failure-injection runs used a stand-in server without those headers. All dynamic text uses `textContent`; icon URLs are host-checked. |
| Maintainability | ✅ | HTML, CSS and JS are separate; CSS is split into tokens / base / components; JS into `api`, `core`, `ui`. |
| Compatibility | ⚠️ | Only a Chromium-based browser was available. Safari, Firefox and Edge were **not** tested. The code uses only widely supported features (ES modules, `fetch`, `AbortController`, CSS grid/custom properties). |
| Accessibility | ⚠️ | Verified: keyboard operation (skip link, focus rings, tab/arrow keys), label and landmark structure, heading order, no unnamed controls, ARIA tabs, live regions, and WCAG contrast (lowest pair 5.29:1 against the 4.5:1 AA limit). Not done: testing with a real screen reader. |
| Responsiveness | ✅ | See FR-09. |
| Scalability | ✅ | Logic is framework-free, DOM-free and unit-tested; components talk only to the store. |

## Out of scope

None of it was built: accounts, database, profiles, history, forecasts, push notifications, payments, admin dashboard, backend services.

## Not done / open

1. **Visual fidelity to the reference screenshot — not verified.** The PRD refers to an attached screenshot, but none came through, so the visual design is original (dark, "credit-app" look). It needs a comparison once the screenshot is shared.
2. **Safari, Firefox and Edge** were not tested (see above).
3. **A real offline state and a real quota-exceeded response** were not reproduced (injected / documented bodies were used instead).
4. **No automated browser tests are checked in.** Logic is covered by `npm test`; the browser checks above were driven by hand during this session.
5. **The three extra personalities** (Hazy Mode, Layer Up, Warm Spell) and the **Delhi country hint** are interpretation calls the product team should confirm.
