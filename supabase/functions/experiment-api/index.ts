import { createClient } from 'npm:@supabase/supabase-js@2.110.0';
import materials from '../_shared/materials.json' with { type: 'json' };
import { createHandler, ApiError } from './handler.mjs';
const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
function checked(result: any) { if (result.error) throw result.error; return result.data; }
const store = {
  async get(pid: string) { return checked(await db.from('study2_sessions').select('*').eq('pid',pid).maybeSingle()); },
  async create(row: any) {
    const r=await db.from('study2_sessions').insert(row).select('*').single();
    if (r.error?.code==='23505') return await store.get(row.pid);
    return checked(r);
  },
  async update(row: any, patch: any) {
    return checked(await db.from('study2_sessions').update({...patch, revision:row.revision+1}).eq('pid',row.pid).eq('revision',row.revision).select('*').maybeSingle());
  },
  async quota(kind: string, limit: number) {
    return checked(await db.rpc('study2_reserve_quota',{p_key:kind+':'+new Date().toISOString().slice(0,10),p_limit:limit}));
  },
  async isResearcher(id: string) { return !!checked(await db.from('study2_researchers').select('user_id').eq('user_id',id).maybeSingle()); },
  async schema() { return checked(await db.rpc('study2_field_schema')); },
  async list(source: string, offset: number, count: number) {
    if (source==='legacy') {
      const result=await db.from('experiment_data').select('*').order('timestamp').order('pid').range(offset,offset+count-1);
      // A missing legacy table is distinct from a failed query or denied permission.
      if (result.error?.code==='PGRST205') return [];
      return checked(result).map((r: any)=>({source:'legacy',...r}));
    }
    const rows=checked(await db.from('study2_sessions').select('pid,group_name,entry_mode,status,current_step,record,chat_history,created_at,updated_at,completed_at').order('created_at').order('pid').range(offset,offset+count-1));
    return rows.map((r: any)=>{const {chat_history,...rest}=r; return {source:'current',...rest,record:{...r.record,chatHistory:chat_history}};});
  }
};
const handler=createHandler({
  store, materials,
  origins:(Deno.env.get('ALLOWED_ORIGINS')||'https://huangrui1008-collab.github.io').split(',').map(x=>x.trim()).filter(Boolean),
  dailyStarts:Number(Deno.env.get('DAILY_START_LIMIT')||1000),
  dailyChats:Number(Deno.env.get('DAILY_CHAT_LIMIT')||500),
  async ready() { return !!Deno.env.get('DEEPSEEK_API_KEY') && checked(await db.rpc('study2_backend_ready'))===true; },
  async auth(jwt: string) { const {data,error}=await db.auth.getUser(jwt); return error?null:data.user; },
  async ai(messages: any[], group: string) {
    const r=await fetch('https://api.deepseek.com/chat/completions',{
      method:'POST',signal:AbortSignal.timeout(60000),
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+Deno.env.get('DEEPSEEK_API_KEY')},
      body:JSON.stringify({model:'deepseek-chat',messages,max_tokens:group==='A'?1600:700})
    });
    if (!r.ok) throw new ApiError(502,'AI 服务暂未响应，请重试或联系研究者');
    const data=await r.json(); return data.choices?.[0]?.message?.content;
  }
});
Deno.serve(handler);
