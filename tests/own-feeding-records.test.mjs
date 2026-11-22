import test from 'node:test';
import assert from 'node:assert/strict';
import {browser,enterGame,settle} from './helpers.mjs';

test('both groups start without supplied examples and retain only participant feeding in the view and AI context without erasing legacy stored examples',async()=>{
 for(const group of ['A','B']){
  const calls=[];
  const network=async(url,init)=>{
   if(String(url).endsWith('/game/access'))return new Response(JSON.stringify({token:'test-only',expires_in:7200}));
   calls.push(JSON.parse(init.body));return new Response(JSON.stringify({text:'已收到你的问题。',source:'real'}));
  };
  const url='https://huangrui1008-collab.github.io/psych-exp/?group='+group,key='az-flow-v1-session-'+group;
  const read=b=>JSON.parse(b.w.localStorage.getItem(key));
  async function ask(b){const input=b.document.getElementById('chatInput');input.value='请帮我分析已有记录';input.dispatchEvent(new b.w.Event('input',{bubbles:true}));b.document.getElementById('chatForm').dispatchEvent(new b.w.Event('submit',{bubbles:true,cancelable:true}));await settle(()=>b.document.getElementById('aiAck')&&!b.document.querySelector('.chat-waiting'));}
  const b=browser('index',network,{url});let local,originalRound;
  const legacy=[{id:'H1',x:[2,4,3,1,2],delta:1},{id:'H2',x:[2,1,3,4,2],delta:-1}];
  try{
   enterGame(b);assert.deepEqual(read(b).history,[]);assert.equal(b.document.querySelector('.history-card table'),null);
   await ask(b);assert.deepEqual(calls[0].history,[]);
   const input=b.document.getElementById('p1');input.value='4';input.dispatchEvent(new b.w.Event('input',{bubbles:true}));
   const ack=b.document.getElementById('aiAck');ack.checked=true;ack.dispatchEvent(new b.w.Event('change',{bubbles:true}));b.document.querySelector('[data-do=feed]').click();
   originalRound=read(b).rounds[0];assert.equal(b.document.querySelectorAll('.history-card tbody tr').length,1);assert.match(b.document.querySelector('.history-card').textContent,/R1/);assert.doesNotMatch(b.document.querySelector('.history-card').textContent,/H1|H2/);
   b.document.querySelector('[data-do=next]').click();local=Object.fromEntries(Object.entries(b.w.localStorage));const old=JSON.parse(local[key]);old.history=legacy;local[key]=JSON.stringify(old);
  }finally{b.close();}
  const resumed=browser('index',network,{url,local});
  try{
   assert.equal(resumed.document.querySelectorAll('.history-card tbody tr').length,1);assert.doesNotMatch(resumed.document.querySelector('.history-card').textContent,/H1|H2/);
   assert.deepEqual(read(resumed).history,legacy);assert.deepEqual(read(resumed).rounds[0],originalRound);
   await ask(resumed);assert.deepEqual(calls.at(-1).history,[{id:'R1',x:originalRound.x,delta:originalRound.delta}]);assert.deepEqual(read(resumed).history,legacy);assert.deepEqual(read(resumed).rounds[0],originalRound);assert.deepEqual(resumed.errors,[]);
  }finally{resumed.close();}
 }
});
