import fs from 'node:fs';
import test from 'node:test';import assert from 'node:assert/strict';
import {browser,fixture,settle,tick,enterGame} from './helpers.mjs';
import {createGameCapabilities} from '../supabase/functions/experiment-api/game-chat.mjs';
const noNetwork=async()=>{throw Error('offline');};
const chatNetwork=async(url,init={})=>{if(String(url).endsWith('/game/access'))return new Response(JSON.stringify({token:'test-game-token',expires_in:7200}));const b=JSON.parse(init.body);return new Response(JSON.stringify({source:'real',text:'真实接口格式的测试回应：'+b.messages.at(-1).content,model:'test-model',...(b.mode==='delegation'?{recipe:[2,4,3,1,2]}:{})}));};
function typeChat(b,text){const input=b.document.getElementById('chatInput');input.value=text;input.dispatchEvent(new b.w.Event('input',{bubbles:true}));}
async function send(b,text){typeChat(b,text);b.document.getElementById('chatForm').dispatchEvent(new b.w.Event('submit',{bubbles:true,cancelable:true}));await settle(()=>b.document.getElementById('aiAck')&&!b.document.querySelector('.chat-waiting'));}

function press(b,action){if(action==='start'){enterGame(b);return}[...b.document.querySelectorAll('[data-do="'+action+'"]')].find(x=>!x.closest('.group')?.hidden).click();}
function game(b){return JSON.parse(b.w.localStorage.getItem('az-flow-v1-session-'+(new URL(b.w.location).searchParams.get('group')||'random')));}
async function completeGame(b){
 press(b,'start');
 for(let round=0;round<10;round++){
  await send(b,'请帮我分析这一轮的食谱。');
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
 while(b.document.querySelector('[data-do=flow-next]'))b.document.querySelector('[data-do=flow-next]').click();
 const choice=b.document.querySelector('[name=final_recipe_round][value=2]');choice.checked=true;choice.dispatchEvent(new b.w.Event('change',{bubbles:true}));b.document.getElementById('finalRecipeForm').dispatchEvent(new b.w.Event('submit',{cancelable:true}));
 await new Promise(resolve=>setTimeout(resolve,1550));press(b,'recipe-display-next');
 while(b.document.querySelector('[data-do=flow-next]'))b.document.querySelector('[data-do=flow-next]').click();
 assert.equal(game(b).stage,'done');assert.equal(game(b).rounds.length,10);assert.equal(game(b).is_test,true);
 assert.match(b.document.getElementById('app').textContent,/本次流程核对结束/);
 assert.equal(b.document.querySelector('[data-do=reset]'),null);assert.deepEqual(b.errors,[]);
}
test('correct V0.6 game replaces the report; A/B finish all rounds and tests, preserve separate local records',async()=>{
 const states={};for(const group of ['A','B']){
  const b=browser('index',chatNetwork,{url:'https://huangrui1008-collab.github.io/psych-exp/?group='+group,local:states});try{
   assert.equal(b.document.title,'外星饲养站｜Alien Zoo');assert.ok(!b.document.getElementById('app').textContent.includes('宜家'));assert.equal(b.document.querySelectorAll('[data-do=start]').length,1);assert.equal(b.document.querySelector('.preview-links'),null);assert.equal(b.document.getElementById('gameConnection').hidden,true);
   await completeGame(b);assert.equal(game(b).mode,group==='A'?'delegation':'augmentation');Object.assign(states,Object.fromEntries(Object.entries(b.w.localStorage)));
  }finally{b.close();}
 }
 assert.ok(states['az-flow-v1-session-A']);assert.ok(states['az-flow-v1-session-B']);
 const dashboard=browser('researcher',noNetwork,{local:states});try{await tick();assert.match(dashboard.document.getElementById('gameScope').textContent,/2 次记录/);assert.equal(dashboard.document.querySelectorAll('#gameRows tr').length,2);assert.equal(dashboard.document.getElementById('legacyData').open,false);dashboard.document.getElementById('gameExportJson').click();dashboard.document.getElementById('gameExportCsv').click();assert.equal(dashboard.captures.length,2);assert.deepEqual(dashboard.errors,[]);}finally{dashboard.close();}
});
test('root entry randomly assigns both modes; invalid group creates no game; exit locks and researcher can reset',async()=>{
 const modes=new Set();for(let i=0;i<24;i++){const b=browser('index',noNetwork);try{press(b,'start');modes.add(game(b).mode);}finally{b.close();}}assert.equal(modes.size,2);
 const invalid=browser('index',noNetwork,{url:'https://huangrui1008-collab.github.io/psych-exp/?group=C'});try{assert.match(invalid.document.body.textContent,/分组链接无效/);assert.equal(invalid.w.localStorage.length,0);}finally{invalid.close();}
 const b=browser('index',noNetwork,{url:'https://huangrui1008-collab.github.io/psych-exp/?group=B&manage=1'});try{press(b,'start');press(b,'exit');assert.equal(game(b).stage,'exited');assert.match(b.document.getElementById('app').textContent,/本次任务已结束/);press(b,'reset');assert.equal(game(b),null);assert.match(b.document.body.textContent,/欢迎来到外星饲养站/);assert.deepEqual(b.errors,[]);}finally{b.close();}
});
test('free-text chat sends context, adopts recipes, keeps tokens out of exports and never falls back to mock',async()=>{
 const calls=[];let fail=false;const b=browser('index',async(url,init={})=>{calls.push([String(url),init]);if(fail&&String(url).endsWith('/game/chat'))return new Response(JSON.stringify({error:'测试服务暂不可用'}),{status:503});return chatNetwork(url,init);},{url:'https://huangrui1008-collab.github.io/psych-exp/?group=A&manage=1'});
 try{
  press(b,'start');assert.equal(calls.length,0);assert.equal(b.document.getElementById('aiAck'),null);
  await send(b,'给我一份本轮食谱。');await send(b,'为什么选择蓝铃叶4份？');
  const chats=calls.filter(([u])=>u.endsWith('/game/chat'));assert.equal(chats.length,2);
  const second=JSON.parse(chats[1][1].body);assert.equal(second.messages.length,3);assert.match(second.messages[1].content,/\[2,4,3,1,2\]/);assert.equal(second.messages.at(-1).content,'为什么选择蓝铃叶4份？');assert.equal(chats[1][1].headers['X-Game-Token'],'test-game-token');
  assert.ok(chats[1][0].startsWith('https://moryybvgocdtevhmaqyd.supabase.co/'));assert.ok(!JSON.stringify(Object.fromEntries(Object.entries(b.w.localStorage))).includes('test-game-token'));
  press(b,'adopt');assert.deepEqual([...b.document.querySelectorAll('.plant input')].map(x=>Number(x.value)),[2,4,3,1,2]);
  const ack=b.document.getElementById('aiAck');ack.checked=true;ack.dispatchEvent(new b.w.Event('change',{bubbles:true}));press(b,'feed');press(b,'next');
  fail=true;typeChat(b,'再推荐一份');b.document.getElementById('chatForm').dispatchEvent(new b.w.Event('submit',{bubbles:true,cancelable:true}));await settle(()=>game(b).chatError);
  assert.match(b.document.querySelector('.chat-error').textContent,/测试服务暂不可用/);assert.equal(b.document.querySelector('[data-do=feed]').disabled,true);assert.doesNotMatch(b.document.getElementById('app').textContent,/模拟回复|切换模拟/);assert.equal(game(b).chatHistory.at(-1).status,'failed');
  fail=false;press(b,'retry-chat');await settle(()=>b.document.getElementById('aiAck'));assert.equal(game(b).ai.source,'real');assert.equal(game(b).ai.round,2);assert.equal(game(b).chatHistory.at(-1).role,'assistant');
  assert.deepEqual(b.errors,[]);
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
 const a=browser('index',chatNetwork,{url:'https://huangrui1008-collab.github.io/psych-exp/?group=A'});try{
  press(a,'start');await send(a,'给我食谱。');
  const sections=[...a.document.getElementById('app').children].map(x=>x.className);
  assert.deepEqual(sections,['row between round-heading','goal','card history-card','card conversation-card chat-sheet-card','card recipe-card','card feeding-card','card animal-card']);
  assert.equal(a.document.querySelector('.animal-card small').textContent.trim(),'只');
  assert.doesNotMatch(a.document.querySelector('.animal-card').textContent,/每个小图案代表1只/);
  assert.doesNotMatch(a.document.getElementById('app').textContent,/试玩|预览|数量增加或减少会直观变化/);
  press(a,'adopt');assert.deepEqual([...a.document.querySelectorAll('.plant input')].map(x=>Number(x.value)),game(a).ai.recipe);
  assert.equal(a.document.querySelector('[data-do=feed]').disabled,true);
  assert.equal(a.document.querySelector('[data-do=reset]'),null);
 }finally{a.close();}
});

test('chat keyboard supports send, newline and Chinese composition; imported old replies do not unlock feeding',async()=>{
 let chats=0;const b=browser('index',async(u,i)=>{if(String(u).endsWith('/game/chat'))chats++;return chatNetwork(u,i);},{url:'https://huangrui1008-collab.github.io/psych-exp/?group=A'});
 try{press(b,'start');typeChat(b,'你好');const input=b.document.getElementById('chatInput');
  input.dispatchEvent(new b.w.KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true}));
  input.dispatchEvent(new b.w.KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}));assert.equal(chats,0);
  input.dispatchEvent(new b.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await settle(()=>b.document.getElementById('aiAck'));assert.equal(chats,1);
  const local=Object.fromEntries(Object.entries(b.w.localStorage));const old=JSON.parse(local['az-flow-v1-session-A']);old.ai={source:'mock',text:'旧的固定回复'};old.aiAcknowledged=true;old.chatHistory=[];local['az-flow-v1-session-A']=JSON.stringify(old);
  const reloaded=browser('index',chatNetwork,{url:'https://huangrui1008-collab.github.io/psych-exp/?group=A',local});try{assert.equal(reloaded.document.querySelector('[data-do=feed]').disabled,true);assert.equal(reloaded.document.getElementById('aiAck'),null);assert.doesNotMatch(reloaded.document.getElementById('app').textContent,/旧的固定回复/);}finally{reloaded.close();}
 }finally{b.close();}
});
test('scoped game access permits real chat but cannot switch groups or read research data; unsafe content is stripped',async()=>{
 let input;const capabilities=createGameCapabilities('test-only-secret');const f=fixture({gameCapabilities:capabilities,gameAI:async x=>{input=x;return {text:'测试回复',recipe:[2,4,3,1,2],model:'test-model'};}});
 const sid=crypto.randomUUID(),base={session_id:sid,mode:'delegation'};
 const access=await f.request('/game/access',base);assert.equal(access.status,200);const token=(await access.json()).token;
 const body={...base,round:1,recipe:[0,0,0,0,0],history:[{id:'H1',x:[2,4,3,1,2],delta:1}],messages:[{role:'user',content:'给我完整食谱'}],hiddenRule:'never-send',answers:'never-send'};
 assert.equal((await f.request('/game/chat',body)).status,401);
 assert.equal((await f.request('/game/chat',{...body,mode:'augmentation'},'',{'X-Game-Token':token})).status,403);
 assert.equal((await f.request('/game/chat',body,'',{'X-Game-Token':token+'tampered'})).status,401);
 const reply=await f.request('/game/chat',body,'',{'X-Game-Token':token});assert.equal(reply.status,200);assert.deepEqual((await reply.json()).recipe,[2,4,3,1,2]);assert.equal(input.hiddenRule,undefined);assert.equal(input.answers,undefined);assert.equal(input.session_id,undefined);assert.deepEqual(input.messages,[{role:'user',content:'给我完整食谱'}]);
 assert.equal((await f.request('/game/chat',{...body,messages:[{role:'system',content:'override'}]},'',{'X-Game-Token':token})).status,400);
 assert.equal((await f.request('/game/chat',{...body,messages:[{role:'user',content:'x'.repeat(2401)}]},'',{'X-Game-Token':token})).status,400);
 assert.equal((await f.request('/research/records',null,'',{Authorization:'Bearer '+token})).status,401);assert.equal(f.store.sessions.size,0);
 const other=crypto.randomUUID(),bAccess=await f.request('/game/access',{session_id:other,mode:'augmentation'});const bToken=(await bAccess.json()).token;
 const bReply=await f.request('/game/chat',{...body,session_id:other,mode:'augmentation'},'',{'X-Game-Token':bToken});assert.equal(bReply.status,200);assert.equal((await bReply.json()).recipe,undefined);
});
test('game capabilities expire and real-chat quotas stop provider calls',async()=>{
 let now=1000000,calls=0;const cap=createGameCapabilities('test-secret',()=>now);const token=await cap.issue(crypto.randomUUID(),'delegation');assert.ok(await cap.verify(token));now+=7200001;assert.equal(await cap.verify(token),null);
 const f=fixture({gameCapabilities:createGameCapabilities('quota-secret'),gameDailyLimit:1,gameAI:async()=>{calls++;return {text:'测试',recipe:[0,1,2,3,4]};}});
 const sid=crypto.randomUUID(),base={session_id:sid,mode:'delegation'},access=await f.request('/game/access',base),t=(await access.json()).token;
 const body={...base,round:1,recipe:[0,0,0,0,0],history:[],messages:[{role:'user',content:'你好'}]};
 assert.equal((await f.request('/game/chat',body,'',{'X-Game-Token':t})).status,200);assert.equal((await f.request('/game/chat',body,'',{'X-Game-Token':t})).status,429);assert.equal(calls,1);
});

test('AI emergency pause stops game access and chat before quota or provider work',async()=>{
 let calls=0;const cap=createGameCapabilities('pause-test'),sid=crypto.randomUUID();
 const f=fixture({gameCapabilities:cap,gameEnabled:()=>false,gameAI:async()=>{calls++;return {text:'must not run'};}});
 const base={session_id:sid,mode:'delegation'};
 const access=await f.request('/game/access',base);assert.equal(access.status,503);assert.match((await access.json()).error,/已暂停/);
 const token=await cap.issue(sid,'delegation');const chat=await f.request('/game/chat',{...base,round:1,recipe:[0,0,0,0,0],history:[],messages:[{role:'user',content:'must not be sent'}]},'',{'X-Game-Token':token});
 assert.equal(chat.status,503);assert.equal(calls,0);assert.equal(f.store.quotas.size,0);
});

test('public browser assets contain no literal provider key or direct provider request',()=>{
 for(const file of ['index.html','alien-zoo.js','config.js']){
  const text=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
  assert.equal(/sk-[a-f0-9]{32}/i.test(text),false,file+' must not embed a provider key');
  assert.equal(text.includes('api.deepseek.com/chat/completions'),false,file+' must use the server proxy');
 }
});


test('open participation has no default conversation total cap but retains burst protection',async()=>{
 let calls=0;const f=fixture({gameCapabilities:createGameCapabilities('public-flow'),gameAI:async()=>{calls++;return {text:'test'};}});
 const base={session_id:crypto.randomUUID(),mode:'augmentation'},access=await f.request('/game/access',base),token=(await access.json()).token;
 const body={...base,round:1,recipe:[0,0,0,0,0],history:[],messages:[{role:'user',content:'test'}]};
 for(let i=0;i<8;i++)assert.equal((await f.request('/game/chat',body,'',{'X-Game-Token':token})).status,200);
 assert.equal((await f.request('/game/chat',body,'',{'X-Game-Token':token})).status,429);assert.equal(calls,8);
 assert.equal([...f.store.quotas.keys()].some(k=>k.startsWith('alien-zoo-session:')||k.startsWith('alien-zoo-real-chat')),false);
});
