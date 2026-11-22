import test from 'node:test';import assert from 'node:assert/strict';
import {browser} from './helpers.mjs';
const key=g=>'az-flow-v1-session-'+g;
const read=(b,g)=>JSON.parse(b.w.localStorage.getItem(key(g)));
const cfg={version:'0.6.0',kind:'alien-zoo',flow_version:'alien-zoo-flow-v1',flow_status:'in_progress',stage:'final_recipe_selection',flow_current:'final_recipe_selection',tests:{phase:'complete',answers:{q0:'增加'},score:{prediction:1,relevance:2,rule:0}},events:[],chatHistory:[]};
function record(group='A',id='fixture-'+group){return {...structuredClone(cfg),id,mode:group==='A'?'delegation':'augmentation',rounds:Array.from({length:10},(_,i)=>({id:'R'+(i+1),x:[i%7,(i+1)%7,(i+2)%7,(i+3)%7,group==='A'?1:5],aiRecipe:[6,6,6,6,6],delta:i%2?8:-1})),flow_steps:Object.fromEntries(['consent','ai_literacy','feeding_game','independent_test','self_assessment','manipulation_check','agency','visual_difference','psychological_ownership','learning_gain'].map(id=>[id,{label:id,placeholder:!['feeding_game','independent_test'].includes(id),status:'completed',responses:null,score:null}]))};}
const open=(r,g='A',local={})=>browser('index',async()=>{throw Error('Final recipe screens must not call AI')},{url:'https://huangrui1008-collab.github.io/psych-exp/?group='+g,local:{...local,[key(g)]:JSON.stringify(r)}});
function choose(b,n){const radio=b.document.querySelector('[name=final_recipe_round][value="'+n+'"]');radio.checked=true;radio.dispatchEvent(new b.w.Event('change',{bubbles:true}));}
function confirm(b){b.document.getElementById('finalRecipeForm').dispatchEvent(new b.w.Event('submit',{cancelable:true}));}
function snapshot(b){return Object.fromEntries(Object.entries(b.w.localStorage));}
async function blobText(b,blob){return new Promise(resolve=>{const r=new b.w.FileReader();r.onload=()=>resolve(r.result);r.readAsText(blob);});}

test('A and B get only their own actual ten chronological recipes; duplicates retained; choose, refresh, confirm, display and PO remain consistent',async()=>{
 for(const group of ['A','B']){
  const r=record(group);r.rounds[4].x=[...r.rounds[0].x];const other=record(group==='A'?'B':'A','different-participant');const b=open(r,group,{[key(group==='A'?'B':'A')]:JSON.stringify(other)});
  try{
   const cards=[...b.document.querySelectorAll('.final-recipe-option')];assert.equal(cards.length,10);assert.equal(b.document.querySelectorAll('[name=final_recipe_round]:checked').length,0);assert.equal(b.document.getElementById('confirmFinalRecipe').disabled,true);
   cards.forEach((card,i)=>{assert.equal(card.querySelector('strong').textContent,'第'+(i+1)+'轮');assert.deepEqual([...card.querySelectorAll('.food b')].map(x=>Number(x.textContent.slice(1))),r.rounds[i].x);});
   assert.doesNotMatch(b.document.getElementById('app').textContent,/最佳|最优|推荐|依赖组|增强组|增加8/);
   choose(b,2);choose(b,7);let state=read(b,group);assert.equal(state.final_recipe_round,undefined);assert.equal(state.final_recipe_candidate_round,7);
   const refreshed=open(state,group);try{assert.equal(refreshed.document.querySelector('[name=final_recipe_round]:checked').value,'7');}finally{refreshed.close();}
   confirm(b);state=read(b,group);assert.equal(state.stage,'final_recipe_display');assert.equal(state.final_recipe_round,7);assert.deepEqual(state.final_recipe,r.rounds[6].x);assert.notDeepEqual(state.final_recipe,r.rounds[6].aiRecipe);assert.deepEqual(state.tests,r.tests);assert.deepEqual(state.rounds,r.rounds);assert.equal(b.document.querySelector('[data-do=recipe-display-next]').disabled,true);
   state.final_recipe_display_started_at=new Date(Date.now()-3000).toISOString();const display=open(state,group);try{
    assert.equal(display.document.querySelector('.recipe-reveal'),null);assert.equal(display.document.querySelector('[data-do=recipe-display-next]').disabled,false);display.document.querySelector('[data-do=recipe-display-next]').click();assert.equal(read(display,group).stage,'psychological_ownership');assert.deepEqual([...display.document.querySelectorAll('.selected-recipe-card .food b')].map(x=>Number(x.textContent.slice(1))),r.rounds[6].x);assert.match(display.document.body.textContent,/以下题目中的“这份任务成果”，均指这份食谱/);assert.match(display.document.body.textContent,/占位/);
    display.document.querySelector('[data-do=flow-next]').click();assert.equal(read(display,group).stage,'learning_gain');assert.deepEqual(read(display,group).tests,r.tests);assert.deepEqual(display.errors,[]);
   }finally{display.close();}
   assert.deepEqual(b.errors,[]);
  }finally{b.close();}
 }
});

test('missing, corrupt or mismatched records block without inventing recipes; posttest must already be complete',()=>{
 const bads=[];let r=record();r.rounds.pop();bads.push(r);r=record();r.rounds[2].x=[1,2];bads.push(r);r=record();r.rounds[2].id='R1';bads.push(r);r=record();r.tests.phase='prediction';bads.push(r);r=record();r.rounds=null;bads.push(r);r=record();r.rounds[3]=null;bads.push(r);
 for(const r of bads){const b=open(r);try{assert.match(b.document.body.textContent,/食谱记录暂时无法核对/);assert.equal(b.document.querySelector('#finalRecipeForm'),null);assert.equal(b.w.localStorage.getItem(key('A')),JSON.stringify(r));}finally{b.close();}}
 const b=open(record());try{choose(b,2);confirm(b);const state=read(b,'A');for(const mutate of [r=>r.final_recipe[0]++,r=>r.final_recipe_source.participant_id='other',r=>r.final_recipe_source.mode='augmentation',r=>r.final_recipe_round=10]){const r=structuredClone(state);mutate(r);const resumed=open(r);try{assert.match(resumed.document.body.textContent,/食谱记录暂时无法核对/);assert.equal(resumed.document.querySelector('.selected-recipe-card'),null);}finally{resumed.close();}}}finally{b.close();}
});

test('new selection is absent during independent test; old completed records are not restarted or assigned a fabricated recipe',()=>{
 for(const stage of ['test','done']){const r=record();r.stage=stage;r.flow_current=stage==='test'?'independent_test':'learning_gain';if(stage==='test')r.tests.phase='prediction';r.tests.score={prediction:1,relevance:2,rule:0,predictionKey:[1,-1,0,2]};const b=open(r);try{assert.equal(b.document.querySelector('.final-recipe-option'),null);assert.equal(b.document.querySelector('.history-card'),null);assert.equal(r.final_recipe,undefined);assert.equal(b.w.localStorage.getItem(key('A')),JSON.stringify(r));}finally{b.close();}}
});

test('researcher JSON and CSV export executed recipes plus final round and exact recipe linked to participant and group',async()=>{
 const b=open(record('B'),'B');let local;
 try{choose(b,2);confirm(b);local=snapshot(b);}finally{b.close();}
 const r=browser('researcher',async()=>{throw Error('no network')},{local});try{r.document.getElementById('gameExportJson').click();r.document.getElementById('gameExportCsv').click();const json=JSON.parse(await blobText(r,r.captures[0]));const saved=json.records[0];assert.equal(saved.id,'fixture-B');assert.equal(saved.final_recipe_round,2);assert.deepEqual(saved.final_recipe,saved.rounds[1].x);const csv=await blobText(r,r.captures[1]);assert.match(csv,/executed_recipes/);assert.match(csv,/final_recipe_round/);assert.match(csv,/final_recipe_source/);assert.match(csv,/fixture-B/);assert.match(csv,/"B"/);assert.match(csv,/R10/);assert.deepEqual(r.errors,[]);}finally{r.close();}
});


test('legacy in-progress PO can add the selection without changing feeding or test data; exit recovery preserves the confirmed choice',()=>{
 const legacy=record();legacy.stage='psychological_ownership';legacy.flow_current='psychological_ownership';const b=open(legacy);try{
  assert.match(b.document.body.textContent,/食谱记录暂时无法核对/);b.document.querySelector('[data-do=recipe-select-existing]').click();choose(b,3);confirm(b);const selected=read(b,'A');assert.deepEqual(selected.rounds,legacy.rounds);assert.deepEqual(selected.tests,legacy.tests);
  selected.stage='exited';selected.exit_info={from:'final_recipe_display',at:new Date().toISOString()};selected.flow_status='exited';const resumed=open(selected);try{resumed.document.querySelector('[data-do=recover-exit]').click();const state=read(resumed,'A');assert.equal(state.stage,'final_recipe_display');assert.equal(state.final_recipe_round,3);assert.deepEqual(state.final_recipe,legacy.rounds[2].x);assert.deepEqual(resumed.errors,[]);}finally{resumed.close();}
 }finally{b.close();}
});
