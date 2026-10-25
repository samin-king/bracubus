import Complaints from './pages/Complaints';
import Feedback from './pages/Feedback';
import Notifications from './pages/Notifications';
import ComplaintManagement from './pages/ComplaintManagement';
import Drivers from './pages/Drivers';
import DriverDashboard from './pages/DriverDashboard';
import React,{useState} from 'react';
import {useAuth} from './hooks/useAuth.js';
import LiveTracking from './pages/LiveTracking.jsx';

import Buses from './pages/Buses';
import Routes from './pages/Routes';
import Trips from './pages/Trips';
import './style.css';
export default function Transport(){
 const {user}=useAuth();
 const pages=['authority','admin'].includes(user?.role)?['Buses','Routes','Trips','Drivers','Complaint Management','Notifications']:user?.role==='driver'?['Driver Dashboard','Live Bus Tracking','Notifications']:['Live Bus Tracking','Complaints','Feedback','Notifications'];
 const [page,setPage]=useState(()=>pages.includes('Trips')?'Trips':pages[0]);
 const activePage=pages.includes(page)?page:pages[0];
 const Page={'Live Bus Tracking':LiveTracking,Buses,Routes,Trips,Drivers,'Driver Dashboard':DriverDashboard,Complaints,Feedback,Notifications,'Complaint Management':ComplaintManagement}[activePage];
 return <><header className="app-header px-5 py-5"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-4"><img src="/bracu-logo.png" alt="BRAC University - Inspiring Excellence" className="h-auto w-24 shrink-0 object-contain" width="104" height="96"/><div className="border-l border-blue-100 pl-4"><p className="text-xs font-semibold uppercase tracking-widest text-blue-800">BRAC University</p><p className="mt-1 text-lg font-bold text-blue-900 sm:text-xl">Transport management</p></div></div><nav aria-label="Management pages" className="app-navigation flex flex-wrap gap-2">{pages.map(p=><button key={p} aria-current={activePage===p?'page':undefined} className={activePage===p?'bg-blue-800 text-white shadow-sm':'text-blue-900 hover:bg-blue-50'} onClick={()=>setPage(p)}>{p}</button>)}</nav></div></header><main className="mx-auto max-w-7xl p-5 md:p-8"><Page key={activePage}/></main></>;
}
