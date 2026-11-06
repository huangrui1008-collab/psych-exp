import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('migration preserves historical rows, blocks all browser roles, checks column grants and is repeatable',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table public.experiment_data(pid uuid,group_name text,essay text,timestamp timestamptz);insert into public.experiment_data values ('00000000-0000-4000-8000-000000000001','A','真实历史数据',now());grant all on experiment_data to anon,authenticated;grant select(essay) on experiment_data to anon;`);
 const sql=fs.readFileSync(new URL('../supabase/migrations/202611060001_secure_study2.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 assert.equal((await db.query('select essay from experiment_data')).rows[0].essay,'真实历史数据');
 assert.equal((await db.query('select study2_backend_ready() as ready')).rows[0].ready,true);
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  for(const table of ['experiment_data','study2_sessions','study2_researchers'])await assert.rejects(db.query('select * from '+table),/permission denied/);
  await assert.rejects(db.query(`insert into study2_researchers values ('00000000-0000-4000-8000-000000000001',now())`),/permission denied/);
  await assert.rejects(db.query('select study2_field_schema()'),/permission denied/);await db.exec('reset role');
 }
 await db.exec('grant select(essay) on experiment_data to anon');assert.equal((await db.query('select study2_backend_ready() as ready')).rows[0].ready,false);
 await db.exec(sql);assert.equal((await db.query('select study2_backend_ready() as ready')).rows[0].ready,true);
 assert.equal((await db.query("select study2_reserve_quota('chat:today',1) as ok")).rows[0].ok,true);assert.equal((await db.query("select study2_reserve_quota('chat:today',1) as ok")).rows[0].ok,false);
 assert.ok((await db.query('select * from study2_field_schema()')).rows.some(x=>x.table_name==='experiment_data'&&x.column_name==='essay'));
 }finally{await db.close();}
});
test('named owner is granted only after email confirmation and revoked after an email change',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create table public.study2_researchers(user_id uuid primary key references auth.users(id),added_at timestamptz default now());insert into auth.users values ('00000000-0000-4000-8000-000000000001','huangrui1008@gmail.com',null),('00000000-0000-4000-8000-000000000002','other@example.test',now());`);
 const sql=fs.readFileSync(new URL('../supabase/migrations/202611060002_owner_researcher.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 const count=async()=>Number((await db.query('select count(*) as n from study2_researchers')).rows[0].n);
 assert.equal(await count(),0);
 await db.exec("update auth.users set email_confirmed_at=now() where id='00000000-0000-4000-8000-000000000001'");assert.equal(await count(),1);
 await db.exec("update auth.users set email='changed@example.test' where id='00000000-0000-4000-8000-000000000001'");assert.equal(await count(),0);
 await db.exec("insert into auth.users values ('00000000-0000-4000-8000-000000000003','huangrui1008@gmail.com',now())");assert.equal(await count(),1);
 await db.exec('set role anon');await assert.rejects(db.query('select study2_sync_owner_researcher()'),/permission denied/);await db.exec('reset role');
 }finally{await db.close();}
});
