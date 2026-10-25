import React from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';
afterEach(()=>{vi.unstubAllGlobals();window.history.replaceState(null,'','/');});
function sessionFetch(role,initial=false){
 let signedIn=initial;
 const user={id:7,name:'Role Test User',email:'role.test@g.bracu.ac.bd',role,...(role==='driver'?{driver_id:2}:{})};
 const fetch=vi.fn(async(url,options={})=>{
  let status=200,body=[];
  if(url==='/api/auth/me'){status=signedIn?200:401;body=signedIn?user:{error:'unauthenticated'};}
  else if(url==='/api/auth/development/email-login'){
   expect(Object.keys(JSON.parse(options.body))).toEqual(['email']);signedIn=true;body={authenticated:true,user};
  }else if(url==='/api/auth/logout'){signedIn=false;status=204;}
  else if(url==='/api/drivers/me')body={id:2,name:'Test Driver',status:'ACTIVE'};
  else if(url==='/api/drivers/me/trips')body=[];
  return {ok:status>=200&&status<300,status,json:async()=>body};
 });
 vi.stubGlobal('fetch',fetch);return {fetch,user};
}
for(const [role,path,heading] of [['student','/','Student Dashboard'],['driver','/driver','Driver Dashboard'],['authority','/transport','Trips']]){
 it(`${role} email login lands on its role dashboard through AuthProvider`,async()=>{
  sessionFetch(role);window.history.replaceState(null,'','/login');render(<App/>);const user=userEvent.setup();
  await user.type(await screen.findByRole('textbox',{name:'BRACU email'}),'role.test@g.bracu.ac.bd');await user.click(screen.getByRole('button',{name:'Login',exact:true}));
  await screen.findByRole('heading',{name:heading});expect(window.location.pathname).toBe(path);
  if(role==='driver'){expect(await screen.findByText('Welcome, Test Driver')).toBeInTheDocument();expect(screen.queryByRole('link',{name:'Book a Seat'})).not.toBeInTheDocument();}
  await user.click(screen.getByRole('button',{name:'Logout'}));await screen.findByRole('textbox',{name:'BRACU email'});expect(window.location.pathname).toBe('/login');
 });
}
it('student cannot enter the driver route even by URL',async()=>{
 sessionFetch('student',true);window.history.replaceState(null,'','/driver');render(<App/>);
 await screen.findByRole('heading',{name:'Student Dashboard'});expect(window.location.pathname).toBe('/');expect(screen.queryByRole('heading',{name:'Driver Dashboard'})).not.toBeInTheDocument();
});
it('driver cannot enter student booking/history routes even by URL',async()=>{
 const {fetch}=sessionFetch('driver',true);window.history.replaceState(null,'','/bookings');render(<App/>);
 await screen.findByRole('heading',{name:'Driver Dashboard'});expect(window.location.pathname).toBe('/driver');expect(fetch.mock.calls.some(([url])=>url==='/api/student/bookings')).toBe(false);
});

it('driver cannot open the student profile route',async()=>{
 const {fetch}=sessionFetch('driver',true);window.history.replaceState(null,'','/profile');render(<App/>);await screen.findByRole('heading',{name:'Driver Dashboard'});expect(window.location.pathname).toBe('/driver');expect(fetch.mock.calls.some(([url])=>url==='/api/student/profile')).toBe(false);
});
