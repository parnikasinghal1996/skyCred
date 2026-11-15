#!/usr/bin/env node
/**
 * Local dev server — zero dependencies.
 * Builds once, serves dist/ with the same security headers as vercel.json, and rebuilds when src/ changes.
 *
 *   npm run dev                 → http://localhost:3000
 *   npm run dev -- --port 4321  → custom port
 */
import { createServer } from 'node:http';
import { watch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { build, DIST_DIR, ROOT, SRC_DIR } from './build.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const PORT = Number(argValue('--port') || process.env.PORT || 3000);
const HOST = process.env.HOST || 'localhost';

/** Reuse the headers from vercel.json so CSP problems show up locally, not only in production. */
async function readSecurityHeaders() {
  try {
    const config = JSON.parse(await readFile(join(ROOT, 'vercel.json'), 'utf8'));
    const rule = (config.headers || []).find((entry) => entry.source === '/(.*)');
    return Object.fromEntries(((rule && rule.headers) || []).map(({ key, value }) => [key, value]));
  } catch {
    return {};
  }
}

await build();
const securityHeaders = await readSecurityHeaders();

const server = createServer(async (request, response) => {
  try {
    const { pathname } = new URL(request.url, 'http://localhost');
    let relative;
    try {
      relative = decodeURIComponent(pathname);
    } catch {
      response.writeHead(400);
      return response.end('Bad request');
    }
    if (relative.endsWith('/')) relative += 'index.html';

    const file = resolve(DIST_DIR, `.${relative}`);
    if (file !== DIST_DIR && !file.startsWith(DIST_DIR + sep)) {
      response.writeHead(403);
      return response.end('Forbidden');
    }

    let target = file;
    let info = await stat(target).catch(() => null);
    if (info && info.isDirectory()) {
      target = join(target, 'index.html');
      info = await stat(target).catch(() => null);
    }
    if (!info) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return response.end('Not found');
    }

    const body = await readFile(target);
    response.writeHead(200, {
      'Content-Type': MIME[extname(target)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      ...securityHeaders,
    });
    response.end(body);
  } catch (error) {
    console.error('[dev]', error);
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Server error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[dev] SKY CRED running at http://${HOST}:${PORT}`);
});

try {
  let timer;
  watch(SRC_DIR, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      build({ log: () => {} })
        .then(() => console.log('[dev] rebuilt'))
        .catch((error) => console.error('[dev]', error.message));
    }, 150);
  });
} catch {
  console.log('[dev] file watching is unavailable here — restart the server to pick up changes');
}
