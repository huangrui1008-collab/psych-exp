import fs from 'node:fs';import test from 'node:test';import assert from 'node:assert/strict';
import {browser,enterGame,settle} from './helpers.mjs';
const stylesheet=fs.readFileSync(new URL('../participant.css',import.meta.url),'utf8');
const noCalls=async()=>{throw Error('Layout must not call AI');};

test('narrow computers keep inline chat; only narrow touch-primary devices use a sheet, identically in A and B',()=>{
 for(const group of ['A','B'])for(const device of [
  {width:665,pointer:'fine',hover:'hover',sheet:false},
  {width:390,pointer:'fine',hover:'hover',sheet:false},
  {width:390,pointer:'coarse',hover:'none',sheet:true},
  {width:665,pointer:'coarse',hover:'hover',sheet:false},
  {width:1280,pointer:'coarse',hover:'none',sheet:false},
 ]){
  const b=browser('index',noCalls,{url:'https://huangrui1008-collab.github.io/psych-exp/?group='+group,mediaMatch:device});
  try{enterGame(b);assert.equal(b.document.querySelector('.chat-sheet-card').classList.contains('mobile-chat-layout'),device.sheet);assert.equal(b.document.getElementById('aiChatSheet').hidden,device.sheet);assert.equal(b.document.querySelector('[data-do=open-ai-sheet]').hidden,!device.sheet);assert.equal(b.document.getElementById('aiChatSheet').getAttribute('role'),device.sheet?'dialog':null);assert.deepEqual(b.errors,[]);}finally{b.close();}
 }
});

test('acknowledgement is large, centred and fully clickable without changing the consultation or feeding gate',async()=>{
 for(const group of ['A','B']){
  const b=browser('index',async address=>new Response(JSON.stringify(String(address).endsWith('/game/access')?{token:'fixture',expires_in:7200}:{source:'real',text:'用于界面检查的测试回复',...(group==='A'?{recipe:[1,2,3,4,5]}:{})})),{url:'https://huangrui1008-collab.github.io/psych-exp/?group='+group,mediaMatch:{width:665,pointer:'fine',hover:'hover'}});
  try{
   const style=b.document.createElement('style');style.textContent=stylesheet;b.document.head.append(style);enterGame(b);const input=b.document.getElementById('chatInput');input.value='分析这个结果';input.dispatchEvent(new b.w.Event('input',{bubbles:true}));b.document.getElementById('chatForm').dispatchEvent(new b.w.Event('submit',{bubbles:true,cancelable:true}));await settle(()=>b.document.getElementById('aiAck'));
   const ack=b.document.getElementById('aiAck'),label=ack.closest('label');const css=b.w.getComputedStyle(label),checkboxCss=b.w.getComputedStyle(ack);
   assert.equal(css.fontSize,'20px');assert.equal(css.justifyContent,'center');assert.equal(css.minHeight,'80px');assert.equal(checkboxCss.width,'28px');assert.equal(checkboxCss.height,'28px');assert.equal(b.document.querySelector('[data-do=feed]').disabled,true);
   label.querySelector('span').click();assert.equal(ack.checked,true);assert.equal(b.document.querySelector('[data-do=feed]').disabled,false);label.querySelector('span').click();assert.equal(ack.checked,false);assert.equal(b.document.querySelector('[data-do=feed]').disabled,true);assert.deepEqual(b.errors,[]);
  }finally{b.close();}
 }
});
