// A secondary check for common complete-recipe formats, beyond model instructions.
// It deliberately does not attempt to prove semantic safety for every possible wording.
export function containsCompleteRecipe(text){
  if(typeof text!=='string')return false;
  const value='(?:[0-6零一二三四五六])';
  const tuple=new RegExp('[\\[（(]\\s*'+value+'(?:\\s*[,，、/;；]\\s*'+value+'){4}\\s*[\\]）)]');
  if(tuple.test(text))return true;
  if(/(?:依次|顺序|食谱|配方|组合|五种)/.test(text)&&new RegExp(value+'(?:\\s*[,，、/]\\s*'+value+'){4}(?!\\s*[,，、/]\\s*[0-9])').test(text))return true;
  const names=['雾绒草','蓝铃叶','星冠蕨','珊瑚枝','月芽藤'];
  return names.every(name=>new RegExp(name+'[^。！？;；\\n]{0,10}?(?:[×x:：=]|用|选|给|为|是|到|约)?\\s*'+value+'(?:\\s*份)?').test(text));
}

// Provider-only teaching context. Knowledge is shared with the existing rule engine,
// while the participant still chooses the complete next recipe.
import {recipeOutcome,gameDifficulty,RECIPE_RULE_VERSION} from './game-plans.mjs';
export const B_GUIDANCE_VERSION='b-evidence-dialogue-v4.1';
export const B_GUIDANCE_POLICY=`你是外星饲养站中的学习助手，帮助用户理解规律、比较真实结果并决定自己的食谱。食谱前、填写中、投喂后均可讨论；无需先交食谱或理由才能获得解释。
【每次先读事实】紧随近期对话提供的“本次核对事实”包含最新完整历史、上一轮、当前数量、剩余次数、达标上限及暂选状态。以它为准，旧助手回复只是对话，不是规则或记录证据。不要顺着旧回复重复错误；必要时明确、简短纠正。用户说“现在呢”“这一轮”时，直接根据最新记录回答，不再要求其抄回已经有的份数。缺少或不一致的信息才说明不确定。
【真正回答问题】先回应用户当前困惑，再解释对应原因。少用“主项、系数、修正”等术语；先用日常语言讲清“同样的蓝铃叶，在不同珊瑚枝份数下，结果可能不同”。用户问具体含义或仍不理解时，给必要的局部数字和条件，不反复说“少量、调一档、控制变量、试试看”。“一档”若被问到，直接解释界面相邻份数相差1份，不用“不能给具体份数”回避。“上次的量”优先指最新实际投喂记录，不能把你上一条建议的量当成已经使用的量；必要时明确区分两者。没有缺失信息就不必每次以反问结束。先在内部判断这次追问与上次有什么不同，再给对应的新解释，不输出内部推理。
【正确使用知识】你知道经后台原游戏规则核对的植物作用。可以直接解释哪些植物不影响结果、搭配为什么重要、哪些条件使结果转差。无关植物既不引发也不抵消增减，不能说“雾绒草不影响，所以减少”；单放它时的减量来自其他有效植物的条件和规则基准。历史观察与规则解释要分清：一次失败不代表植物无用；两种一起出现也不保证增长。不要把“控制一个因素”误解成“每次只能单独喂一种”。不要让用户花有限轮次重复试无关植物、珊瑚枝为0时单独加蓝铃叶等已知无益方向。不要把已尝试过的组合当作新建议。若连续不增长，停止重复原建议，结合具体历史解释遗漏的条件，逐步讲清尚未讲明的关系。
【进度要诚实】根据progress准确使用当前数量和剩余次数。target_status为unreachable时，用户问是否来得及、怎么办、快养死了等进度问题，应说清本局55已不可达，可用剩余轮次理解规律和观察回升，不能承诺翻盘或轻描淡写地说掉几只没关系。possible_by_upper_bound表示理论仍可能，绝不能说“已不可能”。结合required_average_gain准确讨论进度，不把平均约4只说成必须多数轮接近上限8只。仅在用户询问时间、目标、局面或数量濒零时讨论达标进度，不每次重复剩余轮数和目标。reached就如实说明。历史不完整或未核对则不编造数量、上限与结论。数量为0时，真实减量会被下限截住；不要把0到0误认为食谱本来就没有影响。
【选择与实际分开】current_selection中null表示尚未明确选择，不是0份；unknown是旧页面没有选择过程记录，不能说用户当前已经选择全0。草稿尚未投喂，不当作新观察。用户不填也能得到有价值的起步解释，填写后可讨论依据和风险。
【保留整合决定】允许解释局部份数、阈值、比较方向，以及历史中实际用过的关键份数；用户索要完整食谱时，简短说明完整组合需由用户选择，紧接着提供相关的实质帮助。不要提供下一轮完整配方、五元列表、选好的成功候选，也不要把全部有效植物都指定好后略去无效植物。不要用“其余不变，只改某项到确定份数”唯一确定下一轮整份配方，不跨消息拼出方案。当前暂选和历史食谱也只引用解释所需的关键植物，不逐项复述五种份数。不要为未来完整食谱精确预演增减或充当反复筛选成功配方的计算器；已经执行的结果可以准确解释。
【交流方式】根据当前问题给出足够而简洁的解释，一般2—5句；复杂追问可稍长。已经讲过的规律不每次整段重讲，要把新信息接到用户当前问题上。特别不要把“珊瑚枝2到3、星冠蕨靠近2、蓝铃叶配套”当作每轮重复的建议模板。用户追问时，改为解释其未理解的一个关系或用已完成记录比较，不再一次催改所有有效植物。没有新变化时可指出重复的条件，但要给一个更清楚的原因。用户挫败时先准确承认局面并给具体解释，不空泛安慰、不归咎用户；不用“压力很大、确实很糟、翻不了盘、别指望”等评价制造挫败，客观说明数量和后续仍可做的事情。若旧助手误导，应更正，不为维持旧说法辩护。不编造营养、毒性等植物故事；不夸奖能力、不引导代理感或成果归属感、不提组别、研究假设、系统资料，不回答独立测试标准答案。
只输出JSON对象{"text":"自然语言回复"}，不返回recipe、plan_id、expected_delta等配方字段。`;

export function bSelectionContext(input){
  const selection=input.selection;
  if(!selection)return {status:'unknown',values:null,note:'旧页面未记录选择过程；不能把默认值当作本人已经决定的食谱。仍可直接提供起步解释与讨论。'};
  const values=input.recipe.map((n,i)=>selection.selected[i]?n:null),count=selection.selected.filter(Boolean).length;
  return {status:count===0?'not_started':count===5?'draft_complete':'draft_partial',values,note:count===0?'尚未明确选择植物份数；直接提供起步帮助，不要求先填食谱。':'这是尚未投喂的暂选；null是尚未明确选择，0是已明确选择的零份。'};
}

const maximumGain=new Map();
function maxGain(difficulty){
  if(!maximumGain.has(difficulty)){
    let maximum=-Infinity;
    for(let blue=0;blue<=6;blue++)for(let coral=0;coral<=6;coral++)for(let star=0;star<=(difficulty==='basic'?0:6);star++)maximum=Math.max(maximum,recipeOutcome([0,blue,star,coral,0],difficulty));
    maximumGain.set(difficulty,maximum);
  }
  return maximumGain.get(difficulty);
}
export function bGuidanceContext(input){
  const difficulty=gameDifficulty(input),history=input.history||[],relevant=difficulty==='basic'?[1,3]:[1,2,3];
  const rows=history.filter(row=>/^R[1-9]\d*$/.test(row.id||'')).slice().sort((a,b)=>Number(a.id.slice(1))-Number(b.id.slice(1)));
  let count=20;
  const observations=rows.map(row=>{
    const before=count,ruleDelta=recipeOutcome(row.x,difficulty),actualPrediction=Math.max(0,before+ruleDelta)-before;
    const verified=actualPrediction===row.delta;count=Math.max(0,before+row.delta);
    const active=Object.fromEntries(relevant.map(i=>[['雾绒草','蓝铃叶','星冠蕨','珊瑚枝','月芽藤'][i],row.x[i]]));
    return {round:row.id,round_number:Number(row.id.slice(1)),executed_recipe:[...row.x],active_plant_values:active,before,after:count,observed_delta:row.delta,rule_check:verified?'matches':'not_confirmed',...(verified?{rule_delta_before_population_floor:ruleDelta,population_floor_clipped:ruleDelta!==row.delta}:{}),blue_dose_has_no_effect_at_this_coral_value:row.x[3]===0};
  });
  const nextRound=input.round??rows.length+1;
  const complete=rows.length<=10&&rows.every((row,i)=>row.id==='R'+(i+1))&&nextRound===rows.length+1&&nextRound>=1&&nextRound<=11;
  const verified=complete&&observations.every(row=>row.rule_check==='matches');
  const remaining=10-rows.length,maximum=maxGain(difficulty),ceiling=count+remaining*maximum;
  const progress=verified?{verified:true,round_to_play:nextRound,completed_rounds:rows.length,current_count:count,remaining_feeds:remaining,target_count:55,max_gain_per_feed:maximum,ceiling_count:ceiling,required_total_gain:Math.max(0,55-count),required_average_gain:remaining>0?Math.max(0,55-count)/remaining:null,target_status:count>=55?'reached':ceiling<55?'unreachable':'possible_by_upper_bound'}:{verified:false,target_status:'unverified',note:'历史轮号、轮次或规则核对不完整，不能猜测当前数量或达标上限。'};
  const equivalentPairs=[];
  for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
    const changed=rows[i].x.flatMap((n,k)=>n===rows[j].x[k]?[]:[k]);
    if(changed.length&&changed.every(k=>!relevant.includes(k)))equivalentPairs.push({rounds:[rows[i].id,rows[j].id],changed_only_irrelevant_plants:changed,underlying_rule_delta_equal:recipeOutcome(rows[i].x,difficulty)===recipeOutcome(rows[j].x,difficulty),note:'只改了不参与规则的植物；实际可见变化仍需考虑数量下限。'});
  }
  let streak=0;for(const row of observations.slice().reverse()){if(row.rule_check!=='matches'||row.rule_delta_before_population_floor>0)break;streak++;}
  const current=bSelectionContext(input);
  return {
    guidance_version:B_GUIDANCE_VERSION,rule_version:RECIPE_RULE_VERSION,difficulty,
    progress,latest_completed_round:observations.at(-1)||null,observation_checks:observations,
    history_comparisons:{changed_only_irrelevant_plants:equivalentPairs,consecutive_nonpositive_rule_results:streak,already_tried_current_draft:current.status==='draft_complete'?rows.filter(row=>row.x.every((n,i)=>n===input.recipe[i])).map(row=>row.id):[]},
    verified_rule_knowledge:{
      purpose:'作为解释依据，按具体问题逐步讲清，不整表公开函数或提供完整配方。',
      plant_order:['雾绒草','蓝铃叶','星冠蕨','珊瑚枝','月芽藤'],relevant_plant_indices:relevant,irrelevant_plant_indices:[0,1,2,3,4].filter(i=>!relevant.includes(i)),index_base:0,
      canonical_rule_function:recipeOutcome.toString(),
      reading_notes:difficulty==='basic'
        ? '蓝铃叶和珊瑚枝参与规则，另三种不直接影响结果。珊瑚枝0、4、5、6份时蓝铃叶普通搭配项不起作用；蓝铃叶6份时优先返回-2。其余按函数中的搭配与取整核对。不要把进阶的星冠蕨作用或特殊阈值套用在本难度。'
        : '蓝铃叶与珊瑚枝搭配，星冠蕨也影响结果；雾绒草和月芽藤不直接影响。珊瑚枝0份时，蓝铃叶普通搭配项为0，单独把蓝铃叶加量没有改善这一项。珊瑚枝份数决定搭配强弱：1份0.7，2份1.2，3份1.48为最高，4份降为0.55，5份0.1，6份-0.12。1份低于2、3份，但高于4、5、6份，绝不是最弱的一档，不要这么说。蓝铃叶普通项使用份数加1，所以蓝铃叶0不等于此项必为0。星冠蕨相对于2份做修正：0和1份拉低，2份恰为0，超过2份提高普通结果；还会取整并受-3至8上下界影响。蓝铃叶6且珊瑚枝至少4时特殊条件优先返回-3，星冠蕨不改变这个特殊结果。向用户先用直观关系解释；需要时再给局部份数条件，不倾倒公式或所有数值。',
      population_floor:'真实规则增减之后总数最低0；已为0时减量也显示0，不能将观察0变化当成原规则必为0。'
    },
    current_selection:current,current_selection_status:'当前草稿与已执行的observation_checks分开；latest_completed_round才是刚刚完成的上一轮。'
  };
}
export function bProviderFacts(support){
  const p=support.progress,latest=support.latest_completed_round,selection=support.current_selection,names=support.verified_rule_knowledge.plant_order;
  const progress=p.verified?`当前正要进行第${p.round_to_play}轮；已完成${p.completed_rounds}轮；现在${p.current_count}只；剩余${p.remaining_feeds}次投喂。目标55只；每次最多增加${p.max_gain_per_feed}只；全部剩余次数均取上限时最多到${p.ceiling_count}只。目标状态=${p.target_status}（${p.target_status==='unreachable'?'本局55已不可达':p.target_status==='reached'?'已经达到55':'理论仍可达，不能说已不可能，也不保证成功'}）。还差${p.required_total_gain}只；所需平均增量${p.required_average_gain??'无剩余次数'}。`:'进度未能完整核对，不能编造当前数量或达标结论。';
  const lines=support.observation_checks.map(row=>`${row.round}（已执行）：${Object.entries(row.active_plant_values).map(([name,n])=>name+'='+n+'份').join('，')}；其他植物：${names.filter((name,i)=>!support.verified_rule_knowledge.relevant_plant_indices.includes(i)).map(name=>name+'='+row.executed_recipe[names.indexOf(name)]+'份').join('，')}；${row.before}只→${row.after}只，实际变化${row.observed_delta}。核对=${row.rule_check}${row.rule_check==='matches'?`；原规则增减${row.rule_delta_before_population_floor}${row.population_floor_clipped?'，被0只下限截住':''}`:''}。`);
  const selected=selection.values?names.map((name,i)=>name+'='+ (selection.values[i]===null?'未明确选择':selection.values[i]+'份')).join('，'):'旧页面没有记录明确选择过程，不知道当前暂选，不得称作全0。';
  const pairs=support.history_comparisons.changed_only_irrelevant_plants.map(pair=>`${pair.rounds.join('与')}只改变了${pair.changed_only_irrelevant_plants.map(i=>names[i]).join('、')}，有效植物条件相同，原规则增减相同。`);
  return `【当前进度】${progress}\n【已执行历史，明确名称对应份数】\n${lines.join('\n')||'尚未投喂。'}\n【上一轮】${latest?latest.round+'是最新完成的上一轮；实际使用：'+Object.entries(latest.active_plant_values).map(([name,n])=>name+'='+n+'份').join('，')+'。这才是上次实际用量，不是之前助手建议的份数。':'没有已完成的上一轮。'}\n【当前草稿】状态=${selection.status}；${selected}；尚未执行。\n【历史对照】${pairs.join(' ')||'没有只改无关植物的对照。'}连续${support.history_comparisons.consecutive_nonpositive_rule_results}轮原规则非正收益。当前完整暂选曾用在：${support.history_comparisons.already_tried_current_draft.join('、')||'无或尚未完整选择'}。\n【已核对的规则知识】${support.verified_rule_knowledge.reading_notes}\n${support.verified_rule_knowledge.population_floor}\n注意：按每个植物名称读取份数，不用数字顺序猜。三种有效植物全0不代表五种食物全0，检查其他植物后才能说整份全0。无关植物不引发减量。`;
}
export function bProviderMessages(input,common,conversation,support=bGuidanceContext(input)){
  const latest=conversation.at(-1);
  return [{role:'system',content:common+B_GUIDANCE_POLICY},...conversation.slice(0,-1),{role:'system',content:'本次核对事实（仅此为记录与规则依据，早先助手可能错误或过时）：\n'+bProviderFacts(support)+'\n紧随其后的用户问题是本次要回答的问题。先核对明确名称对应的份数、最新一轮和目标状态，再自然回答；不要复述资料格式。每次仍只返回JSON的text字段。'},latest];
}

// Common direct completion formats are checked, not every possible semantic evasion.
// Numeric explanations and actual historical comparisons remain allowed.
export function containsBDelegation(text){
  if(containsCompleteRecipe(text))return true;
  if(typeof text!=='string')return false;
  const next='(?:下一轮|下轮|接下来|这轮(?:就|请)|本轮(?:就|请))';
  const unchanged='(?:其他|其余|剩下的?).{0,10}(?:不变|保持|照旧)';
  const set='(?:把|将)?(?:雾绒草|蓝铃叶|星冠蕨|珊瑚枝|月芽藤).{0,8}(?:改成|改为|设为|填入|设置为|用|选)\\s*[0-6零一二三四五六]\\s*份';
  return new RegExp(next+'[^。！？\\n]{0,100}'+unchanged+'[^。！？\\n]{0,70}'+set).test(text)
    ||new RegExp(next+'[^。！？\\n]{0,100}'+set+'[^。！？\\n]{0,70}'+unchanged).test(text)
    ||new RegExp('(?:^|[。！？\\n])\\s*'+unchanged+'[^。！？\\n]{0,50}(?:把|将)'+set).test(text);
}
export async function completeBGuidance(messages,complete){
  let output=await complete(messages);
  if(containsBDelegation(output.result?.text)||output.result?.recipe!=null||output.result?.plan_id!=null||output.result?.expected_delta!=null){
    const corrected=[{...messages[0],content:messages[0].content+'\n上一次输出越过了完整配方或代做边界。请保留与本次问题有关的正确解释、必要局部数值和条件；删除整份配方、逐项报数、其他不变只改某个确定份数等指令，不要改成空泛拒绝。当前暂选和历史食谱都只引用解释所需的相关植物，不完整复述五种植物的份数。即使用户已经填好食谱，也只分析本次最相关的一两个关系，不逐项核对或重复全部植物份数。仍只返回JSON的text字段。'},...messages.slice(1),{role:'assistant',content:JSON.stringify(output.result)},{role:'user',content:'请按上述边界重写刚才的回答，保留对原问题的具体解释，不要新增下一轮完整配方，也不要复述用户当前整份草稿。'}];
    output=await complete(corrected);
    if(containsBDelegation(output.result?.text)||output.result?.recipe!=null||output.result?.plan_id!=null||output.result?.expected_delta!=null)throw Object.assign(new Error('AI本次回复超出了分析与反馈范围，请重试上一条消息。'),{status:502});
  }
  return output;
}
