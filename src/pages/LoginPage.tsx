import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Lock, Mail, RotateCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  captchaInput: z.string().min(1, 'Please enter the verification code'),
});
type FormData = z.infer<typeof schema>;

const CAPTCHA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

const generateCaptchaCode = () => {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CAPTCHA_CHARS.charAt(Math.floor(Math.random() * CAPTCHA_CHARS.length));
  }
  return code;
};

const drawCaptchaOnCanvas = (canvas: HTMLCanvasElement, code: string) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Clear and set background
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f1f5f9'; // matching background token --color-bg-secondary
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw noise lines
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = `rgba(${Math.floor(Math.random() * 150)}, ${Math.floor(Math.random() * 150)}, ${Math.floor(Math.random() * 255)}, 0.25)`;
    ctx.lineWidth = 1 + Math.random() * 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
    ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
    ctx.stroke();
  }

  // Draw noise dots
  for (let i = 0; i < 35; i++) {
    ctx.fillStyle = `rgba(${Math.floor(Math.random() * 180)}, ${Math.floor(Math.random() * 180)}, ${Math.floor(Math.random() * 220)}, 0.35)`;
    ctx.beginPath();
    ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, 1 + Math.random() * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw characters
  ctx.textBaseline = 'middle';
  const charWidth = canvas.width / (code.length + 1);
  
  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const fontSize = 20 + Math.floor(Math.random() * 6); // font size between 20 and 26
    ctx.font = `bold ${fontSize}px "Inter", "Courier New", Courier, monospace`;
    
    // Random darker colors for high contrast and readability
    ctx.fillStyle = `rgb(${Math.floor(Math.random() * 100)}, ${Math.floor(Math.random() * 100)}, ${Math.floor(Math.random() * 160)})`;
    
    // Position with slight randomness
    const x = (i + 0.8) * charWidth;
    const y = canvas.height / 2 + (Math.random() * 8 - 4);
    
    // Rotate slightly
    ctx.save();
    ctx.translate(x, y);
    const angle = (Math.random() * 30 - 15) * Math.PI / 180; // -15deg to 15deg
    ctx.rotate(angle);
    ctx.fillText(char, 0, 0);
    ctx.restore();
  }
};

const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [captchaCode, setCaptchaCode] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const { register, handleSubmit, formState: { errors }, setError, setValue } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const generateNewCaptcha = useCallback(() => {
    setCaptchaCode(generateCaptchaCode());
  }, []);

  useEffect(() => {
    generateNewCaptcha();
  }, [generateNewCaptcha]);

  useEffect(() => {
    if (canvasRef.current && captchaCode) {
      drawCaptchaOnCanvas(canvasRef.current, captchaCode);
    }
  }, [captchaCode]);

  const onSubmit = async (data: FormData) => {
    if (data.captchaInput.toLowerCase() !== captchaCode.toLowerCase()) {
      setError('captchaInput', { type: 'manual', message: 'Incorrect verification code' });
      setValue('captchaInput', '');
      generateNewCaptcha();
      return;
    }

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
      // Refresh captcha on login failure for security
      generateNewCaptcha();
      setValue('captchaInput', '');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-secondary)',
      position: 'relative',
      overflow: 'hidden',
      padding: 'var(--space-4)',
    }}>
      {/* Background gradient orbs */}
      <div style={{
        position: 'absolute', top: '-10%', left: '-10%',
        width: 600, height: 600,
        background: 'radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '-10%', right: '-10%',
        width: 600, height: 600,
        background: 'radial-gradient(circle, rgba(37,99,235,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Login Card */}
      <div style={{
        maxWidth: 460,
        width: '100%',
        background: 'var(--color-bg-card)',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-8) var(--space-6)',
        boxShadow: '0 20px 25px -5px rgba(15, 23, 42, 0.05), 0 10px 10px -5px rgba(15, 23, 42, 0.02), 0 0 0 1px var(--color-border)',
        zIndex: 1,
        position: 'relative',
      }} className="login-card-container">
        <div>
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-8)' }}>  
          </div>

          <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, marginBottom: 'var(--space-2)', textAlign: 'center' }}>
            Welcome back
          </h1>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-6)', textAlign: 'center', fontSize: 'var(--font-size-sm)' }}>
            Sign in to your account to continue
          </p>

          <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
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

            {/* Security Captcha */}
            <div className="form-group">
              <label className="form-label required" htmlFor="login-captcha">Security Verification</label>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                marginBottom: 'var(--space-2)',
                background: 'var(--color-bg-secondary)',
                padding: 'var(--space-2)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <canvas
                    ref={canvasRef}
                    width={150}
                    height={45}
                    style={{
                      borderRadius: 'var(--radius-sm)',
                      background: '#f1f5f9',
                      border: '1px solid var(--color-border)',
                      display: 'block',
                    }}
                  />
                  <button
                    type="button"
                    onClick={generateNewCaptcha}
                    style={{
                      background: 'var(--color-bg-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: 'var(--space-2)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--color-text-secondary)',
                      transition: 'all var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--color-accent)';
                      e.currentTarget.style.borderColor = 'var(--color-accent)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--color-text-secondary)';
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                    }}
                    title="Refresh Captcha"
                    aria-label="Refresh Captcha"
                  >
                    <RotateCw size={16} />
                  </button>
                </div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 500, marginRight: 'var(--space-2)' }}>
                  Case-insensitive
                </span>
              </div>
              
              <div className="search-wrapper">
                <input
                  id="login-captcha"
                  type="text"
                  className={`form-input ${errors.captchaInput ? 'error' : ''}`}
                  placeholder="Enter the 6-character code"
                  autoComplete="off"
                  {...register('captchaInput')}
                />
              </div>
              {errors.captchaInput && <span className="form-error">{errors.captchaInput.message}</span>}
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
            marginTop: 'var(--space-6)',
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
