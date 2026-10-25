export class Member2Error extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
export const categories = ['Driver behaviour', 'Bus condition', 'Route problem', 'Overcrowding', 'Late bus', 'Seat/booking issue', 'Other'];
export function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Member2Error('invalid_date');
  return date;
}
export function departureAt(trip, date) { return new Date(`${validDate(date)}T${trip.departureTime}:00+06:00`); }
export function bookingWindow(trip, date) {
  const departure = departureAt(trip, date);
  const previous = new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const windows = {
    '14:00': [date, '10:50', date, '11:15'],
    '17:00': [date, '15:20', date, '15:40'],
    '06:30': [previous, '20:00', date, '06:30'],
    '08:30': [previous, '21:00', date, '08:30']
  };
  const w = windows[trip.departureTime];
  if (!w) throw new Member2Error('unsupported_departure');
  return { opensAt: new Date(`${w[0]}T${w[1]}:00+06:00`), closesAt: new Date(`${w[2]}T${w[3]}:00+06:00`), departure };
}
export function windowOpen(trip, date, now) {
  const { opensAt, closesAt, departure } = bookingWindow(trip, date);
  return now >= opensAt && now < closesAt && now < departure;
}
export function femaleReservedSeatCount(capacity) {
  return Math.min(18, Math.max(0, capacity));
}
export function validateSeat(trip, gender, seat, standing) {
  if (standing) {
    if (seat != null) throw new Member2Error('invalid_seat');
    if (gender !== 'male') throw new Member2Error('standing_male_only', 403);
    if (!(trip.standingCapacity > 0)) throw new Member2Error('standing_unavailable');
  } else {
    if (!Number.isInteger(seat) || seat < 1 || seat > trip.capacity) throw new Member2Error('invalid_seat');
    if (seat <= femaleReservedSeatCount(trip.capacity) && gender !== 'female') throw new Member2Error('women_reserved', 403);
  }
}
