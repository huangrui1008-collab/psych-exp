import test from 'node:test';import assert from 'node:assert/strict';
import {browser,fixture,settle,tick} from './helpers.mjs';
const noNetwork=async()=>{throw Error('offline');};
function press(b,action){[...b.document.querySelectorAll('[data-do="'+action+'"]')].find(x=>!x.closest('.group')?.hidden).click();}
function game(b){return JSON.parse(b.w.localStorage.getItem('az-preview-v06-session-'+(new URL(b.w.location).searchParams.get('group')||'random')));}
async function completeGame(b){
 press(b,'start');
 for(let round=0;round<10;round++){
  if(game(b).mode==='augmentation')press(b,'ask');
  await settle(()=>b.document.getElementById('aiAck'));
  assert.equal(b.document.querySelector('[data-do=feed]').disabled,true);
  const ack=b.document.getElementById('aiAck');ack.checked=true;ack.dispatchEvent(new b.w.Event('change',{bubbles:true}));press(b,'feed');press(b,'next');
 }
 assert.equal(game(b).stage,'test');assert.equal(b.document.querySelector('.ai'),null);assert.equal(b.document.querySelector('.table-recipes'),null);
 for(let phase=0;phase<3;phase++){
  const form=b.document.getElementById('testForm');
  if(phase===2){assert.equal(form.querySelectorAll('.rule-option').length,5);assert.match(form.textContent,/🪻 蓝铃叶/);assert.match(form.textContent,/🪸 珊瑚枝/);}
  for(const name of new Set([...form.querySelectorAll('input[type=radio]')].map(x=>x.name)))form.querySelector('input[name="'+name+'"]').checked=true;
  for(const select of form.querySelectorAll('select'))select.selectedIndex=1;
  form.dispatchEvent(new b.w.Event('submit',{cancelable:true}));
 }
 assert.equal(game(b).stage,'done');assert.equal(game(b).rounds.length,10);assert.equal(game(b).is_test,true);
 assert.match(b.document.getElementById('app').textContent,/喂养与独立测试已完成/);
 assert.equal(b.document.querySelector('[data-do=reset]'),null);assert.deepEqual(b.errors,[]);
}
test('correct V0.6 game replaces the report; A/B finish all rounds and tests, preserve separate local records',async()=>{
 const states={};for(const group of ['A','B']){
  const b=browser('index',noNetwork,{url:'https://huangrui1008-collab.github.io/psych-exp/?group='+group,local:states});try{
   assert.equal(b.document.title,'外星饲养站｜Alien Zoo');assert.ok(!b.document.getElementById('app').textContent.includes('宜家'));assert.equal(b.document.querySelectorAll('[data-do=start]').length,1);assert.equal(b.document.querySelector('.preview-links'),null);assert.equal(b.document.getElementById('gameConnection').hidden,true);
   await completeGame(b);assert.equal(game(b).mode,group==='A'?'delegation':'augmentation');Object.assign(states,Object.fromEntries(Object.entries(b.w.localStorage)));
  }finally{b.close();}
 }
 assert.ok(states['az-preview-v06-session-A']);assert.ok(states['az-preview-v06-session-B']);
 const dashboard=browser('researcher',noNetwork,{local:states});try{await tick();assert.match(dashboard.document.getElementById('gameScope').textContent,/2 次记录/);assert.equal(dashboard.document.querySelectorAll('#gameRows tr').length,2);assert.equal(dashboard.document.getElementById('legacyData').open,false);dashboard.document.getElementById('gameExportJson').click();dashboard.document.getElementById('gameExportCsv').click();assert.equal(dashboard.captures.length,2);assert.deepEqual(dashboard.errors,[]);}finally{dashboard.close();}
});
test('root entry randomly assigns both modes; invalid group creates no game; exit locks and researcher can reset',async()=>{
 const modes=new Set();for(let i=0;i<24;i++){const b=browser('index',noNetwork);try{press(b,'start');modes.add(game(b).mode);}finally{b.close();}}assert.equal(modes.size,2);
 const invalid=browser('index',noNetwork,{url:'https://huangrui1008-collab.github.io/psych-exp/?group=C'});try{assert.match(invalid.document.body.textContent,/分组链接无效/);assert.equal(invalid.w.localStorage.length,0);}finally{invalid.close();}
 const b=browser('index',noNetwork,{url:'https://huangrui1008-collab.github.io/psych-exp/?group=B&manage=1'});try{press(b,'start');press(b,'exit');assert.equal(game(b).stage,'exited');assert.match(b.document.getElementById('app').textContent,/本次任务已结束/);press(b,'reset');assert.equal(game(b),null);assert.match(b.document.body.textContent,/欢迎来到外星饲养站/);assert.deepEqual(b.errors,[]);}finally{b.close();}
});
test('real game AI uses only configured backend with memory-only owner login; fallback is explicit',async()=>{
 const calls=[];let fail=false;const b=browser('index',async(url,init={})=>{calls.push([String(url),init]);if(String(url).includes('/token?'))return new Response(JSON.stringify({access_token:'test-owner-token'}));if(String(url).endsWith('/self-test/access'))return new Response('{}');if(fail)return new Response('{}',{status:503});return new Response(JSON.stringify({kind:'plan',text:'来自真实接口的测试回应',recipe:[1,2,3,2,1]}));},{url:'https://huangrui1008-collab.github.io/psych-exp/?group=A&manage=1'});
 try{
  b.document.getElementById('gamePassword').value='not-real-password';b.document.getElementById('gameLoginForm').dispatchEvent(new b.w.Event('submit',{cancelable:true}));await settle(()=>b.document.getElementById('gameAuthMessage').textContent.includes('身份已验证'));
  b.document.getElementById('setAI').value='real';press(b,'save-settings');press(b,'start');await settle(()=>game(b).ai?.source==='real');const call=calls.find(([u])=>u.endsWith('/api/ai'));assert.ok(call[0].startsWith('https://moryybvgocdtevhmaqyd.supabase.co/'));assert.equal(call[1].headers.Authorization,'Bearer test-owner-token');assert.equal(b.document.getElementById('gamePassword').value,'');assert.ok(!JSON.stringify(Object.fromEntries(Object.entries(b.w.localStorage))).includes('test-owner-token'));
  const ack=b.document.getElementById('aiAck');ack.checked=true;ack.dispatchEvent(new b.w.Event('change',{bubbles:true}));press(b,'feed');fail=true;press(b,'next');await settle(()=>game(b).ai?.source==='mock');assert.match(b.document.querySelector('.ai').textContent,/已切换模拟回复/);assert.deepEqual(b.errors,[]);
 }finally{b.close();}
});
test('game proxy enforces owner auth and strips client rules and post-test answers before calling AI',async()=>{
 let input;const f=fixture({selfTestOnly:true,gameAI:async x=>{input=x;return {text:'测试游戏回复',recipe:[1,2,3,4,5]};}});
 const body={mode:'delegation',recipe:[0,0,0,0,0],history:[{id:'H1',x:[2,4,3,1,2],delta:1}],question:'unsure',hiddenRule:'never-send',testAnswers:['never-send']};
 assert.equal((await f.request('/api/ai',body)).status,401);assert.equal(f.store.quotas.size,0);
 assert.equal((await f.request('/api/ai',body,'',{Authorization:'Bearer ordinary'})).status,403);
 const good=await f.request('/api/ai',body,'',{Authorization:'Bearer good'});assert.equal(good.status,200);assert.deepEqual((await good.json()).recipe,[1,2,3,4,5]);assert.equal(input.hiddenRule,undefined);assert.equal(input.testAnswers,undefined);
 const b=await f.request('/api/ai',{...body,mode:'augmentation'},'',{Authorization:'Bearer good'});assert.equal((await b.json()).recipe,undefined);
 assert.equal((await f.request('/api/ai',{...body,recipe:[99]},'',{Authorization:'Bearer good'})).status,400);
 assert.equal(f.store.sessions.size,0);
});

test('participant layout follows the requested order and root assignment exists before starting and survives reload',async()=>{
 const first=browser('index',noNetwork);let local,mode;
 try{mode=first.w.localStorage.getItem('az-v06-assigned-mode');assert.ok(['delegation','augmentation'].includes(mode));assert.equal(game(first),null);local=Object.fromEntries(Object.entries(first.w.localStorage));}finally{first.close();}
 const reload=browser('index',noNetwork,{local});try{assert.equal(reload.w.localStorage.getItem('az-v06-assigned-mode'),mode);press(reload,'start');assert.equal(game(reload).mode,mode);}finally{reload.close();}
 const a=browser('index',noNetwork,{url:'https://huangrui1008-collab.github.io/psych-exp/?group=A'});try{
  press(a,'start');await settle(()=>a.document.getElementById('aiAck'));
  const sections=[...a.document.getElementById('app').children].map(x=>x.className);
  assert.deepEqual(sections,['row between round-heading','goal','card history-card','card animal-card','card conversation-card','card recipe-card']);
  assert.equal(a.document.querySelector('.animal-card small').textContent.trim(),'只');
  assert.match(a.document.querySelector('.animal-card').textContent,/每个小图案代表1只。/);
  assert.doesNotMatch(a.document.getElementById('app').textContent,/试玩|预览|数量增加或减少会直观变化/);
  press(a,'adopt');assert.deepEqual([...a.document.querySelectorAll('.plant input')].map(x=>Number(x.value)),game(a).ai.recipe);
  assert.equal(a.document.querySelector('[data-do=feed]').disabled,true);
  assert.equal(a.document.querySelector('[data-do=reset]'),null);
 }finally{a.close();}
});
