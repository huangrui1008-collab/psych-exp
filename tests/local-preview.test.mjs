import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {request} from 'node:http';
import {createPreviewServer} from '../scripts/local-preview.mjs';

test('local bridge keeps game credentials scoped and connects only two fixed game routes; static config is not modified',async()=>{
 const calls=[];
 const server=await createPreviewServer({upstreamFetch:async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify(url.endsWith('/game/access')?{token:'test-only',expires_in:7200}:{source:'real',text:'测试的后台响应'}));}});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 const post=(route,extra={})=>fetch(base+'/__preview/experiment-api'+route,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...extra},body:'{"mode":"augmentation"}'});
 try{
  const config=await (await fetch(base+'/config.js')).text();assert.match(config,/"API_BASE": "\/__preview\/experiment-api"/);assert.doesNotMatch(config,/DEEPSEEK_API_KEY|service_role|sk-/);
  assert.equal((await post('/game/access',{Authorization:'Bearer research-must-not-forward',Cookie:'private=must-not-forward'})).status,200);
  assert.equal((await post('/game/chat',{'X-Game-Token':'game-only-token'})).status,200);
  assert.ok(calls.every(x=>x.url.startsWith('https://moryybvgocdtevhmaqyd.supabase.co/functions/v1/experiment-api/game/')));
  assert.equal(calls[0].init.headers.Authorization,undefined);assert.equal(calls[0].init.headers.Cookie,undefined);assert.equal(calls[0].init.headers.Origin,undefined);assert.equal(calls[1].init.headers['X-Game-Token'],'game-only-token');
  const before=calls.length;
  assert.equal((await post('/research/records')).status,404);
  assert.equal((await post('/game/chat?url=https://other.test')).status,404);
  assert.equal((await post('/game/access',{Origin:'https://other.test'})).status,403);
  assert.equal((await post('/game/access',{Origin:''})).status,403);
  const wrongHost=await new Promise((resolve,reject)=>{const req=request(base+'/__preview/experiment-api/game/access',{method:'POST',headers:{Host:'other.test',Origin:base,'Content-Type':'application/json'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end('{}');});
  assert.equal(wrongHost,403);
  assert.equal((await fetch(base+'/.git/config')).status,404);assert.equal((await fetch(base+'/.env')).status,404);
  assert.equal(calls.length,before);
  assert.equal((await fetch(base+'/index.html')).status,200);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('local bridge preserves backend errors and never retries a provider-triggering request automatically',async()=>{
 let calls=0;const server=await createPreviewServer({upstreamFetch:async()=>{calls++;return new Response(JSON.stringify({error:'AI服务余额不足，请联系研究者。'}),{status:502});}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 try{const r=await fetch(base+'/__preview/experiment-api/game/chat',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,502);assert.match((await r.json()).error,/余额不足/);assert.equal(calls,1);}finally{await new Promise(resolve=>server.close(resolve));}
});
