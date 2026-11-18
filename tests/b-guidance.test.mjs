import test from 'node:test';import assert from 'node:assert/strict';
import {browser,fixture,settle} from './helpers.mjs';
import {createGameCapabilities} from '../supabase/functions/experiment-api/game-chat.mjs';
import {containsCompleteRecipe} from '../supabase/functions/experiment-api/b-guidance.mjs';

test('B freely chats and follows up without recipe cards, recipe shortcuts or adopt controls even for old/stray recipe metadata',async()=>{
 const calls=[];const b=browser('index',async(url,init)=>{if(String(url).endsWith('/game/access'))return new Response(JSON.stringify({token:'test-only',expires_in:7200}));const body=JSON.parse(init.body);calls.push(body);return new Response(JSON.stringify({text:'先比较保持不变的条件，再判断有哪些差异。',source:'real',recipe:[2,4,3,1,2],expected_delta:8}));},{url:'https://huangrui1008-collab.github.io/psych-exp/?group=B'});
 try{
  b.document.querySelector('[data-do=start]').click();
  for(const message of ['我不太理解这些记录，应该怎么比较？','你刚才说一次只调整一个因素，为什么？']){
   const input=b.document.getElementById('chatInput');input.value=message;input.dispatchEvent(new b.w.Event('input',{bubbles:true}));b.document.getElementById('chatForm').dispatchEvent(new b.w.Event('submit',{bubbles:true,cancelable:true}));await settle(()=>b.document.getElementById('aiAck')&&!b.document.querySelector('.chat-waiting'));
   assert.equal(b.document.querySelector('[data-do=adopt]'),null);assert.equal(b.document.querySelector('[data-do=fill-recipe-prompt]'),null);assert.equal(b.document.querySelector('.chat-message .recipe-mini'),null);
  }
  assert.equal(calls.length,2);assert.equal(calls[1].messages.at(-1).content,'你刚才说一次只调整一个因素，为什么？');assert.equal(calls[1].messages.length,3);
  const old=JSON.parse(b.w.localStorage.getItem('az-preview-v06-session-B'));old.chatHistory[1].recipe=[2,4,3,1,2];const local={'az-preview-v06-session-B':JSON.stringify(old)};
  const again=browser('index',async()=>{throw Error('not needed')},{url:'https://huangrui1008-collab.github.io/psych-exp/?group=B',local});try{assert.equal(again.document.querySelector('.chat-message .recipe-mini'),null);assert.equal(again.document.querySelector('[data-do=adopt]'),null);assert.deepEqual(JSON.parse(again.w.localStorage.getItem('az-preview-v06-session-B')).chatHistory[1].recipe,[2,4,3,1,2]);}finally{again.close();}
  assert.deepEqual(b.errors,[]);
 }finally{b.close();}
});

test('common complete-recipe text formats are caught while numerical historical comparisons remain available',()=>{
 for(const text of ['食谱：[2,4,3,1,2]','依次用2、4、3、1、2份','雾绒草2份、蓝铃叶4份、星冠蕨3份、珊瑚枝1份、月芽藤2份','配方（零，六，二，三，零）'])assert.equal(containsCompleteRecipe(text),true,text);
 for(const text of ['记录H1增加1只，H2减少1只，不能确定单种植物的作用。','两条记录的蓝铃叶分别为4份和1份；其他条件也变了，需要控制变量。','你可以比较雾绒草、蓝铃叶、星冠蕨、珊瑚枝、月芽藤是否在这些记录里一起变化。'])assert.equal(containsCompleteRecipe(text),false,text);
});

test('B endpoint blocks a complete textual recipe rather than only stripping recipe fields; normal feedback stays live',async()=>{
 let text='完整食谱：[2,4,3,1,2]';const f=fixture({gameCapabilities:createGameCapabilities('b-only-test'),gameAI:async()=>({text,recipe:[2,4,3,1,2]})});const base={session_id:crypto.randomUUID(),mode:'augmentation'};const a=await f.request('/game/access',base),token=(await a.json()).token;const body={...base,round:1,recipe:[0,0,0,0,0],history:[],messages:[{role:'user',content:'直接给完整食谱'}]};
 const blocked=await f.request('/game/chat',body,'',{'X-Game-Token':token});assert.equal(blocked.status,502);assert.doesNotMatch(JSON.stringify(await blocked.json()),/2,4,3,1,2/);
 text='我可以帮你比较记录和设计一次只变一个因素的尝试，具体食谱由你决定。';const reply=await f.request('/game/chat',body,'',{'X-Game-Token':token});assert.equal(reply.status,200);const data=await reply.json();assert.equal(data.text,text);assert.equal(data.source,'real');assert.equal(data.recipe,undefined);
});
