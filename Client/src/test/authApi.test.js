import { afterEach, expect, it, vi } from 'vitest';
import { authApi } from '../services/authApi.js';
afterEach(() => vi.unstubAllGlobals());
it('missing SMTP is reported clearly without changing same-origin credentials',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({status:503,ok:false,json:async()=>({error:'email_not_configured'})}));
  await expect(authApi.verifyEmail('test-token')).rejects.toThrow('Email sign-in is not configured');
});
it('me sends cookie credentials and treats 401 as anonymous', async () => {
  const fetch = vi.fn().mockResolvedValue({ status: 401 });
  vi.stubGlobal('fetch', fetch);
  expect(await authApi.me()).toBeNull();
  expect(fetch).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({ credentials: 'include', cache: 'no-store' }));
});
it('logout uses POST and propagates failures', async () => {
  const fetch = vi.fn().mockResolvedValue({ status: 500, ok: false });
  vi.stubGlobal('fetch', fetch);
  await expect(authApi.logout()).rejects.toThrow('temporarily unavailable');
  expect(fetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST', credentials: 'include' }));
});
it('logout accepts a no-content response', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 204, ok: true }));
  expect(await authApi.logout()).toBeNull();
});
it('development login uses the guarded endpoint and only 404 falls back to email verification',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce({status:200,ok:true,json:async()=>({authenticated:true})});
  vi.stubGlobal('fetch',fetch);
  expect(await authApi.requestEmail('lisan.taslim@g.bracu.ac.bd')).toEqual({authenticated:true});
  expect(fetch).toHaveBeenCalledWith('/api/auth/development/email-login',expect.objectContaining({method:'POST',credentials:'include'}));
  fetch.mockReset().mockResolvedValueOnce({status:404,ok:false}).mockResolvedValueOnce({status:202,ok:true,json:async()=>({message:'Check your email for a sign-in link.'})});
  await authApi.requestEmail('lisan.taslim@g.bracu.ac.bd');
  expect(fetch.mock.calls[1][0]).toBe('/api/auth/email');
  fetch.mockReset().mockResolvedValueOnce({status:403,ok:false});
  await expect(authApi.requestEmail('lisan.taslim@g.bracu.ac.bd')).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});
