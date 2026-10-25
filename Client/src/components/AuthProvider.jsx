import React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthContext } from '../hooks/useAuth.js';
import { authApi } from '../services/authApi.js';
let pendingUserRequest;
function currentUser() {
  if (!pendingUserRequest) {
    const request = authApi.me().finally(() => { if (pendingUserRequest === request) pendingUserRequest = null; });
    pendingUserRequest = request;
  }
  return pendingUserRequest;
}
export default function AuthProvider({ children }) {
  const revision = useRef(0);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async ({ background = false } = {}) => {
    const requestRevision = revision.current;
    if (!background) setLoading(true);
    try {
      const current = await currentUser();
      if (requestRevision === revision.current) { setUser(current); setError(''); }
    } catch (failure) {
      if (requestRevision === revision.current) { setUser(null); setError(failure.message); }
    } finally { if (requestRevision === revision.current) setLoading(false); }
  }, []);
  useEffect(() => {
    refresh();
    const onFocus = () => refresh({ background: true });
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);
  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(() => refresh({ background: true }), 60000);
    return () => window.clearInterval(timer);
  }, [user, refresh]);
  const logout = useCallback(async () => {
    try { await authApi.logout(); revision.current++; pendingUserRequest = null; setUser(null); setError(''); setLoading(false); }
    catch (failure) { setError('Sign out failed. Please try again.'); throw failure; }
  }, []);
  const value = useMemo(() => ({ user, authenticated: Boolean(user), loading, error, logout, refresh }), [user, loading, error, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
