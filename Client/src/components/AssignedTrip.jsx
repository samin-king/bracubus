import TripControl from './TripControl';
export default function AssignedTrip({trip,busy,onAction}) {
 return <article className="rounded-xl border bg-white p-5 shadow-sm">
 <h3 className="text-xl font-semibold">{trip.route.route_name}</h3>
 <p>Bus: {trip.bus.bus_number} ({trip.bus.capacity} seats)</p>
 <p>{trip.route.origin} to {trip.route.destination}</p>
 <p>Date: {trip.travel_date} / Time: {trip.departure_time.slice(0,5)} (Dhaka)</p>
 <p className="mt-2 font-semibold">Status: {trip.status}</p>
 {trip.started_at&&<p className="text-sm">Started: {new Date(trip.started_at).toLocaleString('en-GB',{timeZone:'Asia/Dhaka'})}</p>}
 {trip.completed_at&&<p className="text-sm">Completed: {new Date(trip.completed_at).toLocaleString('en-GB',{timeZone:'Asia/Dhaka'})}</p>}
 <TripControl trip={trip} busy={busy} onAction={onAction}/>
 </article>;
}
