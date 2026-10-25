import { Member2Error, categories, validDate, departureAt, bookingWindow, windowOpen, validateSeat, femaleReservedSeatCount } from './bookingRules.js';
const idValue = id => {
  if (!/^[1-9]\d{0,17}$/.test(String(id))) throw new Member2Error('invalid_id');
  return String(id);
};
const legacyComplaint = row => ({...row,status:({pending:'Pending',in_review:'In Review',resolved:'Resolved',rejected:'Rejected'})[row.status]||row.status});
const dateText = value => value instanceof Date ? value.toISOString().slice(0, 10) : value;
function present(row, now) {
  return { ...row, travel_date: dateText(row.travel_date), section: row.status === 'cancelled' ? 'Cancelled' : new Date(row.departure_at) <= now ? 'Past' : 'Upcoming' };
}
export function createMember2Service({ pool, tripCatalog, clock = () => new Date() }) {
  async function tripFor(id, date) {
    validDate(date);
    const trip = (await tripCatalog.list(date)).find(t => t.id === id);
    if (!trip) throw new Member2Error('trip_not_found', 404);
    return trip;
  }
  async function owned(db, table, id, studentId) {
    const row = (await db.query(`SELECT * FROM ${table} WHERE id = $1`, [idValue(id)])).rows[0];
    if (!row) throw new Member2Error('not_found', 404);
    if (String(row.student_id) !== String(studentId)) throw new Member2Error('forbidden', 403);
    return row;
  }
  async function transaction(work) {
    const client = await pool.connect();
    try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
    catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') throw new Member2Error('booking_conflict', 409);
      if (error.code === 'P0001' && error.message.includes('daily_booking_limit')) throw new Member2Error('daily_booking_limit', 409);
      throw error;
    } finally { client.release(); }
  }
  return {
    async profile(studentId) {
      const row=(await pool.query("SELECT id,name,email,gender,gender_verified FROM users WHERE id=$1 AND role='student'",[studentId])).rows[0];
      if(!row)throw new Member2Error('profile_not_found',404);
      return row;
    },
    async saveProfile(studentId,input) {
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>key!=='gender')||!['male','female'].includes(input.gender))throw new Member2Error('invalid_profile');
      // Verification here means an authenticated, server-validated profile declaration.
      // The profile UPDATE and booking's user-row lock serialize concurrent changes.
      const row=(await pool.query(`UPDATE users SET gender=$2,gender_verified=true,updated_at=NOW()
        WHERE id=$1 AND role='student' RETURNING id,name,email,gender,gender_verified`,[studentId,input.gender])).rows[0];
      if(!row)throw new Member2Error('profile_not_found',404);
      return row;
    },
    async trips(date) {
      validDate(date);
      return (await tripCatalog.list(date)).map(trip => ({ ...trip, ...bookingWindow(trip, date), bookingOpen: windowOpen(trip, date, clock()) }));
    },
    async seats(studentId, tripId, date) {
      const trip = await tripFor(tripId, date);
      const profile=(await pool.query('SELECT gender,gender_verified FROM users WHERE id = $1',[studentId])).rows[0];
      const gender=profile?.gender_verified?profile.gender:null;
      const rows = (await pool.query("SELECT seat_number, standing FROM bookings WHERE trip_id=$1 AND travel_date=$2 AND status='confirmed'", [tripId, date])).rows;
      const reservedCount=femaleReservedSeatCount(trip.capacity);
      const remainingStanding=Math.max(0,(trip.standingCapacity||0)-rows.filter(b=>b.standing).length);
      return { profileGender:gender, genderVerified:Boolean(gender), femaleReservedSeats:reservedCount, standingRemaining:remainingStanding, trip, bookingOpen: windowOpen(trip, date, clock()), genderKnown: Boolean(gender), standingEligible: gender === 'male', standingCapacity: trip.standingCapacity || 0,
        standingAvailable: gender === 'male' ? remainingStanding : 0,
        seats: Array.from({ length: trip.capacity }, (_, i) => {
          const number = i + 1, reserved = number <= reservedCount;
          const booked = rows.some(b => b.seat_number === number);
          return { number, reserved, state: booked ? 'Booked' : reserved ? 'Reserved' : 'Available', selectable: !booked && (!reserved || gender === 'female') };
        }) };
    },
    async book(studentId, input) {
      const { tripId, travelDate, seatNumber, standing = false } = input;
      if (typeof standing !== 'boolean') throw new Member2Error('invalid_standing');
      return transaction(async db => {
        const trip = await tripFor(tripId, travelDate);
        // Consistent lock order: student first, then trip/date. Waiting writers
        // re-read availability/counts with READ COMMITTED after acquiring locks.
        const user = (await db.query('SELECT gender,gender_verified FROM users WHERE id=$1 FOR UPDATE', [studentId])).rows[0];
        if (!user) throw new Member2Error('unauthenticated', 401);
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${tripId}:${travelDate}`]);
        if (!windowOpen(trip, travelDate, clock())) throw new Member2Error('booking_window_closed', 409);
        validateSeat(trip, user.gender_verified?user.gender:null, seatNumber, standing);
        const count = (await db.query("SELECT count(*) FROM bookings WHERE student_id=$1 AND travel_date=$2 AND status='confirmed'", [studentId, travelDate])).rows[0];
        if (Number(count.count) >= 4) throw new Member2Error('daily_booking_limit', 409);
        if (standing) {
          const n = (await db.query("SELECT count(*) FROM bookings WHERE trip_id=$1 AND travel_date=$2 AND standing AND status='confirmed'", [tripId, travelDate])).rows[0];
          if (Number(n.count) >= trip.standingCapacity) throw new Member2Error('standing_full', 409);
        }
        const result = await db.query(`INSERT INTO bookings(student_id,trip_id,travel_date,departure_at,trip_snapshot,capacity,seat_number,standing)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [studentId, tripId, travelDate, departureAt(trip, travelDate), JSON.stringify(trip), trip.capacity, standing ? null : seatNumber, standing]);
        return present(result.rows[0], clock());
      });
    },
    async bookings(studentId) { return (await pool.query('SELECT * FROM bookings WHERE student_id=$1 ORDER BY departure_at DESC, id DESC', [studentId])).rows.map(r => present(r, clock())); },
    async booking(studentId, id) { return present(await owned(pool, 'bookings', id, studentId), clock()); },
    async cancel(studentId, id) {
      return transaction(async db => {
        await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [studentId]);
        const booking = await owned(db, 'bookings', id, studentId);
        if (booking.status === 'cancelled') throw new Member2Error('already_cancelled', 409);
        if (new Date(booking.departure_at) <= clock()) throw new Member2Error('cancellation_closed', 409);
        return present((await db.query("UPDATE bookings SET status='cancelled', cancelled_at=NOW() WHERE id=$1 RETURNING *", [id])).rows[0], clock());
      });
    },
    async complain(studentId, input) {
      const { category, subject, description, bookingId, tripId } = input;
      if (!categories.includes(category) || typeof subject !== 'string' || !subject.trim() || subject.trim().length > 160 ||
          typeof description !== 'string' || !description.trim() || description.trim().length > 5000) throw new Member2Error('invalid_complaint');
      let relatedTrip = null;
      if (bookingId) relatedTrip = (await owned(pool, 'bookings', bookingId, studentId)).trip_id;
      // Trip-only complaints must refer to a trip on one of this student's bookings.
      if (tripId) {
        if (typeof tripId !== 'string' || (relatedTrip && tripId !== relatedTrip)) throw new Member2Error('invalid_related_trip');
        const own = await pool.query('SELECT id FROM bookings WHERE student_id=$1 AND trip_id=$2 LIMIT 1', [studentId, tripId]);
        if (!own.rows.length) throw new Member2Error('invalid_related_trip');
        relatedTrip = tripId;
      }
      return legacyComplaint((await pool.query(`INSERT INTO complaints(student_id,category,subject,description,booking_id,trip_id)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [studentId, category, subject.trim(), description.trim(), bookingId || null, relatedTrip])).rows[0]);
    },
    async complaints(studentId) { return (await pool.query('SELECT * FROM complaints WHERE student_id=$1 ORDER BY created_at DESC, id DESC', [studentId])).rows.map(legacyComplaint); },
    async complaint(studentId, id) { return legacyComplaint(await owned(pool, 'complaints', id, studentId)); }
  };
}
