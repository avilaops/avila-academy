import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { catalog } from './catalog.ts';
import { authenticate } from './auth.ts';

const brands = new Map([
  ['localhost', { name: 'Academia do Abraão', color: '#195f52' }],
  ['127.0.0.1', { name: 'Academia do Abraão', color: '#195f52' }],
  ['abraao.localhost', { name: 'Academia do Abraão', color: '#195f52' }],
  ['demo.localhost', { name: 'Academia de demonstração', color: '#524a92' }]
]);
const assets = new Map([
  ['/aluno', ['student.html', 'text/html']],
  ['/student.js', ['student.js', 'text/javascript']],
  ['/', ['index.html', 'text/html']],
  ['/courses.js', ['courses.js', 'text/javascript']],
  ['/sync.js', ['sync.js', 'text/javascript']],
  ['/studio.js', ['studio.js', 'text/javascript']],
  ['/composition.js', ['composition.js', 'text/javascript']],
  ['/storage.js', ['storage.js', 'text/javascript']],
  ['/style.css', ['style.css', 'text/css']]
]);

export function academyServer(options = {}) {
  const store = catalog(options.directory ?? process.env.DATA_DIRECTORY ?? './data');
  const server = createServer(async (req, res) => {
    const host = req.headers.host?.toLowerCase().split(':')[0] ?? '';
    const brand = brands.get(host);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!brand) { res.writeHead(421).end(); return; }
    const tenant = host === 'demo.localhost' ? 'demo' : 'abraao';
    if (req.url?.startsWith('/auth/')) { await authenticate(req,res,tenant); return; }
    if ((req.url?.startsWith('/api/recordings') || req.url?.startsWith('/api/courses') || req.url?.startsWith('/api/enrollments') || req.url?.startsWith('/api/student/'))) {
      const authorized = await authenticate(req,res,tenant);
      if (!authorized) { res.writeHead(401).end(); return; }
      if(!req.url.startsWith('/api/student/') && authorized.role!=='producer') {res.writeHead(403).end();return;}
      if (req.method !== 'GET' && req.headers.origin !== 'http://'+req.headers.host && req.headers.origin !== 'https://'+req.headers.host) { res.writeHead(403).end(); return; }
      await store.handle(req,res,tenant,authorized.sub); return;
    }
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
  server.on('close', () => store.close());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  academyServer().listen(port, '127.0.0.1', () => console.log('Estúdio em http://localhost:' + port));
}
