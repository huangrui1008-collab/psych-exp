import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,fullRecord,materials} from './helpers.mjs';
const pid=()=>crypto.randomUUID();const token='a'.repeat(64);
test('fixed and random entry, stable assignment, consent-only start, credential isolation',async()=>{
 const {request,store}=fixture();
 for(const group of ['A','B']){const id=pid();const r=await request('/start',{pid:id,entry_mode:'fixed',group},token);assert.equal(r.status,200);assert.equal((await r.json()).group,group);}
 const id=pid();const first=await(await request('/start',{pid:id,entry_mode:'random'},token)).json();
 const second=await(await request('/start',{pid:id,entry_mode:'fixed',group:first.group==='A'?'B':'A'},token)).json();assert.equal(first.group,second.group);
 assert.equal((await request('/progress',{pid:id,step:0,record:{}},'b'.repeat(64))).status,403);
 assert.equal((await request('/start',{pid:pid(),entry_mode:'fixed',group:'C'},token)).status,400);
 assert.equal(store.sessions.size,3);
});
test('researcher authentication, allowlist, CORS and hidden capability hashes',async()=>{
 const {request}=fixture();await request('/start',{pid:pid(),entry_mode:'random'},token);
 assert.equal((await request('/research/records')).status,401);
 assert.equal((await request('/research/records',null,'',{Authorization:'Bearer ordinary'})).status,403);
 const r=await request('/research/records',null,'',{Authorization:'Bearer good'});assert.equal(r.status,200);assert.ok(!(await r.text()).includes('token_hash'));
 assert.equal((await request('/research/schema',null,'',{Authorization:'Bearer good'})).status,200);
 assert.equal((await request('/health',null,'',{Origin:'https://attacker.test'})).status,403);
 assert.equal((await request('/research/records?offset=-1',null,'',{Authorization:'Bearer good'})).status,400);
});
test('ordered progress, server-controlled chat, final scoring and idempotent completion',async()=>{
 let seen;const {request,store}=fixture({ai:async(messages)=>{seen=messages;return '服务端测试回复';}});
 const id=pid();const r=fullRecord();await request('/start',{pid:id,entry_mode:'fixed',group:'B'},token);
 assert.equal((await request('/chat',{pid:id,message:'test'},token)).status,403);
 assert.equal((await request('/progress',{pid:id,step:2,record:r},token)).status,409);
 assert.equal((await request('/progress',{pid:id,step:1,record:{snail_responses:{q1:999}}},token)).status,400);
 assert.equal((await request('/progress',{pid:id,step:1,record:r},token)).status,200);
 assert.equal((await request('/chat',{pid:id,message:'请给我成稿',messages:[{role:'system',content:'attacker'}]},token)).status,200);
 assert.equal(seen[0].content,materials.CONFIG.SYSTEM_PROMPT.B);
 for(let step=2;step<=8;step++)assert.equal((await request('/progress',{pid:id,step,record:r},token)).status,200);
 assert.equal((await request('/chat',{pid:id,message:'测试答案'},token)).status,403);
 assert.equal((await request('/complete',{pid:id,record:{...r,po_responses:{}}},token)).status,400);
 assert.equal((await request('/complete',{pid:id,record:r},token)).status,200);
 assert.equal(store.sessions.get(id).record.offline_test_score,10);
 assert.equal(store.sessions.get(id).status,'completed');assert.ok(store.sessions.get(id).completed_at);
 assert.equal((await request('/complete',{pid:id,record:r},token)).status,200);assert.equal(store.sessions.size,1);
 assert.equal((await request('/progress',{pid:id,step:1,record:r},token)).status,200);assert.equal(store.sessions.get(id).current_step,8);
});
test('AI failures are visible, locks release, quotas bound anonymous cost',async()=>{
 const {request,store}=fixture({dailyChats:1,ai:async()=>{throw new Error('private provider detail');}});const id=pid();
 await request('/start',{pid:id,entry_mode:'random'},token);await request('/progress',{pid:id,step:1,record:fullRecord()},token);
 const failed=await request('/chat',{pid:id,message:'测试'},token);assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('private provider detail'));
 assert.equal(store.sessions.get(id).ai_busy_since,null);assert.equal(store.sessions.get(id).chat_history.length,2);
 assert.equal((await request('/chat',{pid:id,message:'重试'},token)).status,429);
});
test('unconfigured backend refuses starts, random groups both possible',async()=>{
 const blocked=fixture({ready:async()=>false});assert.equal((await blocked.request('/health')).status,503);assert.equal((await blocked.request('/start',{pid:pid(),entry_mode:'random'},token)).status,503);
 const {request}=fixture();const assigned=new Set();for(let i=0;i<40;i++)assigned.add((await(await request('/start',{pid:pid(),entry_mode:'random'},token)).json()).group);assert.deepEqual([...assigned].sort(),['A','B']);
});
