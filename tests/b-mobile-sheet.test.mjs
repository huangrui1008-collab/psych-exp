import test from 'node:test';
import assert from 'node:assert/strict';
import {browser,enterGame,settle} from './helpers.mjs';

const url='https://huangrui1008-collab.github.io/psych-exp/?group=B';
const state=b=>JSON.parse(b.w.localStorage.getItem('az-flow-v1-session-B'));
const click=(b,action)=>b.document.querySelector(`[data-do="${action}"]`).click();
function type(b,text){const input=b.document.getElementById('chatInput');input.value=text;input.dispatchEvent(new b.w.Event('input',{bubbles:true}));}
function scrollHarness(b,y){Object.defineProperties(b.w,{scrollY:{value:y,writable:true,configurable:true},scrollX:{value:0,writable:true,configurable:true}});const calls=[];b.w.scrollTo=options=>{calls.push(options);b.w.scrollY=options.top;b.w.scrollX=options.left;};return calls;}

test('mobile B opens and closes the same chat DOM, retaining draft, history, chat scroll, recipe and page position without network requests',()=>{
 let requests=0;const b=browser('index',async()=>{requests++;throw Error('No request expected');},{url,mediaMatch:true});
 try{
  enterGame(b);const before=state(b),sheet=b.document.getElementById('aiChatSheet'),opener=b.document.querySelector('[data-do="open-ai-sheet"]');assert.equal(sheet.hidden,true);assert.equal(opener.hidden,false);
  const calls=scrollHarness(b,570);type(b,'还没发送的多行问题\n我想继续比较');const input=b.document.getElementById('chatInput'),log=b.document.querySelector('.chat-log');
  for(let i=0;i<3;i++){
   click(b,'open-ai-sheet');assert.equal(sheet.hidden,false);assert.equal(sheet.getAttribute('role'),'dialog');assert.equal(sheet.getAttribute('aria-modal'),'true');assert.equal(b.document.body.style.top,'-570px');assert.equal(b.document.querySelector('.recipe-card').hasAttribute('inert'),true);
   log.scrollTop=137;click(b,'close-ai-sheet');assert.equal(sheet.hidden,true);assert.equal(b.document.getElementById('chatInput'),input);assert.equal(b.document.querySelector('.chat-log'),log);assert.equal(input.value,'还没发送的多行问题\n我想继续比较');assert.equal(b.w.scrollY,570);assert.equal(b.document.body.style.position,'');assert.equal(b.document.querySelector('.recipe-card').hasAttribute('inert'),false);
  }
  click(b,'open-ai-sheet');assert.equal(log.scrollTop,137);click(b,'close-ai-sheet');
  assert.equal(requests,0);assert.equal(state(b).id,before.id);assert.deepEqual(state(b).rounds,before.rounds);assert.deepEqual(state(b).chatHistory,before.chatHistory);assert.deepEqual(state(b).draft,before.draft);assert.ok(calls.every(call=>call.top===570));assert.deepEqual(b.errors,[]);
 }finally{b.close();}
});

test('closing while real-format AI request is pending keeps the sheet closed when it returns, and reopening retains reply and unsent text',async()=>{
 let deliver,requests=0;const b=browser('index',async address=>{requests++;return String(address).endsWith('/game/access')?new Response(JSON.stringify({token:'test-only',expires_in:7200})):new Promise(resolve=>{deliver=()=>resolve(new Response(JSON.stringify({source:'real',text:'这是测试环境中的后台响应。'})));});},{url,mediaMatch:true});
 try{
  enterGame(b);scrollHarness(b,430);click(b,'open-ai-sheet');type(b,'请比较这些记录');b.document.getElementById('chatForm').dispatchEvent(new b.w.Event('submit',{bubbles:true,cancelable:true}));await settle(()=>deliver);
  assert.equal(b.document.getElementById('aiChatSheet').hidden,false);click(b,'close-ai-sheet');assert.equal(b.w.scrollY,430);deliver();await settle(()=>!b.document.querySelector('.chat-waiting')&&state(b).chatHistory.length===2);
  assert.equal(b.document.getElementById('aiChatSheet').hidden,true);assert.equal(b.document.body.style.position,'');assert.equal(b.w.scrollY,430);assert.equal(requests,2);assert.match(b.document.querySelector('.chat-round-status').textContent,/已收到/);
  click(b,'open-ai-sheet');assert.equal(b.document.querySelectorAll('.chat-message').length,2);type(b,'留着稍后发送');b.document.querySelector('.chat-sheet-backdrop').click();assert.equal(state(b).chatDraft,'留着稍后发送');click(b,'open-ai-sheet');assert.equal(b.document.getElementById('chatInput').value,'留着稍后发送');click(b,'close-ai-sheet');assert.equal(requests,2);assert.deepEqual(b.errors,[]);
 }finally{b.close();}
});

test('changing screen width uses the same chat and unlocks the background when returning to desktop',()=>{
 const b=browser('index',async()=>{throw Error('No request expected');},{url,mediaMatch:true});
 try{
  enterGame(b);scrollHarness(b,320);const input=b.document.getElementById('chatInput');click(b,'open-ai-sheet');type(b,'窗口变化时保留');const media=b.w.matchMedia();media.matches=false;media.dispatchEvent(new b.w.Event('change'));
  assert.equal(b.document.getElementById('aiChatSheet').hidden,false);assert.equal(b.document.getElementById('aiChatSheet').hasAttribute('aria-modal'),false);assert.equal(b.document.getElementById('aiChatSheet').hasAttribute('role'),false);assert.equal(b.document.querySelector('[data-do="open-ai-sheet"]').hidden,true);assert.equal(b.document.body.style.position,'');assert.equal(b.w.scrollY,320);assert.equal(b.document.getElementById('chatInput'),input);assert.equal(input.value,'窗口变化时保留');
  media.matches=true;media.dispatchEvent(new b.w.Event('change'));assert.equal(b.document.getElementById('aiChatSheet').hidden,true);click(b,'open-ai-sheet');assert.equal(input.value,'窗口变化时保留');b.document.dispatchEvent(new b.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(b.document.getElementById('aiChatSheet').hidden,true);assert.equal(b.w.scrollY,320);assert.deepEqual(b.errors,[]);
 }finally{b.close();}
});

test('wide chat stays inline and mobile A uses the same sheet while retaining recipe controls',()=>{
 for(const [group,mobile]of [['B',false],['A',true]]){
  const b=browser('index',async()=>{throw Error('No request expected');},{url:url.replace('group=B','group='+group),mediaMatch:mobile});
  try{enterGame(b);if(group==='B'){assert.equal(b.document.getElementById('aiChatSheet').hidden,false);assert.equal(b.document.querySelector('[data-do="open-ai-sheet"]').hidden,true);}else{assert.equal(b.document.getElementById('aiChatSheet').hidden,true);assert.equal(b.document.querySelector('[data-do="open-ai-sheet"]').hidden,false);assert.equal(b.document.querySelector('[data-do="self-decide"]'),null);assert.ok(b.document.querySelector('[data-do="fill-recipe-prompt"]'));}assert.deepEqual(b.errors,[]);}finally{b.close();}
 }
});
