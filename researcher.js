'use strict';
const $ = id => document.getElementById(id);
const ownerEmail = 'huangrui1008@gmail.com';
const recoveryRedirect = 'https://huangrui1008-collab.github.io/psych-exp/researcher.html';
let recoveryToken = '';
// Consume recovery credentials before any requests; never retain them in the URL or storage.
const recoveryParams = new URLSearchParams(location.hash.slice(1));
const recoveryAttempt = recoveryParams.has('access_token') || recoveryParams.has('error');
if (recoveryAttempt) history.replaceState(null, '', location.pathname + location.search);
if (recoveryParams.get('type') === 'recovery') recoveryToken = recoveryParams.get('access_token') || '';
const recoveryExpired = recoveryParams.has('error') || (recoveryAttempt && !recoveryToken);
recoveryParams.delete('access_token'); recoveryParams.delete('refresh_token');
let accessToken = ''; // Memory only: no credentials in localStorage or URLs.
let loaded = false;
let records = [];
let viewSource = '';
let operation = 0;
const phases = ['前测','报告与 AI 对话','操纵检验','代理感','填充任务','报告心理所有权','学习获得感','脱机测试','自估正确率'];
const groupLabel = g => g === 'A' ? 'A · 依赖型' : g === 'B' ? 'B · 增强型' : '未记录';
const dateText = x => x && !Number.isNaN(Date.parse(x)) ? new Date(x).toLocaleString() : '未记录';
const statusLabel = r => (r.data?.is_test?'本人试跑 · ':'')+(r.status==='completed' ? '已完成（服务端确认）' : r.status==='in_progress' ? '进行中 · '+(phases[r.current_step]||'阶段未知') : r.status==='legacy' ? '历史提交 · 过程状态未知' : '本地备份 · 云端收件未验证');
function normalize(row, source) {
  if (source==='current') return {...row, source, group_name:row.group_name, data:row.record||{}};
  return {source,status:source==='legacy'?'legacy':'local',pid:row.pid||'未记录',group_name:row.group_name||row.group,entry_mode:row.entry_mode||'',created_at:row.started_at||'',updated_at:row.timestamp||'',data:row};
}
function filtered() { return records.filter(r => (!$('groupFilter').value || r.group_name===$('groupFilter').value) && (!$('statusFilter').value || r.status===$('statusFilter').value) && (!$('sourceFilter').value || r.source===$('sourceFilter').value)); }
function render() {
  const rows = filtered(); $('rows').replaceChildren();
  if (!rows.length) { const tr=document.createElement('tr'); const td=document.createElement('td'); td.colSpan=6; td.textContent=loaded?'当前筛选没有记录':'尚未加载数据'; tr.appendChild(td); $('rows').appendChild(tr); }
  for (const r of rows) {
    const tr=document.createElement('tr');
    for (const value of [r.pid,groupLabel(r.group_name),r.entry_mode==='random'?'随机分配':r.entry_mode==='fixed'?'固定入口':'未记录',statusLabel(r),dateText(r.created_at)+' / '+dateText(r.updated_at)]) {
      const td=document.createElement('td'); td.textContent=value; tr.appendChild(td);
    }
    const td=document.createElement('td'); const b=document.createElement('button'); b.textContent='查看';
    b.addEventListener('click',()=>{$('detail').textContent=JSON.stringify({...r,data:r.data},null,2);$('recordDetail').open=true;});
    td.appendChild(b);tr.appendChild(td);$('rows').appendChild(tr);
  }
  $('rowCount').textContent=loaded?'显示 '+rows.length+' / '+records.length+' 条（导出应用当前筛选）':'';
  $('exportCsv').disabled=!loaded||!rows.length; $('exportJson').disabled=!loaded||!rows.length;
  $('metrics').hidden=!loaded; $('metrics').replaceChildren();
  if (loaded) {
    const metrics = viewSource==='local' ? [
      ['本地导入 · A 组',records.filter(r=>r.group_name==='A').length],
      ['本地导入 · B 组',records.filter(r=>r.group_name==='B').length],
      ['本地导入 · 未验证收件',records.length]
    ] : [
      ['当前流程 · A 组',records.filter(r=>r.source==='current'&&r.group_name==='A').length],
      ['当前流程 · B 组',records.filter(r=>r.source==='current'&&r.group_name==='B').length],
      ['当前流程 · 已完成',records.filter(r=>r.status==='completed').length],
      ['当前流程 · 进行中',records.filter(r=>r.status==='in_progress').length],
      ['历史提交 · 状态信息有限',records.filter(r=>r.source==='legacy').length],
      ['本地导入 · 未验证收件',records.filter(r=>r.source==='local').length]];
    for (const [label,n] of metrics) {
      const d=document.createElement('div');d.className='metric';d.textContent=label; const strong=document.createElement('strong');strong.textContent=n;d.appendChild(strong);$('metrics').appendChild(d);
    }
  }
}
async function jsonFetch(url, init={}) {
  const r=await fetch(url,{...init,signal:AbortSignal.timeout(20000)}); let data;
  if (r.status === 204) return null;
  try {data=await r.json();} catch {throw new Error('服务未返回有效响应');}
  if (!r.ok) throw new Error(data.error_description||data.error||data.msg||'请求失败（'+r.status+'）');
  return data;
}
function authRequest(path,init={},token='') {
  return jsonFetch(APP_CONFIG.SUPABASE_URL+'/auth/v1/'+path,{...init,headers:{'Content-Type':'application/json',apikey:APP_CONFIG.SUPABASE_KEY,...(token?{Authorization:'Bearer '+token}:{}),...init.headers}});
}
function loginError(error) {
  if (/Invalid login credentials/i.test(error.message)) return '邮箱或密码未通过验证。请使用创建研究者账号时的密码，或点击下方“忘记密码”。';
  if (/Email not confirmed/i.test(error.message)) return '该账号尚未完成邮箱确认，请先确认邮箱。';
  return error.message;
}
$('recoverBtn').addEventListener('click',async()=>{
  $('recoverBtn').disabled=true;$('recoveryMessage').textContent='正在请求恢复邮件…';
  try {
    await authRequest('recover?redirect_to='+encodeURIComponent(recoveryRedirect),{method:'POST',body:JSON.stringify({email:ownerEmail})});
    $('recoveryMessage').textContent='恢复请求已受理。请检查 huangrui1008@gmail.com 的收件箱及垃圾邮件，使用最新邮件中的链接。若未收到，可能受邮件服务限额或收件人限制影响。';
  } catch(error) {$('recoveryMessage').textContent='无法发送恢复邮件：'+error.message;}
  finally {$('recoverBtn').disabled=false;}
});
function leaveRecovery() {
  const token=recoveryToken;recoveryToken='';$('newPassword').value='';$('confirmPassword').value='';
  $('resetCard').hidden=true;$('authCard').hidden=false;$('savePassword').disabled=true;
  if(token)authRequest('logout?scope=global',{method:'POST'},token).catch(()=>{});
}
$('cancelRecovery').addEventListener('click',leaveRecovery);
$('resetForm').addEventListener('submit',async e=>{
  e.preventDefault();
  if(!recoveryToken){$('resetMessage').textContent='恢复链接无效或已失效，请重新请求恢复邮件。';return;}
  if($('newPassword').value.length<8 || $('newPassword').value!==$('confirmPassword').value){$('resetMessage').textContent='请使用至少8位的新密码，两次输入须一致。';return;}
  $('savePassword').disabled=true;$('resetMessage').textContent='正在保存新密码…';
  try {
    await authRequest('user',{method:'PUT',body:JSON.stringify({password:$('newPassword').value})},recoveryToken);
    leaveRecovery();$('authMessage').textContent='密码已更新。请使用新密码登录。';$('password').focus();
  } catch(error) {$('newPassword').value='';$('confirmPassword').value='';$('resetMessage').textContent='密码未更新：'+error.message;$('savePassword').disabled=false;}
});
async function prepareRecovery() {
  if(recoveryExpired){$('authMessage').textContent='恢复链接无效、已使用或已过期，请重新请求恢复邮件。';return;}
  if(!recoveryToken)return;
  $('authCard').hidden=true;$('resetCard').hidden=false;$('resetMessage').textContent='正在验证恢复链接…';
  try {
    const user=await authRequest('user',{},recoveryToken);
    if(user.email?.trim().toLowerCase()!==ownerEmail || !user.email_confirmed_at)throw new Error('恢复链接不属于已确认的研究者邮箱。');
    $('savePassword').disabled=false;$('resetMessage').textContent='邮箱身份已验证，请设置至少8位的新密码。';
  } catch(error) {recoveryToken='';$('resetMessage').textContent='恢复链接验证失败：'+error.message+'。请返回登录，重新请求恢复邮件。';}
}
function research(path) {return jsonFetch(APP_CONFIG.RESEARCH_API_BASE+'/research/'+path,{headers:{apikey:APP_CONFIG.SUPABASE_KEY,Authorization:'Bearer '+accessToken}});}
function clearView() {loaded=false;records=[];viewSource='';$('detail').textContent='';$('recordDetail').open=false;$('actualSchema').textContent='尚未连接，无法核对数据库实际列结构。';render();}
async function loadCloud() {
  const op=++operation;clearView();$('scope').textContent='正在完整读取云端记录，读取失败不会显示部分人数。';$('refresh').disabled=true;
  try {
    const all=[];
    for (const source of ['current','legacy']) {
      for (let offset=0;;offset+=200) {
        const page=await research('records?source='+source+'&offset='+offset);
        if (op!==operation) return;
        all.push(...page.rows.map(r=>normalize(r,source)));
        if (!page.has_more) break;
      }
    }
    const schema=await research('schema'); if (op!==operation) return;
    records=all; loaded=true; viewSource='cloud';
    $('actualSchema').textContent=JSON.stringify(schema,null,2);
    $('scope').textContent='云端读取成功 · '+new Date().toLocaleString()+'。统计为本次分页读取结果；招募期间状态可能继续变化，导出保留来源字段。';
    $('authMessage').textContent='研究者身份与授权已验证。';
    $('connection').textContent='已登录授权研究者。研究数据由服务端校验身份后提供。';
    $('logout').hidden=false;render();
  } catch(e) {
    if(op!==operation)return;
    clearView();$('scope').textContent='无法读取云端数据：'+e.message+'。当前没有可用的汇总结果。';throw e;
  } finally {if(op===operation)$('refresh').disabled=!accessToken;}
}
$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();const loginOp=++operation;accessToken='';clearView();$('logout').hidden=true;$('refresh').disabled=true;$('loginBtn').disabled=true;$('authMessage').textContent='正在登录…';
  try {
    const data=await jsonFetch(APP_CONFIG.SUPABASE_URL+'/auth/v1/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json',apikey:APP_CONFIG.SUPABASE_KEY},body:JSON.stringify({email:$('email').value.trim(),password:$('password').value})});
    if(loginOp!==operation)return;
    accessToken=data.access_token; $('password').value='';
    await loadCloud();
  } catch(err) {accessToken='';$('password').value='';$('authMessage').textContent='登录或授权失败：'+loginError(err);$('refresh').disabled=true;}
  finally {$('loginBtn').disabled=false;}
});
$('refresh').addEventListener('click',()=>loadCloud().catch(e=>{$('authMessage').textContent=e.message;}));
$('logout').addEventListener('click',()=>{
  const oldToken=accessToken; accessToken='';++operation;clearView();$('logout').hidden=true;$('refresh').disabled=true;
  $('scope').textContent='已退出；当前浏览器中的数据视图已清空。';$('connection').textContent='未登录。';
  if(oldToken)jsonFetch(APP_CONFIG.SUPABASE_URL+'/auth/v1/logout',{method:'POST',headers:{apikey:APP_CONFIG.SUPABASE_KEY,Authorization:'Bearer '+oldToken}}).catch(()=>{});
});
for(const id of ['groupFilter','statusFilter','sourceFilter'])$(id).addEventListener('change',render);
function csvCell(value) {
  let s=value===null||value===undefined?'':typeof value==='object'?JSON.stringify(value):String(value);
  if (/^[\s]*[=+@-]/.test(s)) s="'"+s; // Prevent formula execution in spreadsheet apps.
  return '"'+s.replaceAll('"','""')+'"';
}
function flatten(value,prefix='',out={}) {
  for(const [key,v] of Object.entries(value)) {
    const name=prefix?prefix+'.'+key:key;
    if (v && typeof v==='object'&&!Array.isArray(v)) flatten(v,name,out); else out[name]=v;
  }
  return out;
}
function download(name,content,type) {
  const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('exportJson').addEventListener('click',()=>download('study2-'+viewSource+'.json',JSON.stringify({exported_at:new Date().toISOString(),scope:viewSource,filters:{group:$('groupFilter').value,status:$('statusFilter').value,source:$('sourceFilter').value},records:filtered()},null,2),'application/json'));
$('exportCsv').addEventListener('click',()=>{
  const flat=filtered().map(r=>flatten({source:r.source,pid:r.pid,group_name:r.group_name,entry_mode:r.entry_mode,status:r.status,current_step:r.current_step,created_at:r.created_at,updated_at:r.updated_at,completed_at:r.completed_at,data:r.data}));
  const keys=[...new Set(flat.flatMap(r=>Object.keys(r)))];
  download('study2-'+viewSource+'.csv','\uFEFF'+[keys.map(csvCell).join(','),...flat.map(r=>keys.map(k=>csvCell(r[k])).join(','))].join('\r\n'),'text/csv;charset=utf-8');
});
$('importFile').addEventListener('change',async e=>{
  const op=++operation;clearView();
  try {
    const imported=[];
    for(const file of e.target.files) {
      if(file.size>20000000)throw new Error('单个文件不能超过20 MB');
      const data=JSON.parse(await file.text());
      const list=Array.isArray(data)?data:Array.isArray(data.records)?data.records:[data];
      for(const item of list) {
        const row=item.data||item.record||item;
        if(!row || typeof row!=='object'||!row.pid)throw new Error('文件不包含可识别的参与编号');
        imported.push(normalize(row,'local'));
      }
    }
    if(op!==operation)return;
    // Duplicate files are not counted twice; historical duplicates remain visible in cloud mode.
    records=[...new Map(imported.map(r=>[r.pid,r])).values()];loaded=true;viewSource='local';
    $('scope').textContent='仅本地导入 · '+records.length+' 条；不代表全部参与者，也未验证云端收件。';render();
  } catch(err) {$('scope').textContent='导入失败：'+err.message;}
  finally {e.target.value='';}
});
function dictionary() {
  const fields=[['pid / group_name / entry_mode','匿名参与编号、组别、随机或固定分配'],['status / current_step / created_at / updated_at / completed_at','同意参与后建档、阶段、服务端开始/保存/完成时间'],['essay / chatHistory','任务形成的报告与 AI 对话原始记录'],['duration / timestamp / step_times','总时长（秒）、最终提交时间、浏览器阶段进入时间（未经服务器验证）'],['offline_test_responses / offline_test_score','10题原始选项与服务端计算正确数（0–10）；未完成时不计分'],['self_estimate','原有四档自估正确数'],['is_test / test_label','本人试跑标记；这类记录用于程序验收，不能混入正式样本'],['schema_version','study2-report-v2；历史记录可能缺失']];
  const table=document.createElement('table');
  for(const [key,desc]of fields){const tr=document.createElement('tr');for(const value of [key,desc]){const td=document.createElement('td');td.textContent=value;tr.appendChild(td);}table.appendChild(tr);}$('dictionary').appendChild(table);
  for(const [name,cfg]of [['前测',SNAIL_CFG],['操纵检验',HOU_CFG],['代理感',SOA_CFG],['报告心理所有权',PO_CFG],['学习获得感',CAP_CFG],['脱机测试',{key:'offline_test_responses',questions:OFFLINE_TEST_QUESTIONS}],['填充任务',{key:'filler_responses',questions:FILLER_QUESTIONS}]]) {
    const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent=name+' · '+cfg.key+' · '+cfg.questions.length+'题';details.appendChild(summary);
    if(cfg.scale){const p=document.createElement('p');p.textContent=cfg.scale.map((x,i)=>(i+1)+'='+x).join('；');details.appendChild(p);}
    for(const q of cfg.questions){const p=document.createElement('p');p.textContent=cfg.key+'.'+q.id+' — '+(q.text||q.left+' / '+q.right);details.appendChild(p);if(q.options){const options=document.createElement('p');options.textContent=q.options.map(o=>o.value+'：'+o.label).join('；');details.appendChild(options);}}
    $('dictionary').appendChild(details);
  }
}
dictionary();render();
prepareRecovery();
jsonFetch(APP_CONFIG.RESEARCH_API_BASE+'/health',{headers:{apikey:APP_CONFIG.SUPABASE_KEY}}).then(()=>{$('connection').textContent='研究服务已连接。请登录后查看云端数据。';}).catch(()=>{$('connection').textContent='安全后端暂未连接或尚未完成设置。当前不能查看云端汇总；仍可核对字段、导入本地备份。';});
