/**
 * Regional heat map card.
 *
 * For the place on screen it samples WeatherAPI on a 5×5 lattice (≈ 280 km across), interpolates the readings
 * into a smooth colour field and lays it over a dark map — Temperature, or Air quality while the AQI switch is on.
 *
 *  • the map library (Leaflet, vendored) and the 25 requests only start once the card is near the viewport,
 *    so the first screen stays fast and the API quota isn't spent on a map nobody scrolled to;
 *  • choosing another place aborts the old sampling; a late answer for an old place is ignored;
 *  • every number on the map is also in "View the data points", and in a hover tooltip on its dot.
 */
import { ErrorType, WeatherApiError } from '../api/errors.js';
import { AQI_LEVELS, aqiLevelOf } from '../core/aqi.js';
import {
  aqiScale,
  defaultSigma,
  gradientCss,
  interpolateField,
  renderRgba,
  summarize,
  temperatureScale,
} from '../core/heatmap.js';
import { byId, h } from './dom.js';
import { createTabs } from './tabs.js';

const LEAFLET_SCRIPT = 'vendor/leaflet/leaflet.js';
const LEAFLET_STYLE = 'vendor/leaflet/leaflet.css';
// Esri's dark-gray canvas: a basemap made to sit under data colours, served without an API key.
// (Checked first: CARTO's raster tiles now answer "API KEY REQUIRED", and OpenStreetMap's volunteer-run
// servers block generic clients.) Note Esri's {z}/{y}/{x} order. Labels are a separate layer so they can
// sit ABOVE the heat colours and stay readable.
const BASE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const LABEL_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}';
const ATTRIBUTION = 'Tiles © Esri — Esri, DeLorme, NAVTEQ';

const FIELD_PIXELS = 96; // interpolation resolution; the browser smooths it up to the map size
const OVERLAY_OPACITY = 0.66;
const KM_PER_DEGREE = 111.2;

const round1 = (value) => Math.round(value * 10) / 10;
const SHORT_LEVEL = ['Good', 'Moderate', 'Sensitive groups', 'Unhealthy', 'Very unhealthy', 'Hazardous'];

const LAYERS = {
  temperature: {
    valueOf: (point) => point.temp,
    format: (value) => `${round1(value)}°C`,
    scaleFor: (values) => temperatureScale(values),
    columns: ['Latitude', 'Longitude', 'Nearest place', 'Temperature (°C)'],
    cells: (point) => [Number.isFinite(point.temp) ? String(point.temp) : 'no data'],
  },
  aqi: {
    valueOf: (point) => point.aqiLevel,
    format: (value) => `Level ${value} · ${AQI_LEVELS[value - 1].label}`,
    scaleFor: () => aqiScale(),
    columns: ['Latitude', 'Longitude', 'Nearest place', 'US EPA level', 'PM2.5 (µg/m³)'],
    cells: (point) => [
      Number.isFinite(point.aqiLevel) ? `${point.aqiLevel} · ${AQI_LEVELS[point.aqiLevel - 1].label}` : 'no data',
      Number.isFinite(point.pm25) ? String(point.pm25) : '–',
    ],
  },
};

// ---- lazy loading of the vendored map library -----------------------------------------------------------

function loadAsset(element, ready) {
  return new Promise((resolve, reject) => {
    element.onload = () => resolve();
    element.onerror = () => reject(new Error(`Could not load ${ready}`));
    document.head.append(element);
  });
}

let leafletPromise = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletPromise) {
    const script = document.createElement('script');
    script.src = LEAFLET_SCRIPT;
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = LEAFLET_STYLE;
    leafletPromise = Promise.all([loadAsset(script, LEAFLET_SCRIPT), loadAsset(style, LEAFLET_STYLE)])
      .then(() => {
        if (!window.L) throw new Error('Leaflet did not initialise');
        return window.L;
      })
      .catch((error) => {
        leafletPromise = null; // let Retry try again
        throw error;
      });
  }
  return leafletPromise;
}

function describeFailure(error) {
  if (error instanceof WeatherApiError) {
    switch (error.type) {
      case ErrorType.RATE_LIMIT:
        return 'The weather service is busy, so the heat map is paused. Try again in a moment.';
      case ErrorType.API_CONFIG:
        return 'The weather service rejected the API key, so the heat map can’t load.';
      case ErrorType.NETWORK:
        return 'We couldn’t reach the weather service to build the heat map. Check your connection and retry.';
      default:
        return 'The heat map couldn’t be built right now. Please retry.';
    }
  }
  return 'The map couldn’t be loaded. Check your connection and retry.';
}

// ---- the view ----------------------------------------------------------------------------------------------

export function createHeatMapView({ sampler, preferences, announce }) {
  const el = {
    card: byId('heat-card'),
    subtitle: byId('heat-sub'),
    tabTemperature: byId('layer-temperature'),
    tabAqi: byId('layer-aqi'),
    stage: byId('heat-stage'),
    map: byId('heat-map'),
    status: byId('heat-status'),
    spinner: byId('heat-spinner'),
    statusText: byId('heat-status-text'),
    retry: byId('heat-retry'),
    legend: byId('heat-legend'),
    summary: byId('heat-summary'),
    dataHead: byId('heat-data-head'),
    dataBody: byId('heat-data-body'),
  };

  const view = {
    layer: 'temperature',
    target: null, // the place on screen: { lat, lon, name, temp, aqiLevel }
    startedFor: null, // the place the current / last sampling run was started for
    result: null,
    visible: false,
    runId: 0,
    controller: null,
    L: null,
    map: null,
    group: null,
  };

  // ---- status overlay ----
  function setStatus(kind, text = '') {
    el.status.hidden = kind === 'ready';
    el.status.dataset.kind = kind;
    el.spinner.hidden = kind !== 'loading';
    el.retry.hidden = kind !== 'error';
    el.statusText.textContent = text;
  }

  function clearDrawing() {
    if (view.group) view.group.clearLayers();
    el.legend.replaceChildren();
    el.summary.textContent = '';
    el.dataHead.replaceChildren();
    el.dataBody.replaceChildren();
  }

  function stopRun() {
    view.runId++;
    if (view.controller) {
      view.controller.abort();
      view.controller = null;
    }
  }

  function fail(error) {
    clearDrawing();
    const message = describeFailure(error);
    setStatus('error', message);
    announce(message);
  }

  // ---- map ----
  function ensureMap(L) {
    if (view.map) return;
    const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const map = L.map(el.map, {
      scrollWheelZoom: false, // the page keeps scrolling over the map until it is focused
      dragging: !L.Browser.mobile, // on phones one finger scrolls the page; pinch still zooms
      zoomSnap: 0.5,
      minZoom: 3,
      maxZoom: 12,
      zoomAnimation: !calm,
      fadeAnimation: !calm,
      markerZoomAnimation: !calm,
    });
    L.tileLayer(BASE_TILES, { maxNativeZoom: 16, maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);

    // Stacking, bottom to top: base map (200) · heat colours (300) · place names (350) · dots (400) · tooltips (650)
    map.createPane('heat').style.zIndex = 300;
    const labels = map.createPane('labels');
    labels.style.zIndex = 350;
    labels.style.pointerEvents = 'none';
    L.tileLayer(LABEL_TILES, { pane: 'labels', maxNativeZoom: 16, maxZoom: 19 }).addTo(map);

    map.on('focus', () => map.scrollWheelZoom.enable());
    map.on('blur', () => map.scrollWheelZoom.disable());
    view.L = L;
    view.map = map;
    view.group = L.layerGroup().addTo(map);
  }

  const tip = (...lines) => h('span', null, ...lines.flatMap((line, i) => (i ? [h('br'), line] : [line])));

  // ---- drawing (everything below re-runs on a layer switch; sampling does not) ----
  function paintLegend(layerKey, scale) {
    if (layerKey === 'temperature') {
      const bar = h('div', { class: 'legend-bar' });
      bar.style.backgroundImage = gradientCss(scale.stops);
      el.legend.replaceChildren(
        bar,
        h(
          'div',
          { class: 'legend-scale' },
          h('span', null, `${round1(scale.domain[0])}°C`),
          h('span', null, 'cooler → warmer'),
          h('span', null, `${round1(scale.domain[1])}°C`)
        )
      );
    } else {
      el.legend.replaceChildren(
        h(
          'div',
          { class: 'legend-swatches' },
          ...SHORT_LEVEL.map((label, i) =>
            h('span', { class: 'legend-swatch' }, h('span', { class: 'legend-swatch__chip', 'data-level': i + 1 }), label)
          )
        )
      );
    }
  }

  function summaryText(layerKey, readings, result) {
    const layer = LAYERS[layerKey];
    const stats = summarize(readings, layer.valueOf);
    const spacing = Math.round((result.grid.latStep * KM_PER_DEGREE) / 5) * 5;
    const near = (point) => `near ${point.name || 'an unnamed spot'}`;
    const parts = [];

    if (!stats.count) {
      parts.push(layerKey === 'aqi' ? 'WeatherAPI has no air-quality data for this region.' : 'No temperature readings came back.');
    } else if (layerKey === 'temperature') {
      parts.push(`Warmest ${round1(stats.max.value)}°C ${near(stats.max.point)}`);
      parts.push(`coolest ${round1(stats.min.value)}°C ${near(stats.min.point)}`);
      parts.push(`average ${round1(stats.mean)}°C`);
    } else {
      parts.push(`Worst air: ${layer.format(stats.max.value)} ${near(stats.max.point)}`);
      parts.push(`best: ${layer.format(stats.min.value)} ${near(stats.min.point)}`);
      const pm = summarize(readings, (point) => point.pm25);
      if (pm.count) parts.push(`PM2.5 ${round1(pm.min.value)}–${round1(pm.max.value)} µg/m³`);
    }
    const missing = result.total - result.okCount;
    parts.push(`${result.okCount} of ${result.total} points answered, about ${spacing} km apart${missing ? ` (${missing} had no data)` : ''}`);
    return `${parts.join(' · ')}.`;
  }

  function paintTable(layerKey, result) {
    const layer = LAYERS[layerKey];
    const target = view.startedFor;
    el.dataHead.replaceChildren(h('tr', null, ...layer.columns.map((name) => h('th', { scope: 'col' }, name))));

    // every row has the same columns: latitude, longitude, nearest place, then the layer's own values
    const line = (point, place) =>
      h(
        'tr',
        null,
        h('th', { scope: 'row' }, String(point.lat)),
        h('td', null, String(point.lon)),
        h('td', null, place),
        ...layer.cells(point).map((cell) => h('td', null, cell))
      );
    el.dataBody.replaceChildren(
      line(target, `${target.name} (selected place)`),
      ...result.points.map((point) => line(point, point.ok ? point.name : 'no data'))
    );
  }

  function redraw() {
    const { L, map, group, result, startedFor: target } = view;
    if (!L || !map || !result || !target) return;
    const layerKey = view.layer;
    const layer = LAYERS[layerKey];
    group.clearLayers();

    const own = { lat: target.lat, lon: target.lon, name: target.name, temp: target.temp, aqiLevel: target.aqiLevel, pm25: target.pm25, ok: true };
    const readings = [...result.points.filter((point) => point.ok), own];
    const usable = readings.filter((point) => Number.isFinite(layer.valueOf(point)));
    const { bounds } = result.grid;
    const latLngBounds = L.latLngBounds([bounds.south, bounds.west], [bounds.north, bounds.east]);

    if (usable.length) {
      const scale = layer.scaleFor(usable.map(layer.valueOf));
      const field = interpolateField(
        usable.map((point) => ({ lat: point.lat, lon: point.lon, value: layer.valueOf(point) })),
        { bounds, width: FIELD_PIXELS, height: FIELD_PIXELS, sigmaDeg: defaultSigma(result.grid.latStep) }
      );
      const canvas = document.createElement('canvas');
      canvas.width = FIELD_PIXELS;
      canvas.height = FIELD_PIXELS;
      const pixels = renderRgba(field, { width: FIELD_PIXELS, height: FIELD_PIXELS, colorAt: scale.colorAt });
      canvas.getContext('2d').putImageData(new ImageData(pixels, FIELD_PIXELS, FIELD_PIXELS), 0, 0);
      L.imageOverlay(canvas.toDataURL('image/png'), latLngBounds, {
        pane: 'heat',
        opacity: OVERLAY_OPACITY,
        interactive: false,
        className: 'heat-overlay',
      }).addTo(group);
      paintLegend(layerKey, scale);

      for (const point of usable.filter((p) => p !== own)) {
        L.circleMarker([point.lat, point.lon], {
          radius: 3,
          weight: 1,
          color: '#ffffff',
          opacity: 0.55,
          fillColor: '#ffffff',
          fillOpacity: 0.85,
        })
          .bindTooltip(tip(layer.format(layer.valueOf(point)), `near ${point.name}`), { className: 'heat-tip', direction: 'top' })
          .addTo(group);
      }
      const label = Number.isFinite(layer.valueOf(own)) ? `${target.name} · ${layer.format(layer.valueOf(own))}` : target.name;
      L.circleMarker([target.lat, target.lon], { radius: 7, weight: 3, color: '#ffffff', fillColor: '#5ac8fa', fillOpacity: 1 })
        .bindTooltip(tip(label), { permanent: true, direction: 'top', offset: [0, -8], className: 'heat-tip heat-tip--center' })
        .addTo(group);
    } else {
      el.legend.replaceChildren();
    }

    el.summary.textContent = summaryText(layerKey, readings, result);
    paintTable(layerKey, result);
    map.invalidateSize();
    map.fitBounds(latLngBounds, { padding: [6, 6], animate: false });
  }

  // ---- sampling ----
  async function start() {
    const target = view.target;
    if (!target) return;
    stopRun();
    const runId = view.runId;
    const controller = new AbortController();
    view.controller = controller;
    view.startedFor = target;
    view.result = null;
    setStatus('loading', `Sampling points around ${target.name}…`);

    try {
      // The map library first (small, same-origin, cached after the first time): if it cannot load there is
      // no point spending 25 API calls on a map that can't be drawn.
      const L = await loadLeaflet();
      if (runId !== view.runId) return;
      const result = await sampler.sample(
        { lat: target.lat, lon: target.lon },
        {
          signal: controller.signal,
          onProgress: (done, total) => {
            if (runId === view.runId) setStatus('loading', `Sampling points around ${target.name}… ${done}/${total}`);
          },
        }
      );
      if (runId !== view.runId) return;

      view.result = result;
      const { bounds } = result.grid;
      const acrossKm = Math.round(((bounds.north - bounds.south) * KM_PER_DEGREE) / 10) * 10;
      el.subtitle.textContent = `Around ${target.name} · about ${acrossKm} km across`;
      ensureMap(L);
      redraw();
      setStatus('ready');
      announce(`Heat map ready. ${el.summary.textContent}`);
    } catch (error) {
      if (runId !== view.runId || (error && error.name === 'AbortError')) return;
      stopRun(); // a failure on one side (map script or sampling) should not leave the other running
      fail(error);
    } finally {
      if (view.controller === controller) view.controller = null;
    }
  }

  const needsStart = () => Boolean(view.target) && view.startedFor !== view.target && !view.controller;

  // ---- wiring ----
  const tabs = createTabs({
    tabs: [el.tabTemperature, el.tabAqi],
    onSelect: (tab) => {
      view.layer = tab.dataset.layer;
      el.stage.setAttribute('aria-labelledby', tab.id);
      redraw();
    },
  });

  el.retry.addEventListener('click', start);

  if (typeof IntersectionObserver === 'undefined') {
    view.visible = true;
  } else {
    new IntersectionObserver(
      (entries) => {
        view.visible = entries.some((entry) => entry.isIntersecting);
        if (view.visible && needsStart()) start();
        if (view.visible && view.map) view.map.invalidateSize();
      },
      { rootMargin: '240px 0px' }
    ).observe(el.card);
  }

  function refresh() {
    const showAqi = preferences.get('showAqi');
    el.tabAqi.hidden = !showAqi;
    if (!showAqi && view.layer === 'aqi') tabs.select(el.tabTemperature); // redraws with the temperature layer
  }
  refresh();

  let lastWeather = null;
  return {
    /** Called with every store update; only a NEW result changes the map. */
    render(weather) {
      if (!weather || weather === lastWeather) return;
      lastWeather = weather;
      const { location, current } = weather.data;
      stopRun(); // whatever was being gathered belongs to the previous place
      clearDrawing();

      if (!Number.isFinite(location.lat) || !Number.isFinite(location.lon)) {
        view.target = null;
        el.subtitle.textContent = '';
        setStatus('error', 'This place has no coordinates, so there is nothing to map.');
        return;
      }
      const air = current.air_quality;
      view.target = {
        lat: location.lat,
        lon: location.lon,
        name: location.name,
        temp: current.temp_c,
        aqiLevel: aqiLevelOf(air),
        pm25: air && Number.isFinite(air.pm2_5) ? air.pm2_5 : null,
      };
      el.subtitle.textContent = `Around ${location.name}`;
      setStatus('loading', 'Heat map loads as you scroll here…');
      if (view.visible) start();
    },
    refresh,
  };
}
