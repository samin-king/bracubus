import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import AuthProvider from '../components/AuthProvider.jsx';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import {BookBus} from '../pages/Member2.jsx';
import {authApi} from '../services/authApi.js';
import {member2Api as api} from '../services/member2Api.js';
vi.mock('../services/authApi.js',()=>({authApi:{me:vi.fn(),logout:vi.fn()}}));
vi.mock('../services/member2Api.js',()=>({member2Api:{trips:vi.fn(),seats:vi.fn(),book:vi.fn()}}));
const student={id:1,name:'Student',role:'student'};
const trip={id:'1',bus:'Bus 28',route:'Campus route',capacity:28,departureTime:'06:30',bookingOpen:false};
beforeEach(()=>{vi.resetAllMocks();authApi.me.mockResolvedValue(student);api.trips.mockResolvedValue([trip]);api.seats.mockResolvedValue({trip,bookingOpen:false,genderKnown:true,profileGender:'male',standingEligible:true,standingAvailable:2,standingCapacity:2,seats:Array.from({length:28},(_,i)=>({number:i+1,state:i<18?'Reserved':'Available',reserved:i<18,selectable:i>=18}))});});
afterEach(()=>vi.restoreAllMocks());
function view(){render(<MemoryRouter><AuthProvider><Routes><Route path="/" element={<ProtectedRoute><BookBus/></ProtectedRoute>}/><Route path="/login" element={<p>Sign in required</p>}/></Routes></AuthProvider></MemoryRouter>);}
async function choose(){view();await screen.findByLabelText('Travel date');fireEvent.change(screen.getByLabelText('Travel date'),{target:{value:'2030-01-02'}});fireEvent.click(await screen.findByRole('button',{name:/Bus 28/}));fireEvent.click(await screen.findByRole('button',{name:'Seat 19 Available'}));await screen.findByRole('button',{name:'Seat 19 Selected'});}
it('focus session refresh does not unmount the selected trip or E3, including while pending',async()=>{
 await choose();let finish;authApi.me.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));fireEvent(window,new Event('focus'));await waitFor(()=>expect(finish).toBeTypeOf('function'));
 try{expect(screen.queryByRole('button',{name:'Seat 19 Selected'})).toBeInTheDocument();expect(screen.getByLabelText('Travel date')).toHaveValue('2030-01-02');}finally{await act(async()=>finish(student));}
 expect(screen.getByRole('region',{name:'Your selection'})).toHaveTextContent('E3');expect(api.seats).toHaveBeenCalledTimes(1);
});
it('scheduled session checks preserve selection without a booking-page remount',async()=>{
 const interval=vi.spyOn(window,'setInterval');await choose();const poll=interval.mock.calls.find(([,delay])=>delay===60000)[0];let finish;authApi.me.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));act(()=>{poll();});await waitFor(()=>expect(finish).toBeTypeOf('function'));
 try{expect(screen.queryByRole('button',{name:'Seat 19 Selected'})).toBeInTheDocument();}finally{await act(async()=>finish(student));}
 expect(api.seats).toHaveBeenCalledTimes(1);
});
it('background refresh still removes protected booking UI when the session expires',async()=>{
 await choose();authApi.me.mockResolvedValueOnce(null);fireEvent(window,new Event('focus'));await screen.findByText('Sign in required');expect(screen.queryByRole('button',{name:'Seat 19 Selected'})).not.toBeInTheDocument();
});
