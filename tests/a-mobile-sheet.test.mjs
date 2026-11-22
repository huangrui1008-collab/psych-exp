import test from 'node:test';
import assert from 'node:assert/strict';
import {browser,enterGame,settle} from './helpers.mjs';

test('mobile A retains required per-round consultation, full recipe, stable adoption and chat draft across sheet closes',async()=>{
 let requests=0;const recipe=[1,4,3,2,1];
 const b=browser('index',async address=>{requests++;return new Response(JSON.stringify(String(address).endsWith('/game/access')?{token:'test-only',expires_in:7200}:{source:'real',text:'测试环境中返回的完整食谱。',recipe}));},{url:'https://huangrui1008-collab.github.io/psych-exp/?group=A',mediaMatch:true});
 const read=()=>JSON.parse(b.w.localStorage.getItem('az-flow-v1-session-A'));
 const click=action=>b.document.querySelector(`[data-do="${action}"]`).click();
 try{
  enterGame(b);assert.equal(b.document.querySelector('[data-do="self-decide"]'),null);assert.equal(b.document.querySelector('[data-do="feed"]').disabled,true);
  Object.defineProperties(b.w,{scrollY:{value:510,writable:true,configurable:true},scrollX:{value:0,writable:true,configurable:true}});let scrollCalls=0;b.w.scrollTo=options=>{scrollCalls++;b.w.scrollY=options.top;};
  click('open-ai-sheet');click('fill-recipe-prompt');assert.equal(b.document.getElementById('chatInput').value,'请给我提供一份成功喂养的食谱。');assert.equal(requests,0);
  b.document.getElementById('chatForm').dispatchEvent(new b.w.Event('submit',{bubbles:true,cancelable:true}));await settle(()=>b.document.querySelector('[data-do="adopt"]')&&!b.document.querySelector('.chat-waiting'));
  const history=structuredClone(read().chatHistory),log=b.document.querySelector('.chat-log'),input=b.document.getElementById('chatInput'),sheet=b.document.getElementById('aiChatSheet');input.value='留着稍后再问';input.dispatchEvent(new b.w.Event('input',{bubbles:true}));log.scrollTop=73;
  for(let i=0;i<3;i++){
   click('adopt');assert.equal(b.document.querySelector('.chat-log'),log);assert.equal(b.document.getElementById('chatInput'),input);assert.equal(b.document.getElementById('aiChatSheet'),sheet);assert.equal(sheet.hidden,false);assert.equal(log.scrollTop,73);assert.equal(b.document.body.style.top,'-510px');assert.equal(scrollCalls,0);assert.deepEqual(read().chatHistory,history);assert.deepEqual(read().draft,recipe);assert.equal(input.value,'留着稍后再问');assert.match(b.document.querySelector('.chat-recipe-status').textContent,/食谱已填入/);
  }
  click('close-ai-sheet');assert.equal(b.w.scrollY,510);assert.equal(b.document.body.style.position,'');click('open-ai-sheet');assert.equal(log.scrollTop,73);assert.equal(input.value,'留着稍后再问');assert.equal(b.document.querySelectorAll('.chat-message').length,2);click('close-ai-sheet');assert.equal(requests,2);
  const ack=b.document.getElementById('aiAck');ack.checked=true;ack.dispatchEvent(new b.w.Event('change',{bubbles:true}));click('feed');assert.ok(b.document.querySelector('#app > section:last-child.animal-card'));assert.equal(b.document.querySelectorAll('.critter').length,read().pack);click('next');
  assert.equal(read().rounds.length,1);assert.equal(read().rounds[0].aiSource,'real');assert.equal(read().rounds[0].aiParticipationPolicy,'required-v1');assert.equal(b.document.querySelector('[data-do="feed"]').disabled,true);assert.equal(b.document.querySelector('[data-do="self-decide"]'),null);assert.equal(b.document.querySelector('[data-do="adopt"]'),null);assert.equal(b.document.getElementById('aiAck'),null);click('open-ai-sheet');assert.equal(b.document.getElementById('chatInput').value,'留着稍后再问');assert.equal(b.document.querySelectorAll('.chat-message').length,2);click('close-ai-sheet');assert.deepEqual(b.errors,[]);
 }finally{b.close();}
});
