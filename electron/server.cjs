'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function startStaticServer(rootDirectory) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      try {
        const requestUrl = new URL(request.url || '/', 'http://localhost');
        const pathname = decodeURIComponent(requestUrl.pathname);
        let filePath = path.join(rootDirectory, pathname === '/' ? 'index.html' : pathname);

        if (!filePath.startsWith(rootDirectory)) {
          response.writeHead(403).end('Forbidden');
          return;
        }

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          const fallback = path.join(rootDirectory, 'index.html');
          if (!fs.existsSync(fallback)) {
            response.writeHead(404).end('Stellaview build not found. Run npm run build first.');
            return;
          }
          filePath = fallback;
        }

        const extension = path.extname(filePath).toLowerCase();
        response.writeHead(200, {
          'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        fs.createReadStream(filePath).pipe(response);
      } catch (error) {
        response.writeHead(500).end(String(error && error.message ? error.message : error));
      }
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

module.exports = { startStaticServer };
