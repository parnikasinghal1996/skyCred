/**
 * Inline SVG icons (24×24, stroke-based — shapes follow the open-source Feather / Lucide sets).
 * Elements are described as data and built with createElementNS, so no markup strings are parsed.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICONS = {
  search: [['circle', { cx: 11, cy: 11, r: 8 }], ['line', { x1: 21, y1: 21, x2: 16.65, y2: 16.65 }]],
  'map-pin': [['path', { d: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z' }], ['circle', { cx: 12, cy: 10, r: 3 }]],
  clock: [['circle', { cx: 12, cy: 12, r: 10 }], ['polyline', { points: '12 6 12 12 16 14' }]],
  droplet: [['path', { d: 'M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z' }]],
  wind: [['path', { d: 'M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2' }]],
  sun: [
    ['circle', { cx: 12, cy: 12, r: 5 }],
    ['line', { x1: 12, y1: 1, x2: 12, y2: 3 }],
    ['line', { x1: 12, y1: 21, x2: 12, y2: 23 }],
    ['line', { x1: 4.22, y1: 4.22, x2: 5.64, y2: 5.64 }],
    ['line', { x1: 18.36, y1: 18.36, x2: 19.78, y2: 19.78 }],
    ['line', { x1: 1, y1: 12, x2: 3, y2: 12 }],
    ['line', { x1: 21, y1: 12, x2: 23, y2: 12 }],
    ['line', { x1: 4.22, y1: 19.78, x2: 5.64, y2: 18.36 }],
    ['line', { x1: 18.36, y1: 5.64, x2: 19.78, y2: 4.22 }],
  ],
  cloud: [['path', { d: 'M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z' }]],
  eye: [['path', { d: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' }], ['circle', { cx: 12, cy: 12, r: 3 }]],
  gauge: [['path', { d: 'm12 14 4-4' }], ['path', { d: 'M3.34 19a10 10 0 1 1 17.32 0' }]],
  thermometer: [['path', { d: 'M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z' }]],
  'refresh-cw': [
    ['polyline', { points: '23 4 23 10 17 10' }],
    ['polyline', { points: '1 20 1 14 7 14' }],
    ['path', { d: 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' }],
  ],
  copy: [
    ['rect', { x: 9, y: 9, width: 13, height: 13, rx: 2, ry: 2 }],
    ['path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }],
  ],
  'alert-triangle': [
    ['path', { d: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' }],
    ['line', { x1: 12, y1: 9, x2: 12, y2: 13 }],
    ['line', { x1: 12, y1: 17, x2: 12.01, y2: 17 }],
  ],
  'wifi-off': [
    ['line', { x1: 1, y1: 1, x2: 23, y2: 23 }],
    ['path', { d: 'M16.72 11.06A10.94 10.94 0 0 1 19 12.55' }],
    ['path', { d: 'M5 12.55a10.94 10.94 0 0 1 5.17-2.39' }],
    ['path', { d: 'M10.71 5.05A16 16 0 0 1 22.58 9' }],
    ['path', { d: 'M1.42 9a15.91 15.91 0 0 1 4.7-2.88' }],
    ['path', { d: 'M8.53 16.11a6 6 0 0 1 6.95 0' }],
    ['line', { x1: 12, y1: 20, x2: 12.01, y2: 20 }],
  ],
  key: [['path', { d: 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4' }]],
  snowflake: [
    ['path', { d: 'M2 12h20' }],
    ['path', { d: 'M12 2v20' }],
    ['path', { d: 'm20 16-4-4 4-4' }],
    ['path', { d: 'm4 8 4 4-4 4' }],
    ['path', { d: 'm16 4-4 4-4-4' }],
    ['path', { d: 'm8 20 4-4 4 4' }],
  ],
  smile: [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['path', { d: 'M8 14s1.5 2 4 2 4-2 4-2' }],
    ['line', { x1: 9, y1: 9, x2: 9.01, y2: 9 }],
    ['line', { x1: 15, y1: 9, x2: 15.01, y2: 9 }],
  ],
  'cloud-rain': [
    ['line', { x1: 16, y1: 13, x2: 16, y2: 21 }],
    ['line', { x1: 8, y1: 13, x2: 8, y2: 21 }],
    ['line', { x1: 12, y1: 15, x2: 12, y2: 23 }],
    ['path', { d: 'M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25' }],
  ],
  layers: [
    ['polygon', { points: '12 2 2 7 12 12 22 7 12 2' }],
    ['polyline', { points: '2 17 12 22 22 17' }],
    ['polyline', { points: '2 12 12 17 22 12' }],
  ],
};

function svgElement(tag, attributes) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes || {})) element.setAttribute(name, String(value));
  return element;
}

function createLogo() {
  const svg = svgElement('svg', { viewBox: '0 0 40 40', 'aria-hidden': 'true', focusable: 'false' });
  const gradient = svgElement('linearGradient', { id: 'skycred-logo-gradient', x1: 0, y1: 0, x2: 1, y2: 1 });
  gradient.append(
    svgElement('stop', { offset: 0, 'stop-color': '#5ac8fa' }),
    svgElement('stop', { offset: 1, 'stop-color': '#8b7cff' })
  );
  const defs = svgElement('defs');
  defs.append(gradient);
  svg.append(
    defs,
    svgElement('rect', { width: 40, height: 40, rx: 12, fill: 'url(#skycred-logo-gradient)' }),
    svgElement('circle', { cx: 16, cy: 22, r: 6, fill: '#fff' }),
    svgElement('circle', { cx: 24, cy: 19, r: 7.5, fill: '#fff' }),
    svgElement('rect', { x: 11, y: 22, width: 20, height: 6, rx: 3, fill: '#fff' })
  );
  return svg;
}

export function createIcon(name) {
  if (name === 'logo') return createLogo();
  const shapes = ICONS[name];
  if (!shapes) return null;
  const svg = svgElement('svg', {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.8,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
    class: 'icon',
  });
  for (const [tag, attributes] of shapes) svg.append(svgElement(tag, attributes));
  return svg;
}

/** Replace the contents of `element` with the named icon. */
export function setIcon(element, name) {
  const icon = createIcon(name);
  if (icon) element.replaceChildren(icon);
}

/** Fill every <span data-icon="name"> under `root`. */
export function hydrateIcons(root = document) {
  for (const element of root.querySelectorAll('[data-icon]')) setIcon(element, element.dataset.icon);
}
