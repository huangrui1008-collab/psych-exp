// Exact V0.6 feeding function; parity-tested against the participant game.
// This evaluates recipe choices. It does not alter feeding outcomes or test scores.
export const RECIPE_RULE_VERSION='alien-zoo-v06-original';
export function recipeOutcome(x,difficulty='advanced'){
  if(difficulty==='basic')return x[1]===6?-2:Math.floor(((x[1]+1)*[0,6,7,8,0,0,0][x[3]]+3)/6)-2;
  const dose=x[1],partner=x[3],third=x[2];if(dose===6&&partner>=4)return -3;
  const w=[0,.7,1.2,1.48,.55,.1,-.12][partner];return Math.max(-3,Math.min(8,Math.round((dose+1)*w+(third-2)*.56-2.6)));
}
export function gameDifficulty(input){
  if(input.difficulty)return input.difficulty;
  // Older game pages did not send difficulty. Their unchanged H1 distinguishes it.
  return input.history?.some(r=>r.id==='H1'&&r.delta===3&&JSON.stringify(r.x)==='[2,4,3,1,2]')?'basic':'advanced';
}
export const RECIPE_STRATEGY_VERSION='varied-target-v1';
export function feedingProgress(input){
  const difficulty=gameDifficulty(input);
  const rounds=(input.history||[]).filter(r=>/^R[1-9]\d*$/.test(r.id||'')).sort((a,b)=>Number(a.id.slice(1))-Number(b.id.slice(1)));
  let current=20;
  for(const row of rounds)current=Math.max(0,current+recipeOutcome(row.x,difficulty));
  const remaining=Math.max(1,11-(input.round||rounds.length+1));
  return {current,remaining,target:55,rounds,difficulty};
}
export function verifiedRecipePlans(input){
  const progress=feedingProgress(input),draft=input.recipe||[2,2,2,2,2],rows=[];
  for(let dose=0;dose<=6;dose++)for(let partner=0;partner<=6;partner++)for(let third=0;third<=6;third++){
    if(progress.difficulty==='basic'&&third!==draft[2])continue;
    const recipe=[draft[0],dose,third,partner,draft[4]];
    rows.push({recipe,expected_delta:recipeOutcome(recipe,progress.difficulty)});
  }
  const maximum=Math.max(...rows.map(x=>x.expected_delta)),gap=Math.max(0,55-progress.current);
  // Every offered gain leaves a mathematically feasible route to the existing target.
  const required=Math.max(2,gap-(progress.remaining-1)*maximum);
  const average=Math.ceil(gap/progress.remaining);
  let lower=Math.max(required,gap?average-1:2),upper=Math.max(lower,Math.min(6,gap?average+1:5));
  lower=Math.min(maximum,lower);upper=Math.min(maximum,upper);
  const gains=[...new Set(rows.map(r=>r.expected_delta))].filter(n=>n>=lower&&n<=upper);
  return gains.flatMap(gain=>rows.filter(r=>r.expected_delta===gain).sort((a,b)=>a.recipe.reduce((x,y)=>x+y,0)-b.recipe.reduce((x,y)=>x+y,0)).slice(0,6)).map((r,i)=>({id:'P'+(i+1),...r}));
}
export function chooseVariedRecipe(input,plans,random=Math.random){
  const progress=feedingProgress(input),gains=[...new Set(plans.map(p=>p.expected_delta))];
  const previous=progress.rounds.map(r=>recipeOutcome(r.x,progress.difficulty));
  let options=gains.filter(n=>n!==previous.at(-1));if(!options.length)options=gains;
  const frequency=n=>previous.filter(g=>g===n).length;
  const least=Math.min(...options.map(frequency));options=options.filter(n=>frequency(n)===least);
  const pick=values=>values[Math.min(values.length-1,Math.max(0,Math.floor(random()*values.length)))];
  const gain=pick(options),candidates=plans.filter(p=>p.expected_delta===gain);
  const seen=new Set(progress.rounds.map(r=>JSON.stringify(r.x)));
  const fresh=candidates.filter(p=>!seen.has(JSON.stringify(p.recipe)));
  return pick(fresh.length?fresh:candidates);
}
export function requestsRecipe(input){
  if(!input.messages?.length)return true;
  const text=input.messages.at(-1)?.content||'';
  return /(?:提供|给我|推荐|生成|想要|来一份).{0,24}(?:食谱|配方|方案)|(?:怎么|如何).{0,6}(?:喂养|投喂)/.test(text)&&!/(?:不要|不用|无需).{0,8}(?:食谱|配方|方案)/.test(text);
}
export function conversationForProvider(messages,plans){
  return messages.map(m=>{
    if(m.role!=='assistant')return m;
    let prior;try{prior=JSON.parse(m.content);}catch{}
    if(!prior||typeof prior.text!=='string')prior={text:m.content};
    const plan=plans.find(p=>JSON.stringify(p.recipe)===JSON.stringify(prior.recipe));
    return {role:'assistant',content:JSON.stringify({text:prior.text,...(plan?{plan_id:plan.id}:{})})};
  });
}
/** @param {any} result @param {{id:string,recipe:number[],expected_delta:number}[]} plans @param {{id:string,recipe:number[],expected_delta:number}|null} [prepared] */
export function resolveRecipePlan(result,plans,prepared=null){
  // A requested recipe is selected by the rule tool before the model call.
  // The model supplies the explanation; a missing optional ID cannot erase the tool's card.
  if(prepared){
    if(result.plan_id!=null&&result.plan_id!==prepared.id)throw new Error('Mismatched recipe selection');
    if(result.recipe!=null&&JSON.stringify(result.recipe)!==JSON.stringify(prepared.recipe))throw new Error('Mismatched recipe');
    return {text:result.text,recipe:[...prepared.recipe],expected_delta:prepared.expected_delta,recipe_rule_version:RECIPE_RULE_VERSION,recipe_strategy_version:RECIPE_STRATEGY_VERSION};
  }
  if(result.plan_id==null&&result.recipe==null)return {text:result.text};
  const plan=result.plan_id!=null?plans.find(x=>x.id===result.plan_id):plans.find(x=>JSON.stringify(x.recipe)===JSON.stringify(result.recipe));
  if(!plan)throw new Error('Unverified recipe selection');
  return {text:result.text,recipe:[...plan.recipe],expected_delta:plan.expected_delta,recipe_rule_version:RECIPE_RULE_VERSION,recipe_strategy_version:RECIPE_STRATEGY_VERSION};
}
