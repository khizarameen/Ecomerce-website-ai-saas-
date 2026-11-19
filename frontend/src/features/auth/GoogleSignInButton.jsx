import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '515395921565-72b282233o5a91be5pcd6227eu9ep25l.apps.googleusercontent.com';

const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

export default function GoogleSignInButton({
  role = 'buyer',
  mode = 'login',
  onAuthenticated,
}) {
  const { loginWithGoogle } = useAuth();
  const btnRef = useRef(null);
  const roleRef = useRef(role);
  const modeRef = useRef(mode);
  const callbackRef = useRef(onAuthenticated);
  const loginRef = useRef(loginWithGoogle);
  const gsiInitializedRef = useRef(false);

  const [gsiReady, setGsiReady] = useState(
    () => typeof window !== 'undefined' && Boolean(window.google?.accounts?.id)
  );
  const [gsiError, setGsiError] = useState(false);
  const [popupLoading, setPopupLoading] = useState(false);

  const isLoopbackIp =
    typeof window !== 'undefined' && window.location.hostname === '127.0.0.1';
  const localhostHref =
    typeof window !== 'undefined'
      ? window.location.href.replace('://127.0.0.1', '://localhost')
      : 'http://localhost:3000/login';

  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    callbackRef.current = onAuthenticated;
  }, [onAuthenticated]);

  useEffect(() => {
    loginRef.current = loginWithGoogle;
  }, [loginWithGoogle]);

  useEffect(() => {
    if (gsiReady || typeof document === 'undefined') return undefined;

    let active = true;
    const markReady = () => {
      if (active && window.google?.accounts?.id) {
        setGsiReady(true);
        setGsiError(false);
      }
    };

    let script = document.querySelector(`script[src^="${GSI_SCRIPT_SRC}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = GSI_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    const onLoad = () => markReady();
    const onError = () => {
      if (active) setGsiError(true);
    };
    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);

    const timer = setInterval(() => {
      if (window.google?.accounts?.id) {
        markReady();
        clearInterval(timer);
      }
    }, 250);

    const fallbackTimer = setTimeout(() => {
      if (active && !window.google?.accounts?.id) {
        setGsiError(true);
      }
    }, 10000);

    return () => {
      active = false;
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
      clearInterval(timer);
      clearTimeout(fallbackTimer);
    };
  }, [gsiReady]);

  useEffect(() => {
    if (!gsiReady || !btnRef.current || !window.google?.accounts?.id || !GOOGLE_CLIENT_ID) {
      return;
    }

    if (!gsiInitializedRef.current) {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          if (!response?.credential) return;
          const result = await loginRef.current(
            { credential: response.credential },
            roleRef.current,
            modeRef.current
          );
          if (result?.success && typeof callbackRef.current === 'function') {
            callbackRef.current(result);
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      gsiInitializedRef.current = true;
    }

    btnRef.current.innerHTML = '';
    const containerWidth = Math.min(340, Math.max(240, btnRef.current.parentElement?.offsetWidth || 320));
    window.google.accounts.id.renderButton(btnRef.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: mode === 'register' ? 'signup_with' : 'continue_with',
      shape: 'rectangular',
      width: containerWidth,
    });
  }, [gsiReady, mode]);

  const handlePopupAuth = () => {
    if (!window.google?.accounts?.oauth2?.initCodeClient) {
      toast.error('Google Sign-In library is still loading or blocked by an ad blocker.');
      return;
    }
    setPopupLoading(true);
    try {
      const codeClient = window.google.accounts.oauth2.initCodeClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'openid email profile',
        ux_mode: 'popup',
        callback: async (resp) => {
          if (resp?.error) {
            setPopupLoading(false);
            toast.error(resp.error_description || resp.error || 'Google sign-in was cancelled.');
            return;
          }
          if (!resp?.code) {
            setPopupLoading(false);
            toast.error('Google did not return an authorization code.');
            return;
          }
          try {
            const result = await loginRef.current(
              { code: resp.code },
              roleRef.current,
              modeRef.current
            );
            if (result?.success && typeof callbackRef.current === 'function') {
              callbackRef.current(result);
            }
          } finally {
            setPopupLoading(false);
          }
        },
        error_callback: (err) => {
          setPopupLoading(false);
          toast.error(err?.message || 'Google popup was blocked or closed. Please allow popups.');
        },
      });
      codeClient.requestCode();
    } catch (err) {
      setPopupLoading(false);
      toast.error(err?.message || 'Could not launch Google sign-in popup.');
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      {isLoopbackIp && (
        <div className="w-full rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-900">
          Google OAuth is authorized for <code className="font-bold">http://localhost:3000</code>.{' '}
          <a href={localhostHref} className="font-bold underline text-indigo-700">
            Switch to localhost →
          </a>
        </div>
      )}

      <div ref={btnRef} className="min-h-[44px] w-full flex items-center justify-center" />

      {!gsiReady && !gsiError && (
        <p className="text-[11px] text-slate-400">Loading Google Sign-In...</p>
      )}

      {gsiError && (
        <p className="text-[11px] text-amber-700 text-center">
          Google Sign-In script could not load. Check internet connection or disable tracker blockers.
        </p>
      )}

      <button
        type="button"
        disabled={!gsiReady || popupLoading}
        onClick={handlePopupAuth}
        className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 hover:underline disabled:opacity-40 cursor-pointer"
      >
        {popupLoading
          ? 'Connecting to Google...'
          : `Button not responding? Use Google Popup (${role === 'seller' ? 'Seller' : 'Buyer'})`}
      </button>
    </div>
  );
}
