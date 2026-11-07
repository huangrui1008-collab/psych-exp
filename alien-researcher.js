'use strict';
(()=>{
 const el=id=>document.getElementById(id);let games=[];
 const stages={play:'投喂中',feedback:'查看投喂结果',test:'独立测试',done:'已完成',exited:'已退出并锁定'};
 function valid(r){return r&&r.version==='0.6.0'&&typeof r.id==='string'&&['delegation','augmentation'].includes(r.mode)&&Array.isArray(r.rounds)&&r.rounds.length<=10;}
 function sources(r){return [...new Set(r.rounds.map(x=>x.aiSource).filter(Boolean))].map(s=>s==='real'?'真实API':s==='mock'?'模拟AI':s).join('、')||(r.aiMode==='real'?'真实API模式（尚无投喂）':'模拟AI');}
 function render(){
  el('gameRows').replaceChildren();
  for(const r of games){const tr=document.createElement('tr');for(const value of [r.id,r.mode==='delegation'?'A · AI先出食谱':'B · 自己先想再问AI',stages[r.stage]||r.stage,r.rounds.length+'/10',r.pack,sources(r)]){const td=document.createElement('td');td.textContent=String(value??'');tr.appendChild(td);}const td=document.createElement('td'),button=document.createElement('button');button.textContent='查看';button.addEventListener('click',()=>{el('gameDetail').textContent=JSON.stringify(r,null,2);el('gameDetail').parentElement.open=true;});td.appendChild(button);tr.appendChild(td);el('gameRows').appendChild(tr);}
  if(!games.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=7;td.textContent='本浏览器尚无游戏记录。可先试玩或导入游戏导出文件。';tr.appendChild(td);el('gameRows').appendChild(tr);}
  el('gameExportJson').disabled=!games.length;el('gameExportCsv').disabled=!games.length;
 }
 function load(){games=[];try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key.startsWith('az-preview-v06-session')){const r=JSON.parse(localStorage.getItem(key));if(valid(r))games.push(r);}}games=[...new Map(games.map(r=>[r.id,r])).values()];el('gameScope').textContent='仅本机保存 · '+games.length+' 次试玩；不是全部参与者人数。';}catch{el('gameScope').textContent='本机记录无法读取，可使用游戏导出的 JSON 核对。';}render();}
 function downloadFile(name,body,type){const u=URL.createObjectURL(new Blob([body],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
 function cell(value){let t=String(value??'');if(/^\s*[=+@-]/.test(t))t="'"+t;return '"'+t.replaceAll('"','""')+'"';}
 el('gameRefresh').addEventListener('click',load);window.addEventListener('storage',load);
 el('gameExportJson').addEventListener('click',()=>downloadFile('AlienZoo-V0.6-local.json',JSON.stringify({version:'0.6.0',scope:'local-browser-preview',exported_at:new Date().toISOString(),records:games},null,2),'application/json'));
 el('gameExportCsv').addEventListener('click',()=>{const rows=[['id','group','stage','rounds','pack','ai_sources','prediction_score','relevance_score','rule_score','createdAt'],...games.map(r=>[r.id,r.mode==='delegation'?'A':'B',r.stage,r.rounds.length,r.pack,sources(r),r.tests?.score?.prediction,r.tests?.score?.relevance,r.tests?.score?.rule,r.createdAt])];downloadFile('AlienZoo-V0.6-local.csv','\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');});
 el('gameImport').addEventListener('change',async event=>{try{const imported=[];for(const file of event.target.files){if(file.size>20000000)throw Error('单个文件不能超过20 MB');const data=JSON.parse(await file.text());const records=Array.isArray(data.records)?data.records:[data];for(const record of records){if(!valid(record))throw Error('这不是可识别的 Alien Zoo V0.6 记录');imported.push(record);}}games=[...new Map(imported.map(r=>[r.id,r])).values()];el('gameScope').textContent='仅本地导入 · '+games.length+' 次试玩；文件未上传，也不代表云端已收件。';render();}catch(error){el('gameScope').textContent='导入失败：'+error.message;}finally{event.target.value='';}});
 load();
})();
