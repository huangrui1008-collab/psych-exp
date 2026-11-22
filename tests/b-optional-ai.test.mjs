import test from 'node:test';
import assert from 'node:assert/strict';
import {browser,enterGame,settle,tick} from './helpers.mjs';

const address=group=>'https://huangrui1008-collab.github.io/psych-exp/?group='+group;
const read=b=>JSON.parse(b.w.localStorage.getItem('az-flow-v1-session-B'));
const click=(b,action)=>b.document.querySelector(`[data-do=${action}]`).click();
function draft(b,values){values.forEach((value,i)=>{const input=b.document.getElementById('p'+i);input.value=String(value);input.dispatchEvent(new b.w.Event('input',{bubbles:true}));});}
function ask(b,text){const input=b.document.getElementById('chatInput');input.value=text;input.dispatchEvent(new b.w.Event('input',{bubbles:true}));b.document.getElementById('chatForm').dispatchEvent(new b.w.Event('submit',{bubbles:true,cancelable:true}));}
function acknowledge(b){const ack=b.document.getElementById('aiAck');ack.checked=true;ack.dispatchEvent(new b.w.Event('change',{bubbles:true}));}
function network(){return async url=>new Response(JSON.stringify(String(url).endsWith('/game/access')?{token:'test-only',expires_in:7200}:{text:'比较前后记录中保持不变的条件，再判断差异。',source:'real'}));}
async function completeRequiredRounds(b){for(let i=0;i<3;i++){ask(b,'请帮我分析这一轮');await settle(()=>b.document.getElementById('aiAck')&&!b.document.querySelector('.chat-waiting'));acknowledge(b);click(b,'feed');click(b,'next');}}

test('B needs successful AI consultation in three distinct feeding rounds; same-round followups and failed calls do not unlock self-decision',async()=>{
 let fail=false;const normal=network();const b=browser('index',async url=>fail?new Response(JSON.stringify({error:'测试请求失败'}),{status:503}):normal(url),{url:address('B')});
 try{
  enterGame(b);assert.equal(b.document.querySelector('[data-do=self-decide]'),null);assert.equal(b.document.querySelector('[data-do=feed]').disabled,true);
  for(let i=0;i<3;i++){ask(b,'继续分析这轮的食谱');await settle(()=>b.document.getElementById('aiAck')&&!b.document.querySelector('.chat-waiting'));}
  acknowledge(b);click(b,'feed');assert.equal(read(b).rounds[0].completedAIConsultationRounds,1);click(b,'next');assert.equal(b.document.querySelector('[data-do=self-decide]'),null);
  fail=true;ask(b,'请根据上轮结果分析');await settle(()=>read(b).chatError&&!b.document.querySelector('.chat-waiting'));
  assert.equal(b.document.querySelector('[data-do=self-decide]'),null);assert.equal(b.document.querySelector('[data-do=feed]').disabled,true);assert.equal(read(b).rounds.length,1);
  fail=false;
  for(let i=0;i<2;i++){ask(b,'请比较食谱和结果');await settle(()=>b.document.getElementById('aiAck')&&!b.document.querySelector('.chat-waiting'));acknowledge(b);click(b,'feed');click(b,'next');assert.equal(!!b.document.querySelector('[data-do=self-decide]'),i===1);}
  assert.equal(read(b).rounds[2].completedAIConsultationRounds,3);assert.equal(read(b).rounds[2].minimumAIConsultationRounds,3);assert.equal(read(b).rounds[2].aiParticipationPolicy,'b-min3-rounds-v1');assert.deepEqual(b.errors,[]);
 }finally{b.close();}
});

test('a previous preview self-decision cannot bypass the new minimum and old saved rounds are preserved',()=>{
 const initial=browser('index',network(),{url:address('B')});let local,oldRound;
 try{
  enterGame(initial);local=Object.fromEntries(Object.entries(initial.w.localStorage));const old=JSON.parse(local['az-flow-v1-session-B']);
  oldRound={id:'R1',x:[1,4,3,2,1],delta:4,before:20,after:24,aiSource:null,aiConsulted:false,aiUseStatus:'not_consulted',aiParticipationPolicy:'b-optional-v1'};
  old.rounds=[oldRound];old.pack=24;old.selfDecideRound=2;local['az-flow-v1-session-B']=JSON.stringify(old);
 }finally{initial.close();}
 const resumed=browser('index',network(),{url:address('B'),local});
 try{assert.equal(resumed.document.querySelector('[data-do=self-decide]'),null);assert.equal(resumed.document.querySelector('[data-do=feed]').disabled,true);assert.deepEqual(read(resumed).rounds,[oldRound]);assert.equal(read(resumed).pack,24);assert.doesNotMatch(resumed.document.getElementById('feedingHint').textContent,/至少在3个喂养轮次/);}finally{resumed.close();}
});

test('B explicitly chooses an unassisted round, keeps input validation, and can consult again next round',async()=>{
 let calls=0;const real=network();const b=browser('index',async(...args)=>{calls++;return real(...args);},{url:address('B')});
 try{
  enterGame(b);await completeRequiredRounds(b);calls=0;assert.equal(b.document.querySelector('[data-do=feed]').disabled,true);
  draft(b,[1,4,3,2,1]);const log=b.document.querySelector('.chat-log');log.scrollTop=80;
  const input=b.document.getElementById('chatInput');input.value='稍后再问的问题';input.dispatchEvent(new b.w.Event('input',{bubbles:true}));
  click(b,'self-decide');assert.equal(b.document.querySelector('.chat-log'),log);assert.equal(log.scrollTop,80);assert.equal(input.value,'稍后再问的问题');assert.equal(b.document.querySelector('[data-do=feed]').disabled,false);
  draft(b,[1,7,3,2,1]);click(b,'feed');assert.equal(read(b).rounds.length,3);
  draft(b,[1,4,3,2,1]);click(b,'feed');const row=read(b).rounds[3];assert.equal(row.aiUseStatus,'not_consulted');assert.equal(row.aiConsulted,false);assert.equal(row.aiRequested,false);assert.equal(row.aiAcknowledged,false);assert.equal(row.aiSource,null);assert.equal(row.selfDecidedWithoutReply,true);assert.equal(calls,0);
  click(b,'next');assert.equal(b.document.querySelector('[data-do=feed]').disabled,true);assert.equal(b.document.querySelector('[data-do=self-decide]').disabled,false);
  ask(b,'上轮结果能说明哪部分选择有效？');await settle(()=>b.document.getElementById('aiAck')&&!b.document.querySelector('.chat-waiting'));acknowledge(b);click(b,'feed');
  const next=read(b).rounds[4];assert.equal(next.aiUseStatus,'consulted');assert.equal(next.aiConsulted,true);assert.equal(next.selfDecidedWithoutReply,false);assert.deepEqual(b.errors,[]);
 }finally{b.close();}
});

test('a saved B self-decision survives reopening the same entry without changing the session or round',async()=>{
 const b=browser('index',network(),{url:address('B')});let local;
 try{enterGame(b);await completeRequiredRounds(b);draft(b,[1,4,3,2,1]);click(b,'self-decide');local=Object.fromEntries(Object.entries(b.w.localStorage));}finally{b.close();}
 const again=browser('index',()=>{throw Error('No network expected');},{url:address('B'),local});
 try{assert.equal(again.document.querySelector('[data-do=feed]').disabled,false);const before=read(again);click(again,'feed');assert.equal(read(again).id,before.id);assert.equal(read(again).mode,'augmentation');assert.deepEqual(read(again).rounds[3].x,[1,4,3,2,1]);}finally{again.close();}
});

test('consulting after selecting self-decision locks submission while pending and records the successful reply as consulted',async()=>{
 let deliver,hold=false;const normal=network();const b=browser('index',async url=>!hold?normal(url):String(url).endsWith('/game/access')?new Response(JSON.stringify({token:'test-only',expires_in:7200})):new Promise(resolve=>{deliver=()=>resolve(new Response(JSON.stringify({text:'请比较两次观察中的差异。',source:'real'})));}),{url:address('B')});
 try{
  enterGame(b);await completeRequiredRounds(b);hold=true;click(b,'self-decide');ask(b,'我还是想请你分析一下');await settle(()=>deliver);
  assert.equal(b.document.querySelector('[data-do=feed]').disabled,true);assert.equal(b.document.querySelector('[data-do=self-decide]').disabled,true);assert.equal(read(b).selfDecideRound,null);
  deliver();await settle(()=>b.document.getElementById('aiAck')&&!b.document.querySelector('.chat-waiting'));
  assert.equal(b.document.querySelector('[data-do=self-decide]'),null);assert.equal(b.document.querySelector('[data-do=feed]').disabled,true);
  acknowledge(b);click(b,'feed');const row=read(b).rounds[3];assert.equal(row.aiConsulted,true);assert.equal(row.aiRequested,true);assert.equal(row.selfDecidedWithoutReply,false);assert.equal(row.aiSource,'real');assert.deepEqual(b.errors,[]);
 }finally{b.close();}
});

test('B may decide after a failed request without recording a fictitious AI reply, and researcher summary distinguishes it',async()=>{
 let fail=false;const normal=network();const b=browser('index',async url=>fail?new Response(JSON.stringify({error:'测试连接失败'}),{status:503}):normal(url),{url:address('B')});let local;
 try{
  enterGame(b);await completeRequiredRounds(b);fail=true;ask(b,'请帮我比较');await settle(()=>b.document.querySelector('.chat-error')?.textContent.includes('测试连接失败')&&!b.document.querySelector('.chat-waiting'));
  click(b,'self-decide');click(b,'feed');const row=read(b).rounds[3];assert.equal(row.aiUseStatus,'requested_without_reply');assert.equal(row.aiConsulted,false);assert.equal(row.aiRequested,true);assert.equal(row.aiSource,null);assert.equal(row.aiText,null);assert.equal(row.aiAcknowledged,false);assert.equal(read(b).chatHistory.at(-1).status,'failed');local=Object.fromEntries(Object.entries(b.w.localStorage));
 }finally{b.close();}
 const researcher=browser('researcher',async()=>{throw Error('No network expected');},{local});
 try{await tick();assert.match(researcher.document.getElementById('gameRows').textContent,/请求未获回复/);assert.doesNotMatch(researcher.document.getElementById('gameRows').textContent,/真实API模式（尚无投喂）/);}finally{researcher.close();}
});

test('A keeps its required AI flow and has no B self-decision control',()=>{
 const b=browser('index',()=>{throw Error('No network expected');},{url:address('A')});
 try{enterGame(b);assert.equal(b.document.querySelector('[data-do=self-decide]'),null);assert.equal(b.document.querySelector('[data-do=feed]').disabled,true);assert.ok(b.document.querySelector('[data-do=fill-recipe-prompt]'));assert.equal(b.document.querySelector('.header-caption'),null);assert.equal(b.document.querySelector('footer'),null);}finally{b.close();}
});
