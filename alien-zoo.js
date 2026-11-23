
'use strict';
const entryParams=new URLSearchParams(location.search), entryGroup=(entryParams.get('group')||'').toUpperCase(), validEntry=!entryParams.has('group')||['A','B'].includes(entryGroup);
const isManaging=entryParams.get('manage')==='1';
const B_MIN_AI_ROUNDS=3;
const VERSION='0.6.0', SESSION_KEY='az-flow-v1-session-'+(entryGroup||'random'), SETTINGS_KEY='az-preview-v06-settings', LIMIT=10, START=20, TARGET=55;
const FLOW_VERSION='alien-zoo-flow-v1';
const FLOW_STEPS=[['consent','知情同意'],['ai_literacy','AI素养'],['feeding_game','喂养游戏'],['independent_test','独立测试'],['self_assessment','自我评估'],['manipulation_check','操纵检验'],['agency','代理感'],['visual_difference','图形找不同'],['final_recipe_selection','最终食谱选择'],['final_recipe_display','最终食谱展示'],['psychological_ownership','心理所有权'],['learning_gain','学习获得感']].map(([id,label])=>({id,label,placeholder:!['feeding_game','independent_test','final_recipe_selection','final_recipe_display'].includes(id)}));
function enterFlow(id){s.flow_current=id;s.stage=id==='feeding_game'?'play':id==='independent_test'?'test':id;const step=s.flow_steps[id];step.entered_at=step.entered_at||new Date().toISOString();step.status=step.placeholder?'placeholder_in_progress':'in_progress';if(id==='feeding_game')s.roundStarted=Date.now();emit('flow_step_entered',{step:id});}
function advanceFlow(){const id=s.flow_current,index=FLOW_STEPS.findIndex(x=>x.id===id),step=s.flow_steps[id];step.exited_at=new Date().toISOString();step.status=step.placeholder?'placeholder_passed':'completed';if(id==='consent')s.consent={obtained:false,status:'not_obtained_placeholder',material_version:null,placeholder_passed_at:step.exited_at};emit('flow_step_finished',{step:id,status:step.status});if(index===FLOW_STEPS.length-1){s.stage='done';s.flow_status='walkthrough_complete_with_placeholders';s.flow_completed_at=step.exited_at;emit('flow_walkthrough_complete',{contains_placeholders:true});}else enterFlow(FLOW_STEPS[index+1].id);render();}
function renderPlaceholder(){const def=FLOW_STEPS.find(x=>x.id===s.flow_current);if(def.id==='psychological_ownership'&&!selectedRecipeValid())return renderRecipeError();app.innerHTML=`${def.id==='psychological_ownership'?selectedRecipeCard()+ownershipGuidance():''}<section class="card flow-placeholder"><span class="section-kicker">实验流程</span><h2>${esc(def.label)}</h2><div class="notice"><b>内容待定 · 当前为占位页</b><p>${def.id==='consent'?'知情同意正文尚未配置。继续仅用于核对流程，不代表已经取得正式知情同意。':def.id==='visual_difference'?'图形找不同的材料、规则与时长尚未确定，本页不生成临时图形或任务。':'本环节的题目、选项与计分方式尚未定稿，本页不添加临时条目。'}</p><p>本页只记录流程经过及时间，不记录作答，也不生成量表分数。</p></div><div class="buttons"><button data-do="flow-next">继续${def.id==='consent'?'（仅核对流程）':''}</button><button class="ghost" data-do="exit">退出流程</button></div></section>`;}
const foods=[{name:'雾绒草',icon:'🌿'},{name:'蓝铃叶',icon:'🪻'},{name:'星冠蕨',icon:'🌱'},{name:'珊瑚枝',icon:'🪸'},{name:'月芽藤',icon:'🍃'}];
const questions=[{id:'amount',text:'多喂一点，会更好吗？'},{id:'mix',text:'换一种搭配，可能怎样？'},{id:'repeat',text:'这份食谱以前试过吗？'},{id:'unsure',text:'帮我看看现有线索'}];
const testRecipes=[[2,2,3,2,2],[2,5,3,4,2],[2,6,3,1,2],[0,4,6,1,0]];
const defaults={difficulty:'advanced',aiMode:'real',apiBase:APP_CONFIG.API_BASE,timed:false,seconds:120,researcher:true};
const app=document.getElementById('app');
let settings=loadSettings(),s=loadSession(),pending=false,ticker=null,gameAccess=null;
const ANIMAL_MOTION_MS=1800;
let animalMotion=null,animalObserver=null,animalTimer=null,animalFrame=null;
const RECIPE_DISPLAY_MS=1500;
let recipeDisplayTimer=null,restartError='';
const mobileChatMedia=window.matchMedia?.('(max-width: 720px) and (hover: none) and (pointer: coarse)');
const chatSheet={open:false,scrollX:0,scrollY:0,logTop:null,focusReturn:null,bodyStyles:null,inertNodes:[]};
const assignedMode=resolveAssignment();
document.getElementById('gameConnection').hidden=!isManaging;
function resolveAssignment(){
 if(!validEntry)return null;
 if(entryGroup)return entryGroup==='A'?'delegation':'augmentation';
 const key='az-v06-assigned-mode',saved=s?.mode||localStorage.getItem(key);
 const mode=['delegation','augmentation'].includes(saved)?saved:(crypto.getRandomValues(new Uint32Array(1))[0]<2147483648?'delegation':'augmentation');
 localStorage.setItem(key,mode);return mode;
}
function loadSettings(){try{return {...defaults,...JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}'),apiBase:defaults.apiBase,aiMode:'real'}}catch{return {...defaults}}}
function loadSession(){try{const v=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');if(v?.version!==VERSION)return null;v.chatHistory=v.chatHistory||[];for(const message of v.chatHistory)if(message.status==='pending')message.status='failed';
 // Add only the two new step definitions. Keep existing answers, records and completed sessions intact.
 if(v.flow_version===FLOW_VERSION&&v.flow_steps)for(const id of ['final_recipe_selection','final_recipe_display'])if(!v.flow_steps[id]){const def=FLOW_STEPS.find(x=>x.id===id);v.flow_steps[id]={label:def.label,placeholder:false,status:'pending',entered_at:null,exited_at:null,responses:null,score:null,data_ref:'final_recipe'};}
 return v}catch{return null}}
function persist(){localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));if(s)localStorage.setItem(SESSION_KEY,JSON.stringify(s));else localStorage.removeItem(SESSION_KEY)}
function esc(t){return String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]))}
function showToast(t){const e=document.getElementById('toast');e.textContent=t;e.style.display='block';setTimeout(()=>e.style.display='none',3000)}
function emit(type,data={}){if(!s)return;s.events.push({type,time:new Date().toISOString(),stage:s.stage,round:s.rounds.length+1,...data});persist()}
function outcome(x,difficulty){if(difficulty==='basic')return x[1]===6?-2:Math.floor(((x[1]+1)*[0,6,7,8,0,0,0][x[3]]+3)/6)-2;
  const dose=x[1],partner=x[3],third=x[2];if(dose===6&&partner>=4)return -3;
  const w=[0,.7,1.2,1.48,.55,.1,-.12][partner];return Math.max(-3,Math.min(8,Math.round((dose+1)*w+(third-2)*.56-2.6)))}
function foodCards(recipe,compact=true){return `<div class="recipe-mini">${recipe.map((n,i)=>`<span class="food" title="${foods[i].name}"><span class="emoji">${foods[i].icon}</span>${compact?'':`<span>${foods[i].name}</span>`}<b>×${n}</b></span>`).join('')}</div>`}
function recipeTable(rows){return `<div class="table-scroll"><table class="table-recipes"><thead><tr><th>轮次</th><th>食谱（名称＋图标＋份数）</th><th>数量变化</th></tr></thead><tbody>${rows.map(r=>{const delta=rowPopulationChange(r);return `<tr><td>${esc(r.id)}</td><td>${foodCards(r.x,false)}</td><td><b class="${delta>0?'success':delta<0?'error':''}">${delta>0?'+':''}${delta}</b></td></tr>`;}).join('')}</tbody></table></div>`}
function configPanel(){return `<details id="researcher" ${settings.researcher?'open':''}><summary>研究者设置</summary><div class="settings" style="margin-top:13px">
<label>规则难度<select id="setDifficulty"><option value="advanced" ${settings.difficulty==='advanced'?'selected':''}>进阶：三种植物参与规则</option><option value="basic" ${settings.difficulty==='basic'?'selected':''}>基础：两种植物参与规则</option></select></label>
<div><b>AI连接</b><p>真实AI对话 · 由服务器连接</p></div>
<label>API 后端地址<input id="setApiBase" type="url" readonly value="${esc(settings.apiBase)}" placeholder="https://your-server.example"></label>
<label>每轮限时<select id="setTimed"><option value="no" ${!settings.timed?'selected':''}>关闭</option><option value="yes" ${settings.timed?'selected':''}>开启：120秒／轮</option></select></label>
</div><div class="buttons"><button class="secondary" data-do="save-settings">保存设置</button><button class="ghost" data-do="reset">重置本机记录</button></div>
<p class="muted">仅用于预测试。正式版需要由服务器分组、保存数据、计算结果并锁定一次性参与链接。API密钥仅存服务器。</p></details>`}
function home(){
 if(s?.stage==='exited')return locked('你已退出本次任务。');if(s)return render();
 const resume=!!s;
 app.innerHTML=`<section class="card intro-card"><span class="section-kicker">外星饲养站</span><h2>欢迎来到外星饲养站</h2><p>你要照顾一群叫“星绒兽”的外星小动物。从20只开始，通过10次投喂，尽量让它们达到55只。</p><p>每轮从5种植物中选择份数，每种可选0—6份。${assignedMode==='delegation'?'AI会提供完整食谱建议，你可以填入食谱，也可以自行修改。':'请先与AI交流并决定食谱。'}</p><div class="buttons"><button data-do="${resume?'resume':'start'}">${resume?'继续任务':'开始流程'}</button></div></section>${isManaging?'<section class="card"><a href="researcher.html">返回研究者工作台</a>'+configPanel()+'</section>':''}`;
}
function exitOrigin(){if(s?.stage!=='exited')return null;const from=s.exit_info?.from||[...(s.events||[])].reverse().find(e=>e.type==='session_exited'&&e.from&&e.from!=='exited')?.from;return ['play','feedback','test','done',...FLOW_STEPS.map(x=>x.id)].includes(from)?from:null;}
function locked(reason){const recoverable=!!exitOrigin();app.innerHTML=`<section class="card lock"><h2>本次任务已结束</h2><p>${esc(reason)}</p>${recoverable?'<p>如果是误操作，可继续原任务，已保存的内容会保留。如果决定退出，直接关闭页面即可。</p><button data-do="recover-exit">误退出，继续原任务</button>':''}${isManaging?'<a href="researcher.html">返回研究者工作台</a><button class="secondary" data-do="reset">重置本机记录</button>':''}</section>`;}
function recoverExit(){const from=exitOrigin();if(!from)return;if(pending){showToast('上一条AI请求正在结束，请稍后再继续。');return}const exitEvent=[...(s.events||[])].reverse().find(e=>e.type==='session_exited');const resumedAt=new Date().toISOString();s.interruptions=s.interruptions||[];s.interruptions.push({from,exited_at:s.exit_info?.at||exitEvent?.time||null,resumed_at:resumedAt,kind:'participant_resumed_after_exit'});s.stage=from;s.flow_status=from==='done'?'walkthrough_complete_with_placeholders':'in_progress';if(s.flow_steps?.[s.flow_current]&&from!=='done'){s.flow_steps[s.flow_current].status=s.flow_steps[s.flow_current].placeholder?'placeholder_in_progress':'in_progress';s.flow_steps[s.flow_current].exited_at=null;}for(const m of s.chatHistory||[])if(m.status==='pending')m.status='failed';emit('session_resumed_after_exit',{restored_stage:from,exited_at:s.exit_info?.at||exitEvent?.time||null});s.exit_info=null;render();}
function makeSession(mode){return {version:VERSION,kind:'alien-zoo',is_test:true,entry_mode:entryGroup?'fixed':'random',id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),mode,createdAt:new Date().toISOString(),stage:'play',difficulty:settings.difficulty,aiMode:settings.aiMode,apiBase:settings.apiBase,timed:settings.timed,pack:START,lastDelta:null,rounds:[],history:[],events:[],draft:[0,0,0,0,0],goal:null,ai:null,aiSeen:false,aiAcknowledged:false,chatHistory:[],chatDraft:'',chatError:'',adoptedMessageId:null,roundStarted:Date.now(),tests:null}}
async function start(restartOf=null){if(s)return render();s=makeSession(assignedMode);if(restartOf)s.restart_of=restartOf;s.flow_version=FLOW_VERSION;s.flow_status='in_progress';s.flow_steps=Object.fromEntries(FLOW_STEPS.map(x=>[x.id,{label:x.label,placeholder:x.placeholder,status:'pending',entered_at:null,exited_at:null,responses:null,score:null,...(!x.placeholder?{data_ref:x.id==='feeding_game'?'rounds':x.id==='independent_test'?'tests':'final_recipe'}:{})}]));s.consent={obtained:false,status:'not_configured',material_version:null};emit('session_start',{mode:assignedMode,settings:{difficulty:s.difficulty,aiMode:s.aiMode},flow_version:FLOW_VERSION});enterFlow('consent');render()}
// Re-entry is available only for completed walkthroughs, never an active or formal session.
function canRestartWalkthrough(){return s?.stage==='done'&&s.is_test===true&&s.flow_status==='walkthrough_complete_with_placeholders';}
async function restartWalkthrough(){
 if(!canRestartWalkthrough()||pending)return;
 const previous=s;let raw;
 try{
  raw=localStorage.getItem(SESSION_KEY);const saved=raw?JSON.parse(raw):null;
  if(saved?.id!==previous.id||saved.stage!=='done'){showToast('任务记录已更新，请刷新页面后继续。');return;}
  const archiveKey='az-flow-v1-session-archive-'+crypto.randomUUID();
  localStorage.setItem(archiveKey,raw);
  if(localStorage.getItem(archiveKey)!==raw)throw Error('Archive could not be verified');
 }catch{restartError='旧记录暂时无法备份，未重新开始。请到研究者页面导出本机记录后再试。';render();return;}
 try{
  s=null;gameAccess=null;restartError='';await start(previous.id);
 }catch{
  // The verified archive remains intact even if the new session cannot be saved.
  s=previous;try{localStorage.setItem(SESSION_KEY,raw);}catch{}
  restartError='新流程暂时无法保存，旧记录已保留。请到研究者页面导出本机记录后再试。';render();
 }
}
function startRound(){s.draft=[0,0,0,0,0];s.goal=null;s.ai=null;s.aiSeen=false;s.aiAcknowledged=false;s.roundStarted=Date.now();s.stage='play';s.chatError='';s.adoptedMessageId=null;s.selfDecideRound=null;emit('round_open');render()}
function rowPopulationChange(row){return row&&Number.isFinite(row.before)&&Number.isFinite(row.after)?row.after-row.before:row?.delta??null;}
function populationChange(){return s?.rounds?.length?rowPopulationChange(s.rounds.at(-1)):s?.lastDelta??null;}
function clearAnimalRuntime(){animalObserver?.disconnect();animalObserver=null;if(animalTimer!==null)clearTimeout(animalTimer);animalTimer=null;if(animalFrame!==null)window.cancelAnimationFrame?.(animalFrame);animalFrame=null;}
function prepareAnimalMotion(row){
 clearAnimalRuntime();animalMotion=null;
 if(row.after===row.before||window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;
 animalMotion={sessionId:s.id,round:row.id,before:row.before,after:row.after,change:row.after-row.before,status:'waiting',node:null};
}
function currentAnimalMotion(){return animalMotion&&s?.stage==='feedback'&&animalMotion.sessionId===s.id&&animalMotion.round===s.rounds.at(-1)?.id&&animalMotion.status==='waiting'?animalMotion:null;}
function newAnimals(n,motion=null){
 const count=Math.max(0,Math.min(140,n));
 const living=Array.from({length:count},(_,i)=>{const arriving=motion?.change>0&&i>=motion.before;return `<span class="critter${arriving?' arriving':''}" ${arriving?`style="--animal-delay:${(i-motion.before)*70}ms"`:''} aria-hidden="true">•ᴗ•</span>`;}).join('');
 const lost=motion?.change<0?Math.min(motion.before-motion.after,140-count):0;
 return living+Array.from({length:lost},(_,i)=>`<span class="departing-critter" style="--animal-delay:${i*70}ms" aria-hidden="true"><span class="animal-alive-face">•ᴗ•</span><span class="animal-dead-face">×_×</span></span>`).join('');
}
function finishAnimalMotion(){
 const motion=animalMotion;clearAnimalRuntime();if(!motion)return;motion.status='done';
 const node=motion.node;if(!node?.isConnected)return;
 node.dataset.phase='done';const count=node.querySelector('[data-animal-count]');if(count)count.textContent=String(motion.after);
 node.querySelectorAll('.departing-critter').forEach(critter=>critter.remove());node.querySelectorAll('.arriving').forEach(critter=>critter.classList.remove('arriving'));
}
function startAnimalMotion(){
 const motion=currentAnimalMotion();if(!motion||!motion.node?.isConnected)return;
 animalObserver?.disconnect();animalObserver=null;
 const creatures=motion.node.querySelector('.creatures'),height=creatures.getBoundingClientRect().height;
 if(height>0)creatures.style.minHeight=height+'px';
 motion.status='running';motion.node.dataset.phase='running';
 const count=motion.node.querySelector('[data-animal-count]');
 if(typeof window.requestAnimationFrame==='function'){
  let started=null;const update=time=>{if(animalMotion!==motion||motion.status!=='running'||!motion.node.isConnected)return;if(started===null)started=time;const fraction=Math.min(1,(time-started)/1500);count.textContent=String(motion.before+Math.round(motion.change*fraction));if(fraction<1)animalFrame=window.requestAnimationFrame(update);};
  animalFrame=window.requestAnimationFrame(update);
 }else count.textContent=String(motion.after);
 animalTimer=setTimeout(finishAnimalMotion,ANIMAL_MOTION_MS);
}
function observeAnimalMotion(){
 const motion=currentAnimalMotion();if(!motion)return;
 motion.node=app.querySelector('.animal-card[data-phase="waiting"]');if(!motion.node)return;
 const changed=motion.node.querySelector('.arriving,.departing-critter');if(!changed)return finishAnimalMotion();
 if(typeof window.IntersectionObserver==='function'){
  animalObserver=new window.IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting&&entry.intersectionRatio>=0.4))startAnimalMotion();},{threshold:0.4});animalObserver.observe(changed);
 }else startAnimalMotion();
}
function goalBar(){const remaining=Math.max(0,LIMIT-s.rounds.length);return `<section class="goal" aria-label="任务目标"><div class="row between"><b class="goal-title">目标：${TARGET}只星绒兽</b><span class="goal-summary">当前 <b>${s.pack}</b> 只 · 剩余 ${remaining} 轮</span></div><div class="meter"><span style="width:${Math.min(100,Math.max(0,(s.pack-START)/(TARGET-START)*100))}%"></span></div><small>${s.pack>=TARGET?'已达到目标，请继续完成剩余轮次。':`距离目标还差 ${TARGET-s.pack} 只。`}</small></section>`}
function recipeInputs(){return `<div class="plants">${foods.map((f,i)=>`<div class="plant"><b>${f.name}</b><span class="icon">${f.icon}</span><input type="number" min="0" max="6" step="1" id="p${i}" value="${s.draft[i]}" aria-label="${f.name}份数"><span class="note">0—6份</span></div>`).join('')}</div>`}
function assistantPanel(includeRoundControls=true){
 const messages=s.chatHistory||[];
 return `<div class="chat-log" role="log" aria-label="AI对话记录" aria-live="polite">${messages.length?messages.map(m=>`<article class="chat-message ${m.role==='user'?'chat-user':'chat-assistant'}"><div class="chat-meta"><b>${m.role==='user'?'你':'AI助手'}</b><span>第${m.round}轮${m.role==='assistant'?' · 真实AI':''}</span></div><p class="chat-text">${esc(m.content)}</p>${s.mode==='delegation'&&m.recipe?foodCards(m.recipe,false):''}${m.role==='assistant'&&m.recipe&&s.mode==='delegation'&&m.round===s.rounds.length+1?`<button class="secondary" data-do="adopt" data-message-id="${esc(m.id)}" ${pending?'disabled':''}>一键填入食谱</button>`:''}${m.status==='failed'?'<small class="error">这条消息未获得AI回复。</small>':''}</article>`).join(''):''}${pending?'<div class="chat-waiting" role="status"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span> AI正在回复…</div>':''}</div><div class="chat-error" role="alert">${s.chatError?esc(s.chatError)+' <button class="ghost" data-do="retry-chat">重试上一条</button>':''}</div><form id="chatForm" class="chat-composer">${s.mode==='delegation'?`<div class="chat-shortcuts"><span class="muted">快捷提问</span><button type="button" class="secondary" data-do="fill-recipe-prompt" ${pending?'disabled':''}>请给我提供一份成功喂养的食谱。</button></div>`:''}<label class="sr-only" for="chatInput">向AI发送消息</label><textarea id="chatInput" rows="3" maxlength="2000" placeholder="输入你想问AI的问题…" ${pending?'disabled':''}>${esc(s.chatDraft||'')}</textarea><div class="row between"><small>Enter发送 · Shift+Enter换行</small><button type="submit" ${pending?'disabled':''}>${pending?'回复中…':'发送'}</button></div></form>${includeRoundControls?roundAIControls():''}`;
}
function roundAIControls(){return `${canChooseSelfDecision()&&!hasRoundReply()?`<div class="self-decide-option"><button type="button" class="ghost" data-do="self-decide" ${pending||selfDeciding()?'disabled':''}>${selfDeciding()?'本轮自行决定（已选择）':'本轮自行决定，不咨询AI'}</button></div>`:''}${hasRoundReply()?`<label class="row chat-ack"><input type="checkbox" id="aiAck" ${s.aiAcknowledged?'checked':''}><span>我已查看本轮AI回复</span></label>`:''}`;}
function mobileChat(){return ['delegation','augmentation'].includes(s?.mode)&&s.stage==='play'&&!!mobileChatMedia?.matches}
function releaseChatInert(){for(const [node,wasInert]of chatSheet.inertNodes)if(!wasInert)node.removeAttribute('inert');chatSheet.inertNodes=[];}
function lockChatBackground(){
 releaseChatInert();
 const card=app.querySelector('.chat-sheet-card');
 const nodes=[...app.children].filter(node=>node!==card);
 if(card)nodes.push(...[...card.children].filter(node=>!node.classList.contains('chat-sheet-surface')&&!node.classList.contains('chat-sheet-backdrop')));
 nodes.push(...document.querySelectorAll('body > header,body > #gameConnection'));
 for(const node of nodes){chatSheet.inertNodes.push([node,node.hasAttribute('inert')]);node.setAttribute('inert','');}
}
function updateChatViewport(){
 const surface=document.getElementById('aiChatSheet');if(!surface||!chatSheet.open)return;
 const viewport=window.visualViewport;
 surface.style.setProperty('--chat-sheet-max-height',Math.max(140,(viewport?.height||window.innerHeight)-12)+'px');
 surface.style.setProperty('--chat-sheet-bottom',Math.max(0,window.innerHeight-(viewport?.height||window.innerHeight)-(viewport?.offsetTop||0))+'px');
}
function syncChatLayout(){
 const surface=document.getElementById('aiChatSheet'),opener=app.querySelector('[data-do="open-ai-sheet"]');if(!surface)return;
 if(!mobileChat()&&chatSheet.open)closeChatSheet(false);
 const mobile=mobileChat();surface.closest('.chat-sheet-card').classList.toggle('mobile-chat-layout',mobile);surface.hidden=mobile&&!chatSheet.open;
 const close=surface.querySelector('[data-do="close-ai-sheet"]');if(close)close.hidden=!mobile;
 if(mobile){surface.setAttribute('role','dialog');surface.setAttribute('aria-labelledby','aiSheetTitle');}else{surface.removeAttribute('role');surface.removeAttribute('aria-labelledby');}
 if(chatSheet.open){surface.setAttribute('aria-modal','true');lockChatBackground();updateChatViewport();const log=surface.querySelector('.chat-log');if(log)log.scrollTop=chatSheet.logTop??log.scrollHeight;surface.querySelector('[data-do="close-ai-sheet"]')?.focus({preventScroll:true});}else surface.removeAttribute('aria-modal');
 const backdrop=app.querySelector('.chat-sheet-backdrop');if(backdrop)backdrop.hidden=!chatSheet.open;
 if(opener){opener.hidden=!mobile;opener.setAttribute('aria-expanded',String(chatSheet.open));}
}
function openChatSheet(){
 if(!mobileChat()||chatSheet.open)return;
 const surface=document.getElementById('aiChatSheet');if(!surface)return;
 chatSheet.scrollX=window.scrollX;chatSheet.scrollY=window.scrollY;chatSheet.focusReturn=app.querySelector('[data-do="open-ai-sheet"]');
 const body=document.body;chatSheet.bodyStyles={position:body.style.position,top:body.style.top,left:body.style.left,width:body.style.width,overflow:body.style.overflow,paddingRight:body.style.paddingRight};
 const scrollbarGap=window.innerWidth-document.documentElement.clientWidth;
 if(scrollbarGap>0&&document.documentElement.clientWidth>0)body.style.paddingRight=(parseFloat(getComputedStyle(body).paddingRight)||0)+scrollbarGap+'px';
 body.style.position='fixed';body.style.top=-chatSheet.scrollY+'px';body.style.left=-chatSheet.scrollX+'px';body.style.width='100%';body.style.overflow='hidden';
 chatSheet.open=true;syncChatLayout();emit('ai_sheet_opened');
}
function closeChatSheet(restoreFocus=true){
 if(!chatSheet.open)return;
 const surface=document.getElementById('aiChatSheet'),input=document.getElementById('chatInput'),log=surface?.querySelector('.chat-log');
 if(log)chatSheet.logTop=log.scrollTop;
 if(s&&input){s.chatDraft=input.value;if(document.activeElement===input)input.blur();}
 chatSheet.open=false;releaseChatInert();
 if(surface){surface.hidden=mobileChat();surface.removeAttribute('aria-modal');}
 const backdrop=app.querySelector('.chat-sheet-backdrop');if(backdrop)backdrop.hidden=true;
 const opener=app.querySelector('[data-do="open-ai-sheet"]');opener?.setAttribute('aria-expanded','false');
 if(chatSheet.bodyStyles)Object.assign(document.body.style,chatSheet.bodyStyles);chatSheet.bodyStyles=null;
 window.scrollTo({left:chatSheet.scrollX,top:chatSheet.scrollY,behavior:'instant'});
 if(restoreFocus&&(chatSheet.focusReturn?.isConnected||opener))(chatSheet.focusReturn?.isConnected?chatSheet.focusReturn:opener).focus({preventScroll:true});
 emit('ai_sheet_closed');
}
function responsiveAssistantCard(){return `<section class="card conversation-card chat-sheet-card" aria-labelledby="conversationHeading"><span class="section-kicker">AI助手</span><h2 id="conversationHeading">向AI询问什么？</h2><p class="muted">${s.mode==='delegation'?'你可以请AI提供一份本轮食谱，再决定是否采用。':'你可以自由提问和追问，AI会提供分析思路与反馈，食谱由你决定。'}</p><button type="button" class="chat-sheet-open" data-do="open-ai-sheet" aria-haspopup="dialog" aria-controls="aiChatSheet" aria-expanded="false" hidden>打开AI助手</button><p class="chat-round-status" aria-live="polite">${pending?'AI正在回复，你可以稍后打开查看。':hasRoundReply()?'已收到本轮AI回复，可以打开查看。':'可随时打开AI助手，继续当前对话。'}</p><div class="chat-sheet-backdrop" data-do="close-ai-sheet" aria-hidden="true" hidden></div><div class="chat-sheet-surface" id="aiChatSheet"><div class="chat-sheet-heading"><h3 id="aiSheetTitle">AI助手</h3><span class="chat-recipe-status" role="status"></span><button type="button" class="ghost" data-do="close-ai-sheet" aria-label="关闭AI助手" hidden>关闭</button></div><div class="chat-sheet-body">${assistantPanel(false)}</div></div><div class="chat-round-controls">${roundAIControls()}</div></section>`;}
mobileChatMedia?.addEventListener('change',()=>syncChatLayout());
window.visualViewport?.addEventListener('resize',updateChatViewport);
window.visualViewport?.addEventListener('scroll',updateChatViewport);
document.addEventListener('keydown',event=>{
 if(!chatSheet.open)return;
 if(event.key==='Escape'){event.preventDefault();closeChatSheet();return;}
 if(event.key!=='Tab')return;
 const surface=document.getElementById('aiChatSheet');
 const controls=[...surface.querySelectorAll('button:not(:disabled),textarea:not(:disabled),input:not(:disabled),a[href]')].filter(node=>node.tabIndex>=0&&!node.hidden&&!node.closest('[hidden]'));
 const first=controls[0],last=controls.at(-1);if(!first)return;
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus({preventScroll:true});}
 else if(!event.shiftKey&&document.activeElement===last||!surface.contains(document.activeElement)){event.preventDefault();first.focus({preventScroll:true});}
});
function hasRoundReply(){return s?.ai?.source==='real'&&s.ai.round===s.rounds.length+1}
function completedAIConsultationRounds(){return new Set((s?.rounds||[]).filter(r=>r.aiSource==='real'&&r.aiConsulted!==false).map(r=>r.id)).size}
function canChooseSelfDecision(){return s?.mode==='augmentation'&&completedAIConsultationRounds()>=B_MIN_AI_ROUNDS}
function selfDeciding(){return canChooseSelfDecision()&&s.selfDecideRound===s.rounds.length+1&&!hasRoundReply()}
function canFeed(){return s?.stage==='play'&&!pending&&((hasRoundReply()&&s.aiAcknowledged)||selfDeciding())}
function feedingHint(){return s.mode==='delegation'?'请先查看并确认AI回复，再提交本轮食谱。你可以自行修改AI建议。':hasRoundReply()?'请查看并确认本轮AI反馈，再决定食谱并投喂。':!canChooseSelfDecision()?'请先与AI交流，并查看确认本轮回复后投喂。':selfDeciding()?'本轮由你自行决定食谱。你仍可向AI提问，下一轮也可以重新咨询。':'你可以向AI提问，或选择“本轮自行决定，不咨询AI”后投喂。'}
function animalPanel(currentRound=false){
 const motion=currentRound?currentAnimalMotion():null,change=populationChange();
 const label=change===null?'':change===0?`${currentRound?'本轮':'上一轮'}数量不变`:`${currentRound?'本轮':'上一轮'}${change>0?'增加':'减少'} ${Math.abs(change)} 只`;
 return `<section class="card animal-card${motion?' animal-motion':''}" ${motion?`data-phase="waiting" data-motion="${change>0?'increase':'decrease'}"`:''}><div class="row between"><h2>星绒兽</h2><span class="large"><span data-animal-count>${motion?motion.before:s.pack}</span><small> 只</small></span></div>${label?`<p class="delta ${change<0?'down':'up'}">${label}</p>`:''}<div class="zoo"><div class="creatures" aria-label="当前共有${s.pack}只星绒兽">${newAnimals(s.pack,motion)}</div>${motion?`<span class="animal-change-burst" aria-hidden="true">${change>0?'+':''}${change}</span>`:''}</div></section>`;
}
function renderPlay(){
 const n=s.rounds.length+1;
 if(chatSheet.open){const log=app.querySelector('.chat-log');if(log)chatSheet.logTop=log.scrollTop;}
 const recipe=`<section class="card recipe-card" aria-labelledby="recipeHeading"><span class="section-kicker">本轮选择</span><h2 id="recipeHeading">请选择你此轮的食谱</h2>${recipeInputs()}<div id="formError" class="error" aria-live="polite"></div></section>`;
 app.innerHTML=`<div class="row between round-heading"><span class="tag">第 ${n} / ${LIMIT} 轮</span><button class="exit-button" data-do="exit">退出任务</button></div>${goalBar()}${historyPanel()}${responsiveAssistantCard()}${recipe}<section class="card feeding-card">${feedControls()}</section>${animalPanel()}`;
 syncChatLayout();updateClock();
}
function historyPanel(){return `<section class="card history-card" aria-labelledby="historyHeading"><h2 id="historyHeading">投喂记录</h2>${s.rounds.length?recipeTable(s.rounds):'<p class="muted">完成首次投喂后，这里会显示你的食谱和结果。</p>'}</section>`}
function feedControls(){return `<div class="buttons feed-actions">${isManaging?'<button class="secondary" data-do="export">导出记录</button>':''}<button data-do="feed" ${!canFeed()?'disabled':''}>确认投喂</button></div>${s.timed?'<div id="clock" class="muted" aria-live="polite"></div>':''}<p class="muted" id="feedingHint" aria-live="polite">${feedingHint()}</p>`}
function updateClock(){if(ticker)clearInterval(ticker);if(!s?.timed||s.stage!=='play')return;const clock=document.getElementById('clock');if(!clock)return;function tick(){if(s?.stage!=='play'){clearInterval(ticker);return}const elapsed=Math.floor((Date.now()-s.roundStarted)/1000);const remaining=120-elapsed;clock.textContent=remaining>=0?`本轮剩余：${remaining}秒`:'本轮已超时，已记录用时。';if(remaining===-1){emit('round_time_limit_reached')}}tick();ticker=setInterval(tick,1000)}
function renderFeedback(){const change=populationChange();app.innerHTML=`${goalBar()}${historyPanel()}<section class="card"><h2>本轮结果</h2><p class="delta ${change>=0?'up':'down'}">${change===0?'本轮数量不变':`小动物${change>0?'增加':'减少'} ${Math.abs(change)} 只`}，目前共 ${s.pack} 只。</p><p>请对照食谱与结果，再决定下一轮的选择。</p><div class="buttons"><button data-do="next">${s.rounds.length>=LIMIT?'进入独立测试':'继续投喂'}</button>${isManaging?'<button class="secondary" data-do="export">导出记录</button>':''}</div></section>${animalPanel(true)}`;observeAnimalMotion();}
// Final selection always uses executed rounds.x, never an AI suggestion or example recipe.
function executedRecipesValid(){return Array.isArray(s.rounds)&&s.rounds.length===LIMIT&&s.rounds.every((row,i)=>row&&row.id===`R${i+1}`&&Array.isArray(row.x)&&row.x.length===foods.length&&row.x.every(n=>Number.isInteger(n)&&n>=0&&n<=6));}
function postTestComplete(){return s.tests?.phase==='complete'&&!!s.tests.score&&s.flow_steps?.independent_test?.status==='completed';}
function selectedRecipeValid(){const n=s.final_recipe_round,source=s.final_recipe_source;return postTestComplete()&&executedRecipesValid()&&Number.isInteger(n)&&n>=1&&n<=LIMIT&&source?.participant_id===s.id&&source?.mode===s.mode&&source?.row_id===`R${n}`&&Array.isArray(s.final_recipe)&&s.final_recipe.length===foods.length&&s.final_recipe.every((v,i)=>v===s.rounds[n-1].x[i])&&!!s.final_recipe_confirmed_at;}
function renderRecipeError(){app.innerHTML=`<section class="card"><h2>食谱记录暂时无法核对</h2><p role="alert">十轮投喂记录、独立测试状态或最终选择记录缺失或不一致，暂不能继续。请联系研究者核对；已保存的原始记录会保留。</p><div class="buttons"><button class="secondary" data-do="recipe-recheck">重新核对</button>${postTestComplete()&&executedRecipesValid()&&!s.final_recipe_confirmed_at?'<button data-do="recipe-select-existing">选择最终食谱</button>':''}<button class="secondary" data-do="export">导出本次记录</button><button class="ghost" data-do="exit">退出流程</button></div></section>`;}
function renderRecipeSelection(){
 if(!postTestComplete()||!executedRecipesValid())return renderRecipeError();
 const candidate=s.final_recipe_candidate_round;
 app.innerHTML=`<section class="card final-selection"><h2>最终食谱选择</h2><p>您已经完成了10轮喂养任务。</p><p>现在，请回顾刚才使用过的食谱。</p><p><b>如果需要重新进行一次喂养，您会选择刚才哪一轮的食谱？</b></p><p>请从以下10份食谱中选择一份，作为本次任务最终提交的食谱。</p><p>本环节不会再次进行喂养，也不会产生新的喂养结果。</p><form id="finalRecipeForm"><fieldset class="final-recipe-options"><legend class="sr-only">选择一轮食谱</legend>${s.rounds.map((row,i)=>`<label class="final-recipe-option"><input type="radio" name="final_recipe_round" value="${i+1}" required ${candidate===i+1?'checked':''}><span class="final-recipe-option-body"><strong>第${i+1}轮</strong>${foodCards(row.x,false).replace('<div','<span').replace('</div>','</span>')}</span></label>`).join('')}</fieldset><button type="submit" id="confirmFinalRecipe" ${Number.isInteger(candidate)&&candidate>=1&&candidate<=LIMIT?'':'disabled'}>确认选择</button></form></section>`;
 document.getElementById('finalRecipeForm').addEventListener('submit',event=>{event.preventDefault();if(s.stage!=='final_recipe_selection'||!postTestComplete()||!executedRecipesValid())return renderRecipeError();const n=Number(new FormData(event.target).get('final_recipe_round'));if(!Number.isInteger(n)||n<1||n>LIMIT)return;
 s.final_recipe_round=n;s.final_recipe=[...s.rounds[n-1].x];s.final_recipe_source={participant_id:s.id,mode:s.mode,row_id:s.rounds[n-1].id};s.final_recipe_confirmed_at=new Date().toISOString();s.final_recipe_display_started_at=null;s.final_recipe_display_completed_at=null;
 emit('final_recipe_confirmed',{selected_round:n,recipe:[...s.final_recipe],source:'rounds.x'});advanceFlow();});
}
function selectedRecipeCard(animated=false,elapsed=0){return `<section class="card selected-recipe-card${animated?' recipe-reveal':''}" ${animated?`style="animation-delay:-${elapsed}ms"`:''} aria-label="最终选择的食谱"><h2>最终提交的食谱</h2><p>第${s.final_recipe_round}轮</p>${foodCards(s.final_recipe,false)}</section>`;}
function ownershipGuidance(){return '<section class="card ownership-guidance"><p>请查看上方展示的食谱卡。</p><p>这是您在刚才的任务中最终选择并提交的食谱。</p><p>以下题目中的“这份任务成果”，均指这份食谱。</p><p>请根据您的真实感受作答。</p></section>';}
function renderRecipeDisplay(){
 if(!selectedRecipeValid())return renderRecipeError();
 if(!s.final_recipe_display_started_at){s.final_recipe_display_started_at=new Date().toISOString();emit('final_recipe_display_started',{selected_round:s.final_recipe_round});}
 const elapsed=Math.max(0,Date.now()-Date.parse(s.final_recipe_display_started_at)),remaining=s.final_recipe_display_completed_at?0:Math.max(0,RECIPE_DISPLAY_MS-elapsed);
 app.innerHTML=selectedRecipeCard(remaining>0,elapsed)+`<section class="card"><p>请查看上方展示的食谱卡。</p><button data-do="recipe-display-next" ${remaining>0?'disabled':''}>继续</button></section>`;
 const finish=()=>{recipeDisplayTimer=null;if(s?.stage!=='final_recipe_display')return;if(!s.final_recipe_display_completed_at){s.final_recipe_display_completed_at=new Date().toISOString();emit('final_recipe_display_completed',{selected_round:s.final_recipe_round});}const button=app.querySelector('[data-do=recipe-display-next]');if(button)button.disabled=false;};
 if(remaining>0)recipeDisplayTimer=setTimeout(finish,remaining);else finish();
}
function relevantKey(){return s.difficulty==='basic'?[1,3]:[1,2,3]}
function ruleOptions(){return [{id:'condition',label:'蓝铃叶和珊瑚枝的搭配会改变效果，过量也可能不利。'},{id:'three',label:'蓝铃叶、星冠蕨、珊瑚枝共同决定结果，某些数量组合会产生不同效果。'},{id:'more',label:'五种植物都是越多越好。'},{id:'total',label:'只由五种植物的总份数决定。'},{id:'unknown',label:'我仍不确定。'}]}
function ruleLabel(text){let label=esc(text);for(const food of foods)label=label.replaceAll(food.name,`<span class="food">${food.icon} ${food.name}</span>`);if(text.startsWith('五种植物')||text.startsWith('只由五种植物'))label='<span aria-hidden="true">'+foods.map(f=>f.icon).join(' ')+'</span> '+label;return label}
function renderTest(){const t=s.tests;const step=t.phase;let form='';if(step==='prediction')form=`<h3>判断4份新食谱</h3><p>每一题都从20只开始。请判断喂完后，小动物是增加、减少还是不变。</p>${testRecipes.map((x,i)=>`<div class="test-row"><label>食谱${i+1}</label>${foodCards(x,false)}<div class="choices">${['增加','减少','不变','不确定'].map(a=>`<label><input type="radio" name="q${i}" value="${a}" required>${a}</label>`).join('')}</div></div>`).join('')}`;
 else if(step==='relevance')form=`<h3>判断哪些植物会影响结果</h3><p>请分别判断；不确定可以如实选择。</p>${foods.map((f,i)=>`<div class="test-row"><label>${f.icon} ${f.name}</label><select name="r${i}" required><option value="">请选择</option><option>有影响</option><option>没有影响</option><option>不确定</option></select></div>`).join('')}`;
 else form=`<h3>选择你认为最符合观察的规律</h3><div class="test-row">${ruleOptions().map(o=>`<label class="rule-option"><input type="radio" name="rule" value="${o.id}" required><span>${ruleLabel(o.label)}</span></label>`).join('')}</div>`;
 app.innerHTML=`<section class="card"><span class="tag">独立测试 · ${step==='prediction'?'1/3 食谱预测':step==='relevance'?'2/3 植物判断':'3/3 规律判断'}</span><h2 style="margin-top:9px">请独立作答</h2><p>AI和投喂记录已收起。每份食谱都显示植物名称、图标和数量，无需记住数字顺序。</p><form id="testForm">${form}<button type="submit">${step==='rule'?'提交全部答案':'提交并继续'}</button></form></section>`;
 document.getElementById('testForm').addEventListener('submit',e=>{e.preventDefault();const a=Object.fromEntries(new FormData(e.target));Object.assign(t.answers,a);emit('test_section_submitted',{phase:step,answers:a});if(step==='prediction')t.phase='relevance';else if(step==='relevance')t.phase='rule';else {t.phase='complete';t.score=scoreTest();emit('independent_test_complete',{score:t.score});advanceFlow();return}persist();render()})}
function scoreTest(){const a=s.tests.answers;const key=testRecipes.map(x=>outcome(x,s.difficulty));const pred=key.map((v,i)=>a['q'+i]===(v>0?'增加':v<0?'减少':'不变'));const relev=foods.map((_,i)=>a['r'+i]===(relevantKey().includes(i)?'有影响':'没有影响'));return {prediction:pred.filter(Boolean).length,relevance:relev.filter(Boolean).length,rule:Number(a.rule===(s.difficulty==='advanced'?'three':'condition')),predictionKey:key}}
function results(){const t=s.tests||{},c=t.score||scoreTest();app.innerHTML=`<section class="card"><span class="section-kicker">流程已走完</span><h2>本次流程核对结束</h2><p class="notice">喂养游戏与独立测试已完成；其余环节为占位通过，尚未取得正式知情同意，也未采集对应问卷或图形任务作答。</p><p>完成${s.rounds.length}次投喂，星绒兽最终 <b>${s.pack}只</b>，${s.pack>=TARGET?'达到':'未达到'}55只目标。</p><div class="row"><span class="pill">食谱判断 ${c.prediction}/4</span><span class="pill">植物判断 ${c.relevance}/5</span><span class="pill">规律判断 ${c.rule}/1</span></div><div class="buttons"><span class="muted">本次流程已结束，可以关闭页面。</span>${canRestartWalkthrough()?'<button data-do="restart-walkthrough">保留记录，重新开始</button>':''}${isManaging?'<button data-do="export">导出本次记录</button><button class="ghost" data-do="reset">重置本机记录</button>':''}</div>${canRestartWalkthrough()?'<p class="muted">重新开始会保留本次记录，并创建新的记录编号。</p>':''}${restartError?'<p class="error" role="alert">'+esc(restartError)+' <a href="researcher.html">打开研究者页面</a></p>':''}${isManaging?`<div class="notice">流程顺序已接入，未定稿的知情同意、量表及图形材料仍为占位；不作为正式施测完成记录。</div><details><summary>研究者核对：规则与测试答案</summary><p>难度：${s.difficulty}。正确的食谱变化：${c.predictionKey.map(n=>n>0?'增加':n<0?'减少':'不变').join('、')}。</p></details>`:''}</section>`}
function render(){if(recipeDisplayTimer!==null){clearTimeout(recipeDisplayTimer);recipeDisplayTimer=null;}if(animalMotion?.status==='running')finishAnimalMotion();clearAnimalRuntime();if(s?.stage!=='feedback')animalMotion=null;if(chatSheet.open&&(!s||s.stage!=='play'||!['delegation','augmentation'].includes(s.mode)))closeChatSheet(false);if(ticker&&s?.stage!=='play'){clearInterval(ticker);ticker=null;}if(!s)return home();if(s.stage==='final_recipe_selection')return renderRecipeSelection();if(s.stage==='final_recipe_display')return renderRecipeDisplay();if(FLOW_STEPS.some(x=>x.placeholder&&x.id===s.stage))return renderPlaceholder();if(s.stage==='play')return renderPlay();if(s.stage==='feedback')return renderFeedback();if(s.stage==='test')return renderTest();if(s.stage==='done')return results();if(s.stage==='exited')return locked('你已退出本次任务。');home()}
function valid(){return s.draft.length===5&&s.draft.every(x=>Number.isInteger(x)&&x>=0&&x<=6)}
async function accessForGame(session){
 if(gameAccess&&gameAccess.sid===session.id&&gameAccess.mode===session.mode&&gameAccess.expires>Date.now()+10000)return gameAccess.token;
 const r=await fetch(APP_CONFIG.API_BASE+'/game/access',{method:'POST',headers:{'Content-Type':'application/json',apikey:APP_CONFIG.SUPABASE_KEY},body:JSON.stringify({session_id:session.id,mode:session.mode}),signal:AbortSignal.timeout(15000)});
 const body=await r.json();if(!r.ok)throw Error(body.error||'AI连接尚未准备好，请重试。');if(typeof body.token!=='string')throw Error('AI连接未成功，请重试。');
 gameAccess={sid:session.id,mode:session.mode,token:body.token,expires:Date.now()+Math.min(body.expires_in||0,7200)*1000};return body.token;
}
async function sendChat(){
 if(!s||s.stage!=='play'||pending)return;
 const text=(s.chatDraft||'').trim();if(!text){showToast('请先输入想问AI的问题。');return}if(text.length>2000){showToast('每条消息请控制在2000字以内。');return}
 if(!valid()){showToast('每种植物只能填0—6之间的整数。');return}
 const session=s,round=s.rounds.length+1;session.chatHistory=session.chatHistory||[];
 const turn={id:crypto.randomUUID(),role:'user',content:text,round,status:'pending',at:new Date().toISOString()};session.chatHistory.push(turn);session.chatDraft='';session.chatError='';session.aiAcknowledged=false;session.selfDecideRound=null;session.aiMode='real';pending=true;
 emit('ai_requested',{message_id:turn.id,message:text,recipe:[...session.draft],source:'real'});render();
 try{
  const token=await accessForGame(session);
  let messages=session.chatHistory.filter(m=>m.status!=='failed').map(m=>({role:m.role,content:m.role==='assistant'?JSON.stringify({text:m.content,...(session.mode==='delegation'&&m.recipe?{recipe:m.recipe}:{})}):m.content})).slice(-21);
  while(messages.length>1&&messages.reduce((n,m)=>n+m.content.length,0)>13000)messages.shift();
  const r=await fetch(APP_CONFIG.API_BASE+'/game/chat',{method:'POST',headers:{'Content-Type':'application/json',apikey:APP_CONFIG.SUPABASE_KEY,'X-Game-Token':token},body:JSON.stringify({session_id:session.id,mode:session.mode,round,difficulty:session.difficulty,recipe:session.draft,history:session.rounds.map(x=>({id:x.id,x:x.x,delta:rowPopulationChange(x)})),messages}),signal:AbortSignal.timeout(55000)});
  const body=await r.json();if(!r.ok){if(r.status===401)gameAccess=null;throw Error(body.error||'AI暂时无法回复，请重试。')}
  if((session.mode==='delegation'&&body.recipe!=null&&(!Array.isArray(body.recipe)||body.recipe.length!==5||body.recipe.some(n=>!Number.isInteger(n)||n<0||n>6)))||typeof body.text!=='string'||!body.text.trim()||body.source!=='real')throw Error('AI回复未成功，请重试。');
  if(s!==session||s.stage!=='play'||s.rounds.length+1!==round)return;
  turn.status='sent';const reply={id:crypto.randomUUID(),role:'assistant',content:body.text,round,source:'real',status:'sent',at:new Date().toISOString(),model:body.model||null,...(session.mode==='delegation'&&Array.isArray(body.recipe)?{recipe:body.recipe,...(Number.isInteger(body.expected_delta)?{expectedDelta:body.expected_delta,recipeRuleVersion:body.recipe_rule_version,recipeStrategyVersion:body.recipe_strategy_version}:{})}:{})};session.chatHistory.push(reply);
  session.ai={id:reply.id,text:reply.content,recipe:reply.recipe,round,source:'real',model:reply.model,expectedDelta:reply.expectedDelta,recipeRuleVersion:reply.recipeRuleVersion,recipeStrategyVersion:reply.recipeStrategyVersion,shownAt:Date.now()};emit('ai_response_shown',{message_id:reply.id,source:'real',text:reply.content,recipe:reply.recipe||null,model:reply.model});
 }catch(error){
  if(s!==session)return;turn.status='failed';session.chatError=error.name==='TimeoutError'?'AI回复超时，请重试上一条消息。':error.message||'AI连接失败，请重试。';emit('real_ai_failed',{message_id:turn.id,error:session.chatError});
 }finally{
  if(s===session){pending=false;persist();render();const log=app.querySelector('.chat-log');if(log&&(!mobileChat()||chatSheet.open)){log.scrollTop=log.scrollHeight;if(mobileChat())chatSheet.logTop=log.scrollTop;}}
 }
}
function feed(){
 if(!s||s.stage!=='play'||pending)return;
 if(!valid()){showToast('每种植物只能填0—6之间的整数');return}
 if(!canFeed()){showToast(s.mode==='augmentation'?feedingHint():'请先与AI对话，并查看确认本轮回复。');return}
 const round=s.rounds.length+1,consulted=hasRoundReply(),requested=(s.chatHistory||[]).some(m=>m.round===round&&m.role==='user')||(s.events||[]).some(e=>e.round===round&&e.type==='ai_requested');
 const x=[...s.draft],d=outcome(x,s.difficulty),before=s.pack;
 const row={id:`R${round}`,x,delta:d,before,after:Math.max(0,before+d),aiSource:consulted?s.ai.source:null,aiText:consulted?s.ai.text:null,aiRecipe:consulted?s.ai.recipe:null,aiGoal:s.goal,roundSeconds:Math.round((Date.now()-s.roundStarted)/1000),aiAcknowledged:consulted&&s.aiAcknowledged,aiExpectedDelta:consulted?(s.ai.expectedDelta??null):null,aiRecipeRuleVersion:consulted?(s.ai.recipeRuleVersion??null):null,aiRecipeStrategyVersion:consulted?(s.ai.recipeStrategyVersion??null):null,adoptedMessageId:s.adoptedMessageId||null,aiConsulted:consulted,aiRequested:requested,aiUseStatus:consulted?'consulted':requested?'requested_without_reply':'not_consulted',selfDecidedWithoutReply:selfDeciding(),aiParticipationPolicy:s.mode==='augmentation'?'b-min3-rounds-v1':'required-v1',...(s.mode==='augmentation'?{minimumAIConsultationRounds:B_MIN_AI_ROUNDS,completedAIConsultationRounds:completedAIConsultationRounds()+(consulted?1:0)}:{})};
 s.rounds.push(row);s.pack=Math.max(0,s.pack+d);s.lastDelta=d;s.stage='feedback';prepareAnimalMotion(row);emit('feeding_complete',{row});render();
}
function next(){if(s.rounds.length>=LIMIT){s.tests={phase:'prediction',answers:{},score:null};advanceFlow();emit('assistant_removed_for_test');return}startRound()}
function exit(){if(!s||s.stage==='exited')return;if(!confirm('确定退出当前任务吗？已保存内容会保留；如果是误退出，可以在本页继续原任务。'))return;s.exit_info={from:s.stage,at:new Date().toISOString(),flow_status:s.flow_status};emit('session_exited',{from:s.stage});s.flow_status='exited';if(s.flow_steps?.[s.flow_current]){s.flow_steps[s.flow_current].status='exited';s.flow_steps[s.flow_current].exited_at=new Date().toISOString();}s.stage='exited';persist();render()}
function downloadData(){if(!s)return;emit('data_export');const json=JSON.stringify(s,null,2);const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([json],{type:'application/json'}));a.download=`AlienZoo-preview-${s.mode}-${s.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000)}
app.addEventListener('input',e=>{if(e.target.id==='chatInput'&&s){s.chatDraft=e.target.value;persist();return}const m=e.target.id?.match(/^p([0-4])$/);if(!m||!s)return;s.draft[+m[1]]=e.target.value===''?NaN:Number(e.target.value);emit('recipe_input',{plant:+m[1]+1,value:s.draft[+m[1]]});persist()});
app.addEventListener('change',e=>{if(e.target.name==='final_recipe_round'&&s?.stage==='final_recipe_selection'){const n=Number(e.target.value);if(Number.isInteger(n)&&n>=1&&n<=LIMIT){s.final_recipe_candidate_round=n;persist();document.getElementById('confirmFinalRecipe').disabled=false;}return;}if(e.target.id==='aiAck'&&s&&s.stage==='play'){s.aiAcknowledged=e.target.checked;emit('ai_acknowledged',{yes:s.aiAcknowledged,elapsedMs:s.ai?.shownAt?Date.now()-s.ai.shownAt:null});const feed=app.querySelector('[data-do=feed]');if(feed)feed.disabled=!canFeed();}});
app.addEventListener('click',async e=>{const b=e.target.closest('[data-do]');if(!b)return;const action=b.dataset.do;if(action==='save-settings'){settings.difficulty=document.getElementById('setDifficulty').value;settings.aiMode='real';settings.apiBase=document.getElementById('setApiBase').value.trim()||defaults.apiBase;settings.timed=document.getElementById('setTimed').value==='yes';persist();home();showToast('设置已保存');return}
 if(action==='reset'){if(!confirm('清除当前入口的本机记录并重新开始？'))return;s=null;pending=false;persist();home();return}
 if(action==='start')return start();if(action==='restart-walkthrough')return restartWalkthrough();if(action==='resume')return render();if(!s)return;
 if(action==='recipe-recheck')return render();
 if(action==='recipe-select-existing'){if(postTestComplete()&&executedRecipesValid()&&!s.final_recipe_confirmed_at){enterFlow('final_recipe_selection');render();}return}
 if(action==='recipe-display-next'){if(s.stage==='final_recipe_display'&&selectedRecipeValid()&&s.final_recipe_display_completed_at)advanceFlow();return}
 if(action==='flow-next'){if(s.stage==='psychological_ownership'&&!selectedRecipeValid())return renderRecipeError();if(FLOW_STEPS.some(x=>x.placeholder&&x.id===s.stage))advanceFlow();return}
 if(action==='open-ai-sheet')return openChatSheet();if(action==='close-ai-sheet')return closeChatSheet();
 if(action==='recover-exit')return recoverExit();
 if(action==='self-decide'){
  if(!canChooseSelfDecision()||s.stage!=='play'||pending||hasRoundReply())return;
  s.selfDecideRound=s.rounds.length+1;emit('round_self_decision_selected');
  b.disabled=true;b.textContent='本轮自行决定（已选择）';
  const feed=app.querySelector('[data-do=feed]');if(feed)feed.disabled=!canFeed();
  const hint=document.getElementById('feedingHint');if(hint)hint.textContent=feedingHint();return;
 }
 if(action==='exit')return exit();if(action==='adopt'){const message=(s.chatHistory||[]).find(m=>m.id===b.dataset.messageId);if(s.mode==='delegation'&&message?.recipe&&message.round===s.rounds.length+1){s.draft=[...message.recipe];s.adoptedMessageId=message.id;for(let i=0;i<foods.length;i++){const input=document.getElementById('p'+i);if(input)input.value=String(s.draft[i]);}emit('ai_recipe_adopted',{message_id:message.id,recipe:message.recipe});const status=app.querySelector('.chat-recipe-status');if(status)status.textContent='食谱已填入';}return}
 if(action==='fill-recipe-prompt'){if(s.mode!=='delegation'||s.stage!=='play'||pending)return;s.chatDraft='请给我提供一份成功喂养的食谱。';const input=document.getElementById('chatInput');input.value=s.chatDraft;input.focus({preventScroll:true});input.setSelectionRange(input.value.length,input.value.length);emit('chat_prompt_filled',{prompt:s.chatDraft});return}
 if(action==='retry-chat'){const last=[...(s.chatHistory||[])].reverse().find(m=>m.role==='user'&&m.status==='failed');if(last){s.chatDraft=last.content;return sendChat()}return}
 if(action==='feed')return feed();if(action==='next')return next();if(action==='export')return downloadData()});
if(validEntry)render();else app.innerHTML='<section class="card"><h2>分组链接无效</h2><p>请使用根链接、?group=A 或 ?group=B。</p></section>';

app.addEventListener('submit',e=>{if(e.target.id!=='chatForm')return;e.preventDefault();sendChat()});
app.addEventListener('keydown',e=>{if(e.target.id==='chatInput'&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();sendChat()}});
