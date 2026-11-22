import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const apiPrefix='/__preview/experiment-api';
const assets=new Map([
 ['/','index.html'],['/index.html','index.html'],['/alien-zoo.js','alien-zoo.js'],
 ['/participant.css','participant.css'],['/researcher.html','researcher.html'],
 ['/researcher.css','researcher.css'],['/researcher.js','researcher.js'],
 ['/alien-researcher.js','alien-researcher.js'],['/materials.js','materials.js']
]);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};

function answer(res,status,body,type='application/json; charset=utf-8'){
 res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 res.end(typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body));
}
async function requestBody(req){
 let length=0;const chunks=[];
 for await(const chunk of req){length+=chunk.length;if(length<=50000)chunks.push(chunk);}
 if(length>50000)throw Object.assign(new Error('本次对话过长，请缩短问题。'),{status:413});
 return Buffer.concat(chunks).toString('utf8');
}

// Local-only game bridge: fixed upstream and two routes, not a general proxy.
// No provider or service-role credentials are read or stored here.
export async function createPreviewServer({root=projectRoot,upstreamFetch=fetch}={}){
 const configText=await readFile(path.join(root,'config.js'),'utf8');
 const config=JSON.parse(configText.match(/Object\.freeze\(([\s\S]+)\);/)?.[1]||'null');
 if(!config||!/^https:\/\/[a-z0-9]+\.supabase\.co\/functions\/v1\/experiment-api$/.test(config.API_BASE))throw Error('预览的后台地址无效');
 const server=http.createServer(async(req,res)=>{
  try{
   const port=server.address().port;
   const hosts=new Set(['localhost:'+port,'127.0.0.1:'+port]);
   if(!hosts.has(req.headers.host))return answer(res,403,{error:'仅允许本机预览访问。'});
   const localOrigin='http://'+req.headers.host;
   const url=new URL(req.url,localOrigin);
   if(url.pathname.startsWith(apiPrefix)){
    if(req.method!=='POST')return answer(res,405,{error:'仅支持游戏POST请求。'});
    if(req.headers.origin!==localOrigin||req.headers['sec-fetch-site']==='cross-site')return answer(res,403,{error:'仅允许当前本机页面调用。'});
    const route=url.pathname.slice(apiPrefix.length);
    if(url.search||!['/game/access','/game/chat'].includes(route))return answer(res,404,{error:'本机预览只连接游戏AI。'});
    if(!String(req.headers['content-type']||'').startsWith('application/json'))return answer(res,415,{error:'请求格式无效。'});
    if(Number(req.headers['content-length']||0)>50000)return answer(res,413,{error:'本次对话过长，请缩短问题。'});
    const body=await requestBody(req);
    try{JSON.parse(body);}catch{return answer(res,400,{error:'请求格式无效。'});}
    const headers={'Content-Type':'application/json',apikey:config.SUPABASE_KEY};
    const token=req.headers['x-game-token'];
    if(typeof token==='string'&&token.length<=1000)headers['X-Game-Token']=token;
    // This server-to-server call uses the same game capability checks as the site.
    // Browser cookies, research JWTs and Origin headers are never forwarded.
    const abort=new AbortController();const timeout=setTimeout(()=>abort.abort(),60000);
    const disconnect=()=>{if(!res.writableFinished)abort.abort();};res.on('close',disconnect);
    try{
     const upstream=await upstreamFetch(config.API_BASE+route,{method:'POST',headers,body,redirect:'error',signal:abort.signal});
     const text=await upstream.text();
     let value;try{value=JSON.parse(text);}catch{return answer(res,502,{error:'AI后台暂未返回有效内容，请重试。'});}
     return answer(res,upstream.status,value);
    }finally{clearTimeout(timeout);res.off('close',disconnect);}
   }
   if(!['GET','HEAD'].includes(req.method))return answer(res,405,{error:'方法不受支持。'});
   if(url.pathname==='/__preview/health')return answer(res,200,{ready:true,scope:'local-game-preview'});
   if(url.pathname==='/config.js')return answer(res,200,'// Local preview only; provider credentials remain on the backend.\nconst APP_CONFIG = Object.freeze('+JSON.stringify({...config,API_BASE:apiPrefix},null,2)+');\n',types['.js']);
   const file=assets.get(url.pathname);
   if(!file)return answer(res,404,{error:'页面不存在。'});
   return answer(res,200,req.method==='HEAD'?'':await readFile(path.join(root,file)),types[path.extname(file)]);
  }catch(error){
   if(res.destroyed||res.headersSent)return;
   answer(res,error.status||502,{error:error.status?error.message:'本机暂时无法连接AI后台，请稍后重试。'});
  }
 });
 server.requestTimeout=65000;
 return server;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.ALIEN_ZOO_PREVIEW_PORT||8775);
 const server=await createPreviewServer();
 server.listen(port,'127.0.0.1',()=>console.log('Local preview: http://localhost:'+port+'/?group=B'));
 server.on('error',error=>{console.error('Local preview could not start:',error.code||'Error');process.exitCode=1;});
}
