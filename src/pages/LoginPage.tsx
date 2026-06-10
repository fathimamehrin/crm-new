import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Shield, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

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
            Welcome back
          </h1>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-8)' }}>
            Sign in to your account to continue
          </p>

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
    </div>
  );
};

export default LoginPage;
