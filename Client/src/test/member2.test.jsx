import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { BookBus, MyBookings, BookingDetails, Complaints, ComplaintDetails, StudentLayout, StudentDashboard } from '../pages/Member2.jsx';
import { AuthContext } from '../hooks/useAuth.js';
import { member2Api as api } from '../services/member2Api.js';
vi.mock('../services/member2Api.js', () => ({ member2Api: Object.fromEntries(['trips','seats','book','bookings','booking','cancel','complain','complaints','complaint'].map(key => [key, vi.fn()])) }));
const trip = { id: 't1', bus: 'Bus A', route: 'Campus → City', departureTime: '14:00', capacity: 28, bookingOpen: true, opensAt: '2030-01-02T04:50:00Z', closesAt: '2030-01-02T05:15:00Z' };
const booking = { id: '10', trip_id: 't1', trip_snapshot: trip, travel_date: '2030-01-02', seat_number: 19, status: 'confirmed', section: 'Upcoming', created_at: '2030-01-02T05:00:00Z' };
const complaint = { id: '8', category: 'Late bus', subject: 'Late departure', description: 'Departed late', status: 'Pending', created_at: '2030-01-02T05:00:00Z' };
function view(component, path = '/') { return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/" element={component} /><Route path="/bookings/:id" element={<BookingDetails />} /><Route path="/complaints/:id" element={<ComplaintDetails />} /></Routes></MemoryRouter>); }
beforeEach(() => {
  vi.resetAllMocks(); api.trips.mockResolvedValue([trip]); api.bookings.mockResolvedValue([]); api.complaints.mockResolvedValue([]);
  api.seats.mockResolvedValue({ trip, bookingOpen: true, genderKnown: true, standingAvailable: 0, seats: [{ number: 1, state: 'Reserved', selectable: false }, { number: 19, state: 'Available', selectable: true }, { number: 20, state: 'Booked', selectable: false }] });
  api.book.mockResolvedValue(booking); api.booking.mockResolvedValue(booking); api.complaint.mockResolvedValue(complaint); api.cancel.mockResolvedValue({ ...booking, status: 'cancelled' }); api.complain.mockResolvedValue(complaint);
});
describe('Member 2 student pages', () => {
  it('integrates dashboard and navigation with the existing authenticated identity', () => {
    render(<AuthContext.Provider value={{ user: { name: 'Student', role:'student' }, logout: vi.fn() }}><MemoryRouter><Routes><Route element={<StudentLayout />}><Route path="/" element={<StudentDashboard />} /></Route></Routes></MemoryRouter></AuthContext.Provider>);
    expect(screen.getByRole('heading', { name: 'Student Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Student navigation' })).toHaveTextContent('Booking History');
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
  });
  it('selects trip, seat and confirms booking with in-app success feedback', async () => {
    view(<BookBus />);
    expect(screen.getByLabelText('Travel date')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Bus A/ }));
    expect(await screen.findByRole('button', { name: 'Seat 1 Reserved' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Seat 20 Booked' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Seat 19 Available' }));
    expect(screen.getByRole('button', { name: 'Seat 19 Selected' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm booking' }));
    expect(await screen.findByText('Booking confirmed successfully.')).toBeInTheDocument();
    expect(api.book).toHaveBeenCalledWith(expect.objectContaining({ tripId: 't1', seatNumber: 19, standing: false }));
    expect(screen.getByRole('region', { name: 'Booking confirmation' })).toHaveTextContent('Bus A');
  });
  it('shows loading, errors, retry and empty trip results', async () => {
    let reject;
    api.trips.mockImplementationOnce(() => new Promise((resolve, failure) => { reject = failure; }));
    view(<BookBus />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    await waitFor(() => expect(reject).toBeTypeOf('function')); reject(new Error('Trips unavailable'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Trips unavailable');
    api.trips.mockResolvedValueOnce([]); fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No trips are available for this date.')).toBeInTheDocument();
  });
  it('shows booking failure and refreshes seat availability', async () => {
    api.book.mockRejectedValueOnce(new Error('Seat just booked'));
    view(<BookBus />); fireEvent.click(await screen.findByRole('button', { name: /Bus A/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Seat 19 Available' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm booking' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Seat just booked');
    await waitFor(() => expect(api.seats).toHaveBeenCalledTimes(2));
  });
  it('groups own bookings into Upcoming, Past and Cancelled', async () => {
    api.bookings.mockResolvedValue([booking, { ...booking, id: '11', section: 'Past' }, { ...booking, id: '12', section: 'Cancelled', status: 'cancelled' }]);
    view(<MyBookings />);
    expect(await screen.findByRole('link', { name: 'Booking details #10' })).toBeInTheDocument();
    for (const name of ['Upcoming', 'Past', 'Cancelled']) expect(screen.getByRole('heading', { name })).toBeInTheDocument();
  });
  it('cancels only after in-app confirmation and updates details', async () => {
    view(null, '/bookings/10');
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel booking' }));
    expect(api.cancel).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent('Your seat will be released');
    api.booking.mockResolvedValue({ ...booking, section: 'Cancelled', status: 'cancelled' });
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel booking' }));
    expect(await screen.findByText('Booking cancelled. The seat is available again.')).toBeInTheDocument();
    expect(api.cancel).toHaveBeenCalledWith('10');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel booking' })).not.toBeInTheDocument());
  });
  it('submits complaint and refreshes My Complaints with read-only status', async () => {
    view(<Complaints />);
    await screen.findByText('No complaints submitted.');
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Late departure' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Departed late' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Late bus' } });
    api.complaints.mockResolvedValue([complaint]);
    fireEvent.click(screen.getByRole('button', { name: 'Submit complaint' }));
    expect(await screen.findByText('Complaint submitted successfully.')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: '#8 Late departure' })).toBeInTheDocument();
    expect(screen.getByText('Late bus · Pending')).toBeInTheDocument();
    expect(api.complain).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Late departure', category: 'Late bus' }));
  });
  it('renders own complaint details and server errors', async () => {
    api.complaint.mockRejectedValueOnce(new Error('Access denied'));
    view(null, '/complaints/8');
    expect(await screen.findByRole('alert')).toHaveTextContent('Access denied');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: '#8 Late departure' })).toBeInTheDocument();
  });
});
