import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {academyServer} from '../server.ts';

test('sessões OIDC assinadas distinguem produtor de aluno sem liberar APIs de administração',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'academy-auth-'));
  const server=academyServer({directory}).listen(0,'127.0.0.1');
  await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port;
  const oldEnv={...process.env};
  process.env.PUBLIC_ORIGIN=origin;
  process.env.OIDC_CLIENT_ID='test-academy';
  process.env.OIDC_CLIENT_SECRET='test-secret';
  process.env.ACADEMY_PRODUCERS=JSON.stringify({abraao:['producer']});
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const jwk={...publicKey.export({format:'jwk'}),kid:'test-key',use:'sig'};
  const nativeFetch=global.fetch;
  let subject='producer';
  let nonce;
  global.fetch=async(input,options)=>{
    const url=String(input);
    if(url==='https://auth.avilaops.com/oauth/jwks')return Response.json({keys:[jwk]});
    if(url==='https://auth.avilaops.com/oauth/token'){
      assert.match(options.body.toString(),/code_verifier=/);
      assert.equal(options.headers.Authorization,'Basic '+Buffer.from('test-academy:test-secret').toString('base64'));
      const header=Buffer.from(JSON.stringify({alg:'RS256',kid:'test-key'})).toString('base64url');
      const claims=Buffer.from(JSON.stringify({iss:'https://auth.avilaops.com',sub:subject,aud:'test-academy',nonce,exp:Math.floor(Date.now()/1000)+600})).toString('base64url');
      const signature=sign('RSA-SHA256',Buffer.from(header+'.'+claims),privateKey).toString('base64url');
      return Response.json({id_token:header+'.'+claims+'.'+signature});
    }
    return nativeFetch(input,options);
  };
  t.after(async()=>{
    global.fetch=nativeFetch;
    for(const key of ['PUBLIC_ORIGIN','OIDC_CLIENT_ID','OIDC_CLIENT_SECRET','ACADEMY_PRODUCERS']){
      if(oldEnv[key]===undefined)delete process.env[key];else process.env[key]=oldEnv[key];
    }
    await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true});
  });
  async function login(who) {
    subject=who;
    const start=await fetch(origin+'/auth/login',{redirect:'manual'});
    assert.equal(start.status,302);
    const target=new URL(start.headers.get('location'));
    nonce=target.searchParams.get('nonce');
    assert.equal(target.searchParams.get('code_challenge_method'),'S256');
    const state=target.searchParams.get('state');
    const callback=await fetch(origin+'/auth/callback?code=test-code&state='+state,{
      redirect:'manual',headers:{Cookie:start.headers.get('set-cookie').split(';')[0]}
    });
    assert.equal(callback.status,302);
    assert.equal(callback.headers.get('location'),who==='producer'?'/':'/aluno');
    return callback.headers.get('set-cookie').split(';')[0];
  }
  const producer=await login('producer');
  const create=await fetch(origin+'/api/courses',{method:'POST',headers:{Cookie:producer,Origin:origin},body:JSON.stringify({title:'Curso protegido'})});
  assert.equal(create.status,201);
  const {id}=await create.json();
  const student=await login('student');
  for(const path of ['/api/courses','/api/recordings','/api/enrollments','/api/attachments/00000000-0000-0000-0000-000000000000']){
    assert.equal((await fetch(origin+path,{headers:{Cookie:student}})).status,403);
  }
  assert.deepEqual(await (await fetch(origin+'/api/student/courses',{headers:{Cookie:student}})).json(),[]);
  assert.equal((await fetch(origin+'/api/enrollments',{method:'POST',headers:{Cookie:producer,Origin:origin},body:JSON.stringify({subject:'student',courseId:id})})).status,200);
  const courses=await (await fetch(origin+'/api/student/courses',{headers:{Cookie:student}})).json();
  assert.equal(courses[0].title,'Curso protegido');
  assert.equal((await fetch(origin+'/api/enrollments',{method:'POST',headers:{Cookie:producer},body:'{}'})).status,403);
  await fetch(origin+'/auth/logout',{method:'POST',redirect:'manual',headers:{Cookie:student,Origin:origin}});
  assert.equal((await fetch(origin+'/api/student/courses',{headers:{Cookie:student}})).status,401);
  assert.equal((await fetch(origin+'/auth/inexistente')).status,404);
});
