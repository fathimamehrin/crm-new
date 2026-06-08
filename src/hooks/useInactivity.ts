import { useEffect, useRef, useCallback } from 'react';

const EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'];

interface UseInactivityOptions {
  timeoutMs?: number;
  warningMs?: number;
  onWarn?: () => void;
  onTimeout?: () => void;
}

export const useInactivity = ({
  timeoutMs = 10 * 60 * 1000,
  warningMs = 9 * 60 * 1000,
  onWarn,
  onTimeout,
}: UseInactivityOptions) => {
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnedRef = useRef(false);

  const reset = useCallback(() => {
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    warnedRef.current = false;

    warnTimerRef.current = setTimeout(() => {
      warnedRef.current = true;
      onWarn?.();
      logoutTimerRef.current = setTimeout(() => {
        onTimeout?.();
      }, timeoutMs - warningMs);
    }, warningMs);
  }, [timeoutMs, warningMs, onWarn, onTimeout]);

  useEffect(() => {
    reset();
    EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, reset));
      if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    };
  }, [reset]);

  return { reset };
};
