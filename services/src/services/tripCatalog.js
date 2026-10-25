// Read-only boundary: replace this adapter with Member 3's existing repository
// when merged. No bus/route/trip schema or management endpoints are introduced.
export function createTripCatalog(trips = []) {
  const ids = new Set();
  for (const trip of trips) {
    if (!trip || typeof trip.id !== 'string' || !trip.id || ids.has(trip.id) ||
        typeof trip.bus !== 'string' || !trip.bus || typeof trip.route !== 'string' || !trip.route ||
        !['14:00', '17:00', '06:30', '08:30'].includes(trip.departureTime) ||
        !Number.isInteger(trip.capacity) || trip.capacity < 1 || trip.capacity > 200 ||
        !Number.isInteger(trip.standingCapacity ?? 0) || (trip.standingCapacity ?? 0) < 0 ||
        (trip.dates && (!Array.isArray(trip.dates) || trip.dates.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d))))) {
      throw new Error('Invalid Member 2 trip catalog');
    }
    ids.add(trip.id);
  }
  const catalog = structuredClone(trips);
  return { async list(date) { return structuredClone(catalog.filter(t => !t.dates || t.dates.includes(date))); } };
}

export function createDatabaseTripCatalog(pool) {
 return {async list(date) {
  const {rows}=await pool.query(`SELECT t.id::text, b.bus_number AS bus, r.route_name AS route,
   to_char(t.departure_time,'HH24:MI') AS "departureTime", b.capacity,
   COALESCE(b.standing_capacity,0) AS "standingCapacity"
   FROM trips t JOIN buses b ON b.id=t.bus_id JOIN routes r ON r.id=t.route_id
   WHERE t.travel_date=$1 AND t.status='SCHEDULED'
   AND t.departure_time IN ('06:30','08:30','14:00','17:00') ORDER BY t.departure_time,t.id`,[date]);
  return rows;
 }};
}
