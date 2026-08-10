import React, { useState } from 'react';
import { auth } from '../config/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail 
} from 'firebase/auth';
import { Mail, Lock, ShieldAlert, Sparkles, UserPlus, LogIn, KeyRound } from 'lucide-react';

export const AuthView: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg("Please enter your email and password.");
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error(err);
      switch (err.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          setErrorMsg("Incorrect email or password.");
          break;
        case 'auth/email-already-in-use':
          setErrorMsg("This email is already registered by another user.");
          break;
        case 'auth/weak-password':
          setErrorMsg("Password must be at least 6 characters long.");
          break;
        default:
          setErrorMsg("An unexpected error occurred while authenticating.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      setErrorMsg("Enter your email first so we can send you the recovery link.");
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Failed to send the recovery link. Check the email address.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      minHeight: 'calc(100vh - 70px)',
      padding: '1.5rem',
      gap: '1.5rem'
    }}>
      {/* App Branding */}
      <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
        <div style={{
          background: 'var(--gradient)',
          width: '60px', height: '60px', borderRadius: '18px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 1.25rem',
          boxShadow: '0 4px 24px rgba(109,59,215,0.4)'
        }}>
          <Sparkles size={28} color="#fff" />
        </div>
        <h2 style={{
          fontSize: '2rem', marginBottom: '0.25rem', fontFamily: 'var(--font-heading)',
          fontWeight: 800, letterSpacing: '-0.02em',
          background: 'var(--gradient)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'
        }}>TTChop</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Automate your marketing content at scale
        </p>
      </div>

      {/* Auth Card */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
          {isLogin ? <LogIn size={17} style={{ color: 'var(--secondary)' }} /> : <UserPlus size={17} style={{ color: 'var(--secondary)' }} />}
          {isLogin ? 'Log In' : 'Create Account'}
        </h3>

        {errorMsg && (
          <div className="glass-card" style={{ 
            borderColor: 'var(--danger)', 
            background: 'rgba(239, 68, 68, 0.08)',
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
            marginBottom: '1rem',
            padding: '0.75rem'
          }}>
            <ShieldAlert size={16} style={{ color: 'var(--danger)', flexShrink: 0 }} />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-primary)' }}>{errorMsg}</p>
          </div>
        )}

        {resetSent && (
          <div className="glass-card" style={{ 
            borderColor: 'var(--success)', 
            background: 'rgba(16, 185, 129, 0.08)',
            marginBottom: '1rem',
            padding: '0.75rem'
          }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-primary)' }}>
              A recovery link has been sent to your email. Check your inbox or spam folder.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type="email"
                className="form-input"
                placeholder="example@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{ paddingLeft: '2.5rem' }}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input 
                type="password" 
                className="form-input" 
                placeholder="••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ paddingLeft: '2.5rem' }}
                required
              />
            </div>
          </div>

          {isLogin && (
            <button 
              type="button" 
              onClick={handlePasswordReset}
              style={{
                alignSelf: 'flex-end',
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                fontSize: '0.75rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                marginTop: '-0.5rem'
              }}
            >
              <KeyRound size={12} /> Forgot your password?
            </button>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ marginTop: '0.5rem' }}
          >
            {loading ? 'Processing...' : isLogin ? 'Log In' : 'Sign Up'}
          </button>
        </form>

        {/* Tab switcher */}
        <div style={{ 
          marginTop: '1.5rem', 
          textAlign: 'center', 
          borderTop: '1px solid var(--border)', 
          paddingTop: '1rem',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)'
        }}>
          {isLogin ? (
            <p>
              Don't have an account?{' '}
              <button
                onClick={() => { setIsLogin(false); setErrorMsg(''); setResetSent(false); }}
                style={{ background: 'none', border: 'none', color: 'var(--secondary)', fontWeight: '600', cursor: 'pointer' }}
              >
                Sign up here
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{' '}
              <button
                onClick={() => { setIsLogin(true); setErrorMsg(''); setResetSent(false); }}
                style={{ background: 'none', border: 'none', color: 'var(--secondary)', fontWeight: '600', cursor: 'pointer' }}
              >
                Log in here
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
