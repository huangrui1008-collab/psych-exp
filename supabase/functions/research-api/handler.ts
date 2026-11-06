type ResearchUser = { id: string; email?: string; email_confirmed_at?: string };
type ResearchDependencies = {
  store: { isResearcher(id: string): Promise<boolean>; schema(): Promise<unknown>; list(source: string, offset: number, count: number): Promise<unknown[]> };
  auth(jwt: string): Promise<ResearchUser | null>;
  ready(): Promise<boolean>;
  origins: string[];
};
export function createResearchHandler({store, auth, ready, origins}: ResearchDependencies) {
  return async (req: Request): Promise<Response> => {
    const origin=req.headers.get('Origin');
    const headers: Record<string,string>={'Vary':'Origin','Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Authorization, apikey, Content-Type','Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'};
    const response=(body: unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
    if(origin&&!origins.includes(origin))return response({error:'来源未获允许'},403);
    if(origin)headers['Access-Control-Allow-Origin']=origin;
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
    try {
      const u=new URL(req.url), route=u.pathname.split('/research-api')[1]||'/';
      if(route==='/health'&&req.method==='GET')return await ready()?response({ready:true,service:'researcher-download'}):response({error:'数据服务尚未完成安全设置'},503);
      const jwt=req.headers.get('Authorization')?.replace(/^Bearer /,'');
      const user=jwt?await auth(jwt):null;
      if(!user)return response({error:'请先登录研究者账号'},401);
      if(user.email?.trim().toLowerCase()!=='huangrui1008@gmail.com'||!user.email_confirmed_at||!await store.isResearcher(user.id))return response({error:'此账号没有研究数据访问权限'},403);
      if(req.method!=='GET')return response({error:'此服务只允许查看和导出数据'},405);
      if(route==='/research/schema')return response(await store.schema());
      if(route!=='/research/records')return response({error:'接口不存在'},404);
      const source=u.searchParams.get('source')||'current',offset=Number(u.searchParams.get('offset')||0);
      if(!['current','legacy'].includes(source)||!Number.isSafeInteger(offset)||offset<0)return response({error:'分页参数无效'},400);
      const rows=await store.list(source,offset,201);
      return response({rows:rows.slice(0,200),has_more:rows.length>200,source,offset});
    } catch {
      return response({error:'研究数据服务暂不可用，请稍后重试'},503);
    }
  };
}
