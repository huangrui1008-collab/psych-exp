import test from 'node:test';
import assert from 'node:assert/strict';
import {browser,enterGame,settle} from './helpers.mjs';

async function ready(group,recipe,pack=20){
 const requests=[];const fetcher=async(url,init)=>{if(String(url).endsWith('/game/access'))return new Response(JSON.stringify({token:'test-only',expires_in:7200}));requests.push(JSON.parse(init.body));return new Response(JSON.stringify({source:'real',text:'测试环境中的喂养反馈。',...(group==='A'?{recipe}:{})}));};
 let b=browser('index',fetcher,{url:'https://huangrui1008-collab.github.io/psych-exp/?group='+group});enterGame(b);
 const key='az-flow-v1-session-'+group;
 if(pack!==20){const local=Object.fromEntries(Object.entries(b.w.localStorage)),record=JSON.parse(local[key]);record.pack=pack;local[key]=JSON.stringify(record);b.close();b=browser('index',fetcher,{url:'https://huangrui1008-collab.github.io/psych-exp/?group='+group,local});}
 recipe.forEach((value,i)=>{const input=b.document.getElementById('p'+i);input.value=String(value);input.dispatchEvent(new b.w.Event('input',{bubbles:true}));});
 const input=b.document.getElementById('chatInput');input.value='请帮我分析本轮选择';input.dispatchEvent(new b.w.Event('input',{bubbles:true}));b.document.getElementById('chatForm').dispatchEvent(new b.w.Event('submit',{bubbles:true,cancelable:true}));await settle(()=>b.document.getElementById('aiAck')&&!b.document.querySelector('.chat-waiting'));
 const ack=b.document.getElementById('aiAck');ack.checked=true;ack.dispatchEvent(new b.w.Event('change',{bubbles:true}));
 const observers=[],timers=new Map();let nextTimer=9000;const originalSet=b.w.setTimeout.bind(b.w),originalClear=b.w.clearTimeout.bind(b.w);
 b.w.IntersectionObserver=class{constructor(callback){this.callback=callback;this.disconnected=false;observers.push(this);}observe(node){this.node=node;}disconnect(){this.disconnected=true;}};
 b.w.setTimeout=(callback,delay,...args)=>{if(delay===1800){const id=nextTimer++;timers.set(id,callback);return id;}return originalSet(callback,delay,...args);};b.w.clearTimeout=id=>{if(timers.has(id))timers.delete(id);else originalClear(id);};
 return {b,requests,observers,timers,read:()=>JSON.parse(b.w.localStorage.getItem(key)),feed:()=>b.document.querySelector('[data-do="feed"]').click()};
}

test('both groups animate exactly the added or lost animals, wait for visibility, and keep committed feeding data unchanged',async()=>{
 for(const group of ['A','B'])for(const [recipe,change]of [[[1,4,3,2,1],4],[[0,0,0,0,0],-3]]){
  const f=await ready(group,recipe);const {b}=f;
  try{
   f.feed();const panel=b.document.querySelector('.animal-card'),before=structuredClone(f.read());assert.equal(b.document.querySelector('#app > section:last-child'),panel);assert.equal(panel.dataset.phase,'waiting');assert.equal(panel.querySelector('[data-animal-count]').textContent,'20');assert.equal(panel.querySelectorAll('.arriving').length,Math.max(0,change));assert.equal(panel.querySelectorAll('.departing-critter').length,Math.max(0,-change));assert.equal(panel.querySelectorAll('.critter').length,20+change);assert.equal(f.timers.size,0);
   const observer=f.observers[0];observer.callback([{isIntersecting:false,intersectionRatio:0}]);assert.equal(panel.dataset.phase,'waiting');observer.callback([{isIntersecting:true,intersectionRatio:1}]);assert.equal(panel.dataset.phase,'running');assert.equal(observer.disconnected,true);assert.equal(f.timers.size,1);
   [...f.timers.values()][0]();assert.equal(panel.dataset.phase,'done');assert.equal(panel.querySelector('[data-animal-count]').textContent,String(20+change));assert.equal(panel.querySelectorAll('.departing-critter,.arriving').length,0);assert.equal(panel.querySelectorAll('.critter').length,20+change);assert.deepEqual(f.read(),before);assert.equal(f.requests.length,1);
   b.document.querySelector('[data-do="next"]').click();assert.equal(b.document.querySelector('.animal-motion'),null);assert.equal(b.document.querySelectorAll('.arriving,.departing-critter,.fresh').length,0);assert.equal(b.document.querySelector('[data-animal-count]').textContent,String(20+change));assert.deepEqual(b.errors,[]);
  }finally{b.close();}
 }
});

test('a decline below zero animates only the remaining animal, preserves the rule result, and never invents deaths at zero',async()=>{
 for(const pack of [1,0]){
  const f=await ready('B',[0,0,0,0,0],pack),{b}=f;
  try{
   f.feed();const panel=b.document.querySelector('.animal-card');assert.equal(f.read().pack,0);assert.equal(f.read().rounds[0].delta,-3);assert.equal(panel.querySelectorAll('.departing-critter').length,pack);assert.equal(panel.querySelectorAll('.critter').length,0);assert.equal(b.document.querySelector('.history-card tbody td:last-child').textContent,pack?'-1':'0');
   if(pack){assert.match(panel.textContent,/减少 1 只/);f.observers[0].callback([{isIntersecting:true,intersectionRatio:1}]);[...f.timers.values()][0]();}else{assert.match(panel.textContent,/数量不变/);assert.equal(f.observers.length,0);assert.equal(f.timers.size,0);}
   assert.equal(panel.querySelector('[data-animal-count]').textContent,'0');assert.deepEqual(b.errors,[]);
  }finally{b.close();}
 }
});

test('reduced-motion preference shows the correct final count immediately without waiting on an animation',async()=>{
 const f=await ready('A',[1,4,3,2,1]),{b}=f;
 try{b.w.matchMedia=query=>({matches:query==='(prefers-reduced-motion: reduce)'});f.feed();assert.equal(b.document.querySelector('.animal-motion'),null);assert.equal(b.document.querySelector('[data-animal-count]').textContent,'24');assert.equal(b.document.querySelectorAll('.critter').length,24);assert.equal(f.observers.length,0);assert.equal(f.timers.size,0);assert.deepEqual(b.errors,[]);}finally{b.close();}
});
