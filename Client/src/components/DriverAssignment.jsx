import {useEffect,useState} from 'react';
import {driverApi} from '../services/driverApi';
import {tripApi} from '../services/tripApi';
export default function DriverAssignment(){
 const [drivers,setDrivers]=useState([]),[trips,setTrips]=useState([]),[tripId,setTripId]=useState(''),[driverId,setDriverId]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function load(){setLoading(true);setError('');try{const [d,t]=await Promise.all([driverApi.list(),tripApi.list()]);setDrivers(d);setTrips(t.filter(x=>x.status==='SCHEDULED'));}catch(e){setError(e.message);}finally{setLoading(false);}}
 useEffect(()=>{load();},[]);
 async function submit(e){e.preventDefault();setBusy(true);setError('');setNotice('');try{await driverApi.assign(Number(tripId),driverId?Number(driverId):null);setNotice('Driver assignment saved');await load();}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section className="mt-8 rounded-xl border bg-white p-5"><h2 className="mb-4 text-xl font-semibold">Assign or change driver</h2><button type="button" disabled={busy||loading} onClick={load} className="mb-4 text-blue-800">Refresh choices</button>
 {error&&<p role="alert" className="text-red-800">{error}<button onClick={load}>Reload choices</button></p>}{notice&&<p role="status" className="text-blue-800">{notice}</p>}
 {loading?<p role="status">Loading assignment choices...</p>:<form onSubmit={submit} className="grid gap-4 md:grid-cols-3">
 <label>Scheduled trip<select required value={tripId} onChange={e=>{setTripId(e.target.value);const t=trips.find(x=>x.id===Number(e.target.value));setDriverId(t?.driver_id?String(t.driver_id):'');}}><option value="">Select trip</option>{trips.map(t=><option key={t.id} value={t.id}>{t.bus.bus_number} / {t.travel_date} {t.departure_time.slice(0,5)} / {t.driver?.name||'Unassigned'}</option>)}</select></label>
 <label>Driver<select value={driverId} onChange={e=>setDriverId(e.target.value)}><option value="">Unassigned</option>{drivers.filter(d=>d.status==='ACTIVE').map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
 <button disabled={busy||!tripId} className="self-end bg-blue-800 text-white disabled:opacity-50">{busy?'Saving...':'Save assignment'}</button>
 {!trips.length&&<p>No scheduled trips available.</p>}</form>}
 </section>;
}
