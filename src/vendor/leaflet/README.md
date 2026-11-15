# Leaflet 1.9.4 (vendored)

Interactive map library used by the regional heat map. BSD-2-Clause — see `LICENSE`.

- Source: npm package `leaflet@1.9.4` (https://leafletjs.com)
- Registry integrity (sha512): `sha512-nxS1ynzJOmOlHp+iL3FyWqK89GtNL8U8rvlMOsQdTTssxZwCXh8N2NB3GDQOL+YR3XnWyZAxwQixURb+FA74PA==`
- Files are copied unmodified from the package's `dist/` folder (`leaflet.js` minified UMD build, `leaflet.css`, `images/`).
- Loaded lazily (script + stylesheet) the first time the heat map card scrolls into view, so it costs nothing on first paint.
- It is vendored rather than loaded from a CDN so the Content-Security-Policy can keep `script-src 'self'`.
