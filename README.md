# SKY CRED

> Check the sky's credit score before you step out.

Search any city, see its live weather, and get a plain-language "sky personality" that says whether it's a good moment to step outside. Plain HTML, CSS and vanilla JavaScript — no framework, no runtime dependencies, no backend. Weather comes live from [WeatherAPI.com](https://www.weatherapi.com/) (`/v1/current.json`).

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

| PRD | Behaviour |
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
| FR-10 | `GET /v1/current.json?key=…&q=…`, fresh on every search (`cache: no-store`). |

Full requirement-by-requirement results, with how each was tested: [docs/REQUIREMENTS_CHECKLIST.md](docs/REQUIREMENTS_CHECKLIST.md).

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

With nothing on screen yet, an error replaces the card (never a blank card). With data on screen, an error banner appears above it and the data stays.

**Delhi:** WeatherAPI resolves a bare `q=Delhi` to *Delhi, Ontario, Canada*, so Delhi is sent as `Delhi, India` (typed or clicked). The other nine popular cities resolve correctly and are sent exactly as written — Mumbai is still `q=Mumbai`. See `POPULAR_CITY_QUERIES` in [`constants.js`](src/js/core/constants.js).

## Project layout

```
src/
  index.html            markup — labels and structure only, no weather values
  css/                  tokens.css · base.css · components.css
  js/
    main.js             entry point
    api/                weatherApi.js (client) · errors.js (types, copy, classification)
    core/               store.js (state, request ordering) · personality.js · viewModel.js
                        format.js · cities.js · constants.js · loadConfig.js
    ui/                 one small module per component, wired together in app.js
scripts/                build.mjs (copy + generate js/env.js) · dev.mjs (local server)
tests/                  unit tests; fixtures are real WeatherAPI responses
```

`core/` and `api/` never touch the DOM, so the logic is unit-tested in Node. All dynamic text is written with `textContent`, never `innerHTML`.

## Deploying on Vercel

`vercel.json` already sets the build command (`npm run build`), the output directory (`dist`) and the security headers (including a strict Content-Security-Policy). The only configuration needed is one environment variable on the Vercel project:

| Name | Value |
| --- | --- |
| `WEATHER_API_KEY` | your WeatherAPI key |

With the GitHub repository connected to the Vercel project, every push to `main` deploys to production and every other branch gets a preview URL.

## Security note

This is a browser-only app, so the WeatherAPI key is inlined into the built JavaScript (`dist/js/env.js`) and **every visitor can read it** in DevTools. `.env` and the Vercel environment variable keep it out of Git; they cannot keep it out of the browser. Use a dedicated free-tier key, restrict it in the WeatherAPI dashboard if you can, rotate it if it leaks, and move the call behind a small server-side proxy if you ever need a real secret. A backend is out of scope for this release.

## Out of scope

User accounts, database, profiles, history, forecasts, push notifications, payments, admin dashboard, backend services.
