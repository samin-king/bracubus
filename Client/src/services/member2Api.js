async function request(path, options = {}) {
  const response = await fetch(`/api/student${path}`, { credentials: 'include', cache: 'no-store', ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json();
  if (!response.ok) {
    const messages = {
      unauthenticated: 'Your session has expired. Please sign in again.',
      invalid_profile: 'Select Male or Female to save your profile.',
      profile_not_found: 'Your student profile is unavailable. Please sign in again.',
      women_reserved: 'Seats 1–18 require a verified female student profile.',
      booking_conflict: 'This seat or trip is already booked. Refresh availability and choose again.',
      booking_window_closed: 'Booking is closed for this trip.',
      daily_booking_limit: 'You already have four confirmed trips on this date.',
      cancellation_closed: 'This trip has departed and can no longer be cancelled.',
      already_cancelled: 'This booking has already been cancelled.'
    };
    throw new Error(messages[data.error] || `Request failed: ${String(data.error || response.status).replaceAll('_', ' ')}.`);
  }
  return data;
}
export const member2Api = {
  profile:()=>request('/profile'),
  saveProfile:input=>request('/profile',{method:'PATCH',body:JSON.stringify(input)}),
  trips: date => request(`/trips?date=${encodeURIComponent(date)}`),
  seats: (id, date) => request(`/trips/${encodeURIComponent(id)}/seats?date=${encodeURIComponent(date)}`),
  book: input => request('/bookings', { method: 'POST', body: JSON.stringify(input) }),
  bookings: () => request('/bookings'),
  booking: id => request(`/bookings/${encodeURIComponent(id)}`),
  cancel: id => request(`/bookings/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
  complain: input => request('/complaints', { method: 'POST', body: JSON.stringify(input) }),
  complaints: () => request('/complaints'),
  complaint: id => request(`/complaints/${encodeURIComponent(id)}`)
};
