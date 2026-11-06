import test from 'node:test';
import assert from 'node:assert/strict';
import {browser,settle,tick} from './helpers.mjs';
const owner={email:'huangrui1008@gmail.com',email_confirmed_at:'2026-11-07T00:00:00Z'};
const page='https://huangrui1008-collab.github.io/psych-exp/researcher.html';
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status});
const submit=b=>b.document.getElementById('resetForm').dispatchEvent(new b.w.Event('submit',{cancelable:true}));

test('recovery email requires an explicit click and uses only the owner and fixed return URL',async()=>{
 const calls=[];let fail=false;const b=browser('researcher',async(url,init)=>{calls.push([String(url),init]);return fail?reply({msg:'Email rate limit exceeded'},429):reply({});},{url:page});
 try {
  await tick();assert.equal(calls.filter(([u])=>u.includes('/recover?')).length,0);
  b.document.getElementById('email').value='another@example.test';
  b.document.getElementById('recoverBtn').click();await settle(()=>b.document.getElementById('recoveryMessage').textContent.includes('已受理'));
  const [url,init]=calls.find(([u])=>u.includes('/recover?'));
  assert.equal(new URL(url).searchParams.get('redirect_to'),page);assert.deepEqual(JSON.parse(init.body),{email:owner.email});
  fail=true;b.document.getElementById('recoverBtn').click();await settle(()=>b.document.getElementById('recoveryMessage').textContent.includes('无法发送'));
  assert.match(b.document.getElementById('recoveryMessage').textContent,/Email rate limit/);assert.deepEqual(b.errors,[]);
 } finally {b.close();}
});

test('recovery token is removed from URL, owner validated, password confirmation enforced, and no research data auto-loaded',async()=>{
 const calls=[];const b=browser('researcher',async(url,init={})=>{
  calls.push([String(url),init]);
  if(String(url).endsWith('/user'))return reply(owner);
  if(String(url).includes('/logout?'))return new Response(null,{status:204});
  return reply({ready:true});
 },{url:page+'#type=recovery&access_token=test-recovery&refresh_token=test-refresh'});
 try {
  assert.equal(b.w.location.hash,'');assert.equal(b.w.localStorage.length,0);assert.equal(b.w.sessionStorage.length,0);
  await settle(()=>!b.document.getElementById('savePassword').disabled);
  assert.equal(b.document.getElementById('resetCard').hidden,false);assert.equal(b.document.getElementById('authCard').hidden,true);
  assert.equal(calls.find(([u])=>u.endsWith('/user'))[1].headers.Authorization,'Bearer test-recovery');
  b.document.getElementById('newPassword').value='test-new-password';b.document.getElementById('confirmPassword').value='different';submit(b);
  assert.equal(calls.some(([,i])=>i.method==='PUT'),false);
  b.document.getElementById('confirmPassword').value='test-new-password';submit(b);
  await settle(()=>b.document.getElementById('authMessage').textContent.includes('密码已更新'));
  const [,update]=calls.find(([,i])=>i.method==='PUT');assert.deepEqual(JSON.parse(update.body),{password:'test-new-password'});
  assert.equal(b.document.getElementById('newPassword').value,'');assert.equal(b.document.getElementById('confirmPassword').value,'');
  assert.equal(b.document.getElementById('resetCard').hidden,true);assert.equal(b.document.getElementById('metrics').hidden,true);
  assert.equal(calls.some(([u])=>u.includes('/research/')),false);assert.ok(calls.some(([u])=>u.includes('/logout?scope=global')));
  assert.equal(b.w.localStorage.length,0);assert.equal(b.w.sessionStorage.length,0);assert.deepEqual(b.errors,[]);
 } finally {b.close();}
});

test('invalid, expired, other-user and unconfirmed recovery credentials never enable password submission',async()=>{
 for(const user of [{...owner,email:'other@example.test'},{...owner,email_confirmed_at:null},null]){
  const calls=[];const b=browser('researcher',async(url,init)=>{calls.push([String(url),init]);return String(url).endsWith('/user')?(user?reply(user):reply({msg:'JWT expired'},401)):reply({ready:true});},{url:page+'#type=recovery&access_token=test-recovery'});
  try {await settle(()=>b.document.getElementById('resetMessage').textContent.includes('验证失败'));assert.equal(b.document.getElementById('savePassword').disabled,true);assert.equal(calls.some(([,i])=>i?.method==='PUT'),false);assert.equal(b.w.location.hash,'');assert.deepEqual(b.errors,[]);}finally{b.close();}
 }
 for(const hash of ['#error=access_denied&error_description=expired','#type=signup&access_token=not-recovery']){
  let userReads=0;const b=browser('researcher',async url=>{if(String(url).endsWith('/user'))userReads++;return reply({ready:true});},{url:page+hash});
  try {await tick();assert.equal(b.w.location.hash,'');assert.match(b.document.getElementById('authMessage').textContent,/恢复链接无效/);assert.equal(userReads,0);assert.equal(b.document.getElementById('resetCard').hidden,true);}finally{b.close();}
 }
});

test('password update failure stays visible and clears both new password fields; login errors explain recovery',async()=>{
 const b=browser('researcher',async(url,init={})=>String(url).includes('/token?')?reply({error_description:'Invalid login credentials'},400):String(url).endsWith('/user')?(init.method==='PUT'?reply({msg:'New password should be different'},422):reply(owner)):reply({ready:true}),{url:page+'#type=recovery&access_token=test-recovery'});
 try {
  await settle(()=>!b.document.getElementById('savePassword').disabled);
  for(const id of ['newPassword','confirmPassword'])b.document.getElementById(id).value='test-new-password';submit(b);
  await settle(()=>b.document.getElementById('resetMessage').textContent.includes('密码未更新'));
  assert.match(b.document.getElementById('resetMessage').textContent,/New password/);assert.equal(b.document.getElementById('newPassword').value,'');
  b.document.getElementById('cancelRecovery').click();
  b.document.getElementById('password').value='not-a-real-password';b.document.getElementById('loginForm').dispatchEvent(new b.w.Event('submit',{cancelable:true}));
  await settle(()=>b.document.getElementById('authMessage').textContent.includes('忘记密码'));
  assert.equal(b.document.getElementById('password').value,'');assert.deepEqual(b.errors,[]);
 } finally {b.close();}
});
