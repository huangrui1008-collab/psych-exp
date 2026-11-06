import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {browser,fixture,fetchHandler,settle,tick,materials} from './helpers.mjs';
function answer(b,step,choose){const section=b.document.getElementById('step-'+step);const names=[...new Set([...section.querySelectorAll('input[type=radio]')].map(x=>x.name))];for(const name of names){const inputs=[...section.querySelectorAll('input')].filter(x=>x.name===name);const input=choose?choose(inputs,name):inputs[0];input.checked=true;input.dispatchEvent(new b.w.Event('change',{bubbles:true}));}}
function next(b,step){b.document.querySelector('#step-'+step+' .next-btn').click();}
async function begin(b){await settle(()=>!b.document.getElementById('agreeBtn').disabled);b.document.getElementById('agreeBtn').click();await settle(()=>b.document.getElementById('step-0').classList.contains('active'));}
test('public materials preserve original items and keep scoring key on server',()=>{
 const js=fs.readFileSync(new URL('../materials.js',import.meta.url),'utf8');assert.ok(!/sk-[a-zA-Z0-9]{20}/.test(js));assert.ok(!js.includes('"correct"'));
 assert.equal(materials.PO_CFG.questions.length,3);for(const q of materials.PO_CFG.questions)assert.ok(q.text.includes('本次任务形成的这篇报告'));
});
test('all three participant entry points start correctly; invalid params and declined consent create no record',async()=>{
 for(const suffix of ['', '?group=A','?group=B']){
  const f=fixture();const b=browser('index',fetchHandler(f.handler),{url:'https://huangrui1008-collab.github.io/psych-exp/'+suffix});try{
   assert.equal(f.store.sessions.size,0);await begin(b);const row=[...f.store.sessions.values()][0];assert.ok(['A','B'].includes(row.group_name));if(suffix)assert.equal(row.group_name,suffix.at(-1));assert.deepEqual(b.errors,[]);
  }finally{b.close();}
 }
 for(const suffix of ['?group=C','?group=','?group=A']){
  const f=fixture();const b=browser('index',fetchHandler(f.handler),{url:'https://huangrui1008-collab.github.io/psych-exp/'+suffix});try{
   if(suffix==='?group=A')b.document.getElementById('declineBtn').click();else assert.equal(b.document.getElementById('groupErrorScreen').style.display,'flex');
   assert.equal(f.store.sessions.size,0);
  }finally{b.close();}
 }
});
test('full nine-step run, upload failure, local backup, retry, stable refresh and server score',async()=>{
 const f=fixture();let failCompletion=true;
 const fetcher=async(url,init)=>String(url).endsWith('/complete')&&failCompletion?new Response(JSON.stringify({error:'模拟断网'}),{status:503}):fetchHandler(f.handler)(url,init);
 const b=browser('index',fetcher,{url:'https://huangrui1008-collab.github.io/psych-exp/?group=B'});
 let session,local;
 try{
  await begin(b);answer(b,0);next(b,0);await tick();
  b.document.getElementById('chatInput').value='请引导我思考';b.document.getElementById('sendBtn').click();await settle(()=>b.document.querySelectorAll('.msg').length===3);
  b.document.getElementById('essayText').value='报'.repeat(399);b.document.getElementById('essayText').dispatchEvent(new b.w.Event('input'));assert.equal(b.document.getElementById('submitBtn').disabled,true);
  b.document.getElementById('essayText').value='报'.repeat(400);b.document.getElementById('essayText').dispatchEvent(new b.w.Event('input'));b.document.getElementById('submitBtn').click();
  for(const step of [2,3,4,5,6]){answer(b,step);next(b,step);}
  answer(b,7,(inputs,name)=>inputs.find(x=>x.value===materials.OFFLINE_TEST_QUESTIONS.find(q=>name.endsWith('_'+q.id)).correct));next(b,7);answer(b,8);next(b,8);
  await settle(()=>b.document.querySelector('#step-8 .next-btn').textContent==='重试提交');assert.equal(b.document.getElementById('step-done').classList.contains('active'),false);assert.ok(b.document.getElementById('downloadBackup'));
  assert.equal([...f.store.sessions.values()][0].status,'in_progress');
  failCompletion=false;next(b,8);await settle(()=>b.document.getElementById('step-done').classList.contains('active'));
  const row=[...f.store.sessions.values()][0];assert.equal(row.record.offline_test_score,10);assert.equal(row.status,'completed');assert.equal(row.group_name,'B');assert.equal(row.record.po_responses.q1,1);assert.equal(row.record.chatHistory.length,4);
  session=Object.fromEntries(Object.entries(b.w.sessionStorage));local=Object.fromEntries(Object.entries(b.w.localStorage));assert.deepEqual(b.errors,[]);
 }finally{b.close();}
 const resumed=browser('index',fetcher,{url:'https://huangrui1008-collab.github.io/psych-exp/?group=B',session,local});try{
  await settle(()=>!resumed.document.getElementById('agreeBtn').disabled);resumed.document.getElementById('agreeBtn').click();await settle(()=>resumed.document.getElementById('step-done').classList.contains('active'));assert.equal(f.store.sessions.size,1);assert.deepEqual(resumed.errors,[]);
 }finally{resumed.close();}
});
test('backend unavailable blocks enrollment and researcher does not invent statistics',async()=>{
 const fetcher=async()=>{throw new Error('offline');};
 for(const page of ['index','researcher']){const b=browser(page,fetcher);try{await tick();if(page==='index'){assert.equal(b.document.getElementById('agreeBtn').disabled,true);assert.match(b.document.getElementById('serviceNotice').textContent,/尚未接通/);}else{assert.equal(b.document.getElementById('metrics').hidden,true);assert.equal(b.document.getElementById('exportCsv').disabled,true);assert.match(b.document.getElementById('scope').textContent,/尚未读取/);}assert.deepEqual(b.errors,[]);}finally{b.close();}}
});
test('researcher login, 401/403, pagination, safe rendering, filters, CSV and logout',async()=>{
 let pages=0;const list=Array.from({length:401},(_,i)=>({source:'current',pid:'participant-'+i,group_name:i%2?'B':'A',status:i%2?'in_progress':'completed',current_step:8,record:{pid:'participant-'+i,essay:i?'report':'<img src=x onerror=alert(1)>',snail_responses:{q1:7}},created_at:'2026-11-06T00:00:00Z'}));
 const fetcher=async(url,init)=>{
  const path=String(url);if(path.includes('/token?'))return new Response(JSON.stringify({access_token:'good'}));
  if(path.includes('/research/records')){pages++;if(path.includes('legacy'))return new Response(JSON.stringify({rows:[],has_more:false}));const offset=Number(new URL(path).searchParams.get('offset'));return new Response(JSON.stringify({rows:list.slice(offset,offset+200),has_more:offset+200<list.length}));}
  if(path.includes('/research/schema'))return new Response(JSON.stringify([{column_name:'record'}]));return new Response(JSON.stringify({ready:true}));
 };
 const b=browser('researcher',fetcher);try{
  b.document.getElementById('email').value='test@example.test';b.document.getElementById('password').value='not-a-real-password';b.document.getElementById('loginForm').dispatchEvent(new b.w.Event('submit',{cancelable:true}));
  await settle(()=>!b.document.getElementById('metrics').hidden);assert.equal(pages,4);assert.equal(b.document.querySelectorAll('#rows tr').length,401);assert.equal(b.document.querySelectorAll('#rows img').length,0);assert.equal(b.document.getElementById('password').value,'');
  b.document.getElementById('groupFilter').value='B';b.document.getElementById('groupFilter').dispatchEvent(new b.w.Event('change'));assert.equal(b.document.querySelectorAll('#rows tr').length,200);
  b.document.getElementById('exportCsv').click();assert.equal(b.captures.length,1);const csv=await new Promise(resolve=>{const r=new b.w.FileReader();r.onload=()=>resolve(r.result);r.readAsText(b.captures[0]);});assert.ok(csv.includes('snail_responses.q1'));assert.equal(csv.split('\r\n').length,201);
  b.document.getElementById('logout').click();assert.equal(b.document.getElementById('metrics').hidden,true);assert.equal(b.document.getElementById('exportCsv').disabled,true);assert.equal(b.document.getElementById('detail').textContent,'');assert.deepEqual(b.errors,[]);
 }finally{b.close();}
});
test('resume from server without local draft restores answer objects used by validation',async()=>{
 const f=fixture();const b=browser('index',fetchHandler(f.handler));let session;
 try{await begin(b);answer(b,0);next(b,0);await settle(()=>[...f.store.sessions.values()][0].current_step===1);session=Object.fromEntries(Object.entries(b.w.sessionStorage));}finally{b.close();}
 const resumed=browser('index',fetchHandler(f.handler),{session});try{
  await settle(()=>!resumed.document.getElementById('agreeBtn').disabled);resumed.document.getElementById('agreeBtn').click();await settle(()=>resumed.document.getElementById('step-1').classList.contains('active'));
  assert.equal(resumed.document.querySelector('input[name="snail_responses_q1"]:checked').value,'1');
  resumed.document.getElementById('essayText').value='报'.repeat(400);resumed.document.getElementById('essayText').dispatchEvent(new resumed.w.Event('input'));resumed.document.getElementById('submitBtn').click();await settle(()=>[...f.store.sessions.values()][0].current_step===2);assert.deepEqual(resumed.errors,[]);
 }finally{resumed.close();}
});
test('local import stays local, deduplicates files and does not claim cloud counts',async()=>{
 let requests=0;const b=browser('researcher',async()=>{requests++;throw new Error('offline');});try{
  await tick();const input=b.document.getElementById('importFile');const data={pid:'local-pid',group:'A',essay:'=HYPERLINK("https://example.test")',snail_responses:{q1:4}};
  Object.defineProperty(input,'files',{value:[{size:100,text:async()=>JSON.stringify(data)},{size:100,text:async()=>JSON.stringify(data)}]});input.dispatchEvent(new b.w.Event('change'));await settle(()=>!b.document.getElementById('metrics').hidden);
  assert.equal(requests,1);assert.match(b.document.getElementById('scope').textContent,/仅本地导入 · 1 条/);assert.ok(!b.document.getElementById('metrics').textContent.includes('当前流程'));
  b.document.getElementById('exportCsv').click();const csv=await new Promise(resolve=>{const r=new b.w.FileReader();r.onload=()=>resolve(r.result);r.readAsText(b.captures[0]);});assert.ok(csv.includes("'=HYPERLINK"));assert.deepEqual(b.errors,[]);
 }finally{b.close();}
});
test('cloud page failure clears all partial counts and disables export',async()=>{
 let page=0;const b=browser('researcher',async(url)=>{
  if(String(url).includes('/token?'))return new Response(JSON.stringify({access_token:'good'}));
  if(String(url).includes('/research/records')){page++;if(page===1)return new Response(JSON.stringify({rows:[{pid:'one',group_name:'A',status:'completed',record:{}}],has_more:true}));throw new Error('connection lost');}
  return new Response(JSON.stringify({ready:true}));
 });try{
  b.document.getElementById('email').value='x@example.test';b.document.getElementById('password').value='not-a-real-password';b.document.getElementById('loginForm').dispatchEvent(new b.w.Event('submit',{cancelable:true}));await settle(()=>b.document.getElementById('scope').textContent.includes('无法读取云端数据'));
  assert.equal(b.document.getElementById('metrics').hidden,true);assert.equal(b.document.getElementById('exportCsv').disabled,true);assert.deepEqual(b.errors,[]);
 }finally{b.close();}
});
