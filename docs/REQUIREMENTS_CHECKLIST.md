# Requirements checklist — implementation and testing

Test date: 15 Nov 2026. Only things that were actually run are marked as verified.

**How each item was tested**

| Tag | Meaning |
| --- | --- |
| **Unit** | `npm test` — 136 tests on Node 22 (48 for the original app, 88 for FR-11…13). Fixtures in `tests/fixtures` are real responses captured from the live WeatherAPI (success and error bodies, with and without air quality) and from Open-Meteo's geocoder. |
| **Live** | The real app in a browser, driven through the UI (real clicks and key presses), against the real WeatherAPI, Open-Meteo and map-tile servers. |
| **Injected** | The real app in a browser with one failure injected at a time — HTTP 503, 429, 401, a dropped connection, HTML instead of JSON, slow replies (a local stand-in for the API, for FR-01…10) and, for FR-11…13, a test-only `fetch` patch or a map library that is temporarily unavailable. The scaffolding is not in this repo. |

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
| GET `/v1/current.json`, `key` and `q` as query params | ✅ | Unit (request inspected) + Live (resource timing). Since FR-11 the call also carries `aqi=yes` (Mumbai is still `q=Mumbai`). |
| Mumbai on launch; fresh data per search | ✅ | Live; `cache: no-store` (Unit). |
| Errors, invalid cities, network failures | ✅ | See FR-08. |
| Key stored in `.env` | ⚠️ | `.env` (git-ignored) is read by `npm run build`, which writes the key into `dist/js/env.js`. On Vercel the same variable is set in project settings. `.env.example` is committed. The key is **not** secret — see below. |
| No hardcoded or mock data | ✅ | The app has no weather data of its own. Test fixtures and the failure stand-in are not shipped. |

## FR-11 Air quality (AQI) option — added in the follow-up request

| Item | Status | Evidence |
| --- | --- | --- |
| An option to show AQI on the page | ✅ | Live: a "Show air quality (AQI)" switch; on → card shown, off → card and the map's AQI layer hidden. |
| Real data, no extra request | ✅ | Unit + Live: `aqi=yes` rides on the existing `current.json` call (request count unchanged); the response, including `air_quality`, is in the JSON viewer whether or not the card is shown. |
| Level, scale, advice, pollutants | ✅ | Live (Mumbai: **Unhealthy**, US EPA level 4 of 6, AQI 151–200, six pollutants in µg/m³, DEFRA 10 "Very high" — all equal to the JSON). Unit: all six levels and the DEFRA bands, against real Mumbai (level 4) and Reykjavik (level 1) responses. |
| Remembered across visits | ✅ | Live: switched off → reloaded → still off, card and map tab hidden; switched on with the Space key → saved. Unit: invalid stored values fall back to the default; blocked or full storage never throws. |
| Missing air-quality data | ✅ | Unit: absent, partial or malformed `air_quality` shows "not available" rather than an error. Not seen on a live place — every place tried had data. |
| Keyboard and screen readers | ✅ | Live: `role="switch"` with a label, toggles with Space; the scale is `role="img"` with a text label. |
| **A numeric 0–500 AQI** | ⚠️ not shown, by decision | WeatherAPI gives a level (1–6), not a number. Computing one from the pollutants agreed with WeatherAPI's own level on only 80 of 90 live readings, so a computed number would sometimes contradict the level shown beside it. The level and its standard AQI range are shown instead. |

Default is **on** (the request said "an option to show"); that is a one-line change in `core/preferences.js`.

## FR-12 Search suggestions — added in the follow-up request

| Item | Status | Evidence |
| --- | --- | --- |
| Suggested places for the text typed | ✅ | Live: "mum" → Mumbai, Maharashtra, India first; "hyder" → Hyderabad (India), Hyderābād (Pakistan), Hyder (Alaska, Arizona)…; "krak" → Krakow, Poland first. Matching text is highlighted. |
| Quality of the source | ⚠️ | WeatherAPI's own search is a fuzzy full-name matcher ("mum" → Mumias, "pun" → Punia Airport): 13 of 22 common prefixes surfaced the expected city, against 20 of 22 for Open-Meteo's geocoder — so suggestions use Open-Meteo. Weather itself is still only WeatherAPI. Open-Meteo's own misses: "ban"/"bang" (it files Bengaluru under that name). |
| Debounce, minimum length, cache | ✅ | Live: three keystrokes → exactly one geocoder request; backspacing to a cached query makes none. Unit: debounce collapses bursts, 2-character minimum, case-insensitive cache with eviction. |
| Stale answers can't win | ✅ | Live: a deliberately slow "pun" answer arriving after "pune" left the list unchanged. Unit: older answers ignored, older requests aborted. |
| Choosing a suggestion searches that exact place | ✅ | Live: Enter on the highlighted Mumbai → one request, `q=Mumbai, Maharashtra, India`; clicking Hyderābād, Sindh → *Hyderabad*, Sindh, Pakistan, Asia/Karachi, in one request (before the accent fix it landed on a village called "Allah Ditta Chandia"). Unit + a real-API run: 23 of 23 popular world cities land on the same-named place within 50 km; Springfield (4 states), Portland (4) and Delhi (India, NY, CA, LA) each land on their own place. |
| Accents | ✅ | Real-API run: 17 of 18 accent-heavy names within 50 km, most in one call. Without folding, "Kraków, …" resolved to *Poland, New York* and "Hyderābād, …" to a village 200 km away — the 50 km check rejected them and accent-free spellings are now tried first. The one outlier is the geocoder's own top hit for "Göteborg" (a mountain in Svalbard), reported honestly as 207 km away. |
| "Nearest weather point" note | ✅ | Live: picking Krakow shows the hero "Kleparz" with *"Nearest weather point to Krakow · about 1 km away"*. Shown only when WeatherAPI's name differs from the place you picked. |
| Keyboard | ✅ | Live (real key events): ↓ highlights with `aria-activedescendant` while focus stays in the box; Enter chooses; Esc closes and keeps the text; ↓ reopens; Tab closes; clicking back into the box reopens from cache. Enter with nothing highlighted still searches the typed text. |
| Mouse / touch | ✅ / ⚠️ | Live: hovering highlights an option while focus stays in the box; clicking chooses; `mousedown` is cancelled so a click or tap never steals focus from the input. Touch was not tried on a real device. |
| Failure of the suggestion service | ✅ | Injected: unreachable → "Suggestions are unavailable right now. Press Enter to search anyway."; no matches → "No places found for …"; the spinner never sticks and plain search works throughout. |
| Accessibility | ✅ | Live audit: `role="combobox"` named "City name", `aria-expanded`, `aria-controls` (target exists), `aria-autocomplete="list"`, a labelled `listbox`, options with `aria-selected`; the live region says "6 suggestions available. Use the up and down arrow keys to review." Contrast ≥ 6.3:1 for every suggestion colour pair. |

Privacy: the text typed (from 2 characters) is sent to Open-Meteo. The README says so.

## FR-13 Regional heat map — added in the follow-up request

"Heat map of the region selection" was read as: a temperature heat map around the place you selected. Because "heat" could also mean air quality, there is an **Air quality** layer too (while the AQI switch is on).

| Item | Status | Evidence |
| --- | --- | --- |
| Heat map for the selected place | ✅ | Live: Mumbai → a map of ≈280 km around it, Temperature layer from 24.4 °C (an inland pocket) to 29.4 °C (the coast), city labels visible above the colours, the selected place marked. |
| Colours come from real WeatherAPI data | ✅ | Live: 25 lattice requests (`current.json?q=lat,lon&aqi=yes`) → 25 of 25 answered; each dot's tooltip shows its reading; **"View the data points"** lists all 26 and the Mumbai row equals the main response. Unit: lattice geometry (north-first, widened by 1/cos latitude, valid near the poles and antimeridian), interpolation (stays within the sample range, handles missing points), colour scales, edge fade. |
| Temperature and air-quality layers | ✅ | Live: switching layers is instant (no new requests); legend, summary and table change with the layer; the AQI tab disappears when the switch is off and the map falls back to Temperature. |
| Legend and summary | ✅ | Live: gradient bar with the range (or six EPA swatches); "Warmest 29.4 °C near …, coolest 24.4 °C near …, average …, 25 of 25 points answered, about 55 km apart." |
| Loads only when needed | ✅ | Live: on a fresh page there is no Leaflet request, no tile and no lattice request; scrolling the card into view loads Leaflet, then samples. |
| Changing place mid-sampling | ✅ | Live: switching city while sampling aborts the old run (one run cut to 23 of 25 requests); the map always ended on the newer place with its own data. Unit: aborting stops new requests; stale runs are ignored. |
| Failures | ✅ | Injected: network down, quota (403/2007), bad key (401/2006) → a specific message + Retry, no stale map left behind, main weather untouched; Retry after recovery rebuilt the map. 6 of 25 points failing → still drawn, "(6 had no data)". Map library missing → "The map couldn't be loaded" + Retry, **zero** lattice requests wasted (loading it first was a fix made during testing — 8 calls used to be wasted). |
| Responsive | ✅ | Live at 320, 375, 414, 768, 1024, 1440 px with the table open: no horizontal overflow; the table scrolls inside its own box. (Testing found and fixed an overflow: an open data table stretched the card past the screen.) |
| Accessibility | ✅ | Live audit: layer tabs with a tabpanel, map labelled and keyboard-focusable, data table with caption and row/column headers, a text summary, Leaflet's controls and attribution restyled for the dark theme; wheel-zoom only after the map is focused. |
| Base map | ⚠️ | Esri's keyless dark-gray canvas + labels (36 of 36 tiles drawn). Found during testing: CARTO's raster tiles now return "API KEY REQUIRED" and OpenStreetMap's servers block generic clients, so both were replaced. Esri's terms may require a key or subscription for heavy use. |
| Data limits | ⚠️ | 25 extra WeatherAPI calls per place viewed (cached 10 min per point). The lattice is ≈55 km apart, so it shows regional patterns, not street-level detail. A point snaps to WeatherAPI's nearest named location, so neighbouring dots can repeat a name. |

## Non-functional requirements

| Category | Status | Notes |
| --- | --- | --- |
| Performance | ⚠️ | No framework or runtime dependencies; skeleton paints before JS runs. The map library (147 KB) and its 25 requests load only when the heat-map card nears the viewport (verified). No Lighthouse/timing audit was run. |
| API feedback | ✅ | Loading feedback appears the moment a request starts. |
| Reliability | ✅ | See FR-08. |
| Security | ✅ | The README states plainly that a browser-side key is visible to every visitor. Strict CSP + security headers — the dev server sends the same headers as `vercel.json`, and the live testing (search, chips, JSON viewer, suggestions, AQI, the map with tiles and tooltips, responsive, accessibility) produced no CSP violations. The allowlist is exactly: `connect-src` WeatherAPI + Open-Meteo; `img-src` WeatherAPI's icon CDN + Esri's tile server. Leaflet is vendored (checksum-verified, byte-identical) so `script-src` stays `'self'`; map tooltips are DOM nodes, never HTML strings. The original failure-injection runs used a stand-in server without those headers. All dynamic text uses `textContent`; icon URLs are host-checked. |
| Maintainability | ✅ | HTML, CSS and JS are separate; CSS is split into tokens / base / components; JS into `api`, `core`, `ui`. |
| Compatibility | ⚠️ | Only a Chromium-based browser was available. Safari, Firefox and Edge were **not** tested — nor touch behaviour of the map on a real phone. The code uses only widely supported features (ES modules, `fetch`, `AbortController`, `IntersectionObserver`, canvas, CSS grid/custom properties). |
| Accessibility | ⚠️ | Verified: keyboard operation (skip link, focus rings, tab/arrow keys, the suggestion combobox, the AQI switch, the map), label and landmark structure, heading order, no unnamed controls, ARIA tabs, live regions, data-table semantics, and WCAG contrast (lowest pair 4.78:1 — dark text on EPA red — against the 4.5:1 AA limit). Not done: testing with a real screen reader. |
| Responsiveness | ✅ | See FR-09. |
| Scalability | ✅ | Logic is framework-free, DOM-free and unit-tested; components talk only to the store. |

## Deployment (Vercel)

| Item | Status | Evidence |
| --- | --- | --- |
| App deployed to production | ✅ | https://skycred-indol.vercel.app — public, HTTP 200 with no login. Vercel project `skycred`; Vercel itself ran `npm run build` using the project's `WEATHER_API_KEY` variable, so the build path is the same one a Git deploy uses. |
| Verified on the live URL | ✅ | Mumbai loaded on launch (one `fetch`, 200); Delhi chip → `q=Delhi, India` → Delhi, India 26.6 °C; typed "Tokyo" + Enter → Tokyo, Japan; an invalid city → **City not found** with Tokyo kept on screen. Production CSP and security headers are served, and the console held nothing but the browser's own note for the deliberate 400. |
| FR-11…13 redeployed and verified on the live URL | ✅ | Same upload-and-build method, from the commit shown in the repo's history. Production serves the new CSP (WeatherAPI + Open-Meteo + Esri tiles only) and every new file; the deployed `leaflet.js` has the same SHA-256 as the verified vendored copy. Live, under that CSP: the first request is `q=Mumbai&aqi=yes` and no Leaflet, tile or lattice request happens until the map nears the viewport; the AQI card shows Mumbai's level 4 and its six pollutants; typing "lond" → one geocoder request, London first, announced to screen readers; choosing it → the two-step lookup (`London, England, United Kingdom` rejected, `London, United Kingdom` accepted), Europe/London, Good air; the heat map for London drew 25 of 25 points on 24 of 24 tiles (4.4–12.1 °C), the Air quality layer switched with no new requests, and the console stayed empty. At 375 px: no horizontal overflow, 12 of 12 tiles, table scrolling inside its own box, legend as 3 × 2. |
| Deploys automatically on every push to GitHub | ❌ not active | Vercel refused to link the repo: *"To link a GitHub repository, you need to install the GitHub integration first."* The Vercel account has no GitHub connection and a token cannot create one (it needs a one-time OAuth / app install by the account owner). The live deployment was therefore created by uploading the repo's tracked files through Vercel's API, so **a push to GitHub does not redeploy yet**. |
| Other `*.vercel.app` addresses | note | The team alias and the per-deployment URLs sit behind Vercel's default Standard Deployment Protection (they redirect to a Vercel login). The public address is the `skycred-indol` one. Protection settings were not changed. |

To turn on deploy-on-push: install the Vercel GitHub app for `parnikasinghal1996` and connect GitHub to the Vercel account, then link the repo (Project → Settings → Git, or one API call).

## Out of scope

None of it was built: accounts, database, profiles, history, forecasts, push notifications, payments, admin dashboard, backend services.

## Not done / open

1. **Automatic deployment on push is not set up** — see "Deployment (Vercel)". The app is live, but redeploying currently means re-running the upload, until the GitHub ↔ Vercel connection is made.
2. **Visual fidelity to the reference screenshot — not verified.** The PRD refers to an attached screenshot, but none came through, so the visual design is original (dark, "credit-app" look). It needs a comparison once the screenshot is shared.
3. **Safari, Firefox and Edge** were not tested (see above) — nor the suggestions or the map on a touch device.
4. **A real offline state and a real quota-exceeded response** were not reproduced (injected / documented bodies were used instead).
5. **No automated browser tests are checked in.** Logic is covered by `npm test`; the browser checks above were driven by hand during this session.
6. **The three extra personalities** (Hazy Mode, Layer Up, Warm Spell) and the **Delhi country hint** are interpretation calls the product team should confirm.
7. **"Heat map of the region selection" was interpreted** as a map around the selected place (Temperature, plus Air quality). If "region" meant something else — a state or country view over many cities, or an area the user draws — that is a different feature.
8. **Cost of the heat map:** 25 extra WeatherAPI calls per place whose map is viewed (cached 10 minutes per point). Fine for a demo; at real traffic it needs a server-side cache or WeatherAPI's bulk endpoint (a higher plan).
9. **Two new third-party dependencies need a product/legal look:** Open-Meteo's geocoder (free for non-commercial use; the typed text is sent to it) and Esri's keyless map tiles (Esri may require a key or subscription for heavy use).
10. **No numeric 0–500 AQI** — a deliberate decision, explained under FR-11.
