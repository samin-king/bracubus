import {useEffect,useState} from 'react';
import {driverApi} from '../services/driverApi';
import AssignedTrip from '../components/AssignedTrip';
export default function DriverDashboard() {
 const [driver,setDriver]=useState(null),[trips,setTrips]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 async function load(){setLoading(true);setError('');try{const [profile,assigned]=await Promise.all([driverApi.me(),driverApi.trips()]);setDriver(profile);setTrips(assigned);}catch(e){setError(e.message);}finally{setLoading(false);}}
 useEffect(()=>{load();},[]);
 async function action(trip,operation){setBusy(true);setError('');setNotice('');try{const updated=await driverApi[operation](trip.id);setTrips(current=>current.map(t=>t.id===updated.id?updated:t));setNotice(operation==='start'?'Trip started':'Trip completed');}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section><h1 className="mb-4 text-3xl font-bold">Driver Dashboard</h1>
 <p className="mb-4 text-slate-600">Uses your authenticated driver session. Local development identity is configured on the server.</p>
 {error&&<div role="alert" className="mb-4 rounded bg-red-50 p-4 text-red-800">{error}<button disabled={busy} onClick={load}>Retry</button></div>}
 {notice&&<p role="status" className="mb-4 text-blue-800">{notice}</p>}
 {loading?<p role="status">Loading assigned trips...</p>:driver&&<><h2 className="text-xl font-semibold">Welcome, {driver.name}</h2><p className="mb-6">Driver status: {driver.status}</p>
 {driver.status!=='ACTIVE'&&<p role="status" className="mb-4">Your driver profile is inactive. Contact transport management.</p>}
 <h2 className="mb-4 text-xl font-semibold">Assigned Trips</h2>
 {trips.length===0?<p>No assigned trips.</p>:<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{trips.map(trip=><AssignedTrip key={trip.id} trip={trip} busy={busy||driver.status!=='ACTIVE'} onAction={action}/>)}</div>}
 <p className="mt-6 text-sm text-slate-600">Passenger information will be available when the booking module is connected.</p></>}
 </section>;
}
