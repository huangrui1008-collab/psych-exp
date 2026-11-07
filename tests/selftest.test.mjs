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
function answer(b,step){const el=b.document.getElementById('step-'+step);for(const name of new Set([...el.querySelectorAll('input[type=radio]')].map(x=>x.name))){const input=[...el.querySelectorAll('input[type=radio]')].find(x=>x.name===name);input.checked=true;input.dispatchEvent(new b.w.Event('change',{bubbles:true}));}}
function next(b,step){b.document.querySelector('#step-'+step+' .next-btn').click();}
async function login(b){b.document.getElementById('trialPassword').value='not-a-real-password';b.document.getElementById('trialLoginForm').dispatchEvent(new b.w.Event('submit',{cancelable:true}));await settle(()=>!b.document.getElementById('agreeBtn').disabled);}
test('owner login gates all three browser entries, full A/B runs save test data, and refresh requires login again',async()=>{
 for(const suffix of ['', '?group=A','?group=B']){
  const f=fixture({selfTestOnly:true});let authenticatedRequests=0;
  const fetcher=async(url,init={})=>{
   if(String(url).includes('/auth/v1/token?'))return new Response(JSON.stringify({access_token:'good'}));
   if(init.headers?.Authorization==='Bearer good')authenticatedRequests++;
   return fetchHandler(f.handler)(url,init);
  };
  const b=browser('index',fetcher,{url:'https://huangrui1008-collab.github.io/psych-exp/'+suffix});let session,local;
  try {
   await tick();assert.equal(b.document.getElementById('agreeBtn').disabled,true);assert.equal(f.store.sessions.size,0);
   await login(b);assert.equal(b.document.getElementById('trialPassword').value,'');assert.equal(b.document.getElementById('trialLoginForm').hidden,true);
   b.document.getElementById('agreeBtn').click();await settle(()=>b.document.getElementById('step-0').classList.contains('active'));
   if(suffix)assert.equal([...f.store.sessions.values()][0].group_name,suffix.at(-1));
   answer(b,0);next(b,0);await tick();b.document.getElementById('chatInput').value='这是程序试跑，请按本组原有要求回复。';b.document.getElementById('sendBtn').click();await settle(()=>b.document.querySelectorAll('.msg').length===3);
   b.document.getElementById('essayText').value='测试报告'.repeat(100);b.document.getElementById('essayText').dispatchEvent(new b.w.Event('input'));b.document.getElementById('submitBtn').click();
   for(const step of [2,3,4,5,6,7,8]){answer(b,step);next(b,step);}
   await settle(()=>b.document.getElementById('step-done').classList.contains('active'));
   const row=[...f.store.sessions.values()][0];assert.equal(row.status,'completed');assert.equal(row.record.is_test,true);assert.equal(row.record.test_label,'researcher-self-test');
   assert.equal(b.document.getElementById('newTrialBtn').hidden,false);assert.ok(authenticatedRequests>10);
   session=Object.fromEntries(Object.entries(b.w.sessionStorage));local=Object.fromEntries(Object.entries(b.w.localStorage));
   assert.ok(!JSON.stringify({session,local}).includes('not-a-real-password'));assert.ok(!JSON.stringify({session,local}).includes('"good"'));assert.deepEqual(b.errors,[]);
  }finally{b.close();}
  const resumed=browser('index',fetcher,{url:'https://huangrui1008-collab.github.io/psych-exp/'+suffix,session,local});
  try {await tick();assert.equal(resumed.document.getElementById('agreeBtn').disabled,true);await login(resumed);resumed.document.getElementById('agreeBtn').click();await settle(()=>resumed.document.getElementById('step-done').classList.contains('active'));assert.equal(f.store.sessions.size,1);assert.deepEqual(resumed.errors,[]);}finally{resumed.close();}
 }
});
test('researcher rows visibly identify trial records and exports preserve the test flag',async()=>{
 const b=browser('researcher',async(url)=>String(url).includes('/token?')?new Response(JSON.stringify({access_token:'good'})):String(url).includes('/research/records')?new Response(JSON.stringify({rows:String(url).includes('source=current')?[{pid:'trial-example',group_name:'A',status:'completed',record:{is_test:true,test_label:'researcher-self-test'}}]:[],has_more:false})):new Response(JSON.stringify({ready:true})));
 try {
  b.document.getElementById('password').value='not-a-real-password';b.document.getElementById('loginForm').dispatchEvent(new b.w.Event('submit',{cancelable:true}));await settle(()=>!b.document.getElementById('metrics').hidden);
  assert.match(b.document.getElementById('rows').textContent,/本人试跑/);b.document.getElementById('exportJson').click();
  const content=await new Promise(resolve=>{const r=new b.w.FileReader();r.onload=()=>resolve(r.result);r.readAsText(b.captures[0]);});assert.equal(JSON.parse(content).records[0].data.is_test,true);assert.deepEqual(b.errors,[]);
 }finally{b.close();}
});
