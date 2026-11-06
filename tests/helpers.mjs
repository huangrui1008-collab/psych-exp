import fs from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
import {createHandler} from '../supabase/functions/experiment-api/handler.mjs';
export const materials=JSON.parse(fs.readFileSync(new URL('../supabase/functions/_shared/materials.json',import.meta.url)));
export function memoryStore(){
  const sessions=new Map();const quotas=new Map();
  return {sessions,quotas,
    async get(id){return structuredClone(sessions.get(id)||null);},
    async create(r){if(!sessions.has(r.pid))sessions.set(r.pid,{status:'in_progress',revision:0,record:{},ai_requests:0,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...structuredClone(r)});return this.get(r.pid);},
    async update(row,patch){const s=sessions.get(row.pid);if(s.revision!==row.revision)return null;Object.assign(s,structuredClone(patch),{revision:s.revision+1});return this.get(row.pid);},
    async quota(k,limit){const n=quotas.get(k)||0;if(n>=limit)return false;quotas.set(k,n+1);return true;},
    async isResearcher(id){return id==='researcher';},async schema(){return [{table_name:'study2_sessions',column_name:'record',data_type:'jsonb'}];},
    async list(source,offset,count){return source==='current'?[...sessions.values()].slice(offset,offset+count).map(({token_hash,...r})=>({...r,source,record:{...r.record,chatHistory:r.chat_history}})):[];}
  };
}
export function fixture(options={}) {
  const store=memoryStore();
  const handler=createHandler({store,materials,origins:['https://huangrui1008-collab.github.io'],auth:async token=>token==='good'?{id:'researcher'}:token==='ordinary'?{id:'ordinary'}:null,ai:async()=> '现有提示词生成的测试回复',ready:async()=>true,...options});
  const request=(path,body,token='',extras={})=>handler(new Request('https://backend.test/functions/v1/experiment-api'+path,{method:body?'POST':'GET',headers:{Origin:'https://huangrui1008-collab.github.io',...(token?{'X-Session-Token':token}:{}),...extras},...(body?{body:JSON.stringify(body)}:{})}));
  return {store,handler,request};
}
export function fullRecord(){
  const r={essay:'报'.repeat(400),self_estimate:'9-10题',offline_test_score:-999};
  for (const [key,cfg] of [['snail_responses','SNAIL_CFG'],['hou_responses','HOU_CFG'],['soa_responses','SOA_CFG'],['po_responses','PO_CFG'],['cap_responses','CAP_CFG']])r[key]=Object.fromEntries(materials[cfg].questions.map(q=>[q.id,4]));
  r.filler_responses=Object.fromEntries(materials.FILLER_QUESTIONS.map(q=>[q.id,'相同']));
  r.offline_test_responses=Object.fromEntries(materials.OFFLINE_TEST_QUESTIONS.map(q=>[q.id,q.correct]));
  return r;
}
export const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
export async function settle(predicate){for(let i=0;i<80;i++){if(predicate())return;await tick();}throw new Error('Timed out waiting for expected UI state');}
export function browser(name,fetcher,{url='https://huangrui1008-collab.github.io/psych-exp/',session={},local={}}={}) {
  const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));
  const html=fs.readFileSync(new URL('../'+name+'.html',import.meta.url),'utf8').replace(/<script[^>]+src=[^>]+><\/script>/g,'');
  const dom=new JSDOM(html,{url,runScripts:'dangerously',virtualConsole:vc});const w=dom.window;
  w.fetch=fetcher;w.AbortSignal=AbortSignal;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
  for(const [k,v]of Object.entries(session))w.sessionStorage.setItem(k,v);
  for(const [k,v]of Object.entries(local))w.localStorage.setItem(k,v);
  const captures=[];w.URL.createObjectURL=b=>{captures.push(b);return 'blob:test';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=()=>{};
  for(const file of ['config.js','materials.js',name==='index'?'experiment.js':'researcher.js']){const script=w.document.createElement('script');script.textContent=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');w.document.body.appendChild(script);}
  return {dom,w,document:w.document,errors,captures,close:()=>w.close()};
}
export function fetchHandler(handler){return (url,init={})=>handler(new Request(url,{...init,headers:{Origin:'https://huangrui1008-collab.github.io',...init.headers}}));}
