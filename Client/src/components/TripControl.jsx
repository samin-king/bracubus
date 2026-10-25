export default function TripControl({trip,busy,onAction}) {
 const action=trip.status==='SCHEDULED'?'start':trip.status==='ACTIVE'?'stop':null;
 if(!action) return <p className="mt-4 text-sm text-slate-600">No trip controls available for {trip.status.toLowerCase()} trips.</p>;
 return <button disabled={busy} onClick={()=>onAction(trip,action)} className="mt-4 bg-blue-800 text-white disabled:opacity-50">{busy?'Updating...':action==='start'?'Start Trip':'Stop Trip'}</button>;
}
