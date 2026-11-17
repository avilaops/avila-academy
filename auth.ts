import { randomBytes, createHash, createPublicKey, verify } from 'node:crypto';

const issuer = 'https://auth.avilaops.com';
const pending = new Map();
const sessions = new Map();
const secret = () => randomBytes(32).toString('base64url');
function cookie(req, name) {
  return req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1);
}
export async function authenticate(req, res, tenant) {
  const url = new URL(req.url, 'http://' + req.headers.host);
  const configured = process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET && process.env.PUBLIC_ORIGIN;
  const session = sessions.get(cookie(req, 'academy_session'));
  const origin = process.env.PUBLIC_ORIGIN;
  const secure = origin?.startsWith('https:') ? '; Secure' : '';
  const redirect = location => { res.writeHead(302, {Location:location}); res.end(); };
  if (url.pathname === '/auth/login') {
    if (!configured || new URL(origin).host !== req.headers.host) { res.writeHead(503).end('Login ainda não configurado para este domínio.'); return true; }
    for (const [key,value] of pending) if (value.expires < Date.now()) pending.delete(key);
    const state = secret();
    const verifier = secret();
    const nonce = secret();
    pending.set(state, {verifier, nonce, tenant, expires:Date.now()+600000});
    res.setHeader('Set-Cookie', 'academy_state='+state+'; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=600'+secure);
    const target = new URL(issuer+'/oauth/authorize');
    target.search = new URLSearchParams({
      client_id:process.env.OIDC_CLIENT_ID, redirect_uri:origin+'/auth/callback', response_type:'code',
      scope:'openid profile email', state, nonce, code_challenge_method:'S256',
      code_challenge:createHash('sha256').update(verifier).digest('base64url')
    }).toString();
    redirect(target.toString()); return true;
  }
  if (url.pathname === '/auth/callback') {
    const state = url.searchParams.get('state');
    const flow = pending.get(state);
    pending.delete(state);
    try {
      if (!configured || !flow || flow.expires<Date.now() || cookie(req,'academy_state')!==state || flow.tenant!==tenant || new URL(origin).host!==req.headers.host) throw Error('state');
      const reply = await fetch(issuer+'/oauth/token', {
        method:'POST', signal:AbortSignal.timeout(15000),
        headers:{'Content-Type':'application/x-www-form-urlencoded', Authorization:'Basic '+Buffer.from(process.env.OIDC_CLIENT_ID+':'+process.env.OIDC_CLIENT_SECRET).toString('base64')},
        body:new URLSearchParams({grant_type:'authorization_code',code:url.searchParams.get('code')??'',redirect_uri:origin+'/auth/callback',code_verifier:flow.verifier})
      });
      if (!reply.ok) throw Error('token');
      const {id_token} = await reply.json();
      const [header,payload,signature,...extra] = id_token.split('.');
      if (extra.length) throw Error('jwt');
      const h=JSON.parse(Buffer.from(header,'base64url').toString());
      const claims=JSON.parse(Buffer.from(payload,'base64url').toString());
      const jwksResponse=await fetch(issuer+'/oauth/jwks',{signal:AbortSignal.timeout(15000)});
      if (!jwksResponse.ok) throw Error('jwks');
      const jwks=await jwksResponse.json();
      const key=jwks.keys.find(k=>k.kid===h.kid && k.kty==='RSA' && (!k.use || k.use==='sig'));
      const audiences=Array.isArray(claims.aud)?claims.aud:[claims.aud];
      if (h.alg!=='RS256' || !key || !verify('RSA-SHA256',Buffer.from(header+'.'+payload),createPublicKey({key,format:'jwk'}),Buffer.from(signature,'base64url'))) throw Error('signature');
      if (claims.iss!==issuer || !audiences.includes(process.env.OIDC_CLIENT_ID) || (audiences.length>1 && claims.azp!==process.env.OIDC_CLIENT_ID) || !Number.isFinite(claims.exp) || claims.exp*1000<Date.now() || (claims.nbf && claims.nbf*1000>Date.now()) || claims.nonce!==flow.nonce || typeof claims.sub!=='string' || !claims.sub || claims.sub.length>255) throw Error('claims');
      const allowed=JSON.parse(process.env.ACADEMY_PRODUCERS??'{}');
      const role=allowed[tenant]?.includes(claims.sub)?'producer':'student';
      for (const [key,value] of sessions) if (value.expires<Date.now()) sessions.delete(key);
      const token=secret();
      sessions.set(token,{tenant,sub:claims.sub,role,expires:Date.now()+28800000});
      res.setHeader('Set-Cookie','academy_session='+token+'; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800'+secure);
      redirect(role==='producer'?'/':'/aluno'); return true;
    } catch { res.writeHead(401).end('Não foi possível validar o login. Inicie novamente.'); return true; }
  }
  if (url.pathname === '/auth/logout' && req.method==='POST') {
    if (req.headers.origin !== 'http://'+req.headers.host && req.headers.origin !== 'https://'+req.headers.host) { res.writeHead(403).end(); return true; }
    sessions.delete(cookie(req,'academy_session'));
    res.setHeader('Set-Cookie','academy_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'+secure);
    redirect('/'); return true;
  }
  if(url.pathname.startsWith('/auth/')) {res.writeHead(404).end();return true;}
  return session && session.tenant===tenant && session.expires>Date.now() ? session : null;
}
