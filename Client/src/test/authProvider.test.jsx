import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AuthProvider from '../components/AuthProvider.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { authApi } from '../services/authApi.js';
vi.mock('../services/authApi.js', () => ({ authApi: { me: vi.fn(), logout: vi.fn() } }));
const student = { id: 1, name: 'Student', email: 'student@g.bracu.ac.bd', role: 'student' };
function Consumer() {
  const { authenticated, logout, refresh, error } = useAuth();
  return <><p>{authenticated ? 'Signed in' : 'Anonymous'}</p><p>{error}</p>
    <button onClick={() => logout().catch(() => {})}>Logout</button><button onClick={refresh}>Refresh</button></>;
}
beforeEach(() => vi.resetAllMocks());
it('removes authenticated state after successful logout', async () => {
  authApi.me.mockResolvedValue(student); authApi.logout.mockResolvedValue(null);
  render(<AuthProvider><Consumer /></AuthProvider>);
  await screen.findByText('Signed in');
  fireEvent.click(screen.getByText('Logout'));
  await screen.findByText('Anonymous');
  expect(authApi.logout).toHaveBeenCalledOnce();
});
it('keeps authentication and shows an error when logout fails', async () => {
  authApi.me.mockResolvedValue(student); authApi.logout.mockRejectedValue(new Error('offline'));
  render(<AuthProvider><Consumer /></AuthProvider>);
  await screen.findByText('Signed in'); fireEvent.click(screen.getByText('Logout'));
  await screen.findByText('Sign out failed. Please try again.');
  expect(screen.getByText('Signed in')).toBeInTheDocument();
});
it('pending refresh cannot restore user after logout', async () => {
  authApi.me.mockResolvedValueOnce(student); authApi.logout.mockResolvedValue(null);
  render(<AuthProvider><Consumer /></AuthProvider>);
  await screen.findByText('Signed in');
  let resolveRefresh;
  authApi.me.mockImplementationOnce(() => new Promise(resolve => { resolveRefresh = resolve; }));
  fireEvent.click(screen.getByText('Refresh'));
  await waitFor(() => expect(resolveRefresh).toBeTypeOf('function'));
  fireEvent.click(screen.getByText('Logout'));
  await screen.findByText('Anonymous');
  authApi.me.mockResolvedValueOnce(null);
  fireEvent.click(screen.getByText('Refresh'));
  await waitFor(() => expect(authApi.me).toHaveBeenCalledTimes(3));
  await act(async () => { resolveRefresh(student); });
  expect(screen.getByText('Anonymous')).toBeInTheDocument();
});