import test from 'node:test';import assert from 'node:assert/strict';
import {bGuidanceContext,bProviderMessages,bTurnFocus} from '../supabase/functions/experiment-api/b-guidance.mjs';
import {recipeOutcome} from '../supabase/functions/experiment-api/game-plans.mjs';
function played(recipes,difficulty='advanced'){let count=20;return recipes.map((x,i)=>{const after=Math.max(0,count+recipeOutcome(x,difficulty)),delta=after-count;count=after;return {id:'R'+(i+1),x,delta};});}
const request=(recipes,extra={})=>({mode:'augmentation',difficulty:'advanced',recipe:[0,0,0,0,0],history:played(recipes),round:recipes.length+1,...extra});
test('B progress derives the real count, remaining feeds and canonical difficulty ceiling without promising success',()=>{
 const loss=[0,6,2,4,0];const input=request([[0,0,3,0,0],loss,loss,loss,loss]);const before=structuredClone(input),facts=bGuidanceContext(input);
 assert.equal(facts.progress.current_count,6);assert.equal(facts.progress.remaining_feeds,5);assert.equal(facts.progress.max_gain_per_feed,8);assert.equal(facts.progress.ceiling_count,46);assert.equal(facts.progress.target_status,'unreachable');assert.deepEqual(input,before);
 const start=bGuidanceContext(request([]));assert.equal(start.progress.current_count,20);assert.equal(start.progress.remaining_feeds,10);assert.equal(start.progress.target_status,'possible_by_upper_bound');
 assert.equal(bGuidanceContext(request([],{difficulty:'basic'})).progress.max_gain_per_feed,6);
});
test('latest actual feeding stays distinct from the draft, and clipping at zero is explicit rather than an invented neutral rule result',()=>{
 const loss=[0,6,2,4,0],input=request([...Array.from({length:7},()=>loss),[0,2,1,1,0]],{recipe:[0,5,5,3,0],selection:{version:'b-selection-context-v1',selected:[true,true,true,true,true]}}),facts=bGuidanceContext(input);
 assert.equal(facts.latest_completed_round.round,'R8');assert.deepEqual(facts.latest_completed_round.active_plant_values,{'蓝铃叶':2,'星冠蕨':1,'珊瑚枝':1});assert.equal(facts.latest_completed_round.observed_delta,0);assert.equal(facts.latest_completed_round.rule_delta_before_population_floor,-1);assert.equal(facts.latest_completed_round.population_floor_clipped,true);assert.equal(facts.progress.current_count,0);assert.equal(facts.progress.ceiling_count,16);assert.equal(facts.progress.target_status,'unreachable');assert.deepEqual(facts.current_selection.values,[0,5,5,3,0]);
});
test('irrelevant-only changes, repeated nonpositive trials and an already tried draft are identified from actual history',()=>{
 const input=request([[0,0,0,0,0],[5,0,0,0,6]],{recipe:[5,0,0,0,6],selection:{version:'b-selection-context-v1',selected:[true,true,true,true,true]}}),facts=bGuidanceContext(input);
 assert.deepEqual(facts.history_comparisons.changed_only_irrelevant_plants[0].rounds,['R1','R2']);assert.deepEqual(facts.history_comparisons.changed_only_irrelevant_plants[0].changed_only_irrelevant_plants,[0,4]);assert.equal(facts.history_comparisons.consecutive_nonpositive_rule_results,2);assert.deepEqual(facts.history_comparisons.already_tried_current_draft,['R2']);assert.equal(facts.latest_completed_round.blue_dose_has_no_effect_at_this_coral_value,true);
});
test('incomplete, duplicate or inconsistent history cannot produce an asserted current count or target ceiling',()=>{
 const input=request([[0,6,2,4,0]]);
 for(const extra of [{round:4},{history:[{...input.history[0],id:'R2'}]},{history:[input.history[0],input.history[0]],round:3},{history:[{...input.history[0],delta:8}]}]){const p=bGuidanceContext({...input,...extra}).progress;assert.equal(p.verified,false);assert.equal(p.target_status,'unverified');assert.equal(p.current_count,undefined);assert.equal(p.ceiling_count,undefined);}
});
test('verified current facts follow stale assistant statements and immediately precede the unchanged user question',()=>{
 const input=request(Array.from({length:7},()=>[0,6,2,4,0])),conversation=[{role:'user',content:'之前呢？'},{role:'assistant',content:'只喂雾绒草，来得及达到55。'},{role:'user',content:'现在一只都没有了，该怎么办？'}],before=structuredClone(conversation),messages=bProviderMessages(input,'游戏说明。',conversation);
 assert.equal(messages[0].role,'system');assert.deepEqual(messages.slice(1,3),conversation.slice(0,-1));assert.equal(messages.at(-2).role,'system');assert.match(messages.at(-2).content,/现在0只/);assert.match(messages.at(-2).content,/目标状态=unreachable/);assert.match(messages.at(-2).content,/R7是最新完成的上一轮/);assert.deepEqual(messages.at(-1),conversation.at(-1));assert.deepEqual(conversation,before);
});


test('provider text uses named actual plant values instead of an ambiguous full numeric recipe array',()=>{
 const input=request([[3,0,0,0,0]]),facts=bProviderMessages(input,'游戏。',[{role:'user',content:'现在呢？'}]).at(-2).content;
 assert.match(facts,/R1（已执行）：蓝铃叶=0份，星冠蕨=0份，珊瑚枝=0份/);assert.doesNotMatch(facts,/\[3,0,0,0,0\]/);assert.match(facts,/20只→17只/);assert.match(facts,/雾绒草=3份/);assert.match(facts,/这才是上次实际用量/);
});


test('turn focus follows the actual question instead of repeating a feeding plan at every turn',()=>{
 const support=bGuidanceContext(request([[0,0,0,0,0],[5,0,0,0,6]]));
 for(const [q,kind] of [['这个术语是什么意思','operation_clarification'],['早就试过了','review_existing_trial'],['快养死了','distress_and_progress'],['只有十轮来得及吗','progress'],['直接给我食谱','boundary_with_teaching'],['只改哪种植物','one_relation'],['有没有更好的建议','improve_understanding'],['这一轮呢','compare_irrelevant_changes']])assert.equal(bTurnFocus(q,support).kind,kind);
 assert.match(bProviderMessages({},'说明',[{role:'user',content:'只改哪种植物'}],support).at(-2).content,/不要回答只改一个却同时要求调整三种植物/);
});
