import React, { useState, useEffect } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import {roleHome} from '../services/roleHome.js';
import { authApi } from '../services/authApi.js';

const messages = {
  invalid_institution: 'Use your complete BRACU email ending in @g.bracu.ac.bd.',
  invalid_callback: 'Your sign-in request expired or was invalid. Please start again.',
  account_conflict: 'This email is already linked to another identity. Contact support.'
};

export default function Login() {
  const { authenticated, loading, error, refresh, user } = useAuth();
  const [email,setEmail]=useState(''),[emailError,setEmailError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const [token,setToken]=useState(()=>{const value=new URLSearchParams(window.location.hash.slice(1)).get('email_token');if(value) window.history.replaceState(null,'',window.location.pathname+window.location.search);return value;});
  useEffect(()=>{const read=()=>{const value=new URLSearchParams(window.location.hash.slice(1)).get('email_token');if(value){setToken(value);window.history.replaceState(null,'',window.location.pathname+window.location.search);}};window.addEventListener('hashchange',read);return ()=>window.removeEventListener('hashchange',read);},[]);
  async function submitEmail(event){
    event.preventDefault();setEmailError('');setNotice('');
    if(!/^[a-z]+(?:\.[a-z]+){0,7}@g\.bracu\.ac\.bd$/i.test(email)||email.split('@')[0].length>64){setEmailError('Enter your complete BRACU email.');return;}
    setBusy(true);try{const result=await authApi.requestEmail(email);if(result.authenticated){await refresh();}else{setNotice(result.message);}}catch(error){setEmailError(error.message);}finally{setBusy(false);}
  }
  async function verify(){setBusy(true);setEmailError('');try{await authApi.verifyEmail(token);await refresh();}catch(error){setEmailError(error.message);}finally{setBusy(false);}}
  const [params] = useSearchParams();
  const [logoMissing, setLogoMissing] = useState(false);
  if (authenticated && !loading) return <Navigate to={roleHome(user)} replace />;
  const message = error || (params.has('error') ? messages[params.get('error')] || 'Sign-in failed. Please try again.' : '');

  return (
    <main className="auth-page">
      <div className="auth-layout">
        <header className="auth-brand">
          {!logoMissing && (
            <img
              className="auth-logo"
              src="/bracu-logo.png"
              alt="BRAC University logo"
              onError={() => setLogoMissing(true)}
            />
          )}
          {logoMissing && <p className="auth-university">BRAC University</p>}
          <h1>BRACU SMART TRANSPORT</h1>
          <p className="auth-subtitle">Bus Booking &amp; Tracking System</p>
        </header>

        <section className="auth-card" aria-labelledby="auth-welcome" aria-busy={loading || busy}>
          <h2 id="auth-welcome">Welcome to BRACU<br />Smart Transport</h2>
          <p className="auth-description">Login with your BRACU email.</p>
          {loading ? (
            <p className="auth-status" role="status">Checking authentication...</p>
          ) : (
            <>
              <form className="auth-email-form" onSubmit={submitEmail} noValidate>
                <label htmlFor="bracu-email">BRACU email</label>
                <input id="bracu-email" name="email" type="email" inputMode="email" autoComplete="email"
                  placeholder="your.name@g.bracu.ac.bd" value={email} disabled={busy}
                  aria-describedby="email-help" onChange={e => setEmail(e.target.value)} />
                <button className="auth-email-button" disabled={busy} type="submit">Login</button>
              </form>
              {token && <button className="auth-email-button" disabled={busy} onClick={verify}>Verify email and sign in</button>}
              {emailError && <p role="alert" className="auth-error">{emailError}</p>}{notice && <p role="status" className="auth-status">{notice}</p>}
              {message && <p role="alert" className="auth-error">{message}</p>}
              {error && <button type="button" onClick={refresh} className="auth-retry">Retry authentication check</button>}
              <p id="email-help" className="auth-note">For students and registered staff<br /><span>@g.bracu.ac.bd</span></p>
            </>
          )}
        </section>

        <footer className="auth-footer">
          <p>BRAC University</p>
          <p>Smart Transport System</p>
        </footer>
      </div>
    </main>
  );
}
