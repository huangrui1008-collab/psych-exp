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
export function verifiedRecipePlans(input){
  const difficulty=gameDifficulty(input),draft=input.recipe||[2,2,2,2,2];
  const rows=[];
  for(let dose=0;dose<=6;dose++)for(let partner=0;partner<=6;partner++)for(let third=0;third<=6;third++){
    const recipe=[draft[0],dose,third,partner,draft[4]];
    rows.push({recipe,expected_delta:recipeOutcome(recipe,difficulty)});
  }
  const best=Math.max(...rows.map(x=>x.expected_delta));
  return rows.filter(x=>x.expected_delta===best).sort((a,b)=>a.recipe.reduce((x,y)=>x+y,0)-b.recipe.reduce((x,y)=>x+y,0)).slice(0,6).map((r,i)=>({id:'P'+(i+1),...r}));
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
    return {text:result.text,recipe:[...prepared.recipe],expected_delta:prepared.expected_delta,recipe_rule_version:RECIPE_RULE_VERSION};
  }
  if(result.plan_id==null&&result.recipe==null)return {text:result.text};
  const plan=result.plan_id!=null?plans.find(x=>x.id===result.plan_id):plans.find(x=>JSON.stringify(x.recipe)===JSON.stringify(result.recipe));
  if(!plan)throw new Error('Unverified recipe selection');
  return {text:result.text,recipe:[...plan.recipe],expected_delta:plan.expected_delta,recipe_rule_version:RECIPE_RULE_VERSION};
}
