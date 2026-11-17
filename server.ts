import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const brands = new Map([
  ['localhost', { name: 'Academia do Abraão', color: '#195f52' }],
  ['127.0.0.1', { name: 'Academia do Abraão', color: '#195f52' }],
  ['abraao.localhost', { name: 'Academia do Abraão', color: '#195f52' }],
  ['demo.localhost', { name: 'Academia de demonstração', color: '#524a92' }]
]);
const assets = new Map([
  ['/', ['index.html', 'text/html']],
  ['/studio.js', ['studio.js', 'text/javascript']],
  ['/composition.js', ['composition.js', 'text/javascript']],
  ['/storage.js', ['storage.js', 'text/javascript']],
  ['/style.css', ['style.css', 'text/css']]
]);

export function academyServer() {
  return createServer(async (req, res) => {
    const host = req.headers.host?.toLowerCase().split(':')[0] ?? '';
    const brand = brands.get(host);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!brand) { res.writeHead(421).end(); return; }
    if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET' }).end(); return; }
    if (req.url === '/api/academy') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(brand));
      return;
    }
    const asset = assets.get(req.url ?? '');
    if (!asset) { res.writeHead(404).end(); return; }
    try {
      const body = await readFile(new URL('./public/' + asset[0], import.meta.url));
      res.writeHead(200, { 'Content-Type': asset[1] + '; charset=utf-8' }).end(body);
    } catch { res.writeHead(500).end(); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  academyServer().listen(port, '127.0.0.1', () => console.log('Estúdio em http://localhost:' + port));
}
