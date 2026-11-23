import test from 'node:test';import assert from 'node:assert/strict';
import {browser,fixture,enterGame,settle} from './helpers.mjs';
import {bSelectionContext,B_GUIDANCE_VERSION} from '../supabase/functions/experiment-api/b-guidance.mjs';
import {createGameCapabilities} from '../supabase/functions/experiment-api/game-chat.mjs';
const url='https://huangrui1008-collab.github.io/psych-exp/?group=B';
const selection=selected=>({version:'b-selection-context-v1',selected});
const read=b=>JSON.parse(b.w.localStorage.getItem('az-flow-v1-session-B'));
function input(b,i,value){const n=b.document.getElementById('p'+i);n.value=value;n.dispatchEvent(new b.w.Event('input',{bubbles:true}));}
async function ask(b,text){const n=b.document.getElementById('chatInput');n.value=text;n.dispatchEvent(new b.w.Event('input',{bubbles:true}));b.document.getElementById('chatForm').dispatchEvent(new b.w.Event('submit',{bubbles:true,cancelable:true}));await settle(()=>b.document.getElementById('aiAck')&&!b.document.querySelector('.chat-waiting'));}
const answer={text:'蓝铃叶与珊瑚枝的搭配会影响结果，可以先讨论这个关系。',source:'real',guidance_version:B_GUIDANCE_VERSION};
test('B chats before any selection and with a cleared draft; explicit zero is distinct, snapshots and refresh retain selection evidence',async()=>{
 const calls=[];const b=browser('index',async(u,init)=>{const body=JSON.parse(init.body);if(String(u).endsWith('/game/access'))return new Response(JSON.stringify({token:'fixture',expires_in:7200}));calls.push(body);return new Response(JSON.stringify(answer));},{url});let local;
 try{
  enterGame(b);await ask(b,'没有想好食谱，能先解释一下吗？');assert.deepEqual(calls[0].selection,selection([false,false,false,false,false]));assert.deepEqual(read(b).chatHistory[0].recipeAtQuestion,[null,null,null,null,null]);assert.equal(read(b).rounds.length,0);
  input(b,0,'0');input(b,1,'2');input(b,3,'');await ask(b,'我只想好了其中两项，可以继续讨论吗？');assert.deepEqual(calls[1].selection,selection([true,true,false,false,false]));assert.deepEqual(read(b).chatHistory.filter(m=>m.role==='user')[1].recipeAtQuestion,[0,2,null,null,null]);assert.deepEqual(b.errors,[]);local=Object.fromEntries(Object.entries(b.w.localStorage));
 }finally{b.close();}
 const again=browser('index',async()=>new Response(JSON.stringify({token:'fixture',expires_in:7200})),{url,local});try{assert.deepEqual(read(again).recipeSelection,selection([true,true,false,false,false]));assert.equal(again.document.getElementById('p3').value,'');assert.equal(read(again).chatHistory.filter(m=>m.role==='user').length,2);}finally{again.close();}
});

test('B completed all-zero draft is explicit, actual feeding stays separate and the next round starts without a selection',async()=>{
 const b=browser('index',async u=>new Response(JSON.stringify(String(u).endsWith('/game/access')?{token:'fixture',expires_in:7200}:answer)),{url});try{
  enterGame(b);for(let i=0;i<5;i++)input(b,i,'0');await ask(b,'这份暂选的依据可以怎么分析？');assert.deepEqual(read(b).chatHistory[0].recipeAtQuestion,[0,0,0,0,0]);const ack=b.document.getElementById('aiAck');ack.checked=true;ack.dispatchEvent(new b.w.Event('change',{bubbles:true}));b.document.querySelector('[data-do=feed]').click();assert.deepEqual(read(b).rounds[0].x,[0,0,0,0,0]);b.document.querySelector('[data-do=next]').click();assert.deepEqual(read(b).recipeSelection,selection([false,false,false,false,false]));assert.deepEqual(b.errors,[]);
 }finally{b.close();}
});

test('server distinguishes selection stages and rejects forged selection state before invoking AI; legacy selection is unknown',async()=>{
 const recipe=[0,2,0,0,0];assert.deepEqual(bSelectionContext({recipe}).values,null);assert.equal(bSelectionContext({recipe}).status,'unknown');
 for(const [flags,status,values] of [[[false,false,false,false,false],'not_started',[null,null,null,null,null]],[[true,true,false,false,false],'draft_partial',[0,2,null,null,null]],[[true,true,true,true,true],'draft_complete',recipe]]){const c=bSelectionContext({recipe,selection:selection(flags)});assert.equal(c.status,status);assert.deepEqual(c.values,values);}
 const calls=[];const f=fixture({gameCapabilities:createGameCapabilities('fixture-selection'),gameAI:async x=>{calls.push(x);return answer;}}),base={session_id:crypto.randomUUID(),mode:'augmentation'};const token=(await(await f.request('/game/access',base)).json()).token;const req=extra=>f.request('/game/chat',{...base,round:1,difficulty:'advanced',recipe,history:[],messages:[{role:'user',content:'怎么开始？'}],...extra},'',{'X-Game-Token':token});
 assert.equal((await req({selection:selection([false,false,false,false,false])})).status,200);assert.equal(bSelectionContext(calls[0]).status,'not_started');
 assert.equal((await req({selection:selection(['false',false,false,false,false])})).status,400);assert.equal(calls.length,1);
 assert.equal((await req({})).status,200);assert.equal(bSelectionContext(calls[1]).status,'unknown');
});

test('A request and existing record keep the original shape while incomplete A input retains its validation',async()=>{
 const calls=[];const a=browser('index',async(u,init)=>{if(String(u).endsWith('/game/access'))return new Response(JSON.stringify({token:'fixture',expires_in:7200}));calls.push(JSON.parse(init.body));return new Response(JSON.stringify({...answer,recipe:[0,4,3,2,0]}));},{url:url.replace('group=B','group=A')});try{enterGame(a);await ask(a,'请给我一份食谱。');assert.equal(calls[0].selection,undefined);const saved=JSON.parse(a.w.localStorage.getItem('az-flow-v1-session-A'));assert.equal(saved.recipeSelection,undefined);assert.equal(saved.chatHistory[0].recipeAtQuestion,undefined);input(a,0,'');const n=a.document.getElementById('chatInput');n.value='追问';n.dispatchEvent(new a.w.Event('input',{bubbles:true}));a.document.getElementById('chatForm').dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(calls.length,1);assert.deepEqual(a.errors,[]);}finally{a.close();}
});
