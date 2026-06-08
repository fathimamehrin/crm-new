import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Shield, Eye, EyeOff, Lock, Mail, User as UserIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});
type FormData = z.infer<typeof schema>;

const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      await login(data.email, data.password);
      toast.success('Welcome back!');
      navigate('/');
    } catch (err: any) {
      const msg = err.code === 'auth/invalid-credential'
        ? 'Invalid email or password'
        : err.code === 'auth/user-disabled'
        ? 'This account has been disabled'
        : 'Login failed. Please try again.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const onRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || !regEmail.trim() || !regPassword) {
      toast.error('Please fill in all fields');
      return;
    }
    if (regPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, regEmail.trim(), regPassword);
      await setDoc(doc(db, 'users', cred.user.uid), {
        name: regName.trim(),
        email: regEmail.trim(),
        role: 'admin',
        status: 'active',
        createdAt: serverTimestamp(),
      });
      toast.success('Admin account created successfully!');
      navigate('/');
    } catch (err: any) {
      console.error(err);
      let msg = 'Registration failed. Please try again.';
      if (err.code === 'auth/email-already-in-use') {
        msg = 'This email is already in use. Try logging in.';
      } else if (err.code === 'permission-denied' || err.message?.includes('permission')) {
        msg = 'Database permission denied. Make sure you deployed the updated firestore.rules.';
      }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: 'var(--color-bg-primary)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background gradient orbs */}
      <div style={{
        position: 'absolute', top: '-20%', left: '-10%',
        width: 600, height: 600,
        background: 'radial-gradient(circle, rgba(37,99,235,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '-20%', right: '-10%',
        width: 500, height: 500,
        background: 'radial-gradient(circle, rgba(29,78,216,0.05) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Left Panel */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, rgba(37,99,235,0.04), rgba(29,78,216,0.01))',
        borderRight: '1px solid var(--color-border)',
        padding: 'var(--space-12)',
      }} className="login-left-panel">
        <div style={{ maxWidth: 420, width: '100%' }}>
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-10)' }}>
            <div style={{
              width: 48, height: 48,
              background: 'linear-gradient(135deg, var(--color-accent), #1d4ed8)',
              borderRadius: 'var(--radius-md)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: 'var(--shadow-accent)',
            }}>
              <Shield size={24} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700 }}>VN CRM</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                Client Relationship Manager
              </div>
            </div>
          </div>

          <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800, marginBottom: 'var(--space-2)' }}>
            {activeTab === 'login' ? 'Welcome back' : 'Create Admin'}
          </h1>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-6)' }}>
            {activeTab === 'login' ? 'Sign in to your account to continue' : 'Register your initial admin credentials'}
          </p>

          {/* Tabs */}
          <div className="tabs" style={{ marginBottom: 'var(--space-6)', width: '100%', display: 'flex' }}>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'login' ? 'active' : ''}`}
              onClick={() => setActiveTab('login')}
              style={{ flex: 1, textAlign: 'center' }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'register' ? 'active' : ''}`}
              onClick={() => setActiveTab('register')}
              style={{ flex: 1, textAlign: 'center' }}
            >
              Create Admin
            </button>
          </div>

          {activeTab === 'login' ? (
            <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              {/* Email */}
              <div className="form-group">
                <label className="form-label required" htmlFor="login-email">Email Address</label>
                <div className="search-wrapper">
                  <Mail className="search-icon" size={16} />
                  <input
                    id="login-email"
                    type="email"
                    className={`form-input ${errors.email ? 'error' : ''}`}
                    style={{ paddingLeft: '2.5rem' }}
                    placeholder="you@company.com"
                    autoComplete="email"
                    {...register('email')}
                  />
                </div>
                {errors.email && <span className="form-error">{errors.email.message}</span>}
              </div>

              {/* Password */}
              <div className="form-group">
                <label className="form-label required" htmlFor="login-password">Password</label>
                <div className="search-wrapper">
                  <Lock className="search-icon" size={16} />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    className={`form-input ${errors.password ? 'error' : ''}`}
                    style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    style={{
                      position: 'absolute', right: '0.75rem', top: '50%',
                      transform: 'translateY(-50%)', background: 'none', border: 'none',
                      cursor: 'pointer', color: 'var(--color-text-muted)',
                      display: 'flex', alignItems: 'center',
                    }}
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && <span className="form-error">{errors.password.message}</span>}
              </div>

              <button
                id="login-submit-btn"
                type="submit"
                className="btn btn-primary btn-lg"
                disabled={loading}
                style={{ width: '100%', justifyContent: 'center', marginTop: 'var(--space-2)' }}
              >
                {loading ? <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Signing in…</> : 'Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={onRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              {/* Full Name */}
              <div className="form-group">
                <label className="form-label required" htmlFor="register-name">Full Name</label>
                <div className="search-wrapper">
                  <UserIcon className="search-icon" size={16} />
                  <input
                    id="register-name"
                    type="text"
                    className="form-input"
                    style={{ paddingLeft: '2.5rem' }}
                    placeholder="Super Admin"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Email */}
              <div className="form-group">
                <label className="form-label required" htmlFor="register-email">Email Address</label>
                <div className="search-wrapper">
                  <Mail className="search-icon" size={16} />
                  <input
                    id="register-email"
                    type="email"
                    className="form-input"
                    style={{ paddingLeft: '2.5rem' }}
                    placeholder="admin@company.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="form-group">
                <label className="form-label required" htmlFor="register-password">Password</label>
                <div className="search-wrapper">
                  <Lock className="search-icon" size={16} />
                  <input
                    id="register-password"
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }}
                    placeholder="•••••••• (min 6 characters)"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    style={{
                      position: 'absolute', right: '0.75rem', top: '50%',
                      transform: 'translateY(-50%)', background: 'none', border: 'none',
                      cursor: 'pointer', color: 'var(--color-text-muted)',
                      display: 'flex', alignItems: 'center',
                    }}
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                id="register-submit-btn"
                type="submit"
                className="btn btn-primary btn-lg"
                disabled={loading}
                style={{ width: '100%', justifyContent: 'center', marginTop: 'var(--space-2)' }}
              >
                {loading ? <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Registering…</> : 'Create Admin Account'}
              </button>
            </form>
          )}

          <p style={{
            marginTop: 'var(--space-8)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-muted)',
            textAlign: 'center',
          }}>
            Protected by Firebase Authentication · Auto-logout after 10 min inactivity
          </p>
        </div>
      </div>

      {/* Right decorative panel (desktop only) */}
      <div style={{
        width: '40%', minWidth: 360,
        background: 'linear-gradient(135deg, #1e1b4b, #0b0f1a)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 'var(--space-12)',
        position: 'relative', overflow: 'hidden',
      }} className="login-right-panel">
        <div style={{
          position: 'absolute', top: '10%', right: '-20%',
          width: 300, height: 300,
          background: 'radial-gradient(circle, rgba(99,102,241,0.2), transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', bottom: '10%', left: '-20%',
          width: 250, height: 250,
          background: 'radial-gradient(circle, rgba(129,140,248,0.15), transparent 70%)',
        }} />

        <div style={{ position: 'relative', maxWidth: 300, textAlign: 'center' }}>
          <div style={{
            width: 80, height: 80,
            background: 'rgba(99,102,241,0.2)',
            borderRadius: 'var(--radius-xl)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto var(--space-6)',
            border: '1px solid rgba(99,102,241,0.3)',
          }}>
            <Shield size={40} style={{ color: '#818cf8' }} />
          </div>
          <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>
            Powerful CRM
          </h2>
          <p style={{ color: '#94a3b8', lineHeight: 1.8, fontSize: 'var(--font-size-sm)' }}>
            Manage clients, track summaries, monitor payments, and coordinate your entire team — all in one place.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-8)', textAlign: 'left' }}>
            {['Role-based access control', 'Real-time Firestore updates', 'Secure file storage', 'Activity audit logs'].map((feat) => (
              <div key={feat} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', color: '#94a3b8', fontSize: 'var(--font-size-sm)' }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%',
                  background: 'var(--color-accent-light)',
                  border: '1px solid rgba(99,102,241,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-accent)' }} />
                </div>
                {feat}
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .login-right-panel { display: none !important; }
          .login-left-panel { border-right: none !important; }
        }
      `}</style>
    </div>
  );
};

export default LoginPage;
