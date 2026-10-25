import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AuthProvider from './components/AuthProvider.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Transport from './Transport.jsx';
import {useAuth} from './hooks/useAuth.js';
import {roleHome} from './services/roleHome.js';
import StudentProfile from './pages/StudentProfile.jsx';
import DriverDashboard from './pages/DriverDashboard.jsx';
import LiveTracking from './pages/LiveTracking.jsx';
import Feedback from './pages/Feedback.jsx';
import Notifications from './pages/Notifications.jsx';
import { StudentLayout, StudentDashboard, BookBus, MyBookings, BookingDetails, Complaints, ComplaintDetails } from './pages/Member2.jsx';
function DashboardEntry(){const {user}=useAuth();return user?.role==='student'?<StudentDashboard/>:<Navigate to={roleHome(user)} replace/>;}
export default function App() {
  return <BrowserRouter><AuthProvider><Routes>
    <Route path="/login" element={<Login />} />
    <Route element={<ProtectedRoute />}><Route element={<StudentLayout />}>
      <Route path="/" element={<DashboardEntry />} />
      <Route path="/tracking" element={<LiveTracking />} />
      <Route path="/transport" element={<Transport />} />
      <Route element={<ProtectedRoute roles={['student']} />}><Route path="/feedback" element={<Feedback />} /></Route>
      <Route path="/notifications" element={<Notifications />} />
      <Route element={<ProtectedRoute roles={['driver']} />}><Route path="/driver" element={<DriverDashboard/>}/></Route>
      <Route element={<ProtectedRoute roles={['student']} />}>
      <Route path="/profile" element={<StudentProfile/>} />
      <Route path="/book" element={<BookBus />} />
      <Route path="/bookings" element={<MyBookings />} />
      <Route path="/bookings/:id" element={<BookingDetails />} />
      <Route path="/complaints" element={<Complaints />} />
      <Route path="/complaints/:id" element={<ComplaintDetails />} />
      </Route>
    </Route></Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></AuthProvider></BrowserRouter>;
}
