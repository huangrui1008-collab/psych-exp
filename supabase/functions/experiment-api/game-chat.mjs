import { gameDifficulty } from './game-plans.mjs';
// Game-only short-lived credentials. These never grant database or researcher access.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const modes=['delegation','augmentation'];
const encode=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const decode=text=>Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-text.length%4)%4)),c=>c.charCodeAt(0));
const utf8=new TextEncoder();
export function createGameCapabilities(secret,now=()=>Date.now()){
  const key=crypto.subtle.importKey('raw',utf8.encode('alien-zoo-game-only-v1:'+secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  return {
    async issue(sid,mode){
      const payload=encode(utf8.encode(JSON.stringify({scope:'alien-zoo-chat',sid,mode,exp:Math.floor(now()/1000)+7200})));
      return payload+'.'+encode(new Uint8Array(await crypto.subtle.sign('HMAC',await key,utf8.encode(payload))));
    },
    async verify(token){
      try{
        if(typeof token!=='string'||token.length>1000||!/^[-\w]+\.[-\w]+$/.test(token))return null;
        const [payload,signature]=token.split('.');
        if(!await crypto.subtle.verify('HMAC',await key,decode(signature),utf8.encode(payload)))return null;
        const data=JSON.parse(new TextDecoder().decode(decode(payload)));
        return data.scope==='alien-zoo-chat'&&uuid.test(data.sid)&&modes.includes(data.mode)&&Number.isFinite(data.exp)&&data.exp>now()/1000?data:null;
      }catch{return null;}
    }
  };
}
class ChatError extends Error{constructor(status,message){super(message);this.status=status;}}
const reject=(status,message)=>{throw new ChatError(status,message);};
const recipe=x=>Array.isArray(x)&&x.length===5&&x.every(n=>Number.isInteger(n)&&n>=0&&n<=6);
export function createGameChatRouter({store,ready,ai,capabilities,enabled=()=>true,dailyLimit=0,sessionLimit=0,now=()=>Date.now()}){
  return async(req,route,headers)=>{
    const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
    try{
      if(req.method!=='POST')reject(405,'方法不受支持');
      if(!enabled())reject(503,'AI调用已暂停，请联系研究者。');
      if(!capabilities||!ai||!await ready())reject(503,'AI连接尚未准备好，请稍后重试。');
      if(!['/game/access','/game/chat'].includes(route))reject(404,'接口不存在');
      const raw=await req.text();if(raw.length>50000)reject(413,'本次对话过长，请缩短问题。');
      let b;try{b=JSON.parse(raw);}catch{reject(400,'请求格式无效');}
      if(!b||!uuid.test(b.session_id||'')||!modes.includes(b.mode))reject(400,'游戏参与凭据无效');
      if(route==='/game/access'){
        if(!await store.quota('alien-zoo-access',400))reject(429,'今日AI连接次数已达上限，请联系研究者。');
        return response({token:await capabilities.issue(b.session_id,b.mode),expires_in:7200});
      }
      const access=await capabilities.verify(req.headers.get('X-Game-Token'));
      if(!access)reject(401,'本次AI连接已失效，请重试。');
      if(access.sid!==b.session_id||access.mode!==b.mode)reject(403,'AI连接与本次游戏不匹配。');
      if(!Number.isInteger(b.round)||b.round<1||b.round>10||!recipe(b.recipe)||!Array.isArray(b.history)||b.history.length>12||b.history.some(r=>!r||!recipe(r.x)||!Number.isFinite(r.delta)||Math.abs(r.delta)>100))reject(400,'游戏记录格式无效');
      if(b.difficulty!=null&&!['basic','advanced'].includes(b.difficulty))reject(400,'游戏难度无效');
      if(!Array.isArray(b.messages)||!b.messages.length||b.messages.length>21)reject(400,'对话记录格式无效');
      let count=0;
      const messages=b.messages.map(m=>{
        if(!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||!m.content.trim()||m.content.length>2400)reject(400,'每条消息请控制在2000字以内。');
        count+=m.content.length;return {role:m.role,content:m.content.trim()};
      });
      if(count>14000||messages.at(-1).role!=='user')reject(400,'对话过长或缺少本次问题。');
      if(sessionLimit>0&&!await store.quota('alien-zoo-session:'+access.sid,sessionLimit))reject(429,'本次游戏的AI对话次数已达上限，请联系研究者。');
      if(!await store.quota('alien-zoo-minute:'+access.sid+':'+Math.floor(now()/60000),8))reject(429,'发送得太快了，请稍等片刻后重试。');
      if(dailyLimit>0&&!await store.quota('alien-zoo-real-chat',dailyLimit))reject(429,'今日AI对话次数已达上限，请联系研究者。');
      // Explicit allowlist: no hidden rules, answer keys, system roles or credentials reach the model.
      const result=await ai({mode:access.mode,round:b.round,difficulty:gameDifficulty(b),recipe:b.recipe,messages,history:b.history.map(r=>({id:String(r.id||'R').slice(0,20),x:r.x,delta:r.delta}))});
      if(!result||typeof result.text!=='string'||!result.text.trim())reject(502,'AI暂未返回有效回复，请重试。');
      if(access.mode==='delegation'&&result.recipe!=null&&!recipe(result.recipe))reject(502,'AI食谱格式暂不可用，请重新询问。');
      return response({text:result.text.trim().slice(0,2400),...(access.mode==='delegation'&&recipe(result.recipe)?{recipe:result.recipe}:{}),...(access.mode==='delegation'&&recipe(result.recipe)&&Number.isInteger(result.expected_delta)?{expected_delta:result.expected_delta,recipe_rule_version:result.recipe_rule_version}:{}),source:'real',model:typeof result.model==='string'?result.model.slice(0,100):null});
    }catch(e){
      if(e instanceof ChatError)return response({error:e.message},e.status);
      // The provider adapter throws only controlled, non-secret messages.
      if(e?.status===502)return response({error:e.message},502);
      console.error('Alien Zoo chat failed',e?.name||'Error',e?.code||'unknown');
      return response({error:e?.name==='TimeoutError'?'AI回复超时，请重试。':'AI连接暂时失败，请重试。'},503);
    }
  };
}
