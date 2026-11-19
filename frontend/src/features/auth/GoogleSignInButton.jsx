import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '515395921565-72b282233o5a91be5pcd6227eu9ep25l.apps.googleusercontent.com';

export default function GoogleSignInButton({ role = 'buyer', onAuthenticated }) {
  const { loginWithGoogle } = useAuth();
  const btnRef = useRef(null);
  const roleRef = useRef(role);
  const callbackRef = useRef(onAuthenticated);
  const [gsiReady, setGsiReady] = useState(Boolean(window.google?.accounts?.id));

  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  useEffect(() => {
    callbackRef.current = onAuthenticated;
  }, [onAuthenticated]);

  useEffect(() => {
    if (gsiReady) return undefined;
    const timer = setInterval(() => {
      if (window.google?.accounts?.id) {
        setGsiReady(true);
        clearInterval(timer);
      }
    }, 250);
    const timeout = setTimeout(() => clearInterval(timer), 6000);
    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
    };
  }, [gsiReady]);

  useEffect(() => {
    if (!gsiReady || !btnRef.current || !window.google?.accounts?.id || !GOOGLE_CLIENT_ID) {
      return;
    }
    btnRef.current.innerHTML = '';
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response) => {
        if (!response?.credential) return;
        const result = await loginWithGoogle(response.credential, roleRef.current);
        if (result?.success && typeof callbackRef.current === 'function') {
          callbackRef.current(result);
        }
      },
    });
    window.google.accounts.id.renderButton(btnRef.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      width: 340,
    });
  }, [gsiReady, role, loginWithGoogle]);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div ref={btnRef} className="min-h-[44px] flex items-center justify-center" />
      {!gsiReady && (
        <p className="text-[11px] text-slate-400">Loading Google Sign-In...</p>
      )}
    </div>
  );
}
