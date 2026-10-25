import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { member2Api as api } from '../services/member2Api.js';
import './member2.css';
import SeatMap, {seatLabel} from '../components/SeatMap.jsx';
import {Icon, Badge, PageHeading, EmptyState, Loading, useResource} from '../components/Ui.jsx';
import {member4Api} from '../services/member4Api.js';
import {complaintOptions, legacyCategories, complaintDescription} from '../services/complaintOptions.js';
const categories = [...new Set([...complaintOptions.map(o=>o.label), ...legacyCategories])];
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const stamp = value => new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' });
function ErrorMessage({ error }) { return error && <p role="alert" className="m2-error">{error}</p>; }
function useLoad(load, dependencies = []) {
  const [state, set] = useState({ loading: true, data: null, error: '' });
  const [version, update] = useState(0);
  useEffect(() => {
    let active = true;
    set({ loading: true, data: null, error: '' });
    Promise.resolve().then(load).then(data => { if (active) set({ loading: false, data, error: '' }); }, error => { if (active) set({ loading: false, data: null, error: error.message }); });
    return () => { active = false; };
  }, [...dependencies, version]);
  return { ...state, reload: () => update(v => v + 1) };
}
function LoadState({ state }) {
  return <>{state.loading && <Loading/>}<ErrorMessage error={state.error} />{state.error && <button type="button" onClick={state.reload}>Retry</button>}</>;
}
export function StudentLayout() {
  const { user, logout } = useAuth();
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function signOut() { setBusy(true); try { await logout(); } catch { setError('Sign out failed. Please try again.'); } finally { setBusy(false); } }
  const student=user.role==='student',management=['authority','admin'].includes(user.role);
  const links=student?[['/','Dashboard','dashboard'],['/tracking','Live Bus Tracking','map'],['/book','Book a Seat','ticket'],['/bookings','Booking History','history'],['/complaints','Complaints','message'],['/feedback','Feedback','star'],['/notifications','Notifications','bell'],['/profile','Profile','user']]:management?[['/transport','Authority Dashboard','dashboard'],['/tracking','Live Bus Tracking','map'],['/notifications','Notifications','bell']]:[['/driver','Driver Dashboard','bus'],['/tracking','Live Bus Tracking','map'],['/notifications','Notifications','bell']];
  return <div className="member2"><aside className="app-sidebar"><Link to="/" className="sidebar-brand"><img src="/bracu-logo.png" alt="BRAC University"/><span>BRACU<span>SMART TRANSPORT</span></span></Link><p className="sidebar-caption">{student?'STUDENT PORTAL':management?'AUTHORITY PORTAL':'DRIVER PORTAL'}</p>
    <nav aria-label="Student navigation">{links.map(([to,label,icon])=><NavLink key={to} to={to} end={to==='/'}><Icon name={icon}/><span>{label}</span></NavLink>)}</nav>
    <div className="sidebar-bottom"><div className="sidebar-help"><Icon name="shield"/><span>Your campus.<br/><strong>A better commute.</strong></span></div><button className="logout-button" disabled={busy} onClick={signOut}><Icon name="logout"/>{busy?'Signing out...':'Logout'}</button></div></aside>
    <div className="app-workspace"><header className="workspace-header"><div><p>BRAC UNIVERSITY</p><strong>Transport services</strong></div><div className="profile"><span className="profile-avatar">{user.name?.slice(0,1).toUpperCase()}</span><div><span>{user.name}</span><small>{user.role}</small></div></div></header><main><ErrorMessage error={error}/><Outlet/></main><footer className="workspace-footer">BRAC University Smart Transport <span>All journey times are in Asia/Dhaka</span></footer></div></div>;
}
export function StudentDashboard() {
  const {user}=useAuth();
  const student=user?.role==='student';
  const bookings=useResource(()=>student?api.bookings():Promise.resolve([]),[student]);
  const notices=useResource(()=>member4Api.notifications(0),[]);
  const upcoming=bookings.data?.filter(b=>b.section==='Upcoming')||[],next=[...upcoming].sort((a,b)=>new Date(a.departure_at)-new Date(b.departure_at))[0];
  return <><PageHeading title={student?"Student Dashboard":"Transport Dashboard"} eyebrow="YOUR DAILY COMMUTE">Welcome back. Let's make your next journey a good one.</PageHeading>
    <div className="welcome-banner welcome-banner-photo"><div className="welcome-banner-copy"><span className="eyebrow">CONNECTED TO YOUR CAMPUS</span><h2>Students&#8217; Transport<br/>Service</h2><p>Plan your ride, keep track of your bus and stay informed.</p><Link className="primary-link" to={student?'/book':'/transport'}>{student?'Book a Seat':'Open transport portal'}<Icon name="arrow" size={18}/></Link></div><div className="welcome-banner-image"><img src="/bracu-bus.jpg" alt="BRAC University bus decorated with balloons" width="1200" height="621" fetchPriority="high" /></div></div>
    <div className="dashboard-grid"><section className="journey-card"><div className="section-top"><h2><Icon name="ticket"/>Your next journey</h2><Badge status={next?'Upcoming':'No booking'}/></div>{bookings.loading?<Loading>Loading your journeys...</Loading>:bookings.error?<p role="alert">{bookings.error}</p>:next?<><h3>{next.trip_snapshot.route}</h3><div className="journey-details"><span><Icon name="bus"/>{next.trip_snapshot.bus}</span><span><Icon name="clock"/>{next.travel_date} · {next.trip_snapshot.departureTime}</span></div><Link to={'/bookings/'+next.id}>View booking <Icon name="arrow" size={16}/></Link></>:<EmptyState title="No upcoming journey">Your next confirmed ride will appear here.</EmptyState>}</section>
    <section className="credit-card"><div className="section-top"><h2>Transport credit</h2><Icon name="wallet" size={26}/></div><p className="credit-value">—</p><p>Balance unavailable</p><small>Credit information is not connected to your student account yet.</small></section></div>
    <section className="quick-actions"><h2>Quick actions</h2><div className="quick-action-grid">{(student?[['/book','Book a Seat','Find a trip that fits your day','ticket'],['/tracking','Live Bus Tracking','Follow your campus transport','map'],['/bookings','Booking History','Manage your confirmed journeys','history'],['/complaints','Get support','Tell us about your journey','message']]:[['/transport','Transport portal','Your assigned services','bus'],['/tracking','Live Bus Tracking','Route overview','map']]).map(([to,label,description,icon])=><Link key={to} to={to}><span className="card-icon"><Icon name={icon}/></span><strong>{label}</strong><small>{description}</small><Icon name="arrow" size={17}/></Link>)}</div></section>
    <div className="dashboard-grid"><section><div className="section-top"><h2>Recent bookings</h2>{student&&<Link to="/bookings">View all</Link>}</div>{bookings.loading?<Loading/>:bookings.data?.length?bookings.data.slice(0,3).map(b=><div className="recent-item" key={b.id}><span className="card-icon"><Icon name="bus"/></span><div><strong>{b.trip_snapshot.route}</strong><small>{b.travel_date} · {b.trip_snapshot.departureTime}</small></div><Badge status={b.status}/></div>):<EmptyState title="Your bookings, in one place">Confirmed and cancelled journeys will appear here.</EmptyState>}</section>
    <section><div className="section-top"><h2>Latest updates</h2><Link to="/notifications">View all</Link></div>{notices.loading?<Loading/>:notices.error?<p role="alert">{notices.error}</p>:notices.data?.length?notices.data.slice(0,3).map(n=><div className="recent-item" key={n.id}><span className="card-icon"><Icon name="bell"/></span><div><strong>{n.title}</strong><small>{n.message}</small></div>{!n.read_at&&<span className="unread-dot" aria-label="Unread"/>}</div>):<EmptyState icon="bell" title="You're all caught up">Your transport notifications will appear here.</EmptyState>}</section></div></>;
}

export function BookingSummary({ booking }) {
  const trip = booking.trip_snapshot;
  return <dl><dt>Booking ID</dt><dd>{booking.id}</dd><dt>Trip</dt><dd>{booking.trip_id}</dd><dt>Bus</dt><dd>{trip.bus}</dd><dt>Route</dt><dd>{trip.route}</dd><dt>Travel date</dt><dd>{booking.travel_date}</dd><dt>Trip time</dt><dd>{trip.departureTime} (Asia/Dhaka)</dd><dt>Seat</dt><dd>{booking.standing ? 'Standing' : `${seatLabel(booking.seat_number)} (Seat ${booking.seat_number})`}</dd><dt>Status</dt><dd><Badge status={booking.status}/></dd>{booking.created_at && <><dt>Created time</dt><dd>{stamp(booking.created_at)}</dd></>}</dl>;
}
export function BookBus() {
  const [date, setDate] = useState(today), [tripId, setTripId] = useState(''), [seat, setSeat] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirmation, setConfirmation] = useState(null);
  const trips = useLoad(() => api.trips(date), [date]);
  const seats = useLoad(() => tripId ? api.seats(tripId, date) : null, [tripId, date]);
  function selectSeat(choice) { setSeat(current => current === choice ? null : choice); }
  async function book() {
    setBusy(true); setError('');
    try {
      const result = await api.book({ tripId, travelDate: date, standing: seat === 'standing', seatNumber: seat === 'standing' ? null : seat });
      setConfirmation(result); setSeat(null); seats.reload();
    } catch (failure) { setError(failure.message); setSeat(null); seats.reload(); }
    finally { setBusy(false); }
  }
  return <><PageHeading title="Book a Seat">Choose your trip and seat. Female-reserved seats are marked in the seat map.</PageHeading>
    <label>Travel date<input type="date" value={date} min={today()} disabled={busy} onChange={e => { setDate(e.target.value); setTripId(''); setSeat(null); setConfirmation(null); setError(''); }} /></label>
    <LoadState state={trips} />
    {trips.data && <><h2>Available trips</h2>{!trips.data.length && <p>No trips are available for this date.</p>}<div className="m2-cards">{trips.data.map(t => <button key={t.id} disabled={busy} aria-pressed={tripId === t.id} onClick={() => { setTripId(t.id); setSeat(null); setConfirmation(null); setError(''); }}>{t.bus} · {t.route} · {t.departureTime}<small>{t.bookingOpen ? 'Booking open' : 'Booking closed'}</small><small>Window: {stamp(t.opensAt)} – {stamp(t.closesAt)}</small></button>)}</div></>}
    {tripId && <><LoadState state={seats} />{seats.data && <><h2>Select seat</h2>{!seats.data.genderKnown ? <div className="info-note"><span>Your student profile gender is unverified. Reserved seats and standing cannot be booked. <Link to="/profile">Complete your profile</Link></span></div> : seats.data.profileGender && <p className="info-note">Your profile is verified as {seats.data.profileGender}.</p>}
      {!seats.data.bookingOpen && <p className="info-note"><Icon name="clock" size={18}/>Booking is currently closed for this trip. You can preview an eligible seat or standing selection, but confirmation is unavailable until booking opens.</p>}
      <SeatMap data={seats.data} selected={seat} busy={busy} onSelect={selectSeat}/>
      <button className="primary-button" disabled={busy || seat === null || !seats.data.bookingOpen} onClick={book}>{busy ? 'Booking…' : 'Confirm booking'}</button></>}</>}
    <ErrorMessage error={error} />{confirmation && <section aria-label="Booking confirmation"><p role="status">Booking confirmed successfully.</p><BookingSummary booking={confirmation} /><Link to={`/bookings/${confirmation.id}`}>View booking</Link></section>}</>;
}
export function MyBookings() {
  const state = useLoad(api.bookings);
  return <><PageHeading title="Booking History">All your journeys, with details and cancellation in one place.</PageHeading><LoadState state={state} />{state.data && ['Upcoming', 'Past', 'Cancelled'].map(section => <section key={section}><h2>{section}</h2>{!state.data.some(b => b.section === section) && <p>No {section.toLowerCase()} bookings.</p>}{state.data.filter(b => b.section === section).map(b => <article key={b.id}><BookingSummary booking={b} /><Link to={`/bookings/${b.id}`}>Booking details #{b.id}</Link></article>)}</section>)}</>;
}
export function BookingDetails() {
  const { id } = useParams(), state = useLoad(() => api.booking(id), [id]);
  const [ask, setAsk] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('');
  async function cancel() {
    setBusy(true); setError('');
    try { await api.cancel(id); setAsk(false); setSuccess('Booking cancelled. The seat is available again.'); state.reload(); }
    catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  return <><h1>Booking Details</h1><LoadState state={state} /><ErrorMessage error={error} />{success && <p role="status">{success}</p>}{state.data && <><BookingSummary booking={state.data} />{state.data.section === 'Upcoming' && <button onClick={() => setAsk(true)}>Cancel booking</button>}
    {ask && <section role="dialog" aria-modal="true" aria-labelledby="cancel-title"><h2 id="cancel-title">Cancel this booking?</h2><p>Your seat will be released.</p><button disabled={busy} onClick={cancel}>{busy ? 'Cancelling…' : 'Yes, cancel booking'}</button><button disabled={busy} onClick={() => setAsk(false)}>Keep booking</button></section>}</>}<Link to="/bookings">Back to My Bookings</Link></>;
}
export function Complaints() {
  const state = useLoad(api.complaints), bookings = useLoad(api.bookings);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('');
  async function submit(e) {
    e.preventDefault(); const form = e.currentTarget, input = Object.fromEntries(new FormData(form));
    setBusy(true); setError(''); setSuccess('');
    const selected=complaintOptions.find(o=>o.label===input.category);
    const payload={...input,category:selected?.member2||input.category,subject:input.subject.trim()||selected?.label||input.category,description:selected?complaintDescription(selected.label,input.description):input.description.trim()||input.category};
    try { await api.complain(payload); form.reset(); setSuccess('Complaint submitted successfully.'); state.reload(); }
    catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  return <><PageHeading title="Complaints">Help us keep every journey safe, respectful and reliable.</PageHeading><form onSubmit={submit}><fieldset disabled={busy}><legend>Submit a complaint</legend><label>Complaint Category<select name="category" aria-label="Category">{categories.map(c => <option key={c}>{c}</option>)}</select></label><label>Subject (optional)<input name="subject" aria-label="Subject" maxLength={160} placeholder="A short summary, if you would like to add one" /></label><label>Description<textarea name="description" maxLength={4800} placeholder="Additional details (optional)" /></label>
    <label>Related booking (optional)<select name="bookingId"><option value="">None</option>{bookings.data?.map(b => <option key={b.id} value={b.id}>#{b.id} · {b.trip_snapshot.route} · {b.travel_date}</option>)}</select></label><LoadState state={bookings} /><button className="primary-button" type="submit">{busy ? 'Submitting…' : 'Submit complaint'}</button></fieldset></form>
    <ErrorMessage error={error} />{success && <p role="status">{success}</p>}<h2>My Complaints</h2><LoadState state={state} />{state.data && !state.data.length && <p>No complaints submitted.</p>}{state.data?.map(c => <article key={c.id}><h3><Link to={`/complaints/${c.id}`}>#{c.id} {c.subject}</Link></h3><p>{c.category} · {c.status}</p><p className="m2-description">{c.description}</p><p>{stamp(c.created_at)}</p></article>)}</>;
}
export function ComplaintDetails() {
  const { id } = useParams(), state = useLoad(() => api.complaint(id), [id]);
  return <><h1>Complaint Details</h1><LoadState state={state} />{state.data && <article><h2>#{state.data.id} {state.data.subject}</h2><p>{state.data.category} · {state.data.status}</p><p className="m2-description">{state.data.description}</p><p>{stamp(state.data.created_at)}</p>{state.data.response && <p>Authority response: {state.data.response}</p>}{state.data.booking_id && <Link to={`/bookings/${state.data.booking_id}`}>Related booking</Link>}</article>}<Link to="/complaints">Back to My Complaints</Link></>;
}
