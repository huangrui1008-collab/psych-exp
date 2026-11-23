import fs from 'node:fs';
import * as plans from '../supabase/functions/experiment-api/game-plans.mjs';
import {ApiError} from '../supabase/functions/experiment-api/handler.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {B_GUIDANCE_POLICY,B_GUIDANCE_VERSION,bGuidanceContext,completeBGuidance,containsBDelegation} from '../supabase/functions/experiment-api/b-guidance.mjs';
import {recipeOutcome,RECIPE_RULE_VERSION} from '../supabase/functions/experiment-api/game-plans.mjs';
import {browser,fixture,enterGame,settle} from './helpers.mjs';
import {createGameCapabilities} from '../supabase/functions/experiment-api/game-chat.mjs';

test('B receives the canonical difficulty-specific knowledge and verified observations, not example recipes, predictions for new choices or test answers',()=>{
 for(const difficulty of ['basic','advanced']){
  const recipe=[2,6,2,4,2];const input={difficulty,round:2,recipe,history:[{id:'R1',x:recipe,delta:recipeOutcome(recipe,difficulty)}]};const before=structuredClone(input);const context=bGuidanceContext(input);
  assert.equal(context.guidance_version,B_GUIDANCE_VERSION);assert.equal(context.rule_version,RECIPE_RULE_VERSION);assert.equal(context.difficulty,difficulty);assert.deepEqual(context.verified_rule_knowledge.relevant_plant_indices,difficulty==='basic'?[1,3]:[1,2,3]);
  const canonical=Function('return ('+context.verified_rule_knowledge.canonical_rule_function+')')();for(const x of [[2,0,2,3,2],[2,2,2,3,2],[2,6,2,4,2]])assert.equal(canonical(x,difficulty),recipeOutcome(x,difficulty));
  assert.equal(context.observation_checks[0].rule_check,'matches');assert.equal(context.recommended_recipe,undefined);assert.equal(context.current_expected_delta,undefined);assert.equal(context.test_answers,undefined);assert.deepEqual(input,before);
 }
 const floor=bGuidanceContext({difficulty:'advanced',history:Array.from({length:8},(_,i)=>({id:'R'+(i+1),x:[0,6,2,4,0],delta:i<6?-3:i===6?-2:0}))});assert.ok(floor.observation_checks.every(x=>x.rule_check==='matches'));
 const mismatch=bGuidanceContext({difficulty:'advanced',history:[{id:'R1',x:[2,6,2,4,2],delta:8}]});assert.equal(mismatch.observation_checks[0].rule_check,'not_confirmed');
});

test('specific numerical explanations stay allowed while complete recipes and obvious unique future modifications are caught',()=>{
 for(const text of ['当前规则中，蓝铃叶6份且珊瑚枝至少4份会触发减量。','第1轮蓝铃叶0份，第2轮2份，结果从减少1只变成增加2只。','如果当时其他条件不变，蓝铃叶从0变成2，这两轮的比较更清楚。'])assert.equal(containsBDelegation(text),false,text);
 for(const text of ['食谱：[2,4,3,1,2]','下一轮其他都不变，把蓝铃叶改成3份。','下一轮蓝铃叶改成3份，其他全部不变。','其他全部不变，把蓝铃叶改成3份。'])assert.equal(containsBDelegation(text),true,text);
});

test('one correction retains permission for numerical teaching and never falls back to canned or number-free replies',async()=>{
 const requests=[];const messages=[{role:'system',content:B_GUIDANCE_POLICY},{role:'user',content:'为什么这轮减少？'}];const response=await completeBGuidance(messages,async m=>{requests.push(m);return {result:{text:requests.length===1?'下一轮其他不变，把蓝铃叶改成3份。':'你这轮蓝铃叶为6份、珊瑚枝为4份，符合已核对的减量条件。'},model:'fixture'};});
 assert.equal(requests.length,2);assert.match(requests[1][0].content,/保留.*局部数值/);assert.doesNotMatch(requests[1][0].content,/完全不要写数字/);assert.match(response.result.text,/6份/);assert.equal(messages[0].content,B_GUIDANCE_POLICY);
 let attempts=0;await assert.rejects(completeBGuidance(messages,async()=>{attempts++;return {result:{text:'完整配方：[2,4,3,1,2]'}};}),e=>e.status===502);assert.equal(attempts,2);
});

test('B API and the actual feeding record retain guidance provenance without exposing rule knowledge or recipe tools',async()=>{
 const f=fixture({gameCapabilities:createGameCapabilities('b-guidance-fixture'),gameAI:async()=>({text:'蓝铃叶和珊瑚枝存在搭配作用。',guidance_version:B_GUIDANCE_VERSION,guidance_rule_version:RECIPE_RULE_VERSION,model:'fixture'})});const base={session_id:crypto.randomUUID(),mode:'augmentation'};const access=await f.request('/game/access',base),token=(await access.json()).token;
 const response=await f.request('/game/chat',{...base,round:1,difficulty:'advanced',recipe:[0,0,0,0,0],history:[],messages:[{role:'user',content:'怎么开始？'}]},'',{'X-Game-Token':token});const body=await response.json();assert.equal(response.status,200);assert.equal(body.guidance_version,B_GUIDANCE_VERSION);assert.equal(body.guidance_rule_version,RECIPE_RULE_VERSION);assert.equal(body.teaching_support,undefined);assert.equal(body.recipe,undefined);
 const b=browser('index',async url=>new Response(JSON.stringify(String(url).endsWith('/game/access')?{token:'fixture',expires_in:7200}:body)),{url:'https://huangrui1008-collab.github.io/psych-exp/?group=B'});
 try{enterGame(b);const input=b.document.getElementById('chatInput');input.value='怎么开始？';input.dispatchEvent(new b.w.Event('input',{bubbles:true}));b.document.getElementById('chatForm').dispatchEvent(new b.w.Event('submit',{bubbles:true,cancelable:true}));await settle(()=>b.document.getElementById('aiAck'));const ack=b.document.getElementById('aiAck');ack.checked=true;ack.dispatchEvent(new b.w.Event('change',{bubbles:true}));b.document.querySelector('[data-do=feed]').click();const saved=JSON.parse(b.w.localStorage.getItem('az-flow-v1-session-B'));assert.equal(saved.rounds[0].aiGuidanceVersion,B_GUIDANCE_VERSION);assert.equal(saved.rounds[0].aiGuidanceRuleVersion,RECIPE_RULE_VERSION);assert.equal(saved.chatHistory.at(-1).guidanceVersion,B_GUIDANCE_VERSION);assert.equal(saved.rounds[0].minimumAIConsultationRounds,3);assert.equal(saved.rounds[0].aiParticipationPolicy,'b-min3-rounds-v1');assert.deepEqual(b.errors,[]);}finally{b.close();}
});

// Exercise the actual provider adapter body with a stub transport; no copy of its logic.
test('the deployed adapter attaches reliable knowledge only to B and preserves A verified recipes',async()=>{
 const source=fs.readFileSync(new URL('../supabase/functions/experiment-api/index.ts',import.meta.url),'utf8');
 const body=source.match(/async gameAI\(input: any\) \{([\s\S]+?)\n  \},\n  async ai/)[1].replace('providerMessages: any[]','providerMessages');
 const keys=['aiEnabled','ApiError','Deno','fetch','B_GUIDANCE_POLICY','B_GUIDANCE_VERSION','bGuidanceContext','completeBGuidance',...Object.keys(plans)];
 const calls=[];const transport=async(url,options)=>{calls.push(JSON.parse(options.body));return new Response(JSON.stringify({model:'fixture',choices:[{finish_reason:'stop',message:{content:JSON.stringify({text:'蓝铃叶与珊瑚枝有搭配作用。'})}}]}));};
 const adapter=Function(...keys,'return async function(input){'+body+'}')(...[true,ApiError,{env:{get:k=>k==='DEEPSEEK_API_KEY'?'fixture-key':null}},transport,B_GUIDANCE_POLICY,B_GUIDANCE_VERSION,bGuidanceContext,completeBGuidance,...Object.values(plans)]);
 const input={round:1,difficulty:'advanced',recipe:[0,0,0,0,0],history:[],messages:[{role:'user',content:'请给我一份成功喂养的食谱。'}]};
 const b=await adapter({...input,mode:'augmentation'});assert.equal(b.guidance_version,B_GUIDANCE_VERSION);assert.match(calls[0].messages[0].content,/canonical_rule_function/);assert.doesNotMatch(calls[0].messages[0].content,/recommended_recipe|verified_plans/);
 const a=await adapter({...input,mode:'delegation'});assert.equal(a.recipe.length,5);assert.equal(recipeOutcome(a.recipe,'advanced'),a.expected_delta);assert.equal(a.guidance_version,undefined);assert.doesNotMatch(calls[1].messages[0].content,/teaching_support|canonical_rule_function|学习辅助方式/);assert.equal(calls.length,2);
});
