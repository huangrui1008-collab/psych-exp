import test from 'node:test';import assert from 'node:assert/strict';
import {browser,enterGame,settle} from './helpers.mjs';

test('adopting a second-round recipe and acknowledging it retain the chat, scroll positions, draft and full history',async()=>{
 const b=browser('index',async(url,init)=>{if(String(url).endsWith('/game/access'))return new Response(JSON.stringify({token:'test-only',expires_in:7200}));const body=JSON.parse(init.body);return new Response(JSON.stringify({text:'给你解释本轮选择。'.repeat(20),source:'real',recipe:body.round===1?[2,3,3,2,2]:[1,4,3,2,1]}));},{url:'https://huangrui1008-collab.github.io/psych-exp/?group=A'});
 const state=()=>JSON.parse(b.w.localStorage.getItem('az-flow-v1-session-A'));
 async function send(text){const x=b.document.getElementById('chatInput');x.value=text;x.dispatchEvent(new b.w.Event('input',{bubbles:true}));b.document.getElementById('chatForm').dispatchEvent(new b.w.Event('submit',{bubbles:true,cancelable:true}));await settle(()=>b.document.getElementById('aiAck')&&!b.document.querySelector('.chat-waiting'));}
 try{
  enterGame(b);await send('第一轮食谱');let ack=b.document.getElementById('aiAck');ack.checked=true;ack.dispatchEvent(new b.w.Event('change',{bubbles:true}));b.document.querySelector('[data-do=feed]').click();b.document.querySelector('[data-do=next]').click();await send('第二轮食谱');
  const log=b.document.querySelector('.chat-log'),input=b.document.getElementById('chatInput'),card=b.document.querySelector('.recipe-card'),adopt=b.document.querySelector('[data-do=adopt]');const history=structuredClone(state().chatHistory);input.value='继续追问的草稿';input.dispatchEvent(new b.w.Event('input',{bubbles:true}));log.scrollTop=137;Object.defineProperty(b.w,'scrollY',{value:540,configurable:true});let scrollCalls=0;b.w.scrollTo=()=>scrollCalls++;
  for(let i=0;i<3;i++){
   adopt.click();assert.equal(b.document.querySelector('.chat-log'),log);assert.equal(b.document.getElementById('chatInput'),input);assert.equal(b.document.querySelector('.recipe-card'),card);assert.equal(log.scrollTop,137);assert.equal(b.w.scrollY,540);assert.equal(scrollCalls,0);assert.equal(input.value,'继续追问的草稿');assert.deepEqual(state().chatHistory,history);assert.deepEqual([...b.document.querySelectorAll('.plant input')].map(x=>Number(x.value)),[1,4,3,2,1]);assert.deepEqual(state().draft,[1,4,3,2,1]);assert.equal(state().adoptedMessageId,history.at(-1).id);
  }
  ack=b.document.getElementById('aiAck');for(const yes of [true,false,true]){ack.checked=yes;ack.dispatchEvent(new b.w.Event('change',{bubbles:true}));assert.equal(b.document.querySelector('.chat-log'),log);assert.equal(log.scrollTop,137);assert.equal(b.w.scrollY,540);assert.equal(b.document.querySelector('[data-do=feed]').disabled,!yes);assert.equal(state().aiAcknowledged,yes);}
  assert.equal(state().chatHistory.length,4);assert.deepEqual(b.errors,[]);
 }finally{b.close();}
});
