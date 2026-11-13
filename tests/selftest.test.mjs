import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,fullRecord,browser,fetchHandler,settle,tick} from './helpers.mjs';
const capability='a'.repeat(64),owner={Authorization:'Bearer good'};
test('owner-only trial rejects anonymous and other accounts before reads, quotas, writes or AI',async()=>{
 const f=fixture({selfTestOnly:true});const id=crypto.randomUUID();
 const health=await(await f.request('/health')).json();assert.equal(health.mode,'researcher-self-test');
 assert.equal((await f.request('/self-test/access')).status,401);
 assert.equal((await f.request('/self-test/access',null,'',{Authorization:'Bearer ordinary'})).status,403);
 assert.equal((await f.request('/self-test/access',null,'',owner)).status,200);
 for(const path of ['/start','/progress','/chat','/complete']){
  assert.equal((await f.request(path,{pid:id,entry_mode:'fixed',group:'A',step:0,record:{},message:'test'},capability)).status,401);
  assert.equal((await f.request(path,{pid:id,entry_mode:'fixed',group:'A'},capability,{Authorization:'Bearer ordinary'})).status,403);
 }
 assert.equal(f.store.sessions.size,0);assert.equal(f.store.quotas.size,0);
 await f.request('/start',{pid:id,entry_mode:'fixed',group:'A'},capability,owner);
 assert.equal(f.store.sessions.get(id).record.is_test,true);
 assert.equal((await f.request('/progress',{pid:id,step:1,record:fullRecord()},capability,{Authorization:'Bearer expired'})).status,401);
 assert.equal(f.store.sessions.get(id).current_step,0);
 assert.equal((await f.request('/start',{pid:id,entry_mode:'fixed',group:'A'},'b'.repeat(64),owner)).status,403);
});
test('trial flags survive every save and completion; unmarked existing records remain untouched',async()=>{
 const f=fixture({selfTestOnly:true});const id=crypto.randomUUID(),record={...fullRecord(),is_test:false,test_label:'pretend-real'};
 await f.request('/start',{pid:id,entry_mode:'random'},capability,owner);
 for(let step=0;step<=8;step++)assert.equal((await f.request('/progress',{pid:id,step,record},capability,owner)).status,200);
 assert.equal((await f.request('/complete',{pid:id,record},capability,owner)).status,200);
 const result=f.store.sessions.get(id);assert.equal(result.record.is_test,true);assert.equal(result.record.test_label,'researcher-self-test');assert.equal(result.status,'completed');
 const oldId=crypto.randomUUID();await f.store.create({pid:oldId,token_hash:await (await import('../supabase/functions/experiment-api/handler.mjs')).hashToken(capability),group_name:'B',current_step:0,chat_history:[]});
 const original=structuredClone(f.store.sessions.get(oldId));
 assert.equal((await f.request('/start',{pid:oldId,entry_mode:'fixed',group:'B'},capability,owner)).status,403);
 assert.equal((await f.request('/progress',{pid:oldId,step:0,record:{}},capability,owner)).status,403);
 assert.deepEqual(f.store.sessions.get(oldId),original);
});
test('researcher rows visibly identify trial records and exports preserve the test flag',async()=>{
 const b=browser('researcher',async(url)=>String(url).includes('/token?')?new Response(JSON.stringify({access_token:'good'})):String(url).includes('/research/records')?new Response(JSON.stringify({rows:String(url).includes('source=current')?[{pid:'trial-example',group_name:'A',status:'completed',record:{is_test:true,test_label:'researcher-self-test'}}]:[],has_more:false})):new Response(JSON.stringify({ready:true})));
 try {
  b.document.getElementById('password').value='not-a-real-password';b.document.getElementById('loginForm').dispatchEvent(new b.w.Event('submit',{cancelable:true}));await settle(()=>!b.document.getElementById('metrics').hidden);
  assert.match(b.document.getElementById('rows').textContent,/本人试跑/);b.document.getElementById('exportJson').click();
  const content=await new Promise(resolve=>{const r=new b.w.FileReader();r.onload=()=>resolve(r.result);r.readAsText(b.captures[0]);});assert.equal(JSON.parse(content).records[0].data.is_test,true);assert.deepEqual(b.errors,[]);
 }finally{b.close();}
});
