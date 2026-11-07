export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new ApiError(status, message); };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tokenPattern = /^[0-9a-f]{64}$/;
export async function hashToken(token) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2,'0')).join('');
}
export function validateRecord(input, step, m, complete = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400,'记录格式无效');
  const result = {};
  const scales = [['snail_responses','SNAIL_CFG',1],['hou_responses','HOU_CFG',3],['soa_responses','SOA_CFG',4],['po_responses','PO_CFG',6],['cap_responses','CAP_CFG',7]];
  for (const [key,cfg,requiredAt] of scales) {
    result[key] = {};
    const values = input[key] || {};
    for (const q of m[cfg].questions) {
      const v = values[q.id];
      if (v !== undefined && (!Number.isInteger(v) || v<1 || v>7)) fail(400,'量表答案超出范围');
      if ((complete || step>=requiredAt) && v===undefined) fail(400,'量表尚未完成');
      if (v!==undefined) result[key][q.id]=v;
    }
  }
  result.essay = typeof input.essay==='string' ? input.essay : '';
  if (result.essay.length>30000) fail(400,'报告过长');
  if ((complete || step>=2) && (result.essay.match(/[一-龥]/g)||[]).length<m.CONFIG.MIN_WORDS) fail(400,'报告未达到原有字数要求');
  for (const [key,questions,requiredAt] of [['filler_responses',m.FILLER_QUESTIONS,5],['offline_test_responses',m.OFFLINE_TEST_QUESTIONS,8]]) {
    result[key]={};
    for (const q of questions) {
      const v=input[key]?.[q.id]; const allowed=q.options?.map(x=>x.value)||['相同','不同'];
      if (v!==undefined && !allowed.includes(v)) fail(400,'选择题答案无效');
      if ((complete || step>=requiredAt) && v===undefined) fail(400,'选择题尚未完成');
      if (v!==undefined) result[key][q.id]=v;
    }
  }
  result.self_estimate=input.self_estimate || '';
  if (complete && !['0-2题','3-5题','6-8题','9-10题'].includes(result.self_estimate)) fail(400,'请完成自估题');
  result.offline_test_score = complete ? m.OFFLINE_TEST_QUESTIONS.reduce((s,q)=>s+(result.offline_test_responses[q.id]===q.correct?1:0),0) : null;
  result.schema_version='study2-report-v2';
  result.step_times = {};
  for (const [k,v] of Object.entries(input.step_times||{})) {
    if (/^[0-8]$/.test(k) && typeof v==='string' && !Number.isNaN(Date.parse(v))) result.step_times[k]=v;
  }
  return result;
}
export function createHandler({store, materials:m, auth, ai, ready, origins, dailyStarts=1000, dailyChats=500, selfTestOnly=true}) {
  return async req => {
    const origin=req.headers.get('Origin');
    const cors={'Vary':'Origin','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, apikey, X-Session-Token','Access-Control-Max-Age':'600','Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'};
    if (origin && !origins.includes(origin)) return new Response(JSON.stringify({error:'来源未获允许'}),{status:403,headers:cors});
    if (origin) cors['Access-Control-Allow-Origin']=origin;
    const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
    const requireOwner=async()=>{
      const jwt=req.headers.get('Authorization')?.replace(/^Bearer /,'');
      const user=jwt ? await auth(jwt) : null;
      if (!user) fail(401,'请先登录研究者账号进行本人试跑');
      if (user.email?.trim().toLowerCase() !== 'huangrui1008@gmail.com' || !user.email_confirmed_at || !await store.isResearcher(user.id)) fail(403,'仅已授权研究者可以试跑');
      return user;
    };
    try {
      if (req.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
      const route=new URL(req.url).pathname.split('/experiment-api')[1] || '/';
      const u=new URL(req.url);
      if (route==='/health' && req.method==='GET') {
        if (!await ready()) fail(503,'研究服务尚未完成安全设置');
        return response({ready:true,version:'study2-report-v2',mode:selfTestOnly?'researcher-self-test':'study'});
      }
      if (route==='/self-test/access' && req.method==='GET') {
        if (!selfTestOnly) fail(404,'接口不存在');
        await requireOwner();return response({authorized:true,mode:'researcher-self-test'});
      }
      if (route.startsWith('/research/')) {
        const jwt=req.headers.get('Authorization')?.replace(/^Bearer /,'');
        const user=jwt ? await auth(jwt) : null;
        if (!user) fail(401,'请先登录研究者账号');
        if (user.email?.trim().toLowerCase() !== 'huangrui1008@gmail.com' || !user.email_confirmed_at || !await store.isResearcher(user.id)) fail(403,'此账号尚未获研究者授权');
        if (req.method!=='GET') fail(405,'方法不受支持');
        if (route==='/research/schema') return response(await store.schema());
        if (route!=='/research/records') fail(404,'接口不存在');
        const source=u.searchParams.get('source')||'current';
        if (!['current','legacy'].includes(source)) fail(400,'数据来源无效');
        const offset=Number(u.searchParams.get('offset')||0);
        if (!Number.isSafeInteger(offset)||offset<0) fail(400,'分页参数无效');
        const rows=await store.list(source,offset,201);
        return response({rows:rows.slice(0,200),has_more:rows.length>200,source,offset});
      }
      if (req.method!=='POST') fail(405,'方法不受支持');
      if (selfTestOnly) await requireOwner();
      if (Number(req.headers.get('content-length')||0)>250000) fail(413,'记录过大');
      const bodyText=await req.text(); if (bodyText.length>250000) fail(413,'记录过大');
      let b; try { b=JSON.parse(bodyText); } catch { fail(400,'请求格式无效'); }
      if (!b || !uuid.test(b.pid||'')) fail(400,'参与编号无效');
      const token=req.headers.get('X-Session-Token')||'';
      if (!tokenPattern.test(token)) fail(401,'本次参与凭据无效');
      const hash=await hashToken(token);
      let session=await store.get(b.pid);
      if (selfTestOnly && session && session.record?.is_test!==true) fail(403,'该记录不属于本人试跑，请保留原记录并开启新的试跑');
      if (route==='/start') {
        if (session && session.token_hash!==hash) fail(403,'参与凭据不匹配');
        if (!session) {
          if (!await ready()) fail(503,'研究服务暂不可用，请联系研究者');
          if (!['random','fixed'].includes(b.entry_mode) || (b.entry_mode==='fixed'&&!['A','B'].includes(b.group))) fail(400,'分组入口无效');
          if (!await store.quota('start',dailyStarts)) fail(429,'今日参与名额已达服务上限，请联系研究者');
          const group=b.entry_mode==='fixed'?b.group:(crypto.getRandomValues(new Uint32Array(1))[0]<2147483648?'A':'B');
          session=await store.create({pid:b.pid,token_hash:hash,group_name:group,entry_mode:b.entry_mode,current_step:0,...(selfTestOnly?{record:{is_test:true,test_label:'researcher-self-test'}}:{}),chat_history:[{role:'system',content:m.CONFIG.SYSTEM_PROMPT[group]},{role:'assistant',content:m.CONFIG.FIRST_MESSAGE[group]}]});
          if (session.token_hash!==hash) fail(403,'参与凭据不匹配');
        }
        return response({pid:session.pid,group:session.group_name,status:session.status,current_step:session.current_step,record:session.record,chat_history:session.chat_history.filter(x=>x.role!=='system')});
      }
      if (!session || session.token_hash!==hash) fail(403,'参与凭据不匹配');
      if (route==='/progress' || route==='/complete') {
        // A lost completion response can be retried without a second record.
        if (session.status==='completed') return response({saved:true,completed:true,pid:session.pid});
        const complete=route==='/complete';
        const step=complete?8:b.step;
        if (!Number.isInteger(step)||step<session.current_step||step>8||step>session.current_step+1 || (complete&&session.current_step!==8)) fail(409,'步骤顺序不一致，请刷新页面恢复');
        if (session.ai_busy_since && Date.now()-Date.parse(session.ai_busy_since)<90000) fail(409,'请等待 AI 回复后再继续');
        const record=validateRecord(b.record,step,m,complete);
        if (selfTestOnly) {record.is_test=true;record.test_label='researcher-self-test';}
        const now=new Date().toISOString();
        record.pid=session.pid; record.group=session.group_name;
        record.chatHistory=session.chat_history;
        record.duration=Math.max(0,Math.round((Date.now()-Date.parse(session.created_at))/1000));
        record.timestamp=complete?now:'';
        const patch={record,current_step:step,status:complete?'completed':'in_progress',updated_at:now,...(complete?{completed_at:now}:{})};
        if (!await store.update(session,patch)) fail(409,'记录正在更新，请重试');
        return response({saved:true,completed:complete,pid:session.pid});
      }
      if (route==='/chat') {
        if (session.status==='completed'||session.current_step!==1) fail(403,'本阶段不能使用 AI');
        const message=typeof b.message==='string'?b.message.trim():'';
        if (!message||message.length>6000) fail(400,'请输入不超过6000字符的内容');
        if (session.ai_requests>=40) fail(429,'本次 AI 对话次数已达服务上限，请联系研究者');
        if (session.ai_busy_since && Date.now()-Date.parse(session.ai_busy_since)<90000) fail(409,'已有请求处理中，请稍候');
        if (!await store.quota('chat',dailyChats)) fail(429,'今日 AI 服务额度已用完，请联系研究者');
        const locked=await store.update(session,{ai_requests:session.ai_requests+1,ai_busy_since:new Date().toISOString()});
        if (!locked) fail(409,'已有请求处理中，请稍候');
        try {
          const messages=[...session.chat_history,{role:'user',content:message}];
          const reply=await ai(messages,session.group_name);
          if (typeof reply!=='string'||!reply.trim()) fail(502,'AI 未返回有效内容，请重试');
          const saved=await store.update(locked,{chat_history:[...messages,{role:'assistant',content:reply}],ai_busy_since:null,updated_at:new Date().toISOString()});
          if (!saved) fail(409,'对话保存冲突，请刷新页面');
          return response({reply});
        } catch (e) {
          await store.update(locked,{ai_busy_since:null});
          throw e;
        }
      }
      return response({error:'接口不存在'},404);
    } catch(e) {
      return response({error:e instanceof ApiError?e.message:'研究服务连接失败，请稍后重试或联系研究者'},e instanceof ApiError?e.status:503);
    }
  };
}
