import test from 'node:test';import assert from 'node:assert/strict';
import {browser,enterGame,settle,tick} from './helpers.mjs';
const noCalls=async()=>{throw Error('Restart must not call AI or backend');};
const key=entry=>'az-flow-v1-session-'+entry;
const archivePrefix='az-flow-v1-session-archive-';
const url=entry=>'https://huangrui1008-collab.github.io/psych-exp/'+(entry==='random'?'':'?group='+entry);
const read=(b,entry)=>JSON.parse(b.w.localStorage.getItem(key(entry)));
function completed(entry){const b=browser('index',noCalls,{url:url(entry)});try{enterGame(b);const r=read(b,entry);r.stage='done';r.flow_current='learning_gain';r.flow_status='walkthrough_complete_with_placeholders';r.rounds=Array.from({length:10},(_,i)=>({id:'R'+(i+1),x:[i%7,1,2,3,4],delta:1}));r.pack=30;r.tests={phase:'complete',answers:{rule:'three'},score:{prediction:1,relevance:2,rule:1,predictionKey:[1,-1,0,1]}};r.final_recipe_round=2;r.final_recipe=[...r.rounds[1].x];r.chatHistory=[{id:'previous-message',role:'assistant',content:'旧对话',round:10,status:'sent'}];return r;}finally{b.close();}}
const savedLocal=b=>Object.fromEntries(Object.entries(b.w.localStorage));
async function blobText(b,blob){return new Promise(resolve=>{const reader=new b.w.FileReader();reader.onload=()=>resolve(reader.result);reader.readAsText(blob);});}

test('A, B and random completed walkthroughs restart from consent with a new ID while preserving the exact old record and other entries',async()=>{
 for(const entry of ['A','B','random']){
  const previous=completed(entry),raw=JSON.stringify(previous),other=JSON.stringify({...completed('B'),id:'other-entry'});
  const otherKey=key(entry==='A'?'B':'A');const b=browser('index',noCalls,{url:url(entry),local:{[key(entry)]:raw,[otherKey]:other}});
  let local;
  try{
   assert.equal(b.w.localStorage.getItem(key(entry)),raw);assert.ok(b.document.querySelector('[data-do=restart-walkthrough]'));
   b.document.querySelector('[data-do=restart-walkthrough]').click();await settle(()=>read(b,entry).stage==='consent');
   const fresh=read(b,entry);assert.notEqual(fresh.id,previous.id);assert.equal(fresh.restart_of,previous.id);assert.equal(fresh.mode,previous.mode);assert.equal(fresh.is_test,true);assert.deepEqual(fresh.rounds,[]);assert.deepEqual(fresh.chatHistory,[]);assert.equal(fresh.tests,null);assert.equal(fresh.final_recipe_round,undefined);assert.equal(fresh.final_recipe,undefined);assert.equal(fresh.consent.obtained,false);
   const archives=Object.entries(b.w.localStorage).filter(([name])=>name.startsWith(archivePrefix));assert.equal(archives.length,1);assert.equal(archives[0][1],raw);assert.equal(b.w.localStorage.getItem(otherKey),other);
   for(let i=0;i<2;i++)b.document.querySelector('[data-do=flow-next]').click();assert.equal(read(b,entry).stage,'play');assert.ok(b.document.getElementById('chatInput'));assert.equal(b.document.querySelector('[data-do=feed]').disabled,true);
   local=savedLocal(b);const resumed=browser('index',noCalls,{url:url(entry),local});try{assert.equal(read(resumed,entry).id,fresh.id);assert.equal(read(resumed,entry).stage,'play');assert.equal(resumed.document.querySelector('[data-do=restart-walkthrough]'),null);assert.deepEqual(resumed.errors,[]);}finally{resumed.close();}
   assert.deepEqual(b.errors,[]);
  }finally{b.close();}
  const researcher=browser('researcher',noCalls,{local});try{
   assert.equal(researcher.document.querySelectorAll('#gameRows tr').length,3);researcher.document.getElementById('gameExportJson').click();const data=JSON.parse(await blobText(researcher,researcher.captures[0]));const original=data.records.find(r=>r.id===previous.id);assert.deepEqual(original,previous);assert.equal(data.records.filter(r=>r.restart_of===previous.id).length,1);assert.deepEqual(researcher.errors,[]);
  }finally{researcher.close();}
 }
});

test('backup failure or a failed new-session write keeps the original record and reports the failure',async()=>{
 for(const failure of ['archive','active']){
  const previous=completed('A'),raw=JSON.stringify(previous);const b=browser('index',noCalls,{url:url('A'),local:{[key('A')]:raw}});
  try{
   const originalSet=b.w.Storage.prototype.setItem;b.w.Storage.prototype.setItem=function(name,value){if((failure==='archive'&&name.startsWith(archivePrefix))||(failure==='active'&&name===key('A')&&JSON.parse(value).id!==previous.id))throw new b.w.DOMException('Full','QuotaExceededError');return originalSet.call(this,name,value);};
   b.document.querySelector('[data-do=restart-walkthrough]').click();await tick();assert.equal(b.w.localStorage.getItem(key('A')),raw);assert.match(b.document.querySelector('[role=alert]').textContent,failure==='archive'?/未重新开始/:/旧记录已保留/);assert.equal(b.document.querySelector('.flow-placeholder'),null);assert.deepEqual(b.errors,[]);
   const archives=Object.entries(b.w.localStorage).filter(([name])=>name.startsWith(archivePrefix));assert.equal(archives.length,failure==='archive'?0:1);if(archives.length)assert.equal(archives[0][1],raw);
  }finally{b.close();}
 }
});

test('a stale completed tab cannot overwrite a newer session; active, exited and formal sessions have no restart action',async()=>{
 const previous=completed('A');const b=browser('index',noCalls,{url:url('A'),local:{[key('A')]:JSON.stringify(previous)}});
 try{const newer={...previous,id:'newer-id',stage:'play',flow_status:'in_progress'};const raw=JSON.stringify(newer);b.w.localStorage.setItem(key('A'),raw);b.document.querySelector('[data-do=restart-walkthrough]').click();await tick();assert.equal(b.w.localStorage.getItem(key('A')),raw);assert.equal(Object.keys(b.w.localStorage).filter(x=>x.startsWith(archivePrefix)).length,0);assert.match(b.document.getElementById('toast').textContent,/任务记录已更新/);}finally{b.close();}
 for(const state of [{...previous,stage:'play'},{...previous,stage:'exited'},{...previous,is_test:false},{...previous,flow_status:'completed'}]){const b=browser('index',noCalls,{url:url('A'),local:{[key('A')]:JSON.stringify(state)}});try{assert.equal(b.document.querySelector('[data-do=restart-walkthrough]'),null);assert.deepEqual(b.errors,[]);}finally{b.close();}}
});
