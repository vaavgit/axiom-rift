import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = Number(process.env.PORT || 4173);

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
});

const SECURITY_HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
});

function sendText(res, status, message, extraHeaders = {}) {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'text/plain; charset=utf-8',
    ...extraHeaders,
  });
  res.end(message);
}

export function createAppServer(port = DEFAULT_PORT) {
  return http.createServer(async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendText(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
        return;
      }

      const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`);
      let pathname;
      try {
        pathname = decodeURIComponent(reqUrl.pathname);
      } catch {
        sendText(res, 400, 'Bad Request');
        return;
      }

      if (pathname.includes('\0') || pathname.includes('\\')) {
        sendText(res, 400, 'Bad Request');
        return;
      }

      if (pathname === '/') {
        pathname = '/index.html';
      }

      const normalized = path.posix.normalize(pathname);
      const allowed =
        normalized === '/index.html' ||
        normalized === '/styles.css' ||
        normalized.startsWith('/src/');
      if (!allowed) {
        sendText(res, 403, 'Forbidden');
        return;
      }

      const fullPath = path.resolve(__dirname, '.' + normalized);
      const rel = path.relative(__dirname, fullPath);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        sendText(res, 403, 'Forbidden');
        return;
      }

      const stat = await fs.stat(fullPath);
      if (!stat.isFile()) {
        sendText(res, 403, 'Forbidden');
        return;
      }

      const ext = path.extname(fullPath).toLowerCase();
      const headers = {
        ...SECURITY_HEADERS,
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      };

      if (req.method === 'HEAD') {
        res.writeHead(200, headers);
        res.end();
        return;
      }

      const data = await fs.readFile(fullPath);
      res.writeHead(200, headers);
      res.end(data);
    } catch (err) {
      if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
        sendText(res, 404, 'Not Found');
      } else {
        sendText(res, 500, 'Internal Server Error');
      }
    }
  });
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const server = createAppServer(DEFAULT_PORT);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${DEFAULT_PORT} is already in use. Set PORT=<port> npm start`);
    } else {
      console.error('Server error:', err);
    }
    process.exitCode = 1;
  });

  server.listen(DEFAULT_PORT, '127.0.0.1', () => {
    console.log(`AXIOM RIFT running at http://127.0.0.1:${DEFAULT_PORT}`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
