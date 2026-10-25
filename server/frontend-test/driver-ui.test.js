import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import request from 'supertest';
import {testPool} from '../test-support/database.js';
import {migrate,seed} from '../src/utils/database.js';
import {createApp} from '../src/app.js';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(condition){for(let i=0;i<250;i++){if(condition())return;await wait(10);}throw new Error('Timed out waiting for dashboard');}

test('Built Driver Dashboard connects to driver APIs',async t=>{
 const pool=await testPool(),db=await pool.connect();
 const schema='ui_driver_'+Date.now();
 try{
  await db.query('CREATE SCHEMA '+schema);await db.query('SET search_path TO '+schema);await migrate(db);await seed(db);
  const driver=(await db.query("SELECT id FROM drivers WHERE license_number='DEV-DL-001'")).rows[0];
  const app=createApp(db,{authenticateDriver:(req,res,next)=>{req.auth={role:'driver',driver_id:driver.id};next();},authorizeManagement:(req,res,next)=>next()});
  const assets=new URL('../../Client/dist/assets/',import.meta.url);
  const script=(await readdir(assets)).find(name=>name.endsWith('.js'));
  if(!script)throw new Error('Build frontend before running UI tests');
  const source=await readFile(new URL(script,assets),'utf8');
  async function render(mode='normal'){
   const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'http://localhost:5173/transport',runScripts:'outside-only'});
   let release;const gate=new Promise(resolve=>{release=resolve;});
   dom.window.fetch=async(url,options={})=>{
    if(url==='/api/auth/me')return {ok:true,status:200,json:async()=>({id:'1',name:'UI User',role:'driver'})};
    const method=(options.method||'GET').toLowerCase();
    if((mode==='delay'&&String(url).startsWith('/api/drivers/'))||(mode==='actionDelay'&&method==='post'))await gate;
    if(mode==='error'||(mode==='actionError'&&method==='post'))return {ok:false,status:503,json:async()=>({error:'Test API unavailable'})};
    let req=request(app)[method](url);
    if(options.body)req=req.set('Content-Type','application/json').send(options.body);
    const response=await req;
    return {ok:response.status<400,status:response.status,json:async()=>mode==='empty'&&String(url).endsWith('/trips')?[]:response.body};
   };
   dom.window.eval(source);
   await until(()=>Array.from(dom.window.document.querySelectorAll('nav button')).some(b=>b.textContent==='Driver Dashboard'));
   Array.from(dom.window.document.querySelectorAll('nav button')).find(b=>b.textContent==='Driver Dashboard').click();
   return {dom,document:dom.window.document,release};
  }
  await t.test('dashboard loads driver and assigned bus route date and time',async()=>{
   const {dom,document}=await render();try{await until(()=>document.body.textContent.includes('Welcome, Development Driver One'));assert.match(document.body.textContent,/BRACU-01/);assert.match(document.body.textContent,/Mirpur|Uttara/);assert.match(document.body.textContent,/Dhaka/);assert.match(document.body.textContent,/Passenger information will be available/);}finally{dom.window.close();}
  });
  await t.test('start and stop update status, timestamps and success feedback',async()=>{
   const {dom,document}=await render();try{
    await until(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Start Trip'));
    let button=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Start Trip');
    const card=button.closest('article');button.click();
    await until(()=>document.body.textContent.includes('Trip started'));
    assert.match(card.textContent,/Status: ACTIVE/);assert.match(card.textContent,/Started:/);
    button=Array.from(card.querySelectorAll('button')).find(b=>b.textContent==='Stop Trip');assert.ok(button);button.click();
    await until(()=>document.body.textContent.includes('Trip completed'));
    assert.match(card.textContent,/Status: COMPLETED/);assert.match(card.textContent,/Completed:/);assert.equal(card.querySelectorAll('button').length,0);
   }finally{dom.window.close();}
  });
  await t.test('loading state is shown while requests are pending',async()=>{
   const {dom,document,release}=await render('delay');try{await until(()=>document.body.textContent.includes('Loading assigned trips'));release();await until(()=>document.body.textContent.includes('Welcome,'));}finally{release();dom.window.close();}
  });
  await t.test('trip buttons stay disabled during action request',async()=>{
   const {dom,document,release}=await render('actionDelay');try{await until(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Start Trip'));const button=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Start Trip');button.click();await until(()=>button.textContent==='Updating...');assert.equal(button.disabled,true);release();await until(()=>document.body.textContent.includes('Trip started'));const stop=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Stop Trip');stop.click();await until(()=>document.body.textContent.includes('Trip completed'));}finally{release();dom.window.close();}
  });
  await t.test('empty assigned trips state',async()=>{
   const {dom,document}=await render('empty');try{await until(()=>document.body.textContent.includes('No assigned trips.'));assert.equal(document.querySelectorAll('article').length,0);}finally{dom.window.close();}
  });
  await t.test('load errors display an inline retry state',async()=>{
   const {dom,document}=await render('error');try{await until(()=>document.querySelector('[role="alert"]'));assert.match(document.querySelector('[role="alert"]').textContent,/Test API unavailable/);assert.ok(Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Retry'));}finally{dom.window.close();}
  });
  await t.test('action errors retain scheduled state and re-enable controls',async()=>{
   const {dom,document}=await render('actionError');try{await until(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Start Trip'));const button=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Start Trip');const card=button.closest('article');button.click();await until(()=>document.querySelector('[role="alert"]'));assert.match(card.textContent,/Status: SCHEDULED/);assert.match(document.body.textContent,/Test API unavailable/);assert.equal(button.disabled,false);}finally{dom.window.close();}
  });
 }finally{await db.query('SET search_path TO public');await db.query('DROP SCHEMA '+schema+' CASCADE');db.release();await pool.end();}
});
