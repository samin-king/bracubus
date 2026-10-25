import React,{useState} from 'react';
import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import SeatMap,{seatLabel} from '../components/SeatMap.jsx';
import {BookBus,Complaints as StudentComplaints,StudentDashboard} from '../pages/Member2.jsx';
import Complaints from '../pages/Complaints.jsx';
import Feedback from '../pages/Feedback.jsx';
import LiveTracking from '../pages/LiveTracking.jsx';
import Transport from '../Transport.jsx';
import {AuthContext} from '../hooks/useAuth.js';
import {member2Api} from '../services/member2Api.js';
import {member4Api} from '../services/member4Api.js';
import {tripApi} from '../services/tripApi.js';
vi.mock('../services/member2Api.js',()=>({member2Api:Object.fromEntries(['bookings','trips','seats','book','complaints','complain'].map(k=>[k,vi.fn()]))}));
vi.mock('../services/member4Api.js',()=>({member4Api:Object.fromEntries(['notifications','complaints','submitComplaint','feedback','submitFeedback'].map(k=>[k,vi.fn()]))}));
vi.mock('../services/tripApi.js',()=>({tripApi:{list:vi.fn()}}));
const student={id:1,name:'Student',role:'student'};
const trip={id:'1',bus:'BRACU-01',route:'Campus route',departureTime:'14:00',capacity:37,bookingOpen:true};
const seatData={trip,bookingOpen:true,genderKnown:true,standingEligible:true,standingAvailable:2,seats:Array.from({length:37},(_,i)=>({number:i+1,reserved:i<18,state:i===19?'Booked':i<18?'Reserved':'Available',selectable:i>=18&&i!==19}))};
function wrapper(ui){return render(<AuthContext.Provider value={{user:student}}><MemoryRouter>{ui}</MemoryRouter></AuthContext.Provider>);}
beforeEach(()=>{vi.resetAllMocks();member2Api.bookings.mockResolvedValue([]);member2Api.complaints.mockResolvedValue([]);member2Api.trips.mockResolvedValue([trip]);member2Api.seats.mockResolvedValue(seatData);member4Api.notifications.mockResolvedValue([]);member4Api.complaints.mockResolvedValue([]);member4Api.feedback.mockResolvedValue([]);tripApi.list.mockResolvedValue([]);});
it('uses backend seat capacity and numeric IDs with lettered rows and a center aisle',()=>{
 const select=vi.fn();render(<SeatMap data={seatData} selected={null} busy={false} onSelect={select}/>);
 expect(screen.getByLabelText('Seat map').querySelectorAll('button')).toHaveLength(37);
 expect(seatLabel(19)).toBe('E3');expect(seatLabel(37)).toBe('J1');
 const seat=screen.getByRole('button',{name:'Seat 19 Available'});expect(seat).toHaveStyle({gridColumn:'4',gridRow:'5'});expect(seat).toHaveTextContent('E3');fireEvent.click(seat);expect(select).toHaveBeenCalledWith(19);
 expect(screen.getByRole('button',{name:'Seat 20 Booked'})).toBeDisabled();
});
it('standing respects backend eligibility/capacity and allows a selection preview before the window opens',()=>{
 const select=vi.fn();const {rerender}=render(<SeatMap data={{...seatData,standingEligible:false}} selected={null} onSelect={select}/>);
 expect(screen.getByRole('button',{name:'Select Standing'})).toBeDisabled();
 rerender(<SeatMap data={{...seatData,standingAvailable:0}} selected={null} onSelect={select}/>);expect(screen.getByText('Standing is full.')).toBeInTheDocument();
 rerender(<SeatMap data={{...seatData,bookingOpen:false}} selected={null} onSelect={select}/>);expect(screen.getByRole('button',{name:'Select Standing'})).toBeEnabled();fireEvent.click(screen.getByRole('button',{name:'Select Standing'}));expect(select).toHaveBeenCalledWith('standing');
 rerender(<SeatMap data={seatData} selected="standing" onSelect={select}/>);expect(screen.getByRole('button',{name:'Standing selected'})).toHaveAttribute('aria-pressed','true');
});
it('standing selection sends the unchanged booking payload',async()=>{
 member2Api.book.mockRejectedValue(new Error('Test completed'));
 wrapper(<BookBus/>);fireEvent.click(await screen.findByRole('button',{name:/BRACU-01/}));fireEvent.click(await screen.findByRole('button',{name:'Select Standing'}));fireEvent.click(screen.getByRole('button',{name:'Confirm booking'}));
 await waitFor(()=>expect(member2Api.book).toHaveBeenCalledWith(expect.objectContaining({tripId:'1',standing:true,seatNumber:null})));
});
it('specific student complaint category needs no free-text details and maps into the existing API',async()=>{
 member2Api.complain.mockResolvedValue({});wrapper(<StudentComplaints/>);await screen.findByText('No complaints submitted.');
 fireEvent.change(screen.getByLabelText('Category'),{target:{value:'Harassment'}});fireEvent.click(screen.getByRole('button',{name:'Submit complaint'}));
 await waitFor(()=>expect(member2Api.complain).toHaveBeenCalledWith(expect.objectContaining({category:'Driver behaviour',subject:'Harassment',description:'[Harassment]'})));
});
it('Member 4 categories map to supported categories and retain the detailed choice',async()=>{
 member4Api.submitComplaint.mockResolvedValue({});wrapper(<Complaints/>);fireEvent.change(screen.getByLabelText('Complaint Category'),{target:{value:'Rash / Reckless Driving'}});fireEvent.click(screen.getByRole('button',{name:'Submit complaint'}));
 await waitFor(()=>expect(member4Api.submitComplaint).toHaveBeenCalledWith(expect.objectContaining({category:'safety',description:'[Rash / Reckless Driving]'})));
});
it('star rating and feedback category use the existing feedback fields',async()=>{
 member4Api.submitFeedback.mockResolvedValue({});wrapper(<Feedback/>);fireEvent.click(screen.getByRole('radio',{name:'4 stars'}));fireEvent.change(screen.getByLabelText('Feedback category'),{target:{value:'Tracking'}});fireEvent.change(screen.getByLabelText('Comment (optional)'),{target:{value:'Helpful route view'}});fireEvent.click(screen.getByRole('button',{name:'Submit feedback'}));
 await waitFor(()=>expect(member4Api.submitFeedback).toHaveBeenCalledWith({target:'service',rating:4,comment:'[Tracking]\n\nHelpful route view'}));
});
it('tracking displays API route, driver and status while identifying simulated positions',async()=>{
 tripApi.list.mockResolvedValue([{id:1,status:'ACTIVE',bus:{bus_number:'BRACU-01',capacity:37},route:{route_name:'Campus route',origin:'City',destination:'Campus',stops:['City','Campus']},driver:{name:'Driver One'},travel_date:'2030-01-02',departure_time:'06:30:00'}]);wrapper(<LiveTracking/>);
 await screen.findByRole('heading',{name:'BRACU-01'});expect(screen.getByText('Driver One')).toBeInTheDocument();expect(screen.getByText(/Positions are illustrative/)).toBeInTheDocument();expect(screen.getAllByText('ACTIVE').length).toBeGreaterThan(0);
});
it('student transport navigation hides authority and driver-only screens',async()=>{
 wrapper(<Transport/>);expect(screen.queryByRole('button',{name:'Complaint Management'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Drivers'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Driver Dashboard'})).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'Live Bus Tracking'})).toBeInTheDocument();
});
it('dashboard uses real upcoming bookings and does not fabricate transport credit',async()=>{
 member2Api.bookings.mockResolvedValue([{id:7,section:'Upcoming',departure_at:'2030-01-02T08:00:00Z',trip_snapshot:trip,travel_date:'2030-01-02',status:'confirmed'}]);wrapper(<StudentDashboard/>);await screen.findByRole('link',{name:/View booking/});expect(screen.getByText('Balance unavailable')).toBeInTheDocument();expect(screen.getAllByText('Campus route').length).toBeGreaterThan(0);
});

it('a changed role cannot retain an authority-only transport screen',async()=>{
 const {rerender}=render(<AuthContext.Provider value={{user:{...student,role:'authority'}}}><MemoryRouter><Transport/></MemoryRouter></AuthContext.Provider>);
 expect(screen.getByRole('button',{name:'Drivers'})).toBeInTheDocument();
 rerender(<AuthContext.Provider value={{user:student}}><MemoryRouter><Transport/></MemoryRouter></AuthContext.Provider>);
 expect(screen.queryByRole('button',{name:'Drivers'})).not.toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'Live Bus Tracking'})).toBeInTheDocument();
});

it('female seats remain selectable but standing is disabled regardless of remaining capacity',()=>{
 const female={...seatData,femaleReservedSeats:12,standingRemaining:2,standingAvailable:0,standingEligible:false,seats:Array.from({length:12},(_,i)=>({number:i+1,reserved:true,state:'Reserved',selectable:true}))};
 const select=vi.fn();render(<SeatMap data={female} selected={null} onSelect={select}/>);
 expect(screen.getByLabelText('Seat map').querySelectorAll('button')).toHaveLength(12);
 fireEvent.click(screen.getByRole('button',{name:'Seat 1 Reserved'}));expect(select).toHaveBeenCalledWith(1);
 expect(screen.getByRole('button',{name:'Select Standing'})).toBeDisabled();expect(screen.getByText(/Female-reserved range: 1 to 12/)).toBeInTheDocument();
 expect(screen.getByRole('region',{name:'Standing'})).toHaveTextContent('Available: 2');
});

it('28-seat male selection is interactive while confirmation respects a closed booking window',async()=>{
 const maleData={...seatData,bookingOpen:false,trip:{...trip,capacity:28,bookingOpen:false},seats:Array.from({length:28},(_,i)=>({number:i+1,reserved:i<18,state:i<18?'Reserved':i===24?'Booked':'Available',selectable:i>=18&&i!==24}))};
 member2Api.trips.mockResolvedValue([maleData.trip]);member2Api.seats.mockResolvedValue(maleData);
 wrapper(<BookBus/>);fireEvent.click(await screen.findByRole('button',{name:/BRACU-01/}));
 const e3=await screen.findByRole('button',{name:'Seat 19 Available'});expect(e3).toBeEnabled();fireEvent.click(e3);
 expect(screen.getByRole('button',{name:'Seat 19 Selected'})).toHaveAttribute('aria-pressed','true');expect(screen.getByRole('region',{name:'Your selection'})).toHaveTextContent('Seat E3');
 fireEvent.click(screen.getByRole('button',{name:'Seat 20 Available'}));expect(screen.getByRole('region',{name:'Your selection'})).toHaveTextContent('Seat E4');expect(screen.getByRole('button',{name:'Seat 19 Available'})).toBeEnabled();
 expect(screen.getByRole('button',{name:'Seat 1 Reserved'})).toBeDisabled();expect(screen.getByRole('button',{name:'Seat 25 Booked'})).toBeDisabled();
 expect(screen.getByRole('button',{name:'Confirm booking'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'Select Standing'}));expect(screen.getByRole('region',{name:'Your selection'})).toHaveTextContent('Standing ticket selected');expect(screen.getByRole('button',{name:'Confirm booking'})).toBeDisabled();expect(member2Api.book).not.toHaveBeenCalled();
});

it('28-seat E3 submission uses its original numeric ID during an open window',async()=>{
 const data={...seatData,trip:{...trip,capacity:28},seats:seatData.seats.slice(0,28)};
 member2Api.trips.mockResolvedValue([data.trip]);member2Api.seats.mockResolvedValue(data);member2Api.book.mockResolvedValue({id:4,trip_id:'1',trip_snapshot:data.trip,travel_date:'2030-01-02',seat_number:19,standing:false,status:'confirmed'});
 wrapper(<BookBus/>);fireEvent.click(await screen.findByRole('button',{name:/BRACU-01/}));fireEvent.click(await screen.findByRole('button',{name:'Seat 19 Available'}));
 expect(screen.getByRole('region',{name:'Your selection'})).toHaveTextContent('E3');fireEvent.click(screen.getByRole('button',{name:'Confirm booking'}));
 await waitFor(()=>expect(member2Api.book).toHaveBeenCalledWith(expect.objectContaining({tripId:'1',seatNumber:19,standing:false})));await screen.findByText('Booking confirmed successfully.');
});

it('booked, unavailable and missing-eligibility seats remain disabled',()=>{
 render(<SeatMap data={{...seatData,seats:[{number:19,state:'Booked',selectable:true},{number:20,state:'Unavailable',selectable:true},{number:21,state:'Available'}]}} selected={null} onSelect={vi.fn()}/>);
 for(const name of ['Seat 19 Booked','Seat 20 Unavailable','Seat 21 Available'])expect(screen.getByRole('button',{name})).toBeDisabled();
});
it('female 28-seat selection allows both reserved and normal eligible seats',()=>{
 const data={...seatData,standingEligible:false,standingAvailable:0,standingRemaining:2,trip:{...trip,capacity:28},seats:Array.from({length:28},(_,i)=>({number:i+1,reserved:i<18,state:i<18?'Reserved':'Available',selectable:true}))};
 function Selection(){const [selected,setSelected]=useState(null);return <SeatMap data={data} selected={selected} onSelect={setSelected}/>;}
 render(<Selection/>);fireEvent.click(screen.getByRole('button',{name:'Seat 1 Reserved'}));expect(screen.getByRole('region',{name:'Your selection'})).toHaveTextContent('A1');fireEvent.click(screen.getByRole('button',{name:'Seat 19 Available'}));expect(screen.getByRole('region',{name:'Your selection'})).toHaveTextContent('E3');expect(screen.getByRole('button',{name:'Select Standing'})).toBeDisabled();
});

for(const gender of ['male','female','unverified'])it(`${gender} eligible normal seats toggle E3 off and switch to F3 even with booking closed`,async()=>{
 const verified=gender!=='unverified';const female=gender==='female';
 const data={...seatData,bookingOpen:false,genderKnown:verified,profileGender:verified?gender:null,standingEligible:gender==='male',standingAvailable:gender==='male'?2:0,trip:{...trip,capacity:28,bookingOpen:false},seats:Array.from({length:28},(_,i)=>({number:i+1,reserved:i<18,state:i<18?'Reserved':'Available',selectable:i>=18||female}))};
 member2Api.trips.mockResolvedValue([data.trip]);member2Api.seats.mockResolvedValue(data);wrapper(<BookBus/>);fireEvent.click(await screen.findByRole('button',{name:/BRACU-01/}));
 fireEvent.click(await screen.findByRole('button',{name:'Seat 19 Available'}));expect(screen.getByRole('button',{name:'Seat 19 Selected'})).toHaveClass('selected');expect(screen.getByRole('region',{name:'Your selection'})).toHaveTextContent('E3');
 fireEvent.click(screen.getByRole('button',{name:'Seat 19 Selected'}));expect(screen.getByRole('button',{name:'Seat 19 Available'})).toHaveAttribute('aria-pressed','false');expect(screen.getByRole('region',{name:'Your selection'})).toHaveTextContent('Choose an available seat');
 fireEvent.click(screen.getByRole('button',{name:'Seat 23 Available'}));expect(screen.getByRole('region',{name:'Your selection'})).toHaveTextContent('F3');expect(screen.getByRole('button',{name:'Seat 23 Selected'})).toBeInTheDocument();expect(screen.getByRole('button',{name:'Confirm booking'})).toBeDisabled();
 const a1=screen.getByRole('button',{name:'Seat 1 Reserved'});if(female){fireEvent.click(a1);expect(screen.getByRole('button',{name:'Seat 1 Selected'})).toHaveTextContent('Selected');}else expect(a1).toBeDisabled();
 const standing=screen.getByRole('button',{name:'Select Standing'});if(gender==='male'){fireEvent.click(standing);expect(screen.getByRole('region',{name:'Your selection'})).toHaveTextContent('Standing ticket selected');fireEvent.click(screen.getByRole('button',{name:'Standing selected'}));expect(screen.getByRole('region',{name:'Your selection'})).toHaveTextContent('Choose an available seat');}else expect(standing).toBeDisabled();
});
