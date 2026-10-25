import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Login from '../pages/Login.jsx';
import { AuthContext } from '../hooks/useAuth.js';
import { authApi } from '../services/authApi.js';
vi.mock('../services/authApi.js', () => ({ authApi: { requestEmail: vi.fn(), verifyEmail: vi.fn(), login: vi.fn() } }));
const refresh = vi.fn();
function view() { render(<AuthContext.Provider value={{ authenticated: false, loading: false, refresh }}><MemoryRouter><Login /></MemoryRouter></AuthContext.Provider>); }
beforeEach(() => { vi.resetAllMocks(); window.history.replaceState(null, '', '/login'); });
for (const email of ['saeeb.rahman.samin@g.bracu.ac.bd', 'saeeb.rahman@g.bracu.ac.bd', 'saeeb@g.bracu.ac.bd']) {
  it(`submits ${email} with Enter without starting Google`, async () => {
    authApi.requestEmail.mockResolvedValue({ message: 'Check your email for a sign-in link.' });
    view();
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: 'BRACU email' }), email + '{Enter}');
    await screen.findByText('Check your email for a sign-in link.');
    expect(authApi.requestEmail).toHaveBeenCalledExactlyOnceWith(email);
    expect(authApi.login).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
}
for (const email of ['saeebrahman@gmail.com', 'saeeb@bracu.ac.bd', 'saeeb@g.bracu.com', 'malformed']) {
  it(`shows validation error for ${email}`, async () => {
    view(); const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: 'BRACU email' }), email);
    await user.click(screen.getByRole('button', { name: 'Login', exact: true }));
    expect(screen.getByRole('alert')).toHaveTextContent('complete BRACU email');
    expect(authApi.requestEmail).not.toHaveBeenCalled();
  });
}
it('verifies a link and refreshes the existing authentication provider', async () => {
  const token = 'a'.repeat(43);
  window.history.replaceState(null, '', '/login#email_token=' + token);
  authApi.verifyEmail.mockResolvedValue({ id: 1 });
  view();
  expect(window.location.hash).toBe('');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Verify email and sign in' }));
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(authApi.verifyEmail).toHaveBeenCalledWith(token);
});
it('reports delivery configuration errors and allows retry', async () => {
  authApi.requestEmail.mockRejectedValue(new Error('Email delivery is not configured.'));
  view(); const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'BRACU email' }), 'saeeb@g.bracu.ac.bd{Enter}');
  await screen.findByRole('alert');
  expect(screen.getByRole('alert')).toHaveTextContent('Email delivery is not configured.');
  expect(screen.getByRole('button', { name: 'Login', exact: true })).toBeEnabled();
});
it('recognizes a verification link opened in the already-loaded login tab', async () => {
  view();
  const token = 'b'.repeat(43);
  window.location.hash = 'email_token=' + token;
  await screen.findByRole('button', { name: 'Verify email and sign in' });
  expect(window.location.hash).toBe('');
});

it('direct development response refreshes authentication without inbox instructions', async () => {
  authApi.requestEmail.mockResolvedValue({authenticated:true,user:{id:1,role:'student'}});
  view();
  const user=userEvent.setup();
  await user.type(screen.getByRole('textbox',{name:'BRACU email'}),'lisan.taslim@g.bracu.ac.bd{Enter}');
  await waitFor(()=>expect(refresh).toHaveBeenCalledOnce());
  expect(screen.queryByText('Check your email for a sign-in link.')).not.toBeInTheDocument();
});
