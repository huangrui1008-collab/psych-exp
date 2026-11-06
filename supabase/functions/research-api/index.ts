import { createClient } from 'npm:@supabase/supabase-js@2.110.0';
import { createResearchHandler } from './handler.ts';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
function checked(result: any){if(result.error)throw result.error;return result.data;}
const handler=createResearchHandler({
  origins:['https://huangrui1008-collab.github.io'],
  async auth(jwt){const {data,error}=await db.auth.getUser(jwt);return error?null:data.user;},
  async ready(){return checked(await db.rpc('study2_backend_ready'))===true;},
  store:{
    async isResearcher(id){return !!checked(await db.from('study2_researchers').select('user_id').eq('user_id',id).maybeSingle());},
    async schema(){return checked(await db.rpc('study2_field_schema'));},
    async list(source,offset,count){
      if(source==='legacy'){
        const r=await db.from('experiment_data').select('*').order('timestamp').order('pid').range(offset,offset+count-1);
        if(r.error?.code==='PGRST205')return [];
        return checked(r).map((row: any)=>({source:'legacy',...row}));
      }
      const rows=checked(await db.from('study2_sessions').select('pid,group_name,entry_mode,status,current_step,record,chat_history,created_at,updated_at,completed_at').order('created_at').order('pid').range(offset,offset+count-1));
      return rows.map((row: any)=>{const {chat_history,...rest}=row;return {source:'current',...rest,record:{...row.record,chatHistory:chat_history}};});
    }
  }
});
Deno.serve(handler);
