import test from 'node:test';
import assert from 'node:assert/strict';
import {browser,fixture,settle} from './helpers.mjs';
import {createGameCapabilities} from '../supabase/functions/experiment-api/game-chat.mjs';
import {recipeOutcome,verifiedRecipePlans,resolveRecipePlan,gameDifficulty,requestsRecipe,conversationForProvider,chooseVariedRecipe,feedingProgress,RECIPE_RULE_VERSION,RECIPE_STRATEGY_VERSION} from '../supabase/functions/experiment-api/game-plans.mjs';

test('recipe verification matches actual V0.6 feeding for every valid combination in both difficulties',()=>{
 const b=browser('index',async()=>{throw Error('no network')});
 try{
  const actual=b.w.eval('outcome');
  for(const difficulty of ['basic','advanced']){
   for(let n=0;n<16807;n++){let k=n;const recipe=Array.from({length:5},()=>{const v=k%7;k=Math.floor(k/7);return v;});assert.equal(recipeOutcome(recipe,difficulty),actual(recipe,difficulty));}
   const plans=verifiedRecipePlans({difficulty,recipe:[2,4,3,1,2]});
   assert.equal(new Set(plans.map(p=>p.expected_delta)).size,3);for(const p of plans){assert.ok(p.expected_delta>=3&&p.expected_delta<=5);assert.equal(p.expected_delta,actual(p.recipe,difficulty));}
  }
  assert.equal(actual([2,4,3,1,2],'advanced'),1);
 }finally{b.close();}
});

test('ten rounds adopting verified A recipes reach the target using unchanged frontend feeding and preserve verification metadata',async()=>{
 for(const difficulty of ['basic','advanced']){
  const b=browser('index',async(url,init)=>{
   if(String(url).endsWith('/game/access'))return new Response(JSON.stringify({token:'test-only',expires_in:7200}));
   const input=JSON.parse(init.body);assert.equal(input.difficulty,difficulty);
   const plans=verifiedRecipePlans(input),prepared=chooseVariedRecipe(input,plans,()=>0.37);return new Response(JSON.stringify({...resolveRecipePlan({text:'模型解释测试食谱'},plans,prepared),source:'real'}));
  },{url:'https://huangrui1008-collab.github.io/psych-exp/?group=A',local:{'az-preview-v06-settings':JSON.stringify({difficulty})}});
  try{
   b.document.querySelector('[data-do=start]').click();
   for(let i=0;i<10;i++){
    b.document.querySelector('[data-do=fill-recipe-prompt]').click();b.document.getElementById('chatForm').dispatchEvent(new b.w.Event('submit',{bubbles:true,cancelable:true}));await settle(()=>b.document.getElementById('aiAck'));
    b.document.querySelector('[data-do=adopt]').click();const ack=b.document.getElementById('aiAck');ack.checked=true;ack.dispatchEvent(new b.w.Event('change',{bubbles:true}));b.document.querySelector('[data-do=feed]').click();
    const state=JSON.parse(b.w.localStorage.getItem('az-preview-v06-session-A'));assert.ok(state.rounds.at(-1).delta>=2&&state.rounds.at(-1).delta<=6);assert.equal(state.rounds.at(-1).aiExpectedDelta,state.rounds.at(-1).delta);assert.equal(state.rounds.at(-1).aiRecipeRuleVersion,RECIPE_RULE_VERSION);
    if(i<9)b.document.querySelector('[data-do=next]').click();
   }
   const state=JSON.parse(b.w.localStorage.getItem('az-preview-v06-session-A'));assert.ok(state.pack>=55&&state.pack<=65);assert.ok(new Set(state.rounds.map(r=>r.delta)).size>=3);assert.ok(new Set(state.rounds.map(r=>JSON.stringify(r.x))).size>=6);assert.ok(state.rounds.every(r=>r.aiRecipeStrategyVersion===RECIPE_STRATEGY_VERSION));assert.deepEqual(b.errors,[]);
  }finally{b.close();}
 }
});

test('unverified low-yield recipes and invented tool IDs cannot become A recipe cards; explanations stay conversational',()=>{
 const plans=verifiedRecipePlans({difficulty:'advanced',recipe:[2,4,3,1,2]});
 assert.throws(()=>resolveRecipePlan({text:'低收益旧配方',recipe:[2,4,3,1,2]},plans));assert.throws(()=>resolveRecipePlan({text:'不存在的方案',plan_id:'P999'},plans));
 assert.deepEqual(resolveRecipePlan({text:'解释上一条回复',plan_id:null},plans),{text:'解释上一条回复'});
 assert.equal(gameDifficulty({history:[{id:'H1',x:[2,4,3,1,2],delta:3}]}),'basic');assert.equal(gameDifficulty({history:[{id:'H1',x:[2,4,3,1,2],delta:1}]}),'advanced');
});

test('game API carries difficulty and verified outcomes only for A; legacy basic clients are recognized',async()=>{
 let captured;const f=fixture({gameCapabilities:createGameCapabilities('verification-test'),gameAI:async input=>{captured=input;const plans=verifiedRecipePlans(input);return resolveRecipePlan({text:'测试回复',plan_id:plans[0].id},plans);}});
 for(const mode of ['delegation','augmentation']){
  const base={session_id:crypto.randomUUID(),mode};const a=await f.request('/game/access',base),token=(await a.json()).token;
  const b={...base,round:1,recipe:[2,4,3,1,2],history:[{id:'H1',x:[2,4,3,1,2],delta:3}],messages:[{role:'user',content:'成功食谱'}]};
  const response=await f.request('/game/chat',b,'',{'X-Game-Token':token});assert.equal(response.status,200);const result=await response.json();assert.equal(captured.difficulty,'basic');
  if(mode==='delegation'){assert.ok(result.expected_delta>=3&&result.expected_delta<=5);assert.equal(result.recipe_strategy_version,RECIPE_STRATEGY_VERSION);assert.equal(result.recipe_rule_version,RECIPE_RULE_VERSION);}else{assert.equal(result.recipe,undefined);assert.equal(result.expected_delta,undefined);assert.equal(result.recipe_rule_version,undefined);}
  assert.equal((await f.request('/game/chat',{...b,difficulty:'invented'},'',{'X-Game-Token':token})).status,400);
 }
});


test('explicit recipe requests retain the precomputed card even if the model returns only an explanation',()=>{
 const input={difficulty:'advanced',recipe:[0,0,0,0,0],messages:[{role:'user',content:'请给我提供一份成功喂养的食谱。'}]};const plans=verifiedRecipePlans(input);assert.equal(requestsRecipe(input),true);
 const resolved=resolveRecipePlan({text:'当前工具核对的食谱。'},plans,plans[0]);assert.deepEqual(resolved.recipe,plans[0].recipe);assert.equal(resolved.expected_delta,recipeOutcome(plans[0].recipe,'advanced'));
 assert.throws(()=>resolveRecipePlan({text:'不一致',recipe:[2,4,3,1,2]},plans,plans[0]));
 assert.equal(requestsRecipe({messages:[{role:'user',content:'解释一下上一条的依据，不用再给食谱。'}]}),false);
 const history=conversationForProvider([{role:'assistant',content:JSON.stringify({text:'自然回复',recipe:plans[0].recipe})},...input.messages],plans);assert.equal(JSON.parse(history[0].content).plan_id,plans[0].id);assert.equal(history[1].content,input.messages[0].content);
});


test('variable recommendations reach 55 within ten rounds across both difficulties and diverse random choices',()=>{
 const generators=[()=>0,()=>0.999999];
 for(let seed=1;seed<=100;seed++){let state=seed;generators.push(()=>{state=(state*1664525+1013904223)>>>0;return state/4294967296;});}
 const finalCounts=new Set();
 for(const difficulty of ['basic','advanced'])for(const random of generators){
  const input={difficulty,recipe:[0,0,0,0,0],round:1,history:[]};let count=20;
  for(let round=1;round<=10;round++){input.round=round;const plans=verifiedRecipePlans(input),plan=chooseVariedRecipe(input,plans,random);const delta=recipeOutcome(plan.recipe,difficulty);assert.equal(delta,plan.expected_delta);count+=delta;input.history.push({id:'R'+round,x:plan.recipe,delta});assert.ok(count+(10-round)*(difficulty==='basic'?6:8)>=55);}
  assert.ok(count>=55);assert.ok(new Set(input.history.map(r=>r.delta)).size>=3);assert.ok(new Set(input.history.map(r=>JSON.stringify(r.x))).size>=6);finalCounts.add(count);
 }
 assert.ok(finalCounts.size>1);
});

test('planning responds to actual altered feeding history instead of replaying a fixed schedule',()=>{
 for(const difficulty of ['basic','advanced']){
  const input={difficulty,recipe:[0,0,0,0,0],round:2,history:[{id:'H1',x:[2,4,3,1,2],delta:999},{id:'R1',x:[0,6,0,4,0],delta:999}]};
  assert.equal(feedingProgress(input).current,difficulty==='basic'?18:17);
  for(let round=2;round<=10;round++){input.round=round;const plans=verifiedRecipePlans(input),p=chooseVariedRecipe(input,plans,()=>0.5);input.history.push({id:'R'+round,x:p.recipe,delta:p.expected_delta});}
  assert.ok(feedingProgress(input).current>=55);
 }
});
