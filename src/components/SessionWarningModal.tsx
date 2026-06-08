import React, { useState, useEffect } from 'react';
import { LogOut, Clock } from 'lucide-react';

interface SessionWarningModalProps {
  onStay: () => void;
  onLogout: () => void;
  secondsLeft?: number;
}

const SessionWarningModal: React.FC<SessionWarningModalProps> = ({
  onStay,
  onLogout,
  secondsLeft: initialSeconds = 60,
}) => {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    if (seconds <= 0) {
      onLogout();
      return;
    }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds, onLogout]);

  const pct = (seconds / initialSeconds) * 100;

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div className="modal" style={{ maxWidth: 420, textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64,
          background: 'var(--color-warning-light)',
          borderRadius: 'var(--radius-full)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto var(--space-5)',
          color: 'var(--color-warning)',
        }}>
          <Clock size={28} />
        </div>

        <h2 style={{ marginBottom: 'var(--space-3)' }}>Session Expiring Soon</h2>
        <p className="text-secondary text-sm" style={{ marginBottom: 'var(--space-5)' }}>
          You've been inactive for a while. You will be automatically logged out in:
        </p>

        <div style={{
          fontSize: '2.5rem',
          fontWeight: 700,
          color: seconds <= 15 ? 'var(--color-danger)' : 'var(--color-warning)',
          marginBottom: 'var(--space-5)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {String(Math.floor(seconds / 60)).padStart(2, '0')}:
          {String(seconds % 60).padStart(2, '0')}
        </div>

        <div className="progress-bar" style={{ marginBottom: 'var(--space-6)' }}>
          <div
            className="progress-fill"
            style={{
              width: `${pct}%`,
              background: seconds <= 15
                ? 'var(--color-danger)'
                : 'linear-gradient(90deg, var(--color-warning), #fbbf24)',
            }}
          />
        </div>

        <div className="flex gap-3 justify-center">
          <button className="btn btn-secondary" onClick={onLogout}>
            <LogOut size={16} />
            Logout Now
          </button>
          <button className="btn btn-primary" onClick={onStay}>
            Stay Logged In
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionWarningModal;
