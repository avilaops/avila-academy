import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { academyServer } from '../server.ts';
import { request } from 'node:http';

test('cada domínio recebe sua marca e domínios desconhecidos são recusados', async t => {
  const server = academyServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const address = server.address();
  assert(address && typeof address !== 'string');
  for (const [host, status, name] of [
    ['abraao.localhost', 200, 'Academia do Abraão'],
    ['demo.localhost', 200, 'Academia de demonstração'],
    ['desconhecido.invalid', 421, null]
  ] as const) {
    const reply = await new Promise<{status?: number, text: string}>((resolve, reject) => {
      request({ host:'127.0.0.1', port:address.port, path:'/api/academy', headers:{Host:host} }, res => {
        let text = '';
        res.setEncoding('utf8').on('data', chunk => text += chunk);
        res.on('end', () => resolve({status:res.statusCode, text}));
      }).on('error', reject).end();
    });
    assert.equal(reply.status, status);
    if (name) assert.equal(JSON.parse(reply.text).name, name);
  }
});

test('biblioteca exige sessão e login sem configuração não libera acesso',async t=>{
  const server=academyServer().listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>server.close());
  const address=server.address();
  assert(address && typeof address!=='string');
  const base='http://127.0.0.1:'+address.port;
  assert.equal((await fetch(base+'/api/recordings')).status,401);
  assert.equal((await fetch(base+'/auth/login',{redirect:'manual'})).status,503);
  assert.equal((await fetch(base+'/auth/callback?state=forjado&code=falso')).status,401);
});
