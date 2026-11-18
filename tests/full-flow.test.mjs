import test from 'node:test';import assert from 'node:assert/strict';
import {browser,settle,tick} from './helpers.mjs';
const steps=['consent','ai_literacy','feeding_game','independent_test','self_assessment','manipulation_check','agency','visual_difference','psychological_ownership','learning_gain'];
const labels=['知情同意','AI素养','喂养游戏','独立测试','自我评估','操纵检验','代理感','图形找不同','心理所有权','学习获得感'];
const key=g=>'az-flow-v1-session-'+g;
const read=(b,g)=>JSON.parse(b.w.localStorage.getItem(key(g)));

test('A and B traverse the exact ten-step flow; placeholders never become consent, answers or scores; AI appears only in game',async()=>{
 for(const group of ['A','B']){
  let calls=0;const b=browser('index',async(url,init)=>{calls++;if(String(url).endsWith('/game/access'))return new Response(JSON.stringify({token:'test-only',expires_in:7200}));return new Response(JSON.stringify({text:'测试模型回应',source:'real',...(group==='A'?{recipe:[2,4,3,1,2]}:{})}));},{url:'https://huangrui1008-collab.github.io/psych-exp/?group='+group});
  const visited=[];
  try{
   b.document.querySelector('[data-do=start]').click();assert.equal(calls,0);assert.match(b.document.body.textContent,/不代表已经取得正式知情同意/);
   for(let i=0;i<2;i++){visited.push(read(b,group).flow_current);assert.equal(b.document.querySelectorAll('#app input,#app textarea').length,0);b.document.querySelector('[data-do=flow-next]').click();}
   visited.push(read(b,group).flow_current);assert.equal(read(b,group).stage,'play');
   for(let i=0;i<10;i++){
    const input=b.document.getElementById('chatInput');input.value='分析一下';input.dispatchEvent(new b.w.Event('input',{bubbles:true}));b.document.getElementById('chatForm').dispatchEvent(new b.w.Event('submit',{bubbles:true,cancelable:true}));await settle(()=>b.document.getElementById('aiAck')&&!b.document.querySelector('.chat-waiting'));
    const ack=b.document.getElementById('aiAck');ack.checked=true;ack.dispatchEvent(new b.w.Event('change',{bubbles:true}));b.document.querySelector('[data-do=feed]').click();b.document.querySelector('[data-do=next]').click();
   }
   visited.push(read(b,group).flow_current);assert.equal(read(b,group).stage,'test');assert.equal(b.document.getElementById('chatInput'),null);assert.equal(b.document.querySelector('.history-card'),null);
   for(let phase=0;phase<3;phase++){
    const form=b.document.getElementById('testForm');for(const name of new Set([...form.querySelectorAll('input[type=radio]')].map(x=>x.name)))form.querySelector('input[name="'+name+'"]').checked=true;for(const select of form.querySelectorAll('select'))select.selectedIndex=1;form.dispatchEvent(new b.w.Event('submit',{cancelable:true}));
   }
   assert.equal(read(b,group).stage,'self_assessment');assert.doesNotMatch(b.document.getElementById('app').textContent,/食谱判断 \d|植物判断 \d|规律判断 \d/);
   const before=calls;
   for(let i=4;i<10;i++){
    const state=read(b,group);visited.push(state.flow_current);assert.equal(state.flow_current,steps[i]);assert.match(b.document.querySelector('h2').textContent,new RegExp(labels[i]));assert.equal(b.document.getElementById('chatInput'),null);assert.equal(b.document.querySelectorAll('#app input,#app textarea,#app select').length,0);assert.match(b.document.getElementById('app').textContent,/占位/);
    const resumed=browser('index',async()=>{throw Error('no request expected')},{url:'https://huangrui1008-collab.github.io/psych-exp/?group='+group,local:Object.fromEntries(Object.entries(b.w.localStorage))});try{assert.match(resumed.document.querySelector('h2').textContent,new RegExp(labels[i]));assert.equal(read(resumed,group).id,state.id);}finally{resumed.close();}
    b.document.querySelector('[data-do=flow-next]').click();
   }
   assert.equal(calls,before);assert.deepEqual(visited,steps);const final=read(b,group);assert.equal(final.stage,'done');assert.equal(final.flow_status,'walkthrough_complete_with_placeholders');assert.equal(final.consent.obtained,false);assert.equal(Object.values(final.flow_steps).filter(x=>x.status==='placeholder_passed').length,8);
   for(const step of Object.values(final.flow_steps)){assert.ok(step.entered_at&&step.exited_at);if(step.placeholder){assert.equal(step.responses,null);assert.equal(step.score,null);}}
   assert.equal(final.flow_steps.feeding_game.status,'completed');assert.equal(final.flow_steps.independent_test.status,'completed');assert.ok(final.tests.score);assert.match(b.document.body.textContent,/流程已走完/);assert.deepEqual(b.errors,[]);
  }finally{b.close();}
 }
});

test('old game records are not migrated, overwritten or given invented questionnaire data; researcher sees both namespaces',async()=>{
 const old={version:'0.6.0',id:'old-record',mode:'delegation',stage:'done',rounds:[],pack:20,chatHistory:[]};const raw=JSON.stringify(old);const local={'az-preview-v06-session-A':raw};
 const b=browser('index',async()=>{throw Error('no calls')},{url:'https://huangrui1008-collab.github.io/psych-exp/?group=A',local});let saved;
 try{assert.ok(b.document.querySelector('[data-do=start]'));b.document.querySelector('[data-do=start]').click();assert.equal(read(b,'A').stage,'consent');assert.equal(b.w.localStorage.getItem('az-preview-v06-session-A'),raw);saved=Object.fromEntries(Object.entries(b.w.localStorage));}finally{b.close();}
 const r=browser('researcher',async()=>{throw Error('no calls')},{local:saved});try{await tick();assert.equal(r.document.querySelectorAll('#gameRows tr').length,2);assert.match(r.document.getElementById('gameRows').textContent,/知情同意（占位）/);r.document.getElementById('gameExportJson').click();r.document.getElementById('gameExportCsv').click();assert.equal(r.captures.length,2);const body=await new Promise(resolve=>{const x=new r.w.FileReader();x.onload=()=>resolve(x.result);x.readAsText(r.captures[1]);});assert.match(body,/flow_version/);assert.match(body,/flow_steps/);assert.deepEqual(r.errors,[]);}finally{r.close();}
});

test('exiting consent placeholder stops the flow before game or AI, without claiming consent',()=>{
 const b=browser('index',async()=>{throw Error('must not call')},{url:'https://huangrui1008-collab.github.io/psych-exp/?group=B'});try{b.document.querySelector('[data-do=start]').click();b.document.querySelector('[data-do=exit]').click();const s=read(b,'B');assert.equal(s.stage,'exited');assert.equal(s.consent.obtained,false);assert.equal(s.flow_steps.consent.status,'exited');assert.equal(s.flow_steps.feeding_game.status,'pending');assert.equal(b.document.querySelector('[data-do=flow-next]'),null);}finally{b.close();}
});
