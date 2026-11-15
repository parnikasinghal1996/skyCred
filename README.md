# SKY CRED

> Check the sky's credit score before you step out.

**Live:** https://skycred-indol.vercel.app

Search any city, see its live weather and air quality, and get a plain-language "sky personality" that says whether it's a good moment to step outside — with a heat map of the surrounding region. Plain HTML, CSS and vanilla JavaScript: no framework, no build-time dependencies, no backend. Weather, air quality and the heat-map readings all come from [WeatherAPI.com](https://www.weatherapi.com/).

> The sky personality is an application-generated interpretation — **not a real credit score**.

## Run it

Needs Node 18 or newer (`nvm use` reads `.nvmrc`).

```bash
cp .env.example .env        # then put your WeatherAPI key in WEATHER_API_KEY
npm run dev                 # builds, serves http://localhost:3000, rebuilds on change
npm test                    # unit tests (Node's built-in runner)
npm run build               # writes the deployable site to dist/
```

`npm run dev -- --port 4321` picks another port.

## What it does

| | Behaviour |
| --- | --- |
| FR-01 | Mumbai loads on start-up; the search box shows it; a skeleton is visible from first paint until data arrives. |
| FR-02 | Search by button or Enter. Empty input shows a validation message and sends no request. Any number of searches, no reload. |
| FR-03 | Ten popular-city chips; the displayed city is highlighted and the search box follows the chip. |
| FR-04 | City, local time in the **city's** timezone, temperature in °C, wind in km/h, and the API's own condition icon. |
| FR-05 | Sky personality from temperature, condition and wind — rules and priority below. |
| FR-06 | Humidity, Wind and UV index cards, plus cloud, visibility, pressure, wind speed, °F and last-updated. |
| FR-07 | Formatted / Raw JSON viewer with copy and scrolling; Raw is the response body byte-for-byte. |
| FR-08 | Every failure has its own message; Retry only where retrying can help; valid data is never replaced by a failure; late responses can't overwrite newer ones. |
| FR-09 | Centered, max-width layout; stacks on mobile with no horizontal overflow down to 320 px. |
| FR-10 | `GET /v1/current.json?key=…&q=…&aqi=yes`, fresh on every search (`cache: no-store`). |
| FR-11 | **Air quality (AQI)** — a "Show air quality (AQI)" switch (on by default, remembered) controls an air-quality card. |
| FR-12 | **Search suggestions** — places appear under the search box as you type; picking one searches that exact place. |
| FR-13 | **Regional heat map** — temperature or air quality across a ≈280 km area around the place, over a map. |

Requirement-by-requirement results, with how each was tested: [docs/REQUIREMENTS_CHECKLIST.md](docs/REQUIREMENTS_CHECKLIST.md).

## Air quality (AQI)

The switch under the popular cities shows or hides the air-quality card. The data costs nothing extra: it comes from the same `current.json` call (`aqi=yes`), so it is also in the JSON viewer whether or not the card is showing. The choice is saved in `localStorage` (and quietly falls back to memory if storage is blocked).

The card shows WeatherAPI's **US EPA level (1–6)** — Good, Moderate, Unhealthy for sensitive groups, Unhealthy, Very unhealthy, Hazardous — with that level's standard AQI range (e.g. level 4 = AQI 151–200), a six-step scale with the current step marked, the EPA's plain-language advice, the six pollutants (PM2.5, PM10, O₃, NO₂, SO₂, CO in µg/m³) and the UK DEFRA index.

**It does not compute a 0–500 number.** Checked against 90 live readings, WeatherAPI's own level agrees with the textbook EPA formula on only 80 of them (it uses its own PM2.5 cut-offs), so a number computed here would sometimes contradict the category WeatherAPI reports. Showing the API's level and its standard range keeps every figure traceable to the JSON. Places WeatherAPI has no air-quality data for show "not available" instead of an error.

## Search suggestions

Type two or more characters and up to six places appear (name, region, country, with your text highlighted). Typing is debounced (220 ms), answers are cached per query, an older request is aborted by a newer keystroke, and a late answer can never replace a newer list. If the suggestion service fails the list says so — and **plain search keeps working** (Enter searches what you typed, exactly as before).

| Key | Does |
| --- | --- |
| ↓ / ↑ | move through the suggestions (focus stays in the box; screen readers follow via `aria-activedescendant`) |
| Enter | choose the highlighted suggestion — with nothing highlighted, search the typed text |
| Esc | close the list · Tab closes it too · click or tap chooses |

**Why not WeatherAPI's own search?** It is a fuzzy full-name matcher, not a prefix autocomplete: typing "mum" returns *Mumias, Kenya*, "pun" returns *Punia Airport*, "tok" returns *Torokina Airport*. Across 22 common prefixes it surfaced the expected city for 13; Open-Meteo's free geocoder did for 20. So suggestions come from Open-Meteo; **weather still comes only from WeatherAPI**.

**Choosing a suggestion looks up that exact place.** WeatherAPI resolves bare coordinates to the nearest *neighbourhood* ("Strand" for London), and `London, England, United Kingdom` resolves to *New England*, 74 km away — so the lookup tries accent-free `Name, Region, Country`, then `Name, Country`, then the original spelling, then coordinates, and keeps the **first answer that lands within 50 km** of the place you picked. That is why Springfield, Missouri is not Springfield, Illinois, why accents work (`Kraków, …` alone resolves to *Poland, New York*; `Hyderābād, …` to a village 200 km away), and why every popular city is one request. When WeatherAPI only has a differently named point nearby, the card says so: *"Nearest weather point to Krakow · about 1 km away"*.

## Regional heat map

A card under the details shows a map centred on the place, with a colour field over about 280 km × 280 km:

- **Temperature** — blue (cooler) → red (warmer). The scale follows the region's own range but is never narrower than 4 °C, so a region that varies by 0.4 °C looks flat rather than like a rainbow of noise.
- **Air quality** (while the AQI switch is on) — WeatherAPI's US EPA level in the EPA's own colours.

**Where the colours come from:** a 5×5 lattice (≈ 55 km apart) around the place; every lattice point is a real WeatherAPI reading (`current.json?q=lat,lon&aqi=yes`), plus the place's own reading. They are blended with a smooth Gaussian-weighted average, and a failed point simply lets its neighbours fill the gap. Hover a dot for its exact value; **"View the data points behind the map"** lists all 26 as a table (also the accessible alternative to the picture), and a text summary names the warmest and coolest spots.

**What it costs:** 25 WeatherAPI calls per place (8 at a time, ~1.3 s), cached for 10 minutes per point. They only start when the card is scrolled near the viewport — the map library (Leaflet, vendored) is loaded at that moment too — so the first screen stays fast and quota isn't spent on a map nobody looked at. Choosing another place aborts the old sampling. Watch your WeatherAPI quota if you embed this at scale.

**When things go wrong** the card says what happened and offers Retry, and the rest of the page is untouched: network failure, exhausted quota, rejected key, the map library failing to load, or too few points answering (it still draws a map from partial data and says "6 had no data"). The map's wheel-zoom switches on only once the map is focused (so scrolling the page never gets hijacked); on phones one finger scrolls the page and pinch zooms.

**Base map:** Esri's keyless *World Dark Gray Canvas* tiles (a basemap designed to sit under data colours) plus its labels layer, drawn above the colours. CARTO's raster tiles now answer "API KEY REQUIRED" and OpenStreetMap's volunteer servers block generic clients, so both were ruled out.

## Sky personality rules

The first matching rule wins, so overlapping conditions always resolve the same way. Thresholds live in [`src/js/core/personality.js`](src/js/core/personality.js).

| # | Rule | Personality | Recommendation |
| - | --- | --- | --- |
| 1 | temp ≥ 35 °C | **Sun Alert** | Stay hydrated and avoid excessive sun exposure. |
| 2 | temp ≤ 5 °C | **Freeze Frame** | Bone-chilling cold. Bundle up tight. |
| 3 | rain, drizzle, sleet or thunder | **Rain Check** | Carry an umbrella before stepping out. |
| 4 | fog, smoke, haze, dust or sand † | **Hazy Mode** | Reduced visibility or air quality. Take it easy outdoors. |
| 5 | wind ≥ 30 km/h | **Breezy Mode** | Expect strong winds. Dress accordingly. |
| 6 | 18 – 30 °C | **Perfect Day** | Great weather to step outside. |
| 7 | 5 – 18 °C † | **Layer Up** | Cool out there. A jacket will keep you comfortable. |
| 8 | 30 – 35 °C † | **Warm Spell** | Warm weather. Light clothes and a water bottle will help. |

† Not among the PRD's five examples. They exist so every reading maps to an honest message — without them a severe sandstorm or Delhi's smog season would be a "Perfect Day". They are one-line removals if the product team disagrees.

Condition codes are authoritative when known; WeatherAPI keeps adding conditions (live data already returns "Smoky haze" and "Severe sandstorm"), so unknown codes are classified from the condition text.

## Errors

| Situation | Message | Retry |
| --- | --- | --- |
| Empty search | "Please enter a city name to search." (under the box, no request) | – |
| Unknown city (API 1006) | **City not found** | – |
| Missing / invalid / disabled key (1002, 2006, 2008, 2009, 401/403) | **API configuration error** | – |
| Quota exceeded (2007) or HTTP 429 | **Temporary service error** | yes |
| `fetch` fails / offline | **Network connection problem** | yes |
| HTTP 5xx | **Service unavailable** | yes |
| No answer in 15 s | **Request timed out** | yes |
| Non-JSON body or missing fields | **Something went wrong** | yes |
| Slow response | Skeleton (first load) or dimmed data under a "Fetching weather for …" pill | – |

With nothing on screen yet, an error replaces the card (never a blank card). With data on screen, an error banner appears above it and the data stays. The heat map and the suggestion list report their own failures in place (see above) without touching the weather.

**Delhi:** WeatherAPI resolves a bare `q=Delhi` to *Delhi, Ontario, Canada*, so Delhi is sent as `Delhi, India` (typed or clicked). The other nine popular cities resolve correctly and are sent exactly as written — Mumbai is still `q=Mumbai`. See `POPULAR_CITY_QUERIES` in [`constants.js`](src/js/core/constants.js).

## Third-party services

| Service | Used for | What it receives |
| --- | --- | --- |
| [WeatherAPI.com](https://www.weatherapi.com/) | weather, air quality, heat-map readings, condition icons | the API key, the city or place you search, and the lattice coordinates around it |
| [Open-Meteo geocoding](https://open-meteo.com/en/docs/geocoding-api) | place suggestions | **the text typed in the search box** (from 2 characters, debounced). Free for non-commercial use. |
| Esri ArcGIS tile servers | map tiles and labels | tile coordinates (≈ the area on screen), your IP address and the page's origin. Keyless today; Esri may require a key or subscription for heavy use. |
| Leaflet 1.9.4 | map interaction | nothing — it is [vendored](src/vendor/leaflet) (BSD-2-Clause, byte-identical to the checksum-verified npm package) and loaded lazily |

The Content-Security-Policy in `vercel.json` allows exactly these hosts and nothing else: `connect-src` WeatherAPI + Open-Meteo, `img-src` WeatherAPI's icon CDN + Esri tiles.

## Project layout

```
src/
  index.html            markup — labels and structure only, no weather values
  css/                  tokens.css · base.css · components.css · map.css
  vendor/leaflet/       Leaflet 1.9.4, unmodified (see its README for provenance)
  js/
    main.js             entry point
    api/                weatherApi.js (current weather + exact-place lookup) · geocodingApi.js (suggestions)
                        http.js (shared timeout/abort transport) · errors.js (types, copy, classification)
    core/               store.js (state, request ordering) · suggestions.js (debounce, cache, stale-guard)
                        regionSampler.js (lattice requests) · heatmap.js (lattice, interpolation, colour scales)
                        aqi.js · places.js · geo.js · preferences.js
                        personality.js · viewModel.js · format.js · cities.js · constants.js · loadConfig.js
    ui/                 one small module per component, wired together in app.js
scripts/                build.mjs (copy + generate js/env.js) · dev.mjs (local server)
tests/                  unit tests; fixtures are real WeatherAPI / Open-Meteo responses
```

`core/` and `api/` never touch the DOM, so the logic is unit-tested in Node (136 tests). All dynamic text is written with `textContent`, never `innerHTML`; map tooltips are DOM nodes, not HTML strings.

## Deploying on Vercel

`vercel.json` already sets the build command (`npm run build`), the output directory (`dist`) and the security headers (including a strict Content-Security-Policy). The only configuration needed is one environment variable on the Vercel project:

| Name | Value |
| --- | --- |
| `WEATHER_API_KEY` | your WeatherAPI key |

Once the GitHub repository is connected to the Vercel project (Project → Settings → Git, which needs the [Vercel GitHub app](https://github.com/apps/vercel) installed on the account), every push to `main` deploys to production and every other branch gets a preview URL.

## Security note

This is a browser-only app, so the WeatherAPI key is inlined into the built JavaScript (`dist/js/env.js`) and **every visitor can read it** in DevTools. `.env` and the Vercel environment variable keep it out of Git; they cannot keep it out of the browser. Use a dedicated free-tier key, restrict it in the WeatherAPI dashboard if you can, rotate it if it leaks, and move the calls behind a small server-side proxy if you ever need a real secret. The heat map multiplies the calls a visitor can make (25 per place), which is one more reason to keep the key low-value. A backend is out of scope for this release.

## Out of scope

User accounts, database, profiles, history, forecasts, push notifications, payments, admin dashboard, backend services.
