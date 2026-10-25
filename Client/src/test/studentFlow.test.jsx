import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';

afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });
it('real AuthProvider and ProtectedRoute recognize the verified student and permit sign-out', async () => {
  const student = { id: 1, name: 'Member 1 Local Test Student', email: 'saeeb.rahman.samin@g.bracu.ac.bd', role: 'student' };
  let signedIn = false;
  const token = 'a'.repeat(43);
  const fetch = vi.fn(async (url, options = {}) => {
    let status = 200, body;
    if (url === '/api/auth/me') { status = signedIn ? 200 : 401; body = signedIn ? student : { error: 'unauthenticated' }; }
    else if (url === '/api/auth/email/verify') {
      expect(JSON.parse(options.body).token).toBe(token);
      expect(options.credentials).toBe('include');
      signedIn = true; body = student;
    } else if (url === '/api/auth/logout') { signedIn = false; status = 204; }
    else if(String(url).startsWith('/api/notifications')||url==='/api/student/bookings')body=[];
    else throw new Error('Unexpected API request');
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  });
  vi.stubGlobal('fetch', fetch);
  window.history.replaceState(null, '', '/login#email_token=' + token);
  render(<App />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Verify email and sign in' }));
  await screen.findByRole('heading',{name:'Student Dashboard'});
  expect(screen.getAllByRole('link',{name:'Book a Seat'})[0]).toHaveAttribute('href','/book');
  expect(screen.getByText(student.name)).toBeInTheDocument();
  expect(window.location.pathname).toBe('/');
  await user.click(screen.getByRole('button', { name: 'Logout' }));
  await screen.findByRole('textbox', { name: 'BRACU email' });
  expect(window.location.pathname).toBe('/login');
});
