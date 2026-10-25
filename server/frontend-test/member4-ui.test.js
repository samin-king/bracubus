import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import request from 'supertest';
import {testPool} from '../test-support/database.js';
import {migrate,seed} from '../src/utils/database.js';
import {createApp} from '../src/app.js';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn){for(let i=0;i<400;i++){if(fn())return;await wait(10);}throw new Error('Timed out waiting for Member 4 UI');}
const button=(doc,label)=>[...doc.querySelectorAll('button')].find(x=>x.textContent===label);
function fill(dom,label,value) {
 const el=[...dom.window.document.querySelectorAll('label')].find(x=>x.textContent.startsWith(label))?.querySelector('input,textarea,select');
 assert.ok(el,'Field '+label);
 const proto=el.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:el.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;
 Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);
 el.dispatchEvent(new dom.window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));
}
test('Built Member 4 UI uses actual protected APIs',async t=>{
 const pool=await testPool(),db=await pool.connect(),schema='ui_member4_'+Date.now();
 const pendingRequests=new Set();
 try {
  await db.query('CREATE SCHEMA '+schema);await db.query('SET search_path TO '+schema);await migrate(db);await seed(db);await db.query("INSERT INTO users(google_subject,name,email,role) VALUES ('ui1','UI Student','ui1@g.bracu.ac.bd','student'),('ui2','UI Authority','ui2@g.bracu.ac.bd','authority')");
  const assets=new URL('../../Client/dist/assets/',import.meta.url),file=(await readdir(assets)).find(x=>x.endsWith('.js'));
  const source=await readFile(new URL(file,assets),'utf8');
  async function render(page,auth={user_id:'1',role:'student'}) {
   const app=createApp(db,{authenticateUser:(req,res,next)=>{req.auth=auth;next();}});
   const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost:5173/transport',runScripts:'outside-only'});
   dom.window.fetch=async(url,options={})=>{
    if(url==='/api/auth/me')return {ok:true,status:200,json:async()=>({id:'1',name:'UI User',role:auth?.role||'student'})};
    let call=request(app)[(options.method||'GET').toLowerCase()](url);
    if(options.body)call=call.set('Content-Type','application/json').send(options.body);
    const task=Promise.resolve(call);pendingRequests.add(task);
    try{const response=await task;return {ok:response.status<400,status:response.status,json:async()=>response.body};}finally{pendingRequests.delete(task);}
   };
   dom.window.eval(source);
   await until(()=>button(dom.window.document,page));
   button(dom.window.document,page).click();
   await until(()=>[...dom.window.document.querySelectorAll('h1')].some(h=>h.textContent===page.toLowerCase().replace(/^c/,'C')||h.textContent===page));
   return {dom,doc:dom.window.document};
  }
  await t.test('student submits complaint, sees own history and opens details',async()=>{
   const {dom,doc}=await render('Complaints');
   try {
    await until(()=>doc.body.textContent.includes('No complaints found.'));
    fill(dom,'Description','Bus arrived late');
    await wait(10);
    button(doc,'Submit complaint').click();
    await until(()=>doc.body.textContent.includes('Complaint submitted'));
    assert.match(doc.body.textContent,/Bus arrived late/);
    [...doc.querySelectorAll('button')].find(x=>x.textContent.startsWith('View complaint #')).click();
    await until(()=>doc.body.textContent.includes('Awaiting response'));
    assert.match(doc.body.textContent,/pending/);
   }finally{dom.window.close();}
  });
  await t.test('authority filters complaints, opens detail, changes status and responds',async()=>{
   const {dom,doc}=await render('Complaint Management',{user_id:'2',role:'authority'});
   try {
    await until(()=>doc.body.textContent.includes('Bus arrived late'));
    fill(dom,'Search complaints','Bus arrived');await wait(10);button(doc,'Filter complaints').click();await wait(0);
    await until(()=>[...doc.querySelectorAll('button')].some(x=>x.textContent.startsWith('Manage complaint #')));
    [...doc.querySelectorAll('button')].find(x=>x.textContent.startsWith('Manage complaint #')).click();
    await until(()=>button(doc,'Update complaint'));
    fill(dom,'Complaint status','resolved');await wait(10);fill(dom,'Authority response','Schedule reviewed');await wait(10);
    button(doc,'Update complaint').click();
    await until(()=>doc.body.textContent.includes('Complaint updated'));
    assert.equal((await db.query("SELECT status FROM complaints WHERE user_id='1'")).rows[0].status,'resolved');
   }finally{dom.window.close();}
  });
  await t.test('student submits feedback and sees history',async()=>{
   const {dom,doc}=await render('Feedback');
   try {
    await until(()=>doc.body.textContent.includes('No feedback found.'));
    fill(dom,'Rating','4');await wait(10);fill(dom,'Comment (optional)','Comfortable ride');await wait(10);
    button(doc,'Submit feedback').click();
    await until(()=>doc.body.textContent.includes('Feedback submitted'));
    assert.match(doc.body.textContent,/Rating: 4\/5/);assert.match(doc.body.textContent,/Comfortable ride/);
   }finally{dom.window.close();}
  });
  await t.test('notifications show real complaint events and mark one then all read',async()=>{
   const {dom,doc}=await render('Notifications');
   try {
    await until(()=>doc.body.textContent.includes('Unread: 2'));
    assert.match(doc.body.textContent,/Schedule reviewed/);
    button(doc,'Mark as read').click();await until(()=>doc.body.textContent.includes('Unread: 1'));
    button(doc,'Mark all as read').click();await until(()=>doc.body.textContent.includes('Unread: 0'));
    assert.equal(button(doc,'Mark all as read').disabled,true);
   }finally{dom.window.close();}
  });
  await t.test('unauthenticated API errors render inline',async()=>{
   const {dom,doc}=await render('Complaints',null);
   try{await until(()=>doc.querySelector('[role="alert"]'));assert.match(doc.querySelector('[role="alert"]').textContent,/Authenticated user required/);}
   finally{dom.window.close();}
  });
  await t.test('student navigation hides management and driver pages',async()=>{
   const {dom,doc}=await render('Complaints');
   try{assert.equal(button(doc,'Complaint Management'),undefined);assert.equal(button(doc,'Driver Dashboard'),undefined);assert.equal(button(doc,'Drivers'),undefined);}
   finally{dom.window.close();}
  });
 }finally{await wait(0);await Promise.allSettled([...pendingRequests]);await db.query('SET search_path TO public');await db.query('DROP SCHEMA '+schema+' CASCADE');db.release();await pool.end();}
});
