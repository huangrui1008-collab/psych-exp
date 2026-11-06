import test from 'node:test';
import assert from 'node:assert/strict';
import {createResearchHandler} from '../supabase/functions/research-api/handler.ts';
import {fixture} from './helpers.mjs';
const owner={id:'owner-id',email:'huangrui1008@gmail.com',email_confirmed_at:'2026-11-06T00:00:00Z'};
function service(user,member=true){return createResearchHandler({origins:['https://huangrui1008-collab.github.io'],auth:async()=>user,ready:async()=>true,store:{isResearcher:async()=>member,schema:async()=>[],list:async()=>[{pid:'preserved-record'}]}});}
async function request(handler,path='/research/records',token='valid',method='GET'){return handler(new Request('https://test/functions/v1/research-api'+path,{method,headers:{Origin:'https://huangrui1008-collab.github.io',...(token?{Authorization:'Bearer '+token}:{})}}));}
test('only confirmed owner email and explicit account membership may download cloud data',async()=>{
 assert.equal((await request(service(owner))).status,200);
 assert.equal((await request(service(owner),'/research/records','')).status,401);
 for(const user of [{...owner,email:'someone@example.test'},{...owner,email_confirmed_at:undefined},null])assert.ok([401,403].includes((await request(service(user))).status));
 assert.equal((await request(service(owner,false))).status,403);
 assert.equal((await request(service({...owner,email:'HUANGRUI1008@GMAIL.COM'}))).status,200);
});
test('download service exposes no participant start, AI or mutation operations',async()=>{
 for(const path of ['/start','/chat','/complete'])assert.equal((await request(service(owner),path)).status,404);
 assert.equal((await request(service(owner),'/research/records','valid','POST')).status,405);
 assert.equal((await request(service(owner),'/research/records?offset=-1')).status,400);
 assert.equal((await request(service(null),'/health','')).status,200);
});
test('shared experiment API also rejects a whitelisted UUID with another or unconfirmed email',async()=>{
 for(const user of [{id:'researcher',email:'another@example.test',email_confirmed_at:'2026-11-06'}, {id:'researcher',email:'huangrui1008@gmail.com'}]){
  const f=fixture({auth:async()=>user});
  assert.equal((await f.request('/research/records',null,'',{Authorization:'Bearer any'})).status,403);
 }
});
